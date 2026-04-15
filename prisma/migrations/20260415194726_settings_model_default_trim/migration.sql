-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "ollamaUrl" TEXT NOT NULL DEFAULT 'http://localhost:11434',
    "model" TEXT NOT NULL DEFAULT 'qwen2.5:7b'
);
INSERT INTO "new_Settings" ("id", "model", "ollamaUrl") SELECT "id", "model", "ollamaUrl" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
