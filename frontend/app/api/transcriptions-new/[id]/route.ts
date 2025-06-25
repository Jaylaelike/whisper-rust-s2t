import { type NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const transcription = await (prisma as any).transcription.findUnique({
      where: { id: params.id },
    })

    if (!transcription) {
      return NextResponse.json(
        { error: "Transcription not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      transcription
    })
  } catch (error) {
    console.error("Error fetching transcription:", error)
    return NextResponse.json(
      { 
        error: "Failed to fetch transcription",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id
    const body = await request.json()
    
    // Extract risk analysis data from the request
    const {
      riskDetectionStatus,
      riskDetectionResult,
      riskDetectionResponse,
      riskConfidence,
      taskId,
      auto_triggered,
      original_file,
      transcription_text
    } = body
    
    // Find the transcription by task ID or transcription ID
    let transcription
    if (taskId && (original_file || transcription_text)) {
      // If we have a task ID, find the transcription by the original audio filename or text
      if (original_file) {
        const filename = original_file.split('/').pop() // Get filename from path
        transcription = await (prisma as any).transcription.findFirst({
          where: {
            originalAudioFileName: {
              contains: filename
            }
          },
          orderBy: {
            createdAt: 'desc' // Get most recent if multiple matches
          }
        })
      } else if (transcription_text) {
        // Fallback: try to match by transcription text
        transcription = await (prisma as any).transcription.findFirst({
          where: {
            transcriptionText: transcription_text
          },
          orderBy: {
            createdAt: 'desc'
          }
        })
      }
    } else {
      // Direct transcription ID lookup
      transcription = await (prisma as any).transcription.findUnique({
        where: { id }
      })
    }
    
    if (!transcription) {
      return NextResponse.json(
        { error: 'Transcription not found', searched_for: { id, taskId, original_file, has_text: !!transcription_text } },
        { status: 404 }
      )
    }
    
    // Prepare update data
    const updateData: any = {
      updatedAt: new Date()
    }
    
    if (riskDetectionStatus) {
      updateData.riskDetectionStatus = riskDetectionStatus
    }
    
    if (riskDetectionResult) {
      updateData.riskDetectionResult = riskDetectionResult
    }
    
    if (riskDetectionResponse) {
      updateData.riskDetectionResponse = riskDetectionResponse
    }
    
    if (riskConfidence !== undefined) {
      updateData.riskConfidence = riskConfidence
    }
    
    // Set analysis completion time if status is completed
    if (riskDetectionStatus === 'completed') {
      updateData.riskAnalyzedAt = new Date()
    }
    
    // Update the transcription
    const updatedTranscription = await (prisma as any).transcription.update({
      where: { id: transcription.id },
      data: updateData
    })
    
    console.log(`✅ Updated transcription ${transcription.id} with risk analysis results:`, {
      status: riskDetectionStatus,
      result: riskDetectionResult,
      confidence: riskConfidence,
      auto_triggered
    })
    
    return NextResponse.json({
      success: true,
      transcription: updatedTranscription,
      message: 'Risk analysis results updated successfully'
    })
    
  } catch (error) {
    console.error('Error updating transcription with risk analysis:', error)
    return NextResponse.json(
      { 
        error: 'Failed to update transcription with risk analysis results',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id

    // Check if transcription exists
    const existingTranscription = await (prisma as any).transcription.findUnique({
      where: { id }
    })

    if (!existingTranscription) {
      return NextResponse.json(
        { error: "Transcription not found" },
        { status: 404 }
      )
    }

    // Delete the transcription
    await (prisma as any).transcription.delete({
      where: { id }
    })

    console.log(`🗑️ Deleted transcription ${id}: "${existingTranscription.title}"`)

    return NextResponse.json({ 
      success: true,
      message: "Transcription deleted successfully",
      id: id,
      title: existingTranscription.title
    })
  } catch (error) {
    console.error("Error deleting transcription:", error)
    return NextResponse.json(
      { 
        error: "Failed to delete transcription",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}
