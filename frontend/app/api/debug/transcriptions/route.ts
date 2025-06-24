import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

// GET /api/debug/transcriptions - Debug endpoint to check transcription status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '10')

    // Get recent transcriptions with their task info
    const transcriptions = await prisma.transcriptionJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        title: true,
        taskId: true,
        queueStatus: true,
        transcriptionText: true,
        transcriptionResultJson: true,
        errorMessage: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        updatedAt: true
      }
    })

    // Check backend status for tasks that have taskIds
    const tasksWithBackendStatus = await Promise.all(
      transcriptions.map(async (job) => {
        let backendStatus = null
        
        if (job.taskId) {
          try {
            const response = await fetch(`http://localhost:8000/api/task/${job.taskId}/status`, {
              signal: AbortSignal.timeout(5000) // 5 second timeout
            })
            
            if (response.ok) {
              backendStatus = await response.json()
            } else {
              backendStatus = { error: `Backend returned ${response.status}` }
            }
          } catch (error) {
            backendStatus = { error: error instanceof Error ? error.message : 'Unknown error' }
          }
        }

        return {
          ...job,
          backendStatus,
          hasTranscriptionText: !!job.transcriptionText,
          hasTranscriptionResult: !!job.transcriptionResultJson,
          resultLength: job.transcriptionText?.length || 0
        }
      })
    )

    // Summary statistics
    const summary = {
      total: transcriptions.length,
      pending: transcriptions.filter(t => t.queueStatus === 'pending').length,
      processing: transcriptions.filter(t => t.queueStatus === 'processing').length,
      completed: transcriptions.filter(t => t.queueStatus === 'completed').length,
      failed: transcriptions.filter(t => t.queueStatus === 'failed').length,
      withTaskId: transcriptions.filter(t => t.taskId).length,
      withResults: transcriptions.filter(t => t.transcriptionText).length
    }

    return NextResponse.json({
      summary,
      transcriptions: tasksWithBackendStatus,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Error in debug endpoint:', error)
    return NextResponse.json(
      { error: 'Failed to get debug information' },
      { status: 500 }
    )
  }
}
