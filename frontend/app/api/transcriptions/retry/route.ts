import { type NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { originalTranscriptionId, title, description, language, backend } = body

    // Get the original transcription to retrieve file information
    const originalTranscription = await (prisma as any).transcription.findUnique({
      where: { id: originalTranscriptionId },
    })

    if (!originalTranscription) {
      return NextResponse.json(
        { error: "Original transcription not found" },
        { status: 404 }
      )
    }

    // Check if the original file still exists
    const originalFilePath = originalTranscription.filePath
    if (!originalFilePath) {
      return NextResponse.json(
        { error: "Original file path not found. Cannot retry without the source file." },
        { status: 400 }
      )
    }

    // Create a new transcription task with retry information
    const retryTranscription = await (prisma as any).transcription.create({
      data: {
        title: title || `${originalTranscription.title} (Retry)`,
        description: description || `Retry of transcription ${originalTranscriptionId}`,
        language: language || originalTranscription.language,
        backend: backend || originalTranscription.backend,
        filePath: originalFilePath,
        fileSizeBytes: originalTranscription.fileSizeBytes,
        durationSeconds: originalTranscription.durationSeconds,
        status: 'pending',
        priority: 1, // Higher priority for retries
        isRetry: true,
        originalTranscriptionId: originalTranscriptionId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    })

    // Queue the retry task
    const queueResponse = await fetch('http://localhost:8080/api/queue/transcription', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transcription_id: retryTranscription.id,
        file_path: originalFilePath,
        title: retryTranscription.title,
        language: retryTranscription.language,
        backend: retryTranscription.backend,
        priority: 1,
      }),
    })

    if (!queueResponse.ok) {
      // If queueing fails, clean up the transcription record
      await (prisma as any).transcription.delete({
        where: { id: retryTranscription.id },
      })
      
      throw new Error('Failed to queue retry task')
    }

    const queueResult = await queueResponse.json()

    console.log(`🔄 Retry task created for transcription ${originalTranscriptionId}:`, {
      newId: retryTranscription.id,
      taskId: queueResult.task_id,
      title: retryTranscription.title
    })

    return NextResponse.json({
      success: true,
      transcription: retryTranscription,
      task_id: queueResult.task_id,
      message: "Retry task created successfully"
    })

  } catch (error) {
    console.error("Error creating retry task:", error)
    return NextResponse.json(
      { 
        error: "Failed to create retry task",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}
