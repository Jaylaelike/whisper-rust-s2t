import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function PUT(request: NextRequest) {
  try {
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
    
    console.log('🔍 Searching for transcription to update with risk analysis:', {
      taskId,
      original_file,
      has_text: !!transcription_text,
      auto_triggered
    })
    
    // Find the transcription by various methods
    let transcription = null
    
    // Method 1: Try to find by original file path
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
      
      if (transcription) {
        console.log(`✅ Found transcription by filename: ${filename}`)
      }
    }
    
    // Method 2: Try to find by transcription text (exact match on first 100 chars)
    if (!transcription && transcription_text) {
      const searchText = transcription_text.substring(0, 100)
      transcription = await (prisma as any).transcription.findFirst({
        where: {
          transcriptionText: {
            startsWith: searchText
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      })
      
      if (transcription) {
        console.log(`✅ Found transcription by text match`)
      }
    }
    
    // Method 3: Try to find the most recent transcription if auto-triggered
    if (!transcription && auto_triggered) {
      transcription = await (prisma as any).transcription.findFirst({
        where: {
          riskDetectionStatus: {
            in: ['not_analyzed', 'analyzing']
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      })
      
      if (transcription) {
        console.log(`✅ Found transcription by most recent unanalyzed`)
      }
    }
    
    if (!transcription) {
      console.log('❌ No transcription found for risk analysis update')
      return NextResponse.json(
        { 
          error: 'Transcription not found', 
          searched_for: { taskId, original_file, has_text: !!transcription_text, auto_triggered } 
        },
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
