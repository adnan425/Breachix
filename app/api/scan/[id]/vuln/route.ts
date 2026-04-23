import { getScan, updateVulnRunId } from "@/lib/queries";
import { getRuntimeAIConfig } from "@/lib/runtime-ai";
import { tasks } from "@trigger.dev/sdk/v3";
import type { vulnAnalysisAgent } from "@/src/trigger/vuln-analysis-agent";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const runtimeAI = getRuntimeAIConfig();
  const { id } = await params;
  const scan = await getScan(id);
  if (!scan) return Response.json({ error: "Not found" }, { status: 404 });

  if (scan.status !== "completed" || !scan.deliverable?.trim()) {
    return Response.json(
      { error: "Pre-recon must finish successfully before vulnerability analysis." },
      { status: 400 },
    );
  }

  if (scan.vulnStatus === "running") {
    return Response.json(
      { error: "Vulnerability analysis is already running for this scan." },
      { status: 409 },
    );
  }

  let handle: { id: string };
  try {
    handle = await tasks.trigger<typeof vulnAnalysisAgent>("vuln-analysis-agent", {
      scanId: scan.id,
      baseUrl: runtimeAI.baseUrl,
      model: runtimeAI.model,
      apiKey: runtimeAI.apiKey,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Trigger failed";
    return Response.json({ error: message }, { status: 500 });
  }

  await updateVulnRunId(scan.id, handle.id);

  return Response.json({ scanId: scan.id, vulnRunId: handle.id });
}
