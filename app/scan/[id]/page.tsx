import { getScan } from "@/lib/queries";
import { notFound } from "next/navigation";
import { ScanStatus } from "@/components/scan-status";

export default async function ScanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const scan = await getScan(id);
  if (!scan) notFound();

  return (
    <div className="min-h-screen px-4 py-10 sm:px-6 lg:px-8">
      <main className="mx-auto w-full max-w-4xl space-y-6">
        <ScanStatus scan={scan} />
      </main>
    </div>
  );
}
