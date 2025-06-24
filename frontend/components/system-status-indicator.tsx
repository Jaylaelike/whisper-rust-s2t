"use client"

import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Loader2 } from "lucide-react"

interface SystemStatus {
  backendOnline: boolean
  activeTasks: number
  queueLength: number
}

export function SystemStatusIndicator() {
  const [status, setStatus] = useState<SystemStatus>({
    backendOnline: false,
    activeTasks: 0,
    queueLength: 0
  })

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/queue/stats')
        if (response.ok) {
          const data = await response.json()
          setStatus({
            backendOnline: true,
            activeTasks: data.queue_stats?.processing || 0,
            queueLength: data.queue_stats?.pending || 0
          })
        } else {
          setStatus(prev => ({ ...prev, backendOnline: false }))
        }
      } catch (error) {
        setStatus(prev => ({ ...prev, backendOnline: false }))
      }
    }

    checkStatus()
    const interval = setInterval(checkStatus, 15000) // Check every 15 seconds
    return () => clearInterval(interval)
  }, [])

  const isActive = status.activeTasks > 0 || status.queueLength > 0

  return (
    <div className="flex items-center gap-2">
      {status.backendOnline ? (
        <>
          {isActive ? (
            <Badge variant="secondary" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              {status.activeTasks + status.queueLength} tasks
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1">
              <div className="h-2 w-2 bg-green-500 rounded-full"></div>
              Ready
            </Badge>
          )}
        </>
      ) : (
        <Badge variant="destructive" className="gap-1">
          <div className="h-2 w-2 bg-white rounded-full"></div>
          Offline
        </Badge>
      )}
    </div>
  )
}
