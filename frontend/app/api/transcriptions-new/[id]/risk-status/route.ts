import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    
    const { status } = body
    
    if (!['analyzing', 'completed', 'failed', 'not_analyzed'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status' },
        { status: 400 }
      )
    }
    
    // Update the transcription risk status
    const updatedTranscription = await (prisma as any).transcription.update({
      where: { id },
      data: {
        riskDetectionStatus: status,
        updatedAt: new Date(),
        ...(status === 'analyzing' && { riskAnalyzedAt: null }) // Clear analysis time when re-analyzing
      }
    })
    
    console.log(`✅ Updated transcription ${id} risk status to: ${status}`)
    
    return NextResponse.json({
      success: true,
      transcription: updatedTranscription,
      message: `Risk status updated to ${status}`
    })
    
  } catch (error) {
    console.error('Error updating risk status:', error)
    return NextResponse.json(
      { 
        error: 'Failed to update risk status',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}
