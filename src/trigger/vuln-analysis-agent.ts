import { logger, metadata, task } from "@trigger.dev/sdk/v3";
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { getScan, updateVulnStatus } from "../lib/queries";
import { loadExpandedVulnPipelinePrompt } from "../lib/expand-prompt-includes";
import { chat, createRuntimeClient } from "../lib/ai-client";
import { buildCodeContext } from "../lib/repo-snapshot";
import { EVIDENCE_GROUNDING_USER_BLOCK, VULN_SYSTEM_TOOL_BRIDGE } from "../lib/shannon-worker-bridge";
import { runSaveDeliverable } from "../lib/save-deliverable-shannon";

/** Same filenames as Shannon `apps/worker/prompts/vuln-*.txt`. */
const VULN_PIPELINES = [
  { file: "vuln-injection.txt", section: "Injection" },
  { file: "vuln-xss.txt", section: "XSS" },
  { file: "vuln-auth.txt", section: "Authentication" },
  { file: "vuln-authz.txt", section: "Authorization" },
  { file: "vuln-ssrf.txt", section: "SSRF" },
] as const;

function extractTreeLines(snapshot: string, maxChars = 14_000): string {
  const marker = "## Repository File Tree\n";
  const i = snapshot.indexOf(marker);
  if (i === -1) return "(Repository tree marker not found in snapshot.)";
  const tail = snapshot.slice(i + marker.length);
  const next = tail.indexOf("\n## ");
  const block = next === -1 ? tail : tail.slice(0, next);
  return block.trim().slice(0, maxChars);
}

const SYNTHESIS_SYSTEM = `You are merging five specialist Markdown outputs into one document per the same engagement rules as the Shannon vulnerability pipeline.

Output a single report titled exactly: # Vulnerability Hypotheses (Phase 3)

Use level-2 headings in this order: ## Injection, ## XSS, ## Authentication, ## Authorization, ## SSRF

**Anti-hallucination:** Delete or rewrite any specialist bullet that cites code, paths, or endpoints that do not literally appear in (a) the allowed-path reference the user pasted, or (b) the same user message's pre-recon / recon / snapshot excerpts the specialists were given. Generic security tutorials, invented \`src/auth/...\` paths, or fictional snippets must be removed entirely—not summarized.

If a category ends up with nothing grounded, keep the heading and one sentence: no evidenced hypotheses in inputs.

Do not add exploitation steps or payloads.`;

export interface VulnAnalysisPayload {
  scanId: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export const vulnAnalysisAgent = task({
  id: "vuln-analysis-agent",
  maxDuration: 3600,
  retry: { maxAttempts: 1 },

  run: async (payload: VulnAnalysisPayload) => {
    const { scanId, baseUrl, model, apiKey } = payload;

    const setProgress = (phase: string, pct: number, agentStatus: string) => {
      metadata.set("phase", phase);
      metadata.set("progress", pct);
      metadata.set("agentStatus", agentStatus);
      logger.info(`[vuln-analysis] ${phase} – ${pct}%`);
    };

    try {
      const scan = await getScan(scanId);
      if (!scan) throw new Error(`Scan not found: ${scanId}`);
      if (scan.status !== "completed" || !scan.deliverable?.trim()) {
        throw new Error("Pre-recon must complete with a deliverable before vulnerability analysis.");
      }

      try {
        await fs.stat(scan.repoPath);
        await fs.access(scan.repoPath, fsConstants.R_OK);
      } catch {
        throw new Error(`repoPath is not readable on this worker: ${scan.repoPath}`);
      }

      const client = createRuntimeClient(baseUrl, apiKey);
      const ctx = { webUrl: scan.targetUrl, repoPath: scan.repoPath };

      const preCap = 55_000;
      const reconCap = 40_000;
      const preBlock = scan.deliverable.slice(0, preCap);
      const reconBlock =
        scan.reconDeliverable?.trim()
          ? scan.reconDeliverable.slice(0, reconCap)
          : "(Phase 2 reconnaissance was not run or has no deliverable—treat recon deliverable as absent; use pre-recon and snapshot only.)";

      setProgress("Repository snapshot", 6, "Walking repo for vulnerability context…");
      const snapshot = await buildCodeContext(scan.repoPath, scan.targetUrl);
      const treeRef = extractTreeLines(snapshot);
      logger.info(`[vuln-analysis] snapshot: ${snapshot.length} chars`);

      const baseUser = `${EVIDENCE_GROUNDING_USER_BLOCK}
## Pre-reconnaissance deliverable (truncated to ${preCap} chars if long)

${preBlock}

---

## Reconnaissance deliverable (truncated to ${reconCap} chars if present)

${reconBlock}

---

## Repository snapshot

${snapshot}

---

`;

      setProgress("Parallel specialists", 18, VULN_PIPELINES.map((p) => p.file).join(" · "));

      const specialistOutputs = await Promise.all(
        VULN_PIPELINES.map(async ({ file }) => {
          const shannonBody = await loadExpandedVulnPipelinePrompt(file, ctx);
          const system = `${VULN_SYSTEM_TOOL_BRIDGE}${shannonBody}`;
          return chat(client, model, {
            system,
            user: `${baseUser}Execute only your specialist role from the system policy (after the worker-environment block). Output Markdown. If the evidence sections lack content for your category, output only the one-sentence "No hypotheses…" line from **Evidence grounding** above.`,
            maxUserChars: 200_000,
            temperature: 0,
          });
        }),
      );

      setProgress("Synthesis", 78, "Merging five specialist outputs…");

      const combined = VULN_PIPELINES.map(
        (p, i) => `## Specialist (${p.file}): ${p.section}\n\n${specialistOutputs[i]}`,
      ).join("\n\n---\n\n");

      const synthPre = preBlock.slice(0, 12_000);
      const synthRecon = reconBlock.slice(0, 8_000);

      const synthesisUser = `${EVIDENCE_GROUNDING_USER_BLOCK}

## Verification: pre-recon excerpt (specialists used up to ${preCap} chars; compare before keeping any claim)

${synthPre}

---

## Verification: recon excerpt

${synthRecon}

---

## Verification: repository file tree (paths must exist here or in excerpts above)

\`\`\`
${treeRef}
\`\`\`

---

Below are the five parallel specialist outputs. Merge per your system instructions. Strip any claim not supported by the verification sections.

---

${combined}`;

      const deliverable = await chat(client, model, {
        system: SYNTHESIS_SYSTEM,
        user: synthesisUser,
        maxUserChars: 200_000,
        temperature: 0,
      });

      const saveOut = await runSaveDeliverable(scan.repoPath, "VULNERABILITY_HYPOTHESES", deliverable);
      if (saveOut.status !== "success") {
        logger.warn(`[vuln-analysis] save-deliverable step: ${JSON.stringify(saveOut)}`);
      }
      await updateVulnStatus(scanId, "completed", deliverable);
      setProgress("Complete", 100, "Vulnerability analysis finished.");
      logger.info(`[vuln-analysis] scan ${scanId} completed`);

      return { scanId, status: "completed", vulnDeliverable: deliverable };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await updateVulnStatus(scanId, "failed").catch(() => null);
      metadata.set("error", msg);
      logger.error(`[vuln-analysis] scan ${scanId} failed: ${msg}`);
      throw err;
    }
  },
});
