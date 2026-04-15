import { getScan, getSettings, updateReconRunId } from "@/lib/queries";
import { tasks } from "@trigger.dev/sdk/v3";
import type { reconLiteAgent } from "@/src/trigger/recon-lite-agent";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const scan = await getScan(id);
  if (!scan) return Response.json({ error: "Not found" }, { status: 404 });

  if (scan.status !== "completed" || !scan.deliverable?.trim()) {
    return Response.json(
      { error: "Pre-recon must finish successfully before reconnaissance." },
      { status: 400 },
    );
  }

  if (scan.reconStatus === "running") {
    return Response.json({ error: "Reconnaissance is already running for this scan." }, { status: 409 });
  }

  const settings = await getSettings();

  let handle: { id: string };
  try {
    handle = await tasks.trigger<typeof reconLiteAgent>("recon-lite-agent", {
      scanId: scan.id,
      ollamaUrl: settings.ollamaUrl,
      model: settings.model,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Trigger failed";
    return Response.json({ error: message }, { status: 500 });
  }

  await updateReconRunId(scan.id, handle.id);

  return Response.json({ scanId: scan.id, reconRunId: handle.id });
}
