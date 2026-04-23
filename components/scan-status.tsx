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
  vulnStatus: string | null;
  vulnTriggerRunId: string | null;
  vulnDeliverable: string | null;
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
  "Live surface": "Playwright + HTTP discovery…",
  "Fetching live target": "Playwright + HTTP discovery…",
  "Reconnaissance synthesis": "Correlating code + browser + HTTP…",
  "Complete": "Complete",
};

const VULN_PHASE_LABELS: Record<string, string> = {
  "Repository snapshot": "Building repository snapshot…",
  "Parallel specialists": "Running five OWASP-line specialists in parallel…",
  "Synthesis": "Synthesizing vulnerability hypotheses…",
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
  const [preReconStarting, setPreReconStarting] = useState(false);
  const [preReconStartError, setPreReconStartError] = useState<string | null>(null);
  const [reconPhase, setReconPhase] = useState<string>("");
  const [reconProgress, setReconProgress] = useState(0);
  const [reconAgentStatus, setReconAgentStatus] = useState<string>("");
  const [reconStarting, setReconStarting] = useState(false);
  const [reconStartError, setReconStartError] = useState<string | null>(null);
  const [vulnPhase, setVulnPhase] = useState<string>("");
  const [vulnProgress, setVulnProgress] = useState(0);
  const [vulnAgentStatus, setVulnAgentStatus] = useState<string>("");
  const [vulnStarting, setVulnStarting] = useState(false);
  const [vulnStartError, setVulnStartError] = useState<string | null>(null);

  const preReconDone = scan.status === "completed" || scan.status === "failed";
  const preReconActive = scan.status === "running" || (scan.status === "pending" && !!scan.triggerRunId);
  const reconPolling = scan.reconStatus === "running";
  const vulnPolling = scan.vulnStatus === "running";
  const shouldPoll = !preReconDone || reconPolling || vulnPolling;

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
        setVulnPhase(data.vulnPhase ?? "");
        setVulnProgress(data.vulnProgress ?? 0);
        setVulnAgentStatus(data.vulnAgentStatus ?? "");
      } catch {
        // ignore transient errors
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [scan.id, shouldPoll]);

  async function startPreRecon() {
    setPreReconStarting(true);
    setPreReconStartError(null);
    try {
      const res = await fetch(`/api/scan/${scan.id}/start`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      const refreshed = await fetch(`/api/scan/${scan.id}`);
      if (refreshed.ok) {
        const full = await refreshed.json();
        setScan(full.scan);
        setPhase(full.phase ?? "");
        setProgress(full.progress ?? 0);
        setAgentStatus(full.agentStatus ?? "");
      }
    } catch (e) {
      setPreReconStartError(e instanceof Error ? e.message : "Failed to start pre-recon");
    } finally {
      setPreReconStarting(false);
    }
  }

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

  async function startVuln() {
    setVulnStarting(true);
    setVulnStartError(null);
    try {
      const res = await fetch(`/api/scan/${scan.id}/vuln`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      const refreshed = await fetch(`/api/scan/${scan.id}`);
      if (refreshed.ok) {
        const full = await refreshed.json();
        setScan(full.scan);
        setVulnPhase(full.vulnPhase ?? "");
        setVulnProgress(full.vulnProgress ?? 0);
        setVulnAgentStatus(full.vulnAgentStatus ?? "");
      }
    } catch (e) {
      setVulnStartError(e instanceof Error ? e.message : "Failed to start analysis");
    } finally {
      setVulnStarting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Breachix · Pre-recon (1), reconnaissance (2), vulnerability hypotheses (3)
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
          {preReconActive && (
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
              {agentStatus && <p className="text-xs text-muted-foreground">{agentStatus}</p>}
            </div>
          )}

          {scan.status === "pending" && (
            <div className="space-y-3 rounded-md border border-border/70 bg-muted/40 p-3">
              <p className="text-sm text-muted-foreground">
                Pre-recon is pending and waiting to execute.
              </p>
              {!scan.triggerRunId && (
                <div className="space-y-2">
                  <p className="text-sm text-destructive">
                    This scan has no run ID yet. You can trigger it again.
                  </p>
                  <Button type="button" size="sm" onClick={startPreRecon} disabled={preReconStarting}>
                    {preReconStarting ? "Starting…" : "Start pre-recon now"}
                  </Button>
                </div>
              )}
              {scan.triggerRunId && (
                <p className="text-xs text-muted-foreground">
                  run {scan.triggerRunId}
                </p>
              )}
              {preReconStartError && <p className="text-sm text-destructive">{preReconStartError}</p>}
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
              System prompt matches Shannon{" "}
              <span className="font-mono">recon.txt</span> (same name as{" "}
              <span className="font-mono">apps/worker/prompts/recon.txt</span>
              ). The worker runs Playwright Chromium (bounded same-origin crawl) plus
              read-only HTTP fetches (target page,{" "}
              <span className="font-mono">robots.txt</span>,{" "}
              <span className="font-mono">sitemap.xml</span>) and merges both with your pre-recon report.
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

      {scan.status === "completed" && scan.deliverable && (
        <Card>
          <CardHeader>
            <CardTitle>Phase 3 — Vulnerability analysis (hypotheses)</CardTitle>
            <CardDescription>
              Five Shannon-named pipeline prompts (
              <span className="font-mono">vuln-injection.txt</span>,{" "}
              <span className="font-mono">vuln-xss.txt</span>,{" "}
              <span className="font-mono">vuln-auth.txt</span>,{" "}
              <span className="font-mono">vuln-authz.txt</span>,{" "}
              <span className="font-mono">vuln-ssrf.txt</span>
              ) plus synthesis—hypotheses only, no exploitation. Uses pre-recon, recon when
              present, and a fresh repo snapshot. Phase 2 first is recommended but not required.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`text-sm font-medium capitalize ${
                  scan.vulnStatus === "completed"
                    ? "text-green-600"
                    : scan.vulnStatus === "failed"
                      ? "text-destructive"
                      : scan.vulnStatus === "running"
                        ? "text-blue-600"
                        : "text-muted-foreground"
                }`}
              >
                {scan.vulnStatus ?? "not started"}
              </span>
              {scan.vulnTriggerRunId && (
                <span className="text-xs font-mono text-muted-foreground truncate max-w-[200px]">
                  run {scan.vulnTriggerRunId}
                </span>
              )}
            </div>

            {scan.vulnStatus === "running" && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{VULN_PHASE_LABELS[vulnPhase] ?? vulnPhase ?? "Starting…"}</span>
                  <span>{vulnProgress}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-500 rounded-full"
                    style={{ width: `${vulnProgress}%` }}
                  />
                </div>
                {vulnAgentStatus && (
                  <p className="text-xs text-muted-foreground">{vulnAgentStatus}</p>
                )}
              </div>
            )}

            {!scan.vulnStatus && (
              <Button type="button" onClick={startVuln} disabled={vulnStarting}>
                {vulnStarting ? "Starting…" : "Run vulnerability analysis (phase 3)"}
              </Button>
            )}

            {scan.vulnStatus === "failed" && (
              <div className="space-y-2">
                <p className="text-sm text-destructive">
                  Vulnerability analysis failed. Check worker logs and API reachability.
                </p>
                <Button type="button" variant="outline" onClick={startVuln} disabled={vulnStarting}>
                  {vulnStarting ? "Retrying…" : "Retry vulnerability analysis"}
                </Button>
              </div>
            )}

            {scan.vulnStatus === "completed" && (
              <Button type="button" variant="outline" onClick={startVuln} disabled={vulnStarting}>
                {vulnStarting ? "Starting…" : "Re-run vulnerability analysis"}
              </Button>
            )}

            {vulnStartError && <p className="text-sm text-destructive">{vulnStartError}</p>}
          </CardContent>
        </Card>
      )}

      {scan.vulnDeliverable && (
        <Card>
          <CardHeader>
            <CardTitle>Vulnerability hypotheses deliverable</CardTitle>
            <CardDescription>Phase 3 merged output (not exploited findings).</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm font-mono bg-muted rounded-lg p-4 overflow-auto max-h-[60vh]">
              {scan.vulnDeliverable}
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
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              The agent encountered an error. Check that the configured API base
              URL is reachable from the worker, the model id is valid, then try
              again.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={startPreRecon}
              disabled={preReconStarting}
            >
              {preReconStarting ? "Retrying…" : "Retry pre-recon"}
            </Button>
            {preReconStartError && <p className="text-sm text-destructive">{preReconStartError}</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
