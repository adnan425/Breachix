import { logger, metadata, task } from "@trigger.dev/sdk/v3";
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { updateScanStatus } from "../lib/queries";
import { completeChat, createOllamaClient } from "../lib/ai-client";
import {
  extractPreReconSubagentInstructions,
  loadPreReconPromptTemplate,
  PRE_RECON_SUBAGENT_NAMES,
} from "../lib/pre-recon-prompt";

const execAsync = promisify(exec);

/** Prepended to user messages only. Breachix policy file on disk is not edited at runtime. */
const RUNTIME_USER_PREFIX = `You are running as a Breachix worker (Trigger.dev + configured OpenAI-compatible chat API).

The Breachix **system** message is the full Breachix pre-recon policy (bundled as \`src/prompts/pre-recon-code.txt\`): workflow, scope, phased analysis, report headings, completion rules, XSS/SSRF sink catalogues, and quality bar.

Tooling referenced in that policy (Task agents, TodoWrite, Bash, Read, Glob, Grep, Write, Edit, \`save-deliverable\`) is not available in Breachix. Do not claim to have run them.

Follow every analytical and reporting requirement from the Breachix system message using ONLY the repository snapshot in this user message.

Legacy path strings that appear inside the bundled policy (for example under \`.shannon/\`) are not created by Breachix. Breachix stores the final markdown in its own database—put the full report in your reply. If the policy mentions copying schemas to a \`.shannon/deliverables/schemas/\` tree, instead list schema paths and implications in Attack Surface and Critical File Paths.

`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PreReconPayload {
  scanId: string;
  targetUrl: string;
  repoPath: string;
  environment: string;
  ollamaUrl: string;
  model: string;
}

// ---------------------------------------------------------------------------
// File system helpers (repository snapshot — replaces interactive file tools from the spec)
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", ".trigger", "dist", "build", "out",
  ".cache", "coverage", ".turbo", "__pycache__", ".venv", "vendor",
  ".yarn", ".pnp", "tmp", "temp",
]);

const SCHEMA_EXTENSIONS = [".json", ".yaml", ".yml", ".graphql", ".gql"];
const SCHEMA_PATTERNS   = [/openapi/, /swagger/, /schema/, /graphql/, /\.schema\./];

async function walk(dir: string, depth = 0, maxDepth = 5): Promise<string[]> {
  if (depth > maxDepth) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const results: string[] = [];
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name) || e.name.startsWith(".")) {
      if (e.name === ".env.example" || e.name === ".gitignore") {
        results.push(path.join(dir, e.name));
      }
      continue;
    }
    const full = path.join(dir, e.name);
    if (e.isDirectory()) results.push(...(await walk(full, depth + 1, maxDepth)));
    else results.push(full);
  }
  return results;
}

async function readFileSafe(file: string, maxBytes = 6_000): Promise<string> {
  try {
    const content = await fs.readFile(file, "utf-8");
    return content.slice(0, maxBytes);
  } catch {
    return "";
  }
}

async function getGitIgnoredPaths(repoPath: string): Promise<string> {
  try {
    const { stdout } = await execAsync(
      "git ls-files --others --ignored --exclude-standard --directory",
      { cwd: repoPath, timeout: 5000 },
    );
    return stdout.trim();
  } catch {
    return "";
  }
}

