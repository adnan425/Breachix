import { logger, task } from "@trigger.dev/sdk/v3";
import {
  runSaveDeliverable,
  type SaveDeliverableResult,
  type ShannonSaveDeliverableType,
  SHANNON_SAVE_DELIVERABLE_TYPES,
} from "../lib/save-deliverable-shannon";

export interface SaveDeliverablePayload {
  repoPath: string;
  type: ShannonSaveDeliverableType;
  content: string;
}

function isSaveType(s: string): s is ShannonSaveDeliverableType {
  return (SHANNON_SAVE_DELIVERABLE_TYPES as readonly string[]).includes(s);
}

/**
 * Standalone Shannon-style `save-deliverable` step (validate + write + JSON-shaped result).
 * Phase tasks also call `runSaveDeliverable` inline after LLM output; this task is for
 * retries, manual runs, or future orchestration that mirrors Shannon’s discrete CLI invocations.
 */
export const saveDeliverableAgent = task({
  id: "save-deliverable-agent",
  maxDuration: 300,
  retry: { maxAttempts: 2 },

  run: async (payload: SaveDeliverablePayload): Promise<SaveDeliverableResult> => {
    const { repoPath, type, content } = payload;
    if (!isSaveType(type)) {
      const err: SaveDeliverableResult = {
        status: "error",
        message: `invalid type: ${String(type)}`,
        retryable: false,
      };
      logger.error(`[save-deliverable-agent] ${JSON.stringify(err)}`);
      return err;
    }
    const out = await runSaveDeliverable(repoPath, type, content);
    if (out.status === "error") {
      logger.warn(`[save-deliverable-agent] ${JSON.stringify(out)}`);
    } else {
      logger.info(`[save-deliverable-agent] ${JSON.stringify(out)}`);
    }
    return out;
  },
});
