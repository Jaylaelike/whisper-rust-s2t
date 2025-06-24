-- CreateTable
CREATE TABLE "TranscriptionJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "originalAudioFileName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "transcriptionResultJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