async function buildCodeContext(repoPath: string, targetUrl: string): Promise<string> {
  const allFiles   = await walk(repoPath);
  const rel        = (f: string) => path.relative(repoPath, f);
  const ignoredStr = await getGitIgnoredPaths(repoPath);

  const tree = allFiles.map(rel).join("\n");

  const schemaFiles = allFiles.filter((f) => {
    const r = rel(f).toLowerCase();
    return (
      SCHEMA_EXTENSIONS.some((ext) => r.endsWith(ext)) &&
      SCHEMA_PATTERNS.some((p) => p.test(r))
    );
  });

  const KEY_PATTERNS = [
    /package\.json$/,
    /tsconfig.*\.json$/,
    /next\.config\./,
    /middleware\./,
    /auth\./,
    /(routes?|router)\./,
    /server\./,
    /app\.(ts|js)$/,
    /index\.(ts|js)$/,
    /schema\./,
    /prisma\//,
    /\.env\.example$/,
    /docker-compose/,
    /Dockerfile/,
    /nginx\.conf/,
    /security/,
    /permission/,
    /guard\./,
    /jwt/,
    /session/,
    /password/,
    /cors/,
    /webhook/,
  ];

  const keyFiles = allFiles.filter((f) => KEY_PATTERNS.some((p) => p.test(rel(f))));

  const seenPaths = new Set<string>();
  const contentSources: string[] = [];
  for (const f of [...schemaFiles, ...keyFiles]) {
    if (seenPaths.has(f)) continue;
    seenPaths.add(f);
    contentSources.push(f);
  }

  let contentBlocks = "";
  let budget = 48_000;

  for (const file of contentSources) {
    if (budget <= 0) break;
    const content = await readFileSafe(file, Math.min(budget, 6_000));
    if (!content) continue;
    contentBlocks += `\n\n=== ${rel(file)} ===\n${content}`;
    budget -= content.length;
  }

  return [
    `TARGET URL: ${targetUrl}`,
    `REPO PATH: ${repoPath}`,
    ignoredStr ? `\nGIT IGNORED PATHS:\n${ignoredStr}` : "",
    `\n## Repository File Tree\n${tree}`,
    `\n## Key File Contents${contentBlocks}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

export const preReconAgent = task({
  id: "pre-recon-agent",
  maxDuration: 3600,
  retry: { maxAttempts: 1 },

  run: async (payload: PreReconPayload) => {
    const { scanId, targetUrl, repoPath, ollamaUrl, model, environment } = payload;

    const setProgress = (phase: string, pct: number, agentStatus: string) => {
      metadata.set("phase", phase);
      metadata.set("progress", pct);
      metadata.set("agentStatus", agentStatus);
      logger.info(`[pre-recon] ${phase} – ${pct}%`);
    };

    try {
      await updateScanStatus(scanId, "running");

      let repoStat;
      try {
        repoStat = await fs.stat(repoPath);
      } catch {
        throw new Error(`repoPath is not reachable on this worker: ${repoPath}`);
      }
      if (!repoStat.isDirectory()) {
        throw new Error(`repoPath must be a directory: ${repoPath}`);
      }
      await fs.access(repoPath, fsConstants.R_OK).catch(() => {
        throw new Error(`repoPath is not readable: ${repoPath}`);
      });

      const client = createOllamaClient(ollamaUrl);

      const description = [
        `Target application URL: ${targetUrl}`,
        `Declared environment: ${environment}`,
        `Repository path on worker host: ${repoPath}`,
      ].join("\n");

      const systemSpec = await loadPreReconPromptTemplate(repoPath, description);
      const subInstructions = extractPreReconSubagentInstructions(systemSpec);

      setProgress("Reading codebase", 5, "Building repository snapshot…");
      const codeContext = await buildCodeContext(repoPath, targetUrl);
      logger.info(`[pre-recon] snapshot: ${codeContext.length} chars`);

      // Phase 1 — three discovery specialists in parallel
      setProgress("Phase 1 – Discovery", 12, `${PRE_RECON_SUBAGENT_NAMES[0]} · ${PRE_RECON_SUBAGENT_NAMES[1]} · ${PRE_RECON_SUBAGENT_NAMES[2]}`);

      const phase1User = (instruction: string, name: string) =>
        `${RUNTIME_USER_PREFIX}Subtask only — act as **${name}** in isolation (Phase 1 per the Breachix system message).

Output markdown headed with the agent name. Do not produce the full merged sections 1–10 report in this response.

Instruction (verbatim from the Breachix pre-recon policy, phased-analysis block):
"${instruction}"

## Repository snapshot
${codeContext}`;

      const [architecture, entrypoints, securityPatterns] = await Promise.all([
        completeChat(client, model, { system: systemSpec, user: phase1User(subInstructions[0], PRE_RECON_SUBAGENT_NAMES[0]) }),
        completeChat(client, model, { system: systemSpec, user: phase1User(subInstructions[1], PRE_RECON_SUBAGENT_NAMES[1]) }),
        completeChat(client, model, { system: systemSpec, user: phase1User(subInstructions[2], PRE_RECON_SUBAGENT_NAMES[2]) }),
      ]);

      setProgress("Phase 1 complete", 44, "Discovery agents done.");

      // Phase 2 — three vulnerability specialists in parallel
      setProgress("Phase 2 – Vulnerability Analysis", 48, `${PRE_RECON_SUBAGENT_NAMES[3]} · ${PRE_RECON_SUBAGENT_NAMES[4]} · ${PRE_RECON_SUBAGENT_NAMES[5]}`);

      const phase2User = (instruction: string, name: string) =>
        `${RUNTIME_USER_PREFIX}Subtask only — act as **${name}** in isolation (Phase 2 per the Breachix system message).

Output markdown headed with the agent name. Do not produce the full merged sections 1–10 report in this response.

Instruction (verbatim from the Breachix pre-recon policy, phased-analysis block):
"${instruction}"

## Repository snapshot
${codeContext}`;

      const [injectionSinks, ssrf, dataSecurity] = await Promise.all([
        completeChat(client, model, { system: systemSpec, user: phase2User(subInstructions[3], PRE_RECON_SUBAGENT_NAMES[3]) }),
        completeChat(client, model, { system: systemSpec, user: phase2User(subInstructions[4], PRE_RECON_SUBAGENT_NAMES[4]) }),
        completeChat(client, model, { system: systemSpec, user: phase2User(subInstructions[5], PRE_RECON_SUBAGENT_NAMES[5]) }),
      ]);

      setProgress("Phase 2 complete", 80, "Vulnerability analysis agents done.");

      // Phase 3 — synthesis (single report, exact headings in Breachix system message)
      setProgress("Phase 3 – Synthesis", 88, "Merging into final pre-recon report…");

      const combined = [
        `## ${PRE_RECON_SUBAGENT_NAMES[0]}\n${architecture}`,
        `## ${PRE_RECON_SUBAGENT_NAMES[1]}\n${entrypoints}`,
        `## ${PRE_RECON_SUBAGENT_NAMES[2]}\n${securityPatterns}`,
        `## ${PRE_RECON_SUBAGENT_NAMES[3]}\n${injectionSinks}`,
        `## ${PRE_RECON_SUBAGENT_NAMES[4]}\n${ssrf}`,
        `## ${PRE_RECON_SUBAGENT_NAMES[5]}\n${dataSecurity}`,
      ].join("\n\n---\n\n");

      const synthesisUser = `${RUNTIME_USER_PREFIX}Phase 3 — Synthesis and report generation.

Below are the six specialist markdown outputs from this Breachix run. Merge them into ONE document using the **exact** Markdown headings and section order required under "Please structure your report using the exact following Markdown headings" in the Breachix system message (sections 1 through 10, including Penetration Test Scope & Boundaries).

${combined}`;

      const deliverable = await completeChat(client, model, {
        system: systemSpec,
        user: synthesisUser,
        maxUserChars: 200_000,
      });

      await updateScanStatus(scanId, "completed", deliverable);
      setProgress("Complete", 100, "Pre-reconnaissance finished.");
      logger.info(`[pre-recon] scan ${scanId} completed`);

      return { scanId, status: "completed", deliverable };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await updateScanStatus(scanId, "failed").catch(() => null);
      metadata.set("error", msg);
      logger.error(`[pre-recon] scan ${scanId} failed: ${msg}`);
      throw err;
    }
  },
});
