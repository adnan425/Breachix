import { logger, metadata, task } from "@trigger.dev/sdk/v3";
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { getScan, updateReconStatus } from "../lib/queries";
import { completeChat, createOllamaClient } from "../lib/ai-client";
import { collectLiveSurfaceSignals } from "../lib/live-surface";

function resolveReconPromptPath(cwd = process.cwd()): string {
  return path.join(cwd, "src", "prompts", "recon-code.txt");
}

async function loadReconSystemPrompt(cwd = process.cwd()): Promise<string> {
  return fs.readFile(resolveReconPromptPath(cwd), "utf-8");
}

export interface ReconLitePayload {
  scanId: string;
  ollamaUrl: string;
  model: string;
}

export const reconLiteAgent = task({
  id: "recon-lite-agent",
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

      setProgress("Fetching live target", 12, "GET target, robots.txt, sitemap.xml…");
      const liveSignals = await collectLiveSurfaceSignals(scan.targetUrl);
      logger.info(`[recon-lite] live bundle: ${liveSignals.length} chars`);

      setProgress("Reconnaissance synthesis", 45, "Merging pre-recon + live signals…");
      const system = await loadReconSystemPrompt();
      const preReconCap = 95_000;
      const preRecon = scan.deliverable.slice(0, preReconCap);

      const user = `## Pre-reconnaissance deliverable (truncated to ${preReconCap} chars if long)

${preRecon}

---

## Read-only live HTTP signal bundle (worker-generated)

${liveSignals}

---

Produce the reconnaissance markdown using the required headings in the system instructions.`;

      const client = createOllamaClient(ollamaUrl);
      const deliverable = await completeChat(client, model, {
        system,
        user,
        maxUserChars: 200_000,
      });

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
