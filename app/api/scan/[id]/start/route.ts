import { getScan, restartPreReconScan } from "@/lib/queries";
import { getRuntimeAIConfig } from "@/lib/runtime-ai";
import { tasks } from "@trigger.dev/sdk/v3";
import type { preReconAgent } from "@/src/trigger/pre-recon-agent";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const runtimeAI = getRuntimeAIConfig();
    const { id } = await params;
    const scan = await getScan(id);

    if (!scan) {
      return Response.json({ error: "Scan not found" }, { status: 404 });
    }

    if (scan.status === "running") {
      return Response.json({ error: "Pre-recon is already running." }, { status: 409 });
    }

    const handle = await tasks.trigger<typeof preReconAgent>("pre-recon-agent", {
      scanId: scan.id,
      targetUrl: scan.targetUrl,
      repoPath: scan.repoPath,
      environment: scan.environment,
      baseUrl: runtimeAI.baseUrl,
      model: runtimeAI.model,
      apiKey: runtimeAI.apiKey,
    });

    await restartPreReconScan(scan.id, handle.id);

    return Response.json({ scanId: scan.id, runId: handle.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[scan/start-existing]", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
