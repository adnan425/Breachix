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
  vulnStatus?: string | null;
  createdAt: string | Date;
}

interface HomeTabsProps { 
  initialScans: ScanRow[];
  runtimeModel: string;
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

export function HomeTabs({ initialScans, runtimeModel }: HomeTabsProps) {
  const router = useRouter();

  // Scan form
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError]     = useState<string | null>(null);
  const [deleteAllLoading, setDeleteAllLoading] = useState(false);
  const [scansError, setScansError] = useState<string | null>(null);

  // Scans list
  const [scans, setScans] = useState<ScanRow[]>(initialScans);

  // Poll scans list every 4 s when any run is active
  const hasActive = scans.some(
    (s) =>
      s.status === "running" ||
      s.status === "pending" ||
      s.reconStatus === "running" ||
      s.vulnStatus === "running",
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

  async function handleDeleteAllScans() {
    if (scans.length === 0 || deleteAllLoading) return;
    setScansError(null);
    const confirmed = window.confirm("Delete all scans? This action cannot be undone.");
    if (!confirmed) return;

    setDeleteAllLoading(true);
    try {
      const res = await fetch("/api/scans", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete scans");
      setScans([]);
    } catch {
      setScansError("Failed to delete all scans. Please try again.");
    } finally {
      setDeleteAllLoading(false);
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
              {scansError && <p className="text-sm text-destructive">{scansError}</p>}
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteAllScans}
                  disabled={deleteAllLoading}
                >
                  {deleteAllLoading ? "Deleting..." : "Delete all"}
                </Button>
              </div>
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
                  <span className="font-mono text-foreground">{runtimeModel}</span>
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
        {/* Runtime config tab                                               */}
        {/* ---------------------------------------------------------------- */}
      </Tabs>
    </div>
  );
}
