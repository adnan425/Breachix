import { getSettings, saveSettings } from "@/lib/queries";

export async function GET() {
  return Response.json(await getSettings());
}

export async function POST(request: Request) {
  const { ollamaUrl, model } = await request.json() as { ollamaUrl: string; model: string };
  if (!ollamaUrl || !model) {
    return Response.json({ error: "API base URL (ollamaUrl) and model are required" }, { status: 400 });
  }
  return Response.json(await saveSettings(ollamaUrl.trim(), model.trim()));
}
