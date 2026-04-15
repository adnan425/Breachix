import { getSettings, createScan, updateScanRunId, updateScanStatus } from "@/lib/queries";
import { tasks } from "@trigger.dev/sdk/v3";
import type { preReconAgent } from "@/src/trigger/pre-recon-agent";

export async function POST(request: Request) {
  try {
    const { targetUrl, repoPath, environment, workspaceName } = await request.json() as {
      targetUrl: string;
      repoPath: string;
      environment: string;
      workspaceName?: string;
    };

    if (!targetUrl || !repoPath || !environment) {
      return Response.json(
        { error: "targetUrl, repoPath, and environment are required" },
        { status: 400 },
      );
    }

    const [settings, scan] = await Promise.all([
      getSettings(),
      createScan({ targetUrl, repoPath, environment, workspaceName }),
    ]);

    let handle: { id: string };
    try {
      handle = await tasks.trigger<typeof preReconAgent>("pre-recon-agent", {
        scanId: scan.id,
        targetUrl,
        repoPath,
        environment,
        ollamaUrl: settings.ollamaUrl,
        model: settings.model,
      });
    } catch (triggerErr) {
      await updateScanStatus(scan.id, "failed").catch(() => null);
      throw triggerErr;
    }

    await updateScanRunId(scan.id, handle.id);

    return Response.json({ scanId: scan.id, runId: handle.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[scan/start]", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
