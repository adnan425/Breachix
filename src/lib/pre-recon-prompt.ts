import fsp from "node:fs/promises";
import path from "node:path";

/** Breachix pre-recon specialist labels (order matches extractPreReconSubagentInstructions). */
export const PRE_RECON_SUBAGENT_NAMES = [
  "Architecture Scanner Agent",
  "Entry Point Mapper Agent",
  "Security Pattern Hunter Agent",
  "XSS/Injection Sink Hunter Agent",
  "SSRF/External Request Tracer Agent",
  "Data Security Auditor Agent",
] as const;

const PROMPT_FILENAME = "pre-recon-code.txt";

export function resolvePreReconPromptPath(cwd = process.cwd()): string {
  return path.join(cwd, "src", "prompts", PROMPT_FILENAME);
}

/** Load the Breachix pre-recon policy file and substitute \`{{REPO_PATH}}\` / \`{{DESCRIPTION}}\` only. */
export async function loadPreReconPromptTemplate(
  repoPath: string,
  description: string,
  cwd = process.cwd(),
): Promise<string> {
  const policyPath = resolvePreReconPromptPath(cwd);
  let raw: string;
  try {
    raw = await fsp.readFile(policyPath, "utf-8");
  } catch (e) {
    const code = e && typeof e === "object" && "code" in e ? (e as NodeJS.ErrnoException).code : "";
    if (code === "ENOENT") {
      throw new Error(`Pre-recon policy missing at ${policyPath} (cwd=${cwd})`);
    }
    throw e;
  }
  return raw.replaceAll("{{REPO_PATH}}", repoPath).replaceAll("{{DESCRIPTION}}", description);
}

/**
 * Parses the six quoted specialist instructions from the phased-analysis block in the Breachix policy template.
 * If the policy file format changes, update this regex or \`src/prompts/pre-recon-code.txt\`.
 */
export function extractPreReconSubagentInstructions(template: string): string[] {
  const re = /\d+\.\s\*\*[^*]+\*\*:\s*\n\s*"([^"]+)"/gm;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    out.push(m[1]);
  }
  if (out.length !== 6) {
    throw new Error(
      `pre-recon-code.txt: expected 6 sub-agent quoted instructions, found ${out.length}. ` +
        `Refresh src/prompts/pre-recon-code.txt or fix extractPreReconSubagentInstructions().`,
    );
  }
  return out;
}
