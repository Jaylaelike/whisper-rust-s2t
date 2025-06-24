import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { taskId, status, result, error } = body
    
    console.log('Sync task request:', { taskId, status, result: !!result, error: !!error })
    
    // For now, just acknowledge the sync request
    // You can add database sync logic here if needed
    
    return NextResponse.json({
      success: true,
      message: 'Task sync acknowledged',
      taskId
    })
  } catch (error) {
    console.error('Sync task error:', error)
    return NextResponse.json(
      { error: 'Failed to sync task' },
      { status: 500 }
    )
  }
}