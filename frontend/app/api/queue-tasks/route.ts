import { type NextRequest, NextResponse } from "next/server"

// Configuration for the Redis-backed API server
const API_SERVER_URL = process.env.API_SERVER_URL || "http://localhost:8000"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const limit = searchParams.get('limit') || '50'
    
    // Build query string for the API server
    const queryParams = new URLSearchParams()
    if (status) {
      queryParams.set('status', status.toLowerCase())
    }
    queryParams.set('limit', limit)
    
    // Fetch task history from Redis-backed API server
    const response = await fetch(`${API_SERVER_URL}/api/queue/history?${queryParams}`)
    
    if (!response.ok) {
      throw new Error(`API server returned ${response.status}`)
    }

    const data = await response.json()
    
    // Transform the task data to match frontend expectations
    const transformedTasks = (data.tasks || []).map((task: any) => ({
      id: task.id,
      taskId: task.id,
      title: `Task ${task.id.slice(-8)}`, // Generate a display title
      status: task.status?.toLowerCase() || 'unknown',
      progress: task.progress || 0,
      startedAt: task.started_at,
      createdAt: task.created_at,
      completedAt: task.completed_at,
      error: task.error
    }))

    return NextResponse.json({
      success: true,
      tasks: transformedTasks,
      count: transformedTasks.length,
      source: "redis-api-server"
    })
  } catch (error) {
    console.error("Error fetching queue tasks from API server:", error)
    return NextResponse.json(
      { 
        error: "Failed to fetch queue tasks from API server",
        details: error instanceof Error ? error.message : String(error),
        api_server_url: API_SERVER_URL
      },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const taskId = searchParams.get('taskId')
    
    if (!taskId) {
      return NextResponse.json({ error: "taskId is required" }, { status: 400 })
    }

    // For now, we'll return a not implemented response since the Redis queue
    // doesn't have a direct delete endpoint yet
    // You might want to add this to the API server if needed
    return NextResponse.json({
      error: "Task deletion not implemented for Redis-backed queue",
      suggestion: "Tasks are automatically cleaned up by the queue system",
      taskId: taskId
    }, { status: 501 })

  } catch (error) {
    console.error("Error deleting queue task:", error)
    return NextResponse.json(
      { 
        error: "Failed to delete queue task",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}
