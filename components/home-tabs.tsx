"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScanRow {
  id: string;
  targetUrl: string;
  repoPath: string;
  status: string;
  reconStatus?: string | null;
  createdAt: string | Date;
}

interface HomeTabsProps {
  initialSettings: { ollamaUrl: string; model: string };
  initialScans: ScanRow[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_DOT: Record<string, string> = {
  pending:   "bg-yellow-400",
  running:   "bg-blue-500 animate-pulse",
  completed: "bg-green-500",
  failed:    "bg-red-500",
};

function timeAgo(date: string | Date) {
  const diff = (Date.now() - new Date(date).getTime()) / 1000;
  if (diff < 60)   return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HomeTabs({ initialSettings, initialScans }: HomeTabsProps) {
  const router = useRouter();

  // Scan form
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError]     = useState<string | null>(null);

  // Scans list
  const [scans, setScans] = useState<ScanRow[]>(initialScans);

  // Settings
  const [ollamaUrl,      setOllamaUrl]      = useState(initialSettings.ollamaUrl);
  const [model,          setModel]          = useState(initialSettings.model);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved,  setSettingsSaved]  = useState(false);
  const [settingsError,  setSettingsError]  = useState<string | null>(null);

  // Poll scans list every 4 s when any run is active
  const hasActive = scans.some(
    (s) =>
      s.status === "running" ||
      s.status === "pending" ||
      s.reconStatus === "running",
  );

  const refreshScans = useCallback(async () => {
    try {
      const res = await fetch("/api/scans");
      if (res.ok) setScans(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!hasActive) return;
    const id = setInterval(refreshScans, 4000);
    return () => clearInterval(id);
  }, [hasActive, refreshScans]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  async function handleScanSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setScanLoading(true);
    setScanError(null);

    const form = e.currentTarget;
    const data = {
      targetUrl:   (form.elements.namedItem("targetUrl") as HTMLInputElement).value,
      repoPath:    (form.elements.namedItem("repoPath")  as HTMLInputElement).value,
      environment: "local",
    };

    try {
      const res  = await fetch("/api/scan/start", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(data),
      });
      const json = await res.json().catch(() => ({ error: `Server error (${res.status})` }));
      if (!res.ok) throw new Error(json.error ?? "Failed to start scan");
      router.push(`/scan/${json.scanId}`);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setScanLoading(false);
    }
  }

  async function handleSettingsSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSettingsSaving(true);
    setSettingsError(null);
    setSettingsSaved(false);

    try {
      const res  = await fetch("/api/settings", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ollamaUrl, model }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save settings");
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSettingsSaving(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Breachix</p>
        <h1 className="text-3xl font-semibold tracking-tight">AI Penetration Testing</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          White-box security scanning powered by local AI. Configure your model,
          then launch a reconnaissance agent against your application.
        </p>
      </header>

      <Tabs defaultValue="scans">
        <TabsList className="mb-4">
          <TabsTrigger value="scans">Scans {scans.length > 0 && `(${scans.length})`}</TabsTrigger>
          <TabsTrigger value="scan">New Scan</TabsTrigger>
          <TabsTrigger value="settings">AI Settings</TabsTrigger>
        </TabsList>

        {/* ---------------------------------------------------------------- */}
        {/* Scans list tab                                                   */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="scans">
          {scans.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No scans yet. Go to{" "}
                <span className="font-medium text-foreground">New Scan</span>{" "}
                to start your first pre-recon agent.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {scans.map((scan) => (
                <Link
                  key={scan.id}
                  href={`/scan/${scan.id}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm transition-colors hover:bg-muted/50"
                >
                  {/* Status dot */}
                  <span
                    className={`size-2 shrink-0 rounded-full ${STATUS_DOT[scan.status] ?? "bg-muted-foreground"}`}
                  />

                  {/* Target URL */}
                  <span className="flex-1 truncate font-medium">{scan.targetUrl}</span>

                  {/* Repo path */}
                  <span className="hidden truncate text-muted-foreground sm:block max-w-[220px]">
                    {scan.repoPath}
                  </span>

                  {/* Status badge */}
                  <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">
                    {scan.status}
                  </span>

                  {/* Time */}
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {timeAgo(scan.createdAt)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ---------------------------------------------------------------- */}
        {/* New scan tab                                                     */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="scan">
          <form onSubmit={handleScanSubmit} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Scan details</CardTitle>
                <CardDescription>
                  Model{" "}
                  <span className="font-mono text-foreground">{model}</span>
                  {" · "}
                  <span className="font-mono text-foreground">{ollamaUrl}</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="targetUrl">
                    Target URL <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="targetUrl"
                    name="targetUrl"
                    type="url"
                    required
                    placeholder="https://staging.example.com"
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="repoPath">
                    Source code path <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="repoPath"
                    name="repoPath"
                    required
                    placeholder="/Users/you/projects/my-app"
                  />
                  <p className="text-xs text-muted-foreground">
                    Absolute path to the repo on this machine.
                  </p>
                </div>
              </CardContent>
            </Card>

            {scanError && <p className="text-sm text-destructive">{scanError}</p>}

            <Button type="submit" className="w-full" disabled={scanLoading}>
              {scanLoading ? "Starting scan…" : "Start Pre-Recon Agent"}
            </Button>
          </form>
        </TabsContent>

        {/* ---------------------------------------------------------------- */}
        {/* Settings tab                                                     */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="settings">
          <form onSubmit={handleSettingsSave} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>AI Provider</CardTitle>
                <CardDescription>
                  Base URL and model for any OpenAI-compatible chat API (local or
                  hosted). The worker must be able to reach this URL when a scan
                  runs.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="ollamaUrl">API base URL</Label>
                  <Input
                    id="ollamaUrl"
                    value={ollamaUrl}
                    onChange={(e) => setOllamaUrl(e.target.value)}
                    placeholder="http://localhost:11434"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Root URL only (no <span className="font-mono">/v1</span> suffix).
                    Breachix calls <span className="font-mono">{"{base}/v1/chat/completions"}</span>.
                  </p>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="model">Model</Label>
                  <Input
                    id="model"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="llama3.1"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Model id your server expects (provider-specific).
                  </p>
                </div>
              </CardContent>
            </Card>

            {settingsError && <p className="text-sm text-destructive">{settingsError}</p>}

            <Button
              type="submit"
              className="w-full"
              disabled={settingsSaving}
              variant={settingsSaved ? "outline" : "default"}
            >
              {settingsSaving ? "Saving…" : settingsSaved ? "✓ Settings saved" : "Save Settings"}
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}
