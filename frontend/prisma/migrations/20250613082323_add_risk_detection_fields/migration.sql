-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TranscriptionJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "originalAudioFileName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "transcriptionResultJson" JSONB,
    "riskDetectionStatus" TEXT NOT NULL DEFAULT 'not_analyzed',
    "riskDetectionResult" TEXT,
    "riskDetectionResponse" TEXT,
    "riskAnalyzedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_TranscriptionJob" ("createdAt", "description", "id", "originalAudioFileName", "status", "title", "transcriptionResultJson", "updatedAt") SELECT "createdAt", "description", "id", "originalAudioFileName", "status", "title", "transcriptionResultJson", "updatedAt" FROM "TranscriptionJob";
DROP TABLE "TranscriptionJob";
ALTER TABLE "new_TranscriptionJob" RENAME TO "TranscriptionJob";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
