-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "ollamaUrl" TEXT NOT NULL DEFAULT 'http://localhost:11434',
    "model" TEXT NOT NULL DEFAULT 'llama3.1'
);

-- CreateTable
CREATE TABLE "Scan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetUrl" TEXT NOT NULL,
    "repoPath" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "workspaceName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "triggerRunId" TEXT,
    "deliverable" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
