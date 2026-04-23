import { HomeTabs } from "@/components/home-tabs";
import { getScans } from "@/lib/queries";
import { getRuntimeModel } from "@/lib/runtime-ai";

export default async function Home() {
  const scans = await getScans();
  const runtimeModel = getRuntimeModel();

  return (
    <div className="min-h-screen px-4 py-10 sm:px-6 lg:px-8">
      <main className="mx-auto w-full max-w-4xl">
        <HomeTabs initialScans={scans} runtimeModel={runtimeModel} />
      </main>
    </div>
  );
}
