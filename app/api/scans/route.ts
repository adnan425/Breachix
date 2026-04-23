import { deleteAllScans, getScans } from "@/lib/queries";

export async function GET() {
  return Response.json(await getScans());
}

export async function DELETE() {
  const result = await deleteAllScans();
  return Response.json({ deletedCount: result.count });
}
