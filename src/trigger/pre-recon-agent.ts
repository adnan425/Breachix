import { logger, metadata, task } from "@trigger.dev/sdk/v3";
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { updateScanStatus } from "../lib/queries";
import { buildCodeContext, buildGitMetadataSection } from "../lib/repo-snapshot";
import { collectExternalScanBlock } from "../lib/pre-recon-parity";
import { runSaveDeliverable } from "../lib/save-deliverable-shannon";
import { completeChat, createOllamaClient } from "../lib/ai-client";
import {
  extractPreReconSubagentInstructions,
  loadPreReconPromptTemplate,
  PRE_RECON_SUBAGENT_NAMES,
} from "../lib/pre-recon-prompt";
import { PRE_RECON_RUNNER_NOTE } from "../lib/shannon-worker-bridge";

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
// Task
// ---------------------------------------------------------------------------

export const preReconAgent = task({
  id: "pre-recon-agent",
  /** More headroom for parallel nmap / httpx / whois on the worker (same pre-recon phase). */
  machine: { preset: "medium-1x" },
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

      setProgress("Shannon-style inputs", 5, "Parallel CLIs + git + snapshot…");
      const [codeContext, gitMeta, externalBlock] = await Promise.all([
        buildCodeContext(repoPath, targetUrl),
        buildGitMetadataSection(repoPath),
        collectExternalScanBlock(targetUrl, {
          onStatus: (m) => {
            logger.info(`[pre-recon] ${m}`);
            metadata.set("agentStatus", m);
          },
        }),
      ]);
      const evidenceBundle = `${externalBlock}\n\n${gitMeta}\n\n${codeContext}`;
      logger.info(`[pre-recon] evidence bundle: ${evidenceBundle.length} chars`);

      // Phase 1 — three discovery specialists in parallel
      setProgress("Phase 1 – Discovery", 12, `${PRE_RECON_SUBAGENT_NAMES[0]} · ${PRE_RECON_SUBAGENT_NAMES[1]} · ${PRE_RECON_SUBAGENT_NAMES[2]}`);

      const phase1User = (instruction: string, name: string) =>
        `${PRE_RECON_RUNNER_NOTE}Subtask only — act as **${name}** in isolation (Phase 1 per the system policy).

Output markdown headed with the agent name. Do not produce the full merged sections 1–10 report in this response.

Instruction (verbatim from the phased-analysis block in the system policy):
"${instruction}"

## Evidence bundle (external + git + snapshot)

${evidenceBundle}`;

      const [architecture, entrypoints, securityPatterns] = await Promise.all([
        completeChat(client, model, { system: systemSpec, user: phase1User(subInstructions[0], PRE_RECON_SUBAGENT_NAMES[0]) }),
        completeChat(client, model, { system: systemSpec, user: phase1User(subInstructions[1], PRE_RECON_SUBAGENT_NAMES[1]) }),
        completeChat(client, model, { system: systemSpec, user: phase1User(subInstructions[2], PRE_RECON_SUBAGENT_NAMES[2]) }),
      ]);

      setProgress("Phase 1 complete", 44, "Discovery agents done.");

      // Phase 2 — three vulnerability specialists in parallel
      setProgress("Phase 2 – Vulnerability Analysis", 48, `${PRE_RECON_SUBAGENT_NAMES[3]} · ${PRE_RECON_SUBAGENT_NAMES[4]} · ${PRE_RECON_SUBAGENT_NAMES[5]}`);

      const phase2User = (instruction: string, name: string) =>
        `${PRE_RECON_RUNNER_NOTE}Subtask only — act as **${name}** in isolation (Phase 2 per the system policy).

Output markdown headed with the agent name. Do not produce the full merged sections 1–10 report in this response.

Instruction (verbatim from the phased-analysis block in the system policy):
"${instruction}"

## Evidence bundle (external + git + snapshot)

${evidenceBundle}`;

      const [injectionSinks, ssrf, dataSecurity] = await Promise.all([
        completeChat(client, model, { system: systemSpec, user: phase2User(subInstructions[3], PRE_RECON_SUBAGENT_NAMES[3]) }),
        completeChat(client, model, { system: systemSpec, user: phase2User(subInstructions[4], PRE_RECON_SUBAGENT_NAMES[4]) }),
        completeChat(client, model, { system: systemSpec, user: phase2User(subInstructions[5], PRE_RECON_SUBAGENT_NAMES[5]) }),
      ]);

      setProgress("Phase 2 complete", 80, "Vulnerability analysis agents done.");

      // Phase 3 — synthesis (single report, exact headings in pre-recon-code.txt)
      setProgress("Phase 3 – Synthesis", 88, "Merging into final pre-recon report…");

      const combined = [
        `## ${PRE_RECON_SUBAGENT_NAMES[0]}\n${architecture}`,
        `## ${PRE_RECON_SUBAGENT_NAMES[1]}\n${entrypoints}`,
        `## ${PRE_RECON_SUBAGENT_NAMES[2]}\n${securityPatterns}`,
        `## ${PRE_RECON_SUBAGENT_NAMES[3]}\n${injectionSinks}`,
        `## ${PRE_RECON_SUBAGENT_NAMES[4]}\n${ssrf}`,
        `## ${PRE_RECON_SUBAGENT_NAMES[5]}\n${dataSecurity}`,
      ].join("\n\n---\n\n");

      const synthesisUser = `${PRE_RECON_RUNNER_NOTE}Phase 3 — Synthesis and report generation.

Below are the six specialist markdown outputs from this run. Merge them into ONE document using the **exact** Markdown headings and section order required under "Please structure your report using the exact following Markdown headings" in the system policy (sections 1 through 10, including Penetration Test Scope & Boundaries).

${combined}`;

      const deliverable = await completeChat(client, model, {
        system: systemSpec,
        user: synthesisUser,
        maxUserChars: 200_000,
      });

      const saveOut = await runSaveDeliverable(repoPath, "CODE_ANALYSIS", deliverable);
      if (saveOut.status !== "success") {
        logger.warn(`[pre-recon] save-deliverable step: ${JSON.stringify(saveOut)}`);
      }
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
