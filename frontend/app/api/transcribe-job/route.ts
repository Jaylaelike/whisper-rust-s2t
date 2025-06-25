import { type NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"
import { writeFile } from "fs/promises"
import { join } from "path"
import { mkdir } from "fs/promises"
import { v4 as uuidv4 } from "uuid"

const prisma = new PrismaClient()

// Queue-based transcription service URL
const TRANSCRIPTION_SERVICE_URL = "http://localhost:8000"

// Configure API route for long-running operations 20 minutes 
export const maxDuration = 1200 // 20 minutes in seconds
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  console.log("=== Starting transcription job ===")
  
  try {
    const formData = await request.formData()

    const title = formData.get("title") as string
    const description = formData.get("description") as string | null
    const language = formData.get("language") as string || "th"
    const backend = formData.get("backend") as string || "cpu"
    const priority = parseInt(formData.get("priority") as string || "0")
    const audioFile = formData.get("audioFile") as File
    
    // Extract metadata for timeout calculation
    const fileSizeBytes = parseInt(formData.get("fileSizeBytes") as string || audioFile.size.toString())
    const durationSeconds = parseFloat(formData.get("durationSeconds") as string || "0")

    console.log(`Processing upload: ${title}, backend: ${backend}, language: ${language}`)
    console.log(`File metadata: size=${(fileSizeBytes / 1024 / 1024).toFixed(1)}MB, duration=${Math.round(durationSeconds / 60)}min`)

    if (!title || !audioFile) {
      return NextResponse.json({ error: "Title and audio file are required" }, { status: 400 })
    }

    // Create directories if they don't exist
    const audioDir = join(process.cwd(), "public", "uploads", "audio")
    await mkdir(audioDir, { recursive: true })

    // Generate unique filenames
    const audioFileName = `${uuidv4()}-${audioFile.name}`
    const audioPath = join(audioDir, audioFileName)

    // Save audio file
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer())
    await writeFile(audioPath, audioBuffer)

    console.log(`Audio file saved: ${audioFileName}, size: ${audioBuffer.length} bytes`)

    // Process transcription with timeout
    const transcriptionResult = await Promise.race([
      processTranscriptionSync(
        title,
        description,
        `/uploads/audio/${audioFileName}`,
        language,
        backend,
        priority,
        audioBuffer,
        audioFile.name,
        audioFile.type,
        fileSizeBytes,
        durationSeconds
      ),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Transcription timeout after 10 minutes')), 600000)
      )
    ])

    console.log("=== Transcription job completed successfully ===")
    return NextResponse.json({
      success: true,
      transcriptionId: transcriptionResult.id,
      message: "Transcription completed successfully",
      result: transcriptionResult
    })

  } catch (error) {
    console.error("=== Error creating transcription job ===", error)
    
    return NextResponse.json(
      { 
        error: "Failed to create transcription job",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

async function processTranscriptionSync(
  title: string,
  description: string | null,
  audioFilePath: string,
  language: string,
  backend: string,
  priority: number,
  audioBuffer: Buffer,
  originalFileName: string,
  mimeType: string,
  fileSizeBytes: number,
  durationSeconds: number
): Promise<any> {
  let queueTask: any = null
  
  try {
    console.log("Step 1: Creating queue task...")
    
    // Step 1: Create a temporary queue task for tracking
    queueTask = await (prisma as any).queueTask.create({
      data: {
        title,
        description,
        originalAudioFileName: audioFilePath,
        backend,
        language,
        priority,
        status: "pending",
        fileSizeBytes: fileSizeBytes,
        durationSeconds: durationSeconds > 0 ? durationSeconds : null,
      }
    })

    console.log(`✓ Queue task created: ${queueTask.id}`)

    // Step 2: Prepare form data for backend
    console.log("Step 2: Preparing form data for backend...")
    const transcriptionFormData = new FormData()
    const audioBlob = new Blob([audioBuffer], { type: mimeType })
    transcriptionFormData.append("audio", audioBlob, originalFileName)
    transcriptionFormData.append("language", language)
    transcriptionFormData.append("backend", backend)
    transcriptionFormData.append("priority", priority.toString())
    
    // Include metadata for timeout calculation
    transcriptionFormData.append("file_size_bytes", fileSizeBytes.toString())
    if (durationSeconds > 0) {
      transcriptionFormData.append("duration_seconds", durationSeconds.toString())
    }

    console.log(`✓ Form data prepared for ${originalFileName} (${(fileSizeBytes / 1024 / 1024).toFixed(1)}MB, ${Math.round(durationSeconds / 60)}min)`)

    // Step 3: Submit to backend and wait for completion
    console.log(`Step 3: Submitting to backend: ${TRANSCRIPTION_SERVICE_URL}/api/transcribe`)
    
    // Update queue task status to processing
    await (prisma as any).queueTask.update({
      where: { id: queueTask.id },
      data: { status: "processing", startedAt: new Date() }
    })

    console.log("✓ Queue task updated to processing")

    // Add timeout to backend submission
    const queueResponse = await Promise.race([
      fetch(`${TRANSCRIPTION_SERVICE_URL}/api/transcribe`, {
        method: "POST",
        body: transcriptionFormData,
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Backend submission timeout after 30 seconds')), 30000)
      )
    ]) as Response

    console.log(`✓ Backend responded with status: ${queueResponse.status}`)

    if (!queueResponse.ok) {
      const errorText = await queueResponse.text()
      console.error(`Backend error: ${queueResponse.status} - ${errorText}`)
      throw new Error(`Transcription service returned ${queueResponse.status}: ${errorText}`)
    }

    const queueResult = await queueResponse.json()
    const taskId = queueResult.task_id

    console.log(`✓ Task queued with backend ID: ${taskId}`)

    // Update queue task with backend task ID
    await (prisma as any).queueTask.update({
      where: { id: queueTask.id },
      data: { taskId: taskId }
    })

    // Step 4: Poll backend until completion
    const transcriptionResult = await pollForCompletion(taskId, queueTask.id, fileSizeBytes, durationSeconds)

    // Step 5: Create permanent transcription record
    const transcription = await (prisma as any).transcription.create({
      data: {
        title,
        description,
        originalAudioFileName: audioFilePath,
        backend,
        language,
        transcriptionResultJson: transcriptionResult.result,
        transcriptionText: extractTextFromResult(transcriptionResult.result),
        processingTimeMs: transcriptionResult.processingTimeMs,
        fileSizeBytes: audioBuffer.length,
        durationSeconds: transcriptionResult.result?.duration || null,
        audioSampleRate: transcriptionResult.result?.sample_rate || null,
        completedAt: new Date(),
      }
    })

    // Step 6: Clean up queue task
    await (prisma as any).queueTask.delete({
      where: { id: queueTask.id }
    })

    console.log(`Transcription completed and saved: ${transcription.id}`)

    return transcription

  } catch (error) {
    console.error("Error in synchronous transcription processing:", error)
    
    // Update queue task status to failed if it exists
    if (queueTask) {
      try {
        await (prisma as any).queueTask.update({
          where: { id: queueTask.id },
          data: {
            status: "failed",
            errorMessage: error instanceof Error ? error.message : String(error),
            completedAt: new Date()
          }
        })
      } catch (updateError) {
        console.error("Error updating queue task status:", updateError)
      }
    }
    
    throw error
  }
}

async function pollForCompletion(taskId: string, queueTaskId: string, fileSizeBytes: number = 0, durationSeconds: number = 0): Promise<any> {
  // Calculate dynamic timeout based on file size and duration
  let maxTimeoutMinutes = 20 // Base 20 minutes
  
  const sizeMB = fileSizeBytes / (1024 * 1024)
  const durationMinutes = durationSeconds / 60
  
  // Add extra time for large files (1 minute per 50MB)
  if (sizeMB > 50) {
    maxTimeoutMinutes += Math.ceil((sizeMB / 50) * 1)
  }
  
  // Add extra time for long audio (2 minutes per 30 minutes of audio)
  if (durationMinutes > 30) {
    maxTimeoutMinutes += Math.ceil((durationMinutes / 30) * 2)
  }
  
  // Cap at 60 minutes maximum
  maxTimeoutMinutes = Math.min(maxTimeoutMinutes, 60)
  
  const maxAttempts = Math.ceil((maxTimeoutMinutes * 60) / 5) // 5-second intervals
  let attempts = 0

  console.log(`Polling task ${taskId} with dynamic timeout: ${maxTimeoutMinutes} minutes (file: ${sizeMB.toFixed(1)}MB, ${durationMinutes.toFixed(1)}min)`)

  while (attempts < maxAttempts) {
    try {
      // Check task status from backend
      const statusResponse = await fetch(`${TRANSCRIPTION_SERVICE_URL}/api/task/${taskId}/status`)
      
      if (!statusResponse.ok) {
        throw new Error(`Status check failed: ${statusResponse.status}`)
      }

      const statusResult = await statusResponse.json()
      
      // Update queue task progress if available
      if (statusResult.progress !== undefined) {
        await (prisma as any).queueTask.update({
          where: { id: queueTaskId },
          data: { progress: statusResult.progress }
        })
      }

      if (statusResult.status === 'Completed' || statusResult.status === 'completed') {
        console.log(`Task ${taskId} completed after ${attempts + 1} attempts`)
        return {
          result: statusResult.result,
          processingTimeMs: statusResult.processing_time_ms
        }
      } else if (statusResult.status === 'Failed' || statusResult.status === 'failed') {
        throw new Error(`Backend task failed: ${statusResult.error || 'Unknown error'}`)
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, 5000)) // 5 seconds
      attempts++

    } catch (error) {
      console.error(`Error polling task ${taskId} (attempt ${attempts + 1}):`, error)
      
      // If it's a network error and we haven't exceeded max attempts, continue
      if (attempts < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, 5000))
        attempts++
        continue
      }
      
      throw error
    }
  }

  const timeoutMessage = sizeMB > 100 || durationMinutes > 60 
    ? `Large file processing (${sizeMB.toFixed(1)}MB, ${durationMinutes.toFixed(1)}min) did not complete within ${maxTimeoutMinutes} minutes. Consider splitting the file into smaller segments.`
    : `Task ${taskId} did not complete within ${maxTimeoutMinutes} minutes`
    
  throw new Error(timeoutMessage)
}

function extractTextFromResult(result: any): string {
  if (!result) return ""
  
  if (result.text) return result.text
  
  if (result.segments && Array.isArray(result.segments)) {
    return result.segments.map((segment: any) => segment.text || "").join(" ").trim()
  }
  
  return ""
}
