-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_QueueTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "originalAudioFileName" TEXT NOT NULL,
    "backend" TEXT NOT NULL DEFAULT 'cpu',
    "language" TEXT NOT NULL DEFAULT 'th',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" REAL,
    "errorMessage" TEXT,
    "fileSizeBytes" INTEGER,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_QueueTask" ("backend", "completedAt", "createdAt", "description", "errorMessage", "fileSizeBytes", "id", "language", "originalAudioFileName", "priority", "progress", "startedAt", "status", "taskId", "title", "updatedAt") SELECT "backend", "completedAt", "createdAt", "description", "errorMessage", "fileSizeBytes", "id", "language", "originalAudioFileName", "priority", "progress", "startedAt", "status", "taskId", "title", "updatedAt" FROM "QueueTask";
DROP TABLE "QueueTask";
ALTER TABLE "new_QueueTask" RENAME TO "QueueTask";
CREATE UNIQUE INDEX "QueueTask_taskId_key" ON "QueueTask"("taskId");
CREATE INDEX "QueueTask_taskId_idx" ON "QueueTask"("taskId");
CREATE INDEX "QueueTask_status_idx" ON "QueueTask"("status");
CREATE INDEX "QueueTask_createdAt_idx" ON "QueueTask"("createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
