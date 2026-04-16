import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", ".trigger", "dist", "build", "out",
  ".cache", "coverage", ".turbo", "__pycache__", ".venv", "vendor",
  ".yarn", ".pnp", "tmp", "temp",
]);

const SCHEMA_EXTENSIONS = [".json", ".yaml", ".yml", ".graphql", ".gql"];
const SCHEMA_PATTERNS = [/openapi/, /swagger/, /schema/, /graphql/, /\.schema\./];

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

/** Tree + key file contents for LLM phases (pre-recon, vuln analysis, etc.). */
export async function buildCodeContext(repoPath: string, targetUrl: string): Promise<string> {
  const allFiles = await walk(repoPath);
  const rel = (f: string) => path.relative(repoPath, f);
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

/** Git facts for Shannon-style “starting context” (no interactive git tools for the model). */
export async function buildGitMetadataSection(repoPath: string): Promise<string> {
  const lines: string[] = ["## Git metadata (worker, read-only)\n"];
  try {
    const { stdout: root } = await execAsync("git rev-parse --show-toplevel", {
      cwd: repoPath,
      timeout: 4000,
    });
    lines.push(`**top-level:** ${root.trim()}`);
  } catch {
    return `${lines.join("")}\n_(not a git repository or git not available)_\n`;
  }
  try {
    const { stdout: head } = await execAsync("git log -1 --oneline", { cwd: repoPath, timeout: 4000 });
    lines.push(`**HEAD:** ${head.trim()}`);
  } catch {
    lines.push("**HEAD:** _(unavailable)_");
  }
  try {
    const { stdout: st } = await execAsync("git status -sb", { cwd: repoPath, timeout: 8000 });
    lines.push(`**short status:**\n\`\`\`\n${st.trim().slice(0, 6000)}\n\`\`\``);
  } catch {
    lines.push("**short status:** _(unavailable)_");
  }
  return `${lines.join("\n")}\n`;
}

/** Absolute paths of schema-like files (Shannon pre-recon schema copy step). */
export async function collectSchemaFilePaths(repoPath: string): Promise<string[]> {
  const allFiles = await walk(repoPath);
  const rel = (f: string) => path.relative(repoPath, f);
  return allFiles.filter((f) => {
    const r = rel(f).toLowerCase();
    return (
      SCHEMA_EXTENSIONS.some((ext) => r.endsWith(ext)) &&
      SCHEMA_PATTERNS.some((p) => p.test(r))
    );
  });
}
