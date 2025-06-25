import { NextRequest, NextResponse } from 'next/server'

// Configuration for the Redis-backed API server
const API_SERVER_URL = process.env.API_SERVER_URL || "http://localhost:8000"

export async function POST() {
  try {
    const response = await fetch(`${API_SERVER_URL}/api/queue/cleanup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    
    return NextResponse.json({
      ...data,
      source: "redis-api-server"
    })
  } catch (error) {
    console.error('Cleanup error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to cleanup stale tasks',
        details: error instanceof Error ? error.message : String(error),
        api_server_url: API_SERVER_URL
      },
      { status: 500 }
    )
  }
}
