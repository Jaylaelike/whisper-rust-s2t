import { type NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    
    const whereClause = status ? { status } : {}
    
    const queueTasks = await (prisma as any).queueTask.findMany({
      where: whereClause,
      orderBy: {
        createdAt: 'desc'
      },
      take: 50 // Limit to 50 most recent tasks
    })

    return NextResponse.json({
      success: true,
      tasks: queueTasks,
      count: queueTasks.length
    })
  } catch (error) {
    console.error("Error fetching queue tasks:", error)
    return NextResponse.json(
      { 
        error: "Failed to fetch queue tasks",
        details: error instanceof Error ? error.message : String(error)
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

    await (prisma as any).queueTask.delete({
      where: { taskId }
    })

    return NextResponse.json({
      success: true,
      message: "Queue task deleted successfully"
    })
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
