import { type NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function GET(request: NextRequest) {
  try {
    const [
      pendingCount,
      processingCount,
      recentCompleted,
      recentFailed
    ] = await Promise.all([
      (prisma as any).queueTask.count({ where: { status: 'pending' } }),
      (prisma as any).queueTask.count({ where: { status: 'processing' } }),
      (prisma as any).transcription.count({
        where: {
          completedAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        }
      }),
      (prisma as any).queueTask.count({
        where: {
          status: 'failed',
          completedAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        }
      })
    ])

    // Get currently processing tasks with progress
    const processingTasks = await (prisma as any).queueTask.findMany({
      where: { status: 'processing' },
      select: {
        id: true,
        taskId: true,
        title: true,
        progress: true,
        startedAt: true,
        createdAt: true,
      },
      orderBy: { startedAt: 'desc' }
    })

    return NextResponse.json({
      success: true,
      queue: {
        pending: pendingCount,
        processing: processingCount,
        completed24h: recentCompleted,
        failed24h: recentFailed,
        processingTasks
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error("Error fetching queue status:", error)
    return NextResponse.json(
      { 
        error: "Failed to fetch queue status",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}
