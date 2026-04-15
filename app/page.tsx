import { getSettings, getScans } from "@/lib/queries";
import { HomeTabs } from "@/components/home-tabs";

export default async function Home() {
  const [settings, scans] = await Promise.all([getSettings(), getScans()]);

  return (
    <div className="min-h-screen px-4 py-10 sm:px-6 lg:px-8">
      <main className="mx-auto w-full max-w-4xl">
        <HomeTabs
          initialSettings={{ ollamaUrl: settings.ollamaUrl, model: settings.model }}
          initialScans={scans}
        />
      </main>
    </div>
  );
}
