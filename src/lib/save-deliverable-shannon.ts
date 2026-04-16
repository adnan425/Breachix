import fs from "node:fs/promises";
import path from "node:path";
import { writeShannonStylePreReconArtifacts } from "./pre-recon-parity";

/**
 * Shannon `save-deliverable --type …` equivalents used by the assessment runner.
 * @see prompts referencing `save-deliverable` (pre-recon-code.txt, recon.txt, vuln-*.txt)
 */

export const SHANNON_SAVE_DELIVERABLE_TYPES = ["CODE_ANALYSIS", "RECON", "VULNERABILITY_HYPOTHESES"] as const;
export type ShannonSaveDeliverableType = (typeof SHANNON_SAVE_DELIVERABLE_TYPES)[number];

export type SaveDeliverableResult = {
  status: "success" | "error";
  filepath?: string;
  message?: string;
  retryable?: boolean;
};

function validateMarkdown(content: string): { ok: true } | { ok: false; message: string } {
  if (typeof content !== "string") return { ok: false, message: "content must be a string" };
  const t = content.trim();
  if (t.length < 20) return { ok: false, message: "deliverable too short after trim" };
  if (content.length > 12_000_000) return { ok: false, message: "deliverable exceeds max size" };
  return { ok: true };
}

/**
 * Shannon-style persistence: validate → mkdir → write → log JSON line (like CLI stdout).
 * `CODE_ANALYSIS` also copies schema files under `deliverables/schemas/` (same as pre-recon parity).
 */
export async function runSaveDeliverable(
  repoPath: string,
  type: ShannonSaveDeliverableType,
  content: string,
): Promise<SaveDeliverableResult> {
  const v = validateMarkdown(content);
  if (!v.ok) {
    const err: SaveDeliverableResult = { status: "error", message: v.message, retryable: true };
    console.info(`[save-deliverable] ${JSON.stringify(err)}`);
    return err;
  }

  try {
    if (type === "CODE_ANALYSIS") {
      const { mdPath, schemasCopied } = await writeShannonStylePreReconArtifacts(repoPath, content);
      const ok = { status: "success" as const, filepath: mdPath };
      console.info(`[save-deliverable] ${JSON.stringify({ ...ok, schemasCopied })}`);
      return ok;
    }

    const deliverRoot = path.join(repoPath, ".breachix", "deliverables");
    await fs.mkdir(deliverRoot, { recursive: true });
    const fileName =
      type === "RECON"
        ? "recon_deliverable.md"
        : "vulnerability_hypotheses_deliverable.md";
    const fp = path.join(deliverRoot, fileName);
    await fs.writeFile(fp, content, "utf-8");
    const ok = { status: "success" as const, filepath: fp };
    console.info(`[save-deliverable] ${JSON.stringify(ok)}`);
    return ok;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const err: SaveDeliverableResult = { status: "error", message, retryable: true };
    console.info(`[save-deliverable] ${JSON.stringify(err)}`);
    return err;
  }
}
