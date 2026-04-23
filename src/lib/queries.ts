import { prisma } from "./prisma";

// ---------------------------------------------------------------------------
// Scans
// ---------------------------------------------------------------------------

export async function getScan(id: string) {
  return prisma.scan.findUnique({ where: { id } });
}

export async function getScans() {
  return prisma.scan.findMany({ orderBy: { createdAt: "desc" } });
}

export async function deleteAllScans() {
  return prisma.scan.deleteMany();
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

export async function restartPreReconScan(id: string, triggerRunId: string) {
  return prisma.scan.update({
    where: { id },
    data: {
      status: "pending",
      triggerRunId,
      deliverable: null,
    },
  });
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

export async function updateReconRunId(id: string, reconTriggerRunId: string) {
  return prisma.scan.update({
    where: { id },
    data: { reconTriggerRunId, reconStatus: "running", reconDeliverable: null },
  });
}

export async function updateReconStatus(
  id: string,
  reconStatus: string,
  reconDeliverable?: string,
) {
  return prisma.scan.update({
    where: { id },
    data: {
      reconStatus,
      ...(reconDeliverable !== undefined && { reconDeliverable }),
    },
  });
}

export async function updateVulnRunId(id: string, vulnTriggerRunId: string) {
  return prisma.scan.update({
    where: { id },
    data: { vulnTriggerRunId, vulnStatus: "running", vulnDeliverable: null },
  });
}

export async function updateVulnStatus(
  id: string,
  vulnStatus: string,
  vulnDeliverable?: string,
) {
  return prisma.scan.update({
    where: { id },
    data: {
      vulnStatus,
      ...(vulnDeliverable !== undefined && { vulnDeliverable }),
    },
  });
}
