import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { collectSchemaFilePaths } from "./repo-snapshot";

const execFileAsync = promisify(execFile);

export type ExternalToolHooks = {
  /** e.g. update Trigger metadata / logs between major steps */
  onStatus?: (message: string) => void;
};

function cap(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n…[truncated]`;
}

function hostnameFromUrl(targetUrl: string): string | null {
  try {
    const h = new URL(targetUrl).hostname;
    return h || null;
  } catch {
    return null;
  }
}

type ToolSpec = {
  label: string;
  file: string;
  args: string[];
  timeoutMs: number;
};

async function runTool(spec: ToolSpec): Promise<{ label: string; body: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(spec.file, spec.args, {
      timeout: spec.timeoutMs,
      maxBuffer: 8_000_000,
      windowsHide: true,
    });
    const out = `${stdout}${stderr ? `\n${stderr}` : ""}`.trim();
    return {
      label: spec.label,
      body: `### ${spec.label}\n\`\`\`\n${cap(out, 16_000)}\n\`\`\`\n`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      label: spec.label,
      body: `### ${spec.label}\n_(not available or failed on this worker: ${cap(msg, 900)})_\n`,
    };
  }
}

/**
 * Shannon-style **pre-recon external** bundle: run many CLIs **in parallel** on the Trigger worker
 * (same phase as Shannon—still “pre-recon”, not a new product phase).
 * Tools are best-effort; missing binaries are reported inline like a skipped agent step.
 */
export async function collectExternalScanBlock(
  targetUrl: string,
  hooks?: ExternalToolHooks,
): Promise<string> {
  const host = hostnameFromUrl(targetUrl);
  if (!host) {
    return "## External scan tooling (Shannon-style worker inputs)\n\n_Invalid target URL — no host to scan._\n";
  }

  hooks?.onStatus?.("Pre-recon external: running CLIs in parallel (curl, dig, whatweb, nmap, subfinder, httpx, whois)…");

  const specs: ToolSpec[] = [
    {
      label: "curl (response headers)",
      file: "curl",
      args: ["-sSIL", "--max-time", "30", "--connect-timeout", "10", targetUrl],
      timeoutMs: 35_000,
    },
    {
      label: "dig A",
      file: "dig",
      args: ["+timeout=4", "+tries=1", "+short", host, "A"],
      timeoutMs: 12_000,
    },
    {
      label: "dig AAAA",
      file: "dig",
      args: ["+timeout=4", "+tries=1", "+short", host, "AAAA"],
      timeoutMs: 12_000,
    },
    {
      label: "whatweb",
      file: "whatweb",
      args: [targetUrl],
      timeoutMs: 55_000,
    },
    {
      label: "nmap (top ports, -Pn -F)",
      file: "nmap",
      args: ["-Pn", "-F", "--host-timeout", "90s", host],
      timeoutMs: 120_000,
    },
    {
      label: "subfinder",
      file: "subfinder",
      args: ["-d", host, "-silent", "-timeout", "30"],
      timeoutMs: 95_000,
    },
    {
      label: "httpx (probe)",
      file: "httpx",
      args: ["-silent", "-u", targetUrl, "-title", "-tech-detect", "-cdn", "-timeout", "25"],
      timeoutMs: 40_000,
    },
    {
      label: "whois (domain)",
      file: "whois",
      args: [host],
      timeoutMs: 35_000,
    },
  ];

  const chunks = await Promise.all(specs.map((s) => runTool(s)));
  hooks?.onStatus?.(
    `Pre-recon external: finished ${chunks.length} tool slots (see markdown for per-tool success/failure).`,
  );

  const header = "## External scan tooling (Shannon-style worker inputs)\n\n";
  const note =
    "_All commands run on the Trigger.dev worker host in **parallel** (same pre-recon phase as Shannon’s bundled external recon). Install missing tools in your worker image if you want fuller output._\n\n";
  return header + note + chunks.map((c) => c.body).join("\n");
}

function safeSchemaDestName(repoPath: string, absFile: string): string {
  const rel = path.relative(repoPath, absFile).replace(/[/\\]/g, "__");
  return rel.replace(/[^\w.\-()+]/g, "_");
}

/**
 * Writes the same on-disk artifacts Shannon expects (plus Breachix DB copy elsewhere).
 * `pre_recon_deliverable.md` and `deliverables/schemas/*` under `.breachix/`.
 */
export async function writeShannonStylePreReconArtifacts(
  repoPath: string,
  deliverableMarkdown: string,
): Promise<{ mdPath: string; schemasCopied: number }> {
  const deliverRoot = path.join(repoPath, ".breachix", "deliverables");
  const mdPath = path.join(deliverRoot, "pre_recon_deliverable.md");
  const schemaDir = path.join(deliverRoot, "schemas");

  await fs.mkdir(schemaDir, { recursive: true });
  await fs.writeFile(mdPath, deliverableMarkdown, "utf-8");

  let schemasCopied = 0;
  const schemaFiles = await collectSchemaFilePaths(repoPath);
  for (const abs of schemaFiles) {
    const base = safeSchemaDestName(repoPath, abs);
    const dest = path.join(schemaDir, base);
    try {
      await fs.copyFile(abs, dest);
      schemasCopied += 1;
    } catch (e) {
      console.warn(`[pre-recon] schema copy skipped ${abs}:`, e);
    }
  }

  return { mdPath, schemasCopied };
}

/** Best-effort disk write; prefer \`runSaveDeliverable(..., "CODE_ANALYSIS", ...)\` from tasks for structured Shannon \`save-deliverable\` logging. */
export async function tryWriteShannonStylePreReconArtifacts(
  repoPath: string,
  deliverableMarkdown: string,
): Promise<void> {
  try {
    const { mdPath, schemasCopied } = await writeShannonStylePreReconArtifacts(repoPath, deliverableMarkdown);
    console.info(`[pre-recon] wrote Shannon-style artifacts: ${mdPath} (schemas copied: ${schemasCopied})`);
  } catch (e) {
    console.warn(
      `[pre-recon] could not write .breachix/deliverables (repo may be read-only): ${e instanceof Error ? e.message : e}`,
    );
  }
}
