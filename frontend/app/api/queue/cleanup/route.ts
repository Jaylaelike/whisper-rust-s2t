import { NextRequest, NextResponse } from 'next/server'

export async function POST() {
  try {
    const response = await fetch('http://localhost:8000/api/queue/cleanup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    
    return NextResponse.json(data)
  } catch (error) {
    console.error('Cleanup error:', error)
    return NextResponse.json(
      { error: 'Failed to cleanup stale tasks' },
      { status: 500 }
    )
  }
}
