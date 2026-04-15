"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";

interface Scan {
  id: string;
  targetUrl: string;
  repoPath: string;
  environment: string;
  workspaceName: string | null;
  status: string;
  triggerRunId: string | null;
  deliverable: string | null;
  reconStatus: string | null;
  reconTriggerRunId: string | null;
  reconDeliverable: string | null;
  createdAt: Date;
}

const PHASE_LABELS: Record<string, string> = {
  "Reading codebase": "Reading codebase…",
  "Architecture Analysis": "Architecture analysis",
  "Entry Point Mapping": "Entry point mapping",
  "Security Pattern Analysis": "Security pattern analysis",
  "Injection Sink Hunting": "Injection sink hunting",
  "SSRF Analysis": "SSRF analysis",
  "Data Security Audit": "Data security audit",
  "Synthesizing Deliverable": "Synthesizing deliverable",
  "Phase 1 – Discovery": "Phase 1 – Discovery",
  "Phase 1 complete": "Phase 1 complete",
  "Phase 2 – Vulnerability Analysis": "Phase 2 – Vulnerability analysis (pre-recon)",
  "Phase 2 complete": "Phase 2 complete",
  "Phase 3 – Synthesis": "Phase 3 – Synthesis",
  "Fetching live target": "Fetching live target…",
  "Reconnaissance synthesis": "Reconnaissance synthesis…",
  "Complete": "Complete",
};

const RECON_PHASE_LABELS: Record<string, string> = {
  "Fetching live target": "Fetching live target…",
  "Reconnaissance synthesis": "Correlating code + live surface…",
  "Complete": "Complete",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "text-muted-foreground",
  running: "text-blue-600",
  completed: "text-green-600",
  failed: "text-destructive",
};

