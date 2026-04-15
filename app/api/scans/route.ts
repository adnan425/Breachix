import { getScans } from "@/lib/queries";

export async function GET() {
  return Response.json(await getScans());
}
