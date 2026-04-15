import { prisma } from "./prisma";

const DEFAULT_OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:7b";

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSettings() {
  return prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, ollamaUrl: DEFAULT_OLLAMA_URL, model: DEFAULT_OLLAMA_MODEL },
  });
}

export async function saveSettings(ollamaUrl: string, model: string) {
  return prisma.settings.upsert({
    where: { id: 1 },
    update: { ollamaUrl, model },
    create: { id: 1, ollamaUrl, model },
  });
}

// ---------------------------------------------------------------------------
// Scans
// ---------------------------------------------------------------------------

export async function getScan(id: string) {
  return prisma.scan.findUnique({ where: { id } });
}

export async function getScans() {
  return prisma.scan.findMany({ orderBy: { createdAt: "desc" } });
}

export async function createScan(data: {
  targetUrl: string;
  repoPath: string;
  environment: string;
  workspaceName?: string | null;
}) {
  return prisma.scan.create({
    data: { ...data, workspaceName: data.workspaceName?.trim() || null, status: "pending" },
  });
}

export async function updateScanRunId(id: string, triggerRunId: string) {
  return prisma.scan.update({ where: { id }, data: { triggerRunId } });
}

export async function updateScanStatus(
  id: string,
  status: string,
  deliverable?: string,
) {
  return prisma.scan.update({
    where: { id },
    data: { status, ...(deliverable !== undefined && { deliverable }) },
  });
}
