import { getScan } from "@/lib/queries";
import { runs } from "@trigger.dev/sdk/v3";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const scan = await getScan(id);
  if (!scan) return Response.json({ error: "Not found" }, { status: 404 });

  let phase = "";
  let progress = 0;
  let agentStatus = "";

  let reconPhase = "";
  let reconProgress = 0;
  let reconAgentStatus = "";

  let vulnPhase = "";
  let vulnProgress = 0;
  let vulnAgentStatus = "";

  if (scan.triggerRunId && scan.status === "running") {
    try {
      const run = await runs.retrieve(scan.triggerRunId);
      const meta = run.metadata as Record<string, unknown> | undefined;
      phase = (meta?.["phase"] as string) ?? "";
      progress = (meta?.["progress"] as number) ?? 0;
      agentStatus = (meta?.["agentStatus"] as string) ?? "";
    } catch {
      // run not yet visible
    }
  }

  if (scan.status === "completed") {
    progress = 100;
    phase = "Complete";
  }

  if (scan.reconTriggerRunId && scan.reconStatus === "running") {
    try {
      const run = await runs.retrieve(scan.reconTriggerRunId);
      const meta = run.metadata as Record<string, unknown> | undefined;
      reconPhase = (meta?.["phase"] as string) ?? "";
      reconProgress = (meta?.["progress"] as number) ?? 0;
      reconAgentStatus = (meta?.["agentStatus"] as string) ?? "";
    } catch {
      // run not yet visible
    }
  }

  if (scan.reconStatus === "completed") {
    reconProgress = 100;
    reconPhase = "Complete";
  }

  if (scan.vulnTriggerRunId && scan.vulnStatus === "running") {
    try {
      const run = await runs.retrieve(scan.vulnTriggerRunId);
      const meta = run.metadata as Record<string, unknown> | undefined;
      vulnPhase = (meta?.["phase"] as string) ?? "";
      vulnProgress = (meta?.["progress"] as number) ?? 0;
      vulnAgentStatus = (meta?.["agentStatus"] as string) ?? "";
    } catch {
      // run not yet visible
    }
  }

  if (scan.vulnStatus === "completed") {
    vulnProgress = 100;
    vulnPhase = "Complete";
  }

  return Response.json({
    scan,
    phase,
    progress,
    agentStatus,
    reconPhase,
    reconProgress,
    reconAgentStatus,
    vulnPhase,
    vulnProgress,
    vulnAgentStatus,
  });
}
