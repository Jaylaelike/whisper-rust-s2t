import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// Webhook endpoint for backend to notify when tasks are completed
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      task_id,
      status,
      result,
      error_message,
      progress
    } = body

    if (!task_id) {
      return NextResponse.json(
        { error: 'Task ID is required' },
        { status: 400 }
      )
    }

    console.log(`Task completion webhook: ${task_id} - ${status}`)

    // Find the transcription job by task ID
    const job = await prisma.transcriptionJob.findUnique({
      where: { taskId: task_id }
    })

    if (!job) {
      console.log(`No job found for task ID: ${task_id}`)
      return NextResponse.json(
        { error: 'No transcription job found for this task ID' },
        { status: 404 }
      )
    }

    // Prepare update data based on status
    const updateData: any = {
      updatedAt: new Date()
    }

    switch (status?.toLowerCase()) {
      case 'processing':
        updateData.queueStatus = 'processing'
        if (!job.startedAt) {
          updateData.startedAt = new Date()
        }
        break

      case 'completed':
        updateData.queueStatus = 'completed'
        updateData.completedAt = new Date()
        
        if (result) {
          updateData.transcriptionResultJson = result
          
          // Extract text for quick access
          if (result.text) {
            updateData.transcriptionText = result.text
          }
          
          // Extract metadata if available
          if (result.metadata) {
            const metadata = result.metadata
            if (metadata.processing_time) {
              updateData.processingTimeMs = Math.round(parseFloat(metadata.processing_time) * 1000)
            }
            if (metadata.file_size) {
              updateData.fileSizeBytes = parseInt(metadata.file_size)
            }
            if (metadata.sample_rate) {
              updateData.audioSampleRate = parseInt(metadata.sample_rate)
            }
            if (metadata.num_segments) {
              // Store duration in seconds if we can calculate it from segments
              if (result.segments && result.segments.length > 0) {
                const lastSegment = result.segments[result.segments.length - 1]
                if (lastSegment.end) {
                  updateData.durationSeconds = lastSegment.end
                }
              }
            }
          }
        }
        break

      case 'failed':
        updateData.queueStatus = 'failed'
        updateData.completedAt = new Date()
        if (error_message) {
          updateData.errorMessage = error_message
        }
        break

      case 'cancelled':
        updateData.queueStatus = 'cancelled'
        updateData.completedAt = new Date()
        break
    }

    // Update the job
    const updatedJob = await prisma.transcriptionJob.update({
      where: { id: job.id },
      data: updateData
    })

    console.log(`Updated job ${job.id} with status ${status}`)

    return NextResponse.json({
      message: 'Task status updated successfully',
      job: {
        id: updatedJob.id,
        taskId: updatedJob.taskId,
        queueStatus: updatedJob.queueStatus
      }
    })

  } catch (error) {
    console.error('Error processing task completion webhook:', error)
    return NextResponse.json(
      { error: 'Failed to process task completion' },
      { status: 500 }
    )
  }
}
