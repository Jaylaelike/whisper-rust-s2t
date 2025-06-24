/*
  Warnings:

  - You are about to drop the column `status` on the `TranscriptionJob` table. All the data in the column will be lost.
  - You are about to alter the column `riskDetectionResponse` on the `TranscriptionJob` table. The data in that column could be lost. The data in that column will be cast from `String` to `Json`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TranscriptionJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "originalAudioFileName" TEXT NOT NULL,
    "taskId" TEXT,
    "queueStatus" TEXT NOT NULL DEFAULT 'pending',
    "backend" TEXT NOT NULL DEFAULT 'cpu',
    "language" TEXT NOT NULL DEFAULT 'th',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "transcriptionResultJson" JSONB,
    "transcriptionText" TEXT,
    "processingTimeMs" INTEGER,
    "riskDetectionStatus" TEXT NOT NULL DEFAULT 'not_analyzed',
    "riskDetectionResult" TEXT,
    "riskDetectionResponse" JSONB,
    "riskAnalyzedAt" DATETIME,
    "riskConfidence" REAL,
    "fileSizeBytes" INTEGER,
    "durationSeconds" REAL,
    "audioSampleRate" INTEGER,
    "errorMessage" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_TranscriptionJob" ("createdAt", "description", "id", "originalAudioFileName", "riskAnalyzedAt", "riskDetectionResponse", "riskDetectionResult", "riskDetectionStatus", "title", "transcriptionResultJson", "updatedAt") SELECT "createdAt", "description", "id", "originalAudioFileName", "riskAnalyzedAt", "riskDetectionResponse", "riskDetectionResult", "riskDetectionStatus", "title", "transcriptionResultJson", "updatedAt" FROM "TranscriptionJob";
DROP TABLE "TranscriptionJob";
ALTER TABLE "new_TranscriptionJob" RENAME TO "TranscriptionJob";
CREATE UNIQUE INDEX "TranscriptionJob_taskId_key" ON "TranscriptionJob"("taskId");
CREATE INDEX "TranscriptionJob_taskId_idx" ON "TranscriptionJob"("taskId");
CREATE INDEX "TranscriptionJob_queueStatus_idx" ON "TranscriptionJob"("queueStatus");
CREATE INDEX "TranscriptionJob_createdAt_idx" ON "TranscriptionJob"("createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
