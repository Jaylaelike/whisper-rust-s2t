import { type NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '20', 10)
    const search = searchParams.get('search')
    const riskFilter = searchParams.get('risk')
    
    const skip = (page - 1) * limit
    
    // Build where clause
    const whereClause: any = {}
    
    if (search) {
      whereClause.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { transcriptionText: { contains: search, mode: 'insensitive' } }
      ]
    }
    
    if (riskFilter && riskFilter !== 'all') {
      whereClause.riskDetectionResult = riskFilter
    }

    const [transcriptions, total] = await Promise.all([
      (prisma as any).transcription.findMany({
        where: whereClause,
        orderBy: {
          createdAt: 'desc'
        },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          description: true,
          backend: true,
          language: true,
          transcriptionText: true,
          processingTimeMs: true,
          riskDetectionStatus: true,
          riskDetectionResult: true,
          riskConfidence: true,
          fileSizeBytes: true,
          durationSeconds: true,
          completedAt: true,
          createdAt: true,
        }
      }),
      (prisma as any).transcription.count({ where: whereClause })
    ])

    return NextResponse.json({
      success: true,
      transcriptions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error("Error fetching transcriptions:", error)
    return NextResponse.json(
      { 
        error: "Failed to fetch transcriptions",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}
