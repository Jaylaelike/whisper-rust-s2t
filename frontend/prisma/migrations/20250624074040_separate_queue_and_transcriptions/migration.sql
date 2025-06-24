/*
  Warnings:

  - You are about to drop the `TranscriptionJob` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "TranscriptionJob";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "QueueTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
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

-- CreateTable
CREATE TABLE "Transcription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "originalAudioFileName" TEXT NOT NULL,
    "backend" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "transcriptionResultJson" JSONB NOT NULL,
    "transcriptionText" TEXT NOT NULL,
    "processingTimeMs" INTEGER,
    "riskDetectionStatus" TEXT NOT NULL DEFAULT 'not_analyzed',
    "riskDetectionResult" TEXT,
    "riskDetectionResponse" JSONB,
    "riskAnalyzedAt" DATETIME,
    "riskConfidence" REAL,
    "fileSizeBytes" INTEGER,
    "durationSeconds" REAL,
    "audioSampleRate" INTEGER,
    "completedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "QueueTask_taskId_key" ON "QueueTask"("taskId");

-- CreateIndex
CREATE INDEX "QueueTask_taskId_idx" ON "QueueTask"("taskId");

-- CreateIndex
CREATE INDEX "QueueTask_status_idx" ON "QueueTask"("status");

-- CreateIndex
CREATE INDEX "QueueTask_createdAt_idx" ON "QueueTask"("createdAt");

-- CreateIndex
CREATE INDEX "Transcription_createdAt_idx" ON "Transcription"("createdAt");

-- CreateIndex
CREATE INDEX "Transcription_riskDetectionResult_idx" ON "Transcription"("riskDetectionResult");
