import fs from "node:fs/promises";
import path from "node:path";

const INCLUDE_RE = /@include\(shared\/([^)]+)\)/;

/**
 * Resolves Shannon-style `@include(shared/...)` directives against `src/prompts/shared/`
 * (same layout as KeygraphHQ/shannon `apps/worker/prompts`).
 */
export async function expandSharedIncludes(text: string, cwd = process.cwd()): Promise<string> {
  const promptsDir = path.join(cwd, "src", "prompts");
  let out = text;
  for (let i = 0; i < 20; i++) {
    const m = INCLUDE_RE.exec(out);
    if (!m) break;
    const rel = m[1];
    const incPath = path.join(promptsDir, "shared", rel);
    const snippet = await fs.readFile(incPath, "utf-8").catch(
      () => `\n<!-- missing include: shared/${rel} -->\n`,
    );
    out = out.replace(m[0], snippet);
  }
  return out;
}

export function substituteVulnWorkerPlaceholders(template: string): string {
  return template
    .replaceAll(
      "{{LOGIN_INSTRUCTIONS}}",
      "(none — no stored credentials or browser session attached to this run; use pre-recon, recon, and repository snapshot in the user message only.)",
    )
    .replaceAll("{{PLAYWRIGHT_SESSION}}", "n/a");
}

export function substituteReconPlaceholders(
  template: string,
  opts: { webUrl: string; repoPath: string; description: string },
): string {
  return template
    .replaceAll("{{WEB_URL}}", opts.webUrl)
    .replaceAll("{{REPO_PATH}}", opts.repoPath)
    .replaceAll("{{DESCRIPTION}}", opts.description)
    .replaceAll("{{RULES_AVOID}}", "(none)")
    .replaceAll("{{RULES_FOCUS}}", "(none)")
    .replaceAll(
      "{{LOGIN_INSTRUCTIONS}}",
      "(none — no interactive login or stored session; live signals are worker-run Playwright plus read-only HTTP, inlined in the user message.)",
    )
    .replaceAll("{{PLAYWRIGHT_SESSION}}", "n/a");
}

/** Shannon `vuln-*.txt` with `shared/` includes expanded and worker placeholders applied. */
export async function loadExpandedVulnPipelinePrompt(
  filename: string,
  ctx: { webUrl: string; repoPath: string },
  cwd = process.cwd(),
): Promise<string> {
  const raw = await fs.readFile(path.join(cwd, "src", "prompts", filename), "utf-8");
  let out = await expandSharedIncludes(raw, cwd);
  out = out.replaceAll("{{WEB_URL}}", ctx.webUrl).replaceAll("{{REPO_PATH}}", ctx.repoPath);
  return substituteVulnWorkerPlaceholders(out);
}
