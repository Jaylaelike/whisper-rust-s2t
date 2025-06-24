import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params
    
    const response = await fetch(`http://localhost:8000/api/task/${taskId}/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Task not found' }))
      return NextResponse.json(
        { error: errorData.error || 'Failed to fetch task status' },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Task status fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch task status' },
      { status: 500 }
    )
  }
}