export function ScanStatus({ scan: initialScan }: { scan: Scan }) {
  const [scan, setScan] = useState(initialScan);
  const [phase, setPhase] = useState<string>("");
  const [progress, setProgress] = useState(0);
  const [agentStatus, setAgentStatus] = useState<string>("");
  const [reconPhase, setReconPhase] = useState<string>("");
  const [reconProgress, setReconProgress] = useState(0);
  const [reconAgentStatus, setReconAgentStatus] = useState<string>("");
  const [reconStarting, setReconStarting] = useState(false);
  const [reconStartError, setReconStartError] = useState<string | null>(null);

  const preReconDone = scan.status === "completed" || scan.status === "failed";
  const reconPolling = scan.reconStatus === "running";
  const shouldPoll = !preReconDone || reconPolling;

  // Poll while pre-recon is active or reconnaissance is running
  useEffect(() => {
    if (!shouldPoll) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/scan/${scan.id}`);
        if (!res.ok) return;
        const data = await res.json();
        setScan(data.scan);
        setPhase(data.phase ?? "");
        setProgress(data.progress ?? 0);
        setAgentStatus(data.agentStatus ?? "");
        setReconPhase(data.reconPhase ?? "");
        setReconProgress(data.reconProgress ?? 0);
        setReconAgentStatus(data.reconAgentStatus ?? "");
      } catch {
        // ignore transient errors
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [scan.id, shouldPoll]);

  async function startRecon() {
    setReconStarting(true);
    setReconStartError(null);
    try {
      const res = await fetch(`/api/scan/${scan.id}/recon`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      const refreshed = await fetch(`/api/scan/${scan.id}`);
      if (refreshed.ok) {
        const full = await refreshed.json();
        setScan(full.scan);
        setReconPhase(full.reconPhase ?? "");
        setReconProgress(full.reconProgress ?? 0);
        setReconAgentStatus(full.reconAgentStatus ?? "");
      }
    } catch (e) {
      setReconStartError(e instanceof Error ? e.message : "Failed to start recon");
    } finally {
      setReconStarting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Breachix · Pre-recon (phase 1) + Reconnaissance (phase 2)
          </p>
          <h1 className="text-2xl font-semibold tracking-tight truncate max-w-xl">
            {scan.targetUrl}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {scan.workspaceName ?? scan.id}
          </p>
        </div>
        <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
          ← New scan
        </Link>
      </div>

      {/* Status card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Status
            <span className={`text-sm font-normal ${STATUS_COLORS[scan.status]}`}>
              {scan.status}
            </span>
          </CardTitle>
          {scan.status === "running" && (
            <CardDescription>{agentStatus || "Initializing…"}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress bar */}
          {scan.status === "running" && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{PHASE_LABELS[phase] ?? phase ?? "Starting…"}</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-500 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Scan metadata */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Environment</dt>
            <dd className="font-mono">{scan.environment}</dd>
            <dt className="text-muted-foreground">Repo path</dt>
            <dd className="font-mono truncate">{scan.repoPath}</dd>
            {scan.triggerRunId && (
              <>
                <dt className="text-muted-foreground">Run ID</dt>
                <dd className="font-mono text-xs truncate">{scan.triggerRunId}</dd>
              </>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Deliverable */}
      {scan.status === "completed" && scan.deliverable && (
        <Card>
          <CardHeader>
            <CardTitle>Pre-Reconnaissance Deliverable</CardTitle>
            <CardDescription>
              Full security intelligence report from the pre-recon agent (Shannon phase 1 analogue).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm font-mono bg-muted rounded-lg p-4 overflow-auto max-h-[60vh]">
              {scan.deliverable}
            </pre>
          </CardContent>
        </Card>
      )}

      {scan.status === "completed" && scan.deliverable && (
        <Card>
          <CardHeader>
            <CardTitle>Phase 2 — Reconnaissance</CardTitle>
            <CardDescription>
              Read-only HTTP discovery (target page,{" "}
              <span className="font-mono">robots.txt</span>,{" "}
              <span className="font-mono">sitemap.xml</span>) merged with your pre-recon report into
              an attack-surface map. No browser automation yet — aligned with Shannon’s recon
              intent, lighter than Shannon Lite’s full stack.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`text-sm font-medium capitalize ${
                  scan.reconStatus === "completed"
                    ? "text-green-600"
                    : scan.reconStatus === "failed"
                      ? "text-destructive"
                      : scan.reconStatus === "running"
                        ? "text-blue-600"
                        : "text-muted-foreground"
                }`}
              >
                {scan.reconStatus ?? "not started"}
              </span>
              {scan.reconTriggerRunId && (
                <span className="text-xs font-mono text-muted-foreground truncate max-w-[200px]">
                  run {scan.reconTriggerRunId}
                </span>
              )}
            </div>

            {scan.reconStatus === "running" && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{RECON_PHASE_LABELS[reconPhase] ?? reconPhase ?? "Starting…"}</span>
                  <span>{reconProgress}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-500 rounded-full"
                    style={{ width: `${reconProgress}%` }}
                  />
                </div>
                {reconAgentStatus && (
                  <p className="text-xs text-muted-foreground">{reconAgentStatus}</p>
                )}
              </div>
            )}

            {!scan.reconStatus && (
              <Button type="button" onClick={startRecon} disabled={reconStarting}>
                {reconStarting ? "Starting…" : "Run reconnaissance (phase 2)"}
              </Button>
            )}

            {scan.reconStatus === "failed" && (
              <div className="space-y-2">
                <p className="text-sm text-destructive">Reconnaissance failed. Check worker logs and API reachability.</p>
                <Button type="button" variant="outline" onClick={startRecon} disabled={reconStarting}>
                  {reconStarting ? "Retrying…" : "Retry reconnaissance"}
                </Button>
              </div>
            )}

            {scan.reconStatus === "completed" && (
              <Button type="button" variant="outline" onClick={startRecon} disabled={reconStarting}>
                {reconStarting ? "Starting…" : "Re-run reconnaissance"}
              </Button>
            )}

            {reconStartError && <p className="text-sm text-destructive">{reconStartError}</p>}
          </CardContent>
        </Card>
      )}

      {scan.reconDeliverable && (
        <Card>
          <CardHeader>
            <CardTitle>Reconnaissance Deliverable</CardTitle>
            <CardDescription>Attack surface map from phase 2.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm font-mono bg-muted rounded-lg p-4 overflow-auto max-h-[60vh]">
              {scan.reconDeliverable}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {scan.status === "failed" && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-destructive">Scan Failed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              The agent encountered an error. Check that the configured API base
              URL is reachable from the worker, the model id is valid, then try
              again.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
