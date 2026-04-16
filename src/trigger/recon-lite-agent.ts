import { logger, metadata, task } from "@trigger.dev/sdk/v3";
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { getScan, updateReconStatus } from "../lib/queries";
import { substituteReconPlaceholders } from "../lib/expand-prompt-includes";
import { completeChat, createOllamaClient } from "../lib/ai-client";
import { gatherLiveBrowserRecon } from "../lib/recon-browser";
import { collectLiveSurfaceSignals } from "../lib/live-surface";
import { RECON_RUNNER_NOTE } from "../lib/shannon-worker-bridge";
import { runSaveDeliverable } from "../lib/save-deliverable-shannon";

/** Shannon `apps/worker/prompts/recon.txt` — same basename for diffing against upstream. */
function resolveReconPromptPath(cwd = process.cwd()): string {
  return path.join(cwd, "src", "prompts", "recon.txt");
}

async function loadReconSystemPromptForScan(
  scan: { targetUrl: string; repoPath: string; environment: string; workspaceName: string | null },
  cwd = process.cwd(),
): Promise<string> {
  const raw = await fs.readFile(resolveReconPromptPath(cwd), "utf-8");
  const description = [
    `Declared environment: ${scan.environment}`,
    scan.workspaceName ? `Workspace name: ${scan.workspaceName}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return substituteReconPlaceholders(raw, {
    webUrl: scan.targetUrl,
    repoPath: scan.repoPath,
    description,
  });
}

export interface ReconLitePayload {
  scanId: string;
  ollamaUrl: string;
  model: string;
}

export const reconLiteAgent = task({
  id: "recon-lite-agent",
  machine: { preset: "medium-1x" },
  maxDuration: 1800,
  retry: { maxAttempts: 1 },

  run: async (payload: ReconLitePayload) => {
    const { scanId, ollamaUrl, model } = payload;

    const setProgress = (phase: string, pct: number, agentStatus: string) => {
      metadata.set("phase", phase);
      metadata.set("progress", pct);
      metadata.set("agentStatus", agentStatus);
      logger.info(`[recon-lite] ${phase} – ${pct}%`);
    };

    try {
      const scan = await getScan(scanId);
      if (!scan) throw new Error(`Scan not found: ${scanId}`);
      if (scan.status !== "completed" || !scan.deliverable?.trim()) {
        throw new Error("Pre-recon must complete with a deliverable before reconnaissance.");
      }

      try {
        await fs.stat(scan.repoPath);
        await fs.access(scan.repoPath, fsConstants.R_OK);
      } catch {
        logger.warn(`[recon-lite] repoPath not readable (continuing with live + pre-recon only): ${scan.repoPath}`);
      }

      setProgress("Live surface", 12, "Playwright + parallel GET (robots, sitemap)…");
      const [browserBundle, fetchBundle] = await Promise.all([
        gatherLiveBrowserRecon(scan.targetUrl).catch((e) => {
          const msg = e instanceof Error ? e.message : String(e);
          logger.warn(`[recon-lite] Playwright bundle failed: ${msg}`);
          return `## Playwright live navigation\n\n(failed: ${msg})\n`;
        }),
        collectLiveSurfaceSignals(scan.targetUrl),
      ]);
      logger.info(
        `[recon-lite] live bundles: playwright ${browserBundle.length} chars, fetch ${fetchBundle.length} chars`,
      );

      setProgress("Reconnaissance synthesis", 45, "Merging pre-recon + browser + HTTP signals…");
      const system = await loadReconSystemPromptForScan(scan);
      const preReconCap = 95_000;
      const preRecon = scan.deliverable.slice(0, preReconCap);

      const user = `${RECON_RUNNER_NOTE}## \`.breachix/deliverables/pre_recon_deliverable.md\` (inlined; truncated to ${preReconCap} chars if long)

${preRecon}

---

## Live application observations (worker runner: browser + HTTP)

${browserBundle}

---

### Raw HTTP signals (robots, sitemap, primary GET)

${fetchBundle}`;

      const client = createOllamaClient(ollamaUrl);
      const deliverable = await completeChat(client, model, {
        system,
        user,
        maxUserChars: 200_000,
      });

      const saveOut = await runSaveDeliverable(scan.repoPath, "RECON", deliverable);
      if (saveOut.status !== "success") {
        logger.warn(`[recon-lite] save-deliverable step: ${JSON.stringify(saveOut)}`);
      }
      await updateReconStatus(scanId, "completed", deliverable);
      setProgress("Complete", 100, "Reconnaissance finished.");
      logger.info(`[recon-lite] scan ${scanId} recon completed`);

      return { scanId, status: "completed", reconDeliverable: deliverable };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await updateReconStatus(scanId, "failed").catch(() => null);
      metadata.set("error", msg);
      logger.error(`[recon-lite] scan ${scanId} failed: ${msg}`);
      throw err;
    }
  },
});
