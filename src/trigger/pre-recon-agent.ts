import { logger, metadata, task } from "@trigger.dev/sdk/v3";
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { updateScanStatus } from "../lib/queries";
import { buildGitMetadataSection } from "../lib/repo-snapshot";
import { collectExternalScanBlock } from "../lib/pre-recon-parity";
import { runSaveDeliverable } from "../lib/save-deliverable-shannon";
import { loadPreReconPromptTemplate } from "../lib/pre-recon-prompt";

const PRE_RECON_MODEL =
  process.env.PRE_RECON_MODEL ??
  process.env.ANTHROPIC_MEDIUM_MODEL ??
  process.env.MODEL ??
  "claude-sonnet-4-6";

type SDKMessageLike = {
  type?: string;
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PreReconPayload {
  scanId:      string;
  targetUrl:   string;
  repoPath:    string;
  environment: string;
  baseUrl?:    string;
  apiKey?:     string;
  model?:      string;
}

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

export const preReconAgent = task({
  id: "pre-recon-agent",
  machine: { preset: "medium-1x" },
  maxDuration: 3600,
  retry: { maxAttempts: 1 },

  run: async (payload: PreReconPayload) => {
    const { scanId, targetUrl, repoPath, environment, baseUrl, apiKey, model } = payload;

    // ── Progress helper ────────────────────────────────────────────────────
    const setProgress = (phase: string, pct: number, agentStatus: string) => {
      metadata.set("phase", phase);
      metadata.set("progress", pct);
      metadata.set("agentStatus", agentStatus);
      logger.info(`[pre-recon] ${phase} – ${pct}%`);
    };

    try {
      await updateScanStatus(scanId, "running");

      // ── Validate repo path ───────────────────────────────────────────────
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

      // ── Build description for prompt ─────────────────────────────────────
      const description = [
        `Target application URL: ${targetUrl}`,
        `Declared environment: ${environment}`,
        `Repository path on worker host: ${repoPath}`,
      ].join("\n");

      // ── Load Shannon pre-recon prompt template ───────────────────────────
      const systemSpec = await loadPreReconPromptTemplate(repoPath, description);

      // ── Collect worker-side supplemental evidence ─────────────────────────
      setProgress("Shannon-style inputs", 5, "Parallel CLIs + git metadata…");

      const [gitMeta, externalBlock] = await Promise.all([
        buildGitMetadataSection(repoPath),
        collectExternalScanBlock(targetUrl, {
          onStatus: (m) => {
            logger.info(`[pre-recon] ${m}`);
            metadata.set("agentStatus", m);
          },
        }),
      ]);

      const fullPrompt = `${systemSpec}

## Supplemental worker evidence (external recon + git)

${externalBlock}

${gitMeta}

## Runtime note

Return the complete final markdown report in your last assistant response. The runner will persist it to \`.breachix/deliverables/pre_recon_deliverable.md\`.
`;

      const effectiveModel = model || PRE_RECON_MODEL;
      if (!effectiveModel) {
        throw new Error(
          "Missing model for pre-recon. Set PRE_RECON_MODEL or MODEL in environment.",
        );
      }

      let deliverable = "";
      let turns = 0;
      setProgress("Shannon pre-recon run", 12, "Claude Agent SDK running with tool access…");

      const sdkEnv: Record<string, string> = {
        CLAUDE_CODE_MAX_OUTPUT_TOKENS: process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS || "64000",
      };
      if (baseUrl) {
        sdkEnv.ANTHROPIC_BASE_URL = baseUrl;
      }
      if (apiKey) {
        sdkEnv.ANTHROPIC_AUTH_TOKEN = apiKey;
      }
      const passEnv = [
        "ANTHROPIC_API_KEY", 
        "ANTHROPIC_AUTH_TOKEN",
        "ANTHROPIC_BASE_URL",
        "CLAUDE_CODE_OAUTH_TOKEN",
        "HOME",
        "PATH",
      ];
      for (const key of passEnv) {
        const value = process.env[key];
        if (value) sdkEnv[key] = value;
      }

      for await (const message of query({
        prompt: fullPrompt,
        options: {
          model: effectiveModel,
          maxTurns: 10_000,
          cwd: repoPath,
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          settingSources: ["user"],
          env: sdkEnv,
        },
      })) {
        const m = message as SDKMessageLike;

        if (m.type === "assistant") {
          turns += 1;
          if (turns % 5 === 0) {
            metadata.set("agentStatus", `Analyzing repository… (turn ${turns})`);
          }
        }

        if (m.type === "result") {
          if (typeof m.result === "string") {
            deliverable = m.result;
          } else if (typeof m.output === "string") {
            deliverable = m.output;
          } else if (typeof m.final_output === "string") {
            deliverable = m.final_output;
          }
          if (!deliverable.trim()) {
            throw new Error("Pre-recon agent completed without markdown deliverable text.");
          }
          break;
        }
      }

      if (!deliverable.trim()) {
        throw new Error("Pre-recon agent completed without markdown deliverable text.");
      }

      // ── Save deliverable to disk ──────────────────────────────────────────
      const saveOut = await runSaveDeliverable(repoPath, "CODE_ANALYSIS", deliverable);
      if (saveOut.status !== "success") {
        logger.warn(`[pre-recon] save-deliverable: ${JSON.stringify(saveOut)}`);
      }

      // ── Mark complete ─────────────────────────────────────────────────────
      await updateScanStatus(scanId, "completed", deliverable);
      setProgress("Complete", 100, "Pre-reconnaissance finished.");
      logger.info(`[pre-recon] scan ${scanId} completed in ${turns} turns`);

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