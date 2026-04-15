"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

interface Scan {
  id: string;
  targetUrl: string;
  repoPath: string;
  environment: string;
  workspaceName: string | null;
  status: string;
  triggerRunId: string | null;
  deliverable: string | null;
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

  const isDone = scan.status === "completed" || scan.status === "failed";

  // Poll the scan status every 3 s while running
  useEffect(() => {
    if (isDone) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/scan/${scan.id}`);
        if (!res.ok) return;
        const data = await res.json();
        setScan(data.scan);
        setPhase(data.phase ?? "");
        setProgress(data.progress ?? 0);
        setAgentStatus(data.agentStatus ?? "");
      } catch {
        // ignore transient errors
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [scan.id, isDone]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Pre-Recon Agent</p>
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
              Full security intelligence report from the pre-recon agent.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm font-mono bg-muted rounded-lg p-4 overflow-auto max-h-[60vh]">
              {scan.deliverable}
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
