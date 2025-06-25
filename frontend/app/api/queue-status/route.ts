import { type NextRequest, NextResponse } from "next/server"

// Configuration for the Redis-backed API server
const API_SERVER_URL = process.env.API_SERVER_URL || "http://localhost:8000"

export async function GET(request: NextRequest) {
  try {
    // Fetch queue stats from Redis-backed API server
    const [queueStatsResponse, taskHistoryResponse] = await Promise.all([
      fetch(`${API_SERVER_URL}/api/queue/stats`),
      fetch(`${API_SERVER_URL}/api/queue/history?limit=50&status=processing`)
    ])

    if (!queueStatsResponse.ok) {
      throw new Error(`Queue stats API returned ${queueStatsResponse.status}`)
    }

    if (!taskHistoryResponse.ok) {
      throw new Error(`Task history API returned ${taskHistoryResponse.status}`)
    }

    const queueStatsData = await queueStatsResponse.json()
    const taskHistoryData = await taskHistoryResponse.json()

    // Extract stats from the Redis-backed API server response
    const stats = queueStatsData.queue_stats
    const processingTasks = taskHistoryData.tasks
      .filter((task: any) => task.status === 'Processing')
      .map((task: any) => ({
        id: task.id,
        taskId: task.id,
        title: `Task ${task.id.slice(-8)}`, // Generate a display title
        progress: task.progress || 0,
        startedAt: task.started_at,
        createdAt: task.created_at,
        status: task.status
      }))

    // Calculate 24h stats (approximation since Redis doesn't store creation time for completed tasks)
    // For now, we'll use the current completed/failed counts as 24h stats
    const completed24h = stats.completed_count || 0
    const failed24h = stats.failed_count || 0

    return NextResponse.json({
      success: true,
      queue: {
        pending: stats.pending_count || 0,
        processing: stats.processing_count || 0,
        completed24h: completed24h,
        failed24h: failed24h,
        processingTasks: processingTasks
      },
      timestamp: new Date().toISOString(),
      source: "redis-api-server"
    })
  } catch (error) {
    console.error("Error fetching queue status from API server:", error)
    return NextResponse.json(
      { 
        error: "Failed to fetch queue status from API server",
        details: error instanceof Error ? error.message : String(error),
        api_server_url: API_SERVER_URL
      },
      { status: 500 }
    )
  }
}
