"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Loader2, Clock, CheckCircle, XCircle } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { useTranscriptionQueue } from "@/hooks/use-transcription-queue"

interface ProcessingStatusProps {
  status: string
  jobId: string
  enableRealTimeUpdates?: boolean
}

export function ProcessingStatus({ status, jobId, enableRealTimeUpdates = false }: ProcessingStatusProps) {
  const [progress, setProgress] = useState(0)
  const [currentStatus, setCurrentStatus] = useState(status)
  const [queuePosition, setQueuePosition] = useState<number | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null)

  // Use WebSocket for real-time updates if enabled
  const { isConnected, lastUpdate, error } = useTranscriptionQueue({
    taskId: enableRealTimeUpdates ? (taskId || undefined) : undefined,
    onStatusChange: (update) => {
      setCurrentStatus(update.status)
      setProgress(update.progress * 100)
    }
  })

  // Fetch queue status for processing jobs
  useEffect(() => {
    if (currentStatus === "processing" && enableRealTimeUpdates) {
      // In a real implementation, you would get the taskId from the job creation response
      // For now, we'll simulate or fetch it from an API
      fetchTaskId()
    }
  }, [currentStatus, enableRealTimeUpdates])

  const fetchTaskId = async () => {
    try {
      // This would be an API call to get the taskId associated with the jobId
      // For now, we'll use jobId as taskId (you'll need to modify based on your actual implementation)
      setTaskId(jobId)
    } catch (error) {
      console.error('Error fetching task ID:', error)
    }
  }

  // Fallback progress simulation for non-real-time mode
  useEffect(() => {
    if (enableRealTimeUpdates && lastUpdate) return // Use real-time data when available

    if (currentStatus !== "pending" && currentStatus !== "processing") return

    // Start with different progress based on status
    setProgress(currentStatus === "pending" ? 0 : 15)

    const interval = setInterval(() => {
      setProgress((prev) => {
        // Slow down progress as it gets higher to simulate real processing
        const increment = Math.max(1, 10 - Math.floor(prev / 10))

        // Cap at 95% - the final 5% happens when actually complete
        const newProgress = Math.min(95, prev + increment)

        // If we're at 95%, switch to "processing" if we were "pending"
        if (newProgress >= 95 && currentStatus === "pending") {
          setCurrentStatus("processing")
        }

        return newProgress
      })
    }, 800)

    return () => clearInterval(interval)
  }, [currentStatus, enableRealTimeUpdates, lastUpdate])

  // Update status when prop changes
  useEffect(() => {
    setCurrentStatus(status)
    if (status === "completed") {
      setProgress(100)
    } else if (status === "failed") {
      setProgress(0)
    }
  }, [status])

  const getStatusBadge = () => {
    const commonClasses = "gap-2"
    
    switch (currentStatus) {
      case "pending":
        return (
          <Badge variant="outline" className={commonClasses}>
            <Clock className="h-3 w-3" />
            Queued
            {queuePosition && ` (Position: ${queuePosition})`}
          </Badge>
        )
      case "processing":
        return (
          <Badge variant="secondary" className={commonClasses}>
            <Loader2 className="h-3 w-3 animate-spin" />
            Processing
            {enableRealTimeUpdates && isConnected && (
              <span className="text-xs">• Live</span>
            )}
          </Badge>
        )
      case "completed":
        return (
          <Badge variant="default" className={commonClasses}>
            <CheckCircle className="h-3 w-3" />
            Completed
          </Badge>
        )
      case "failed":
        return (
          <Badge variant="destructive" className={commonClasses}>
            <XCircle className="h-3 w-3" />
            Failed
          </Badge>
        )
      default:
        return (
          <Badge variant="outline" className={commonClasses}>
            Unknown
          </Badge>
        )
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "success"
      case "processing":
        return "warning"
      case "pending":
        return "secondary"
      case "failed":
        return "destructive"
      default:
        return "secondary"
    }
  }

  return (
    <div className="flex flex-col space-y-2">
      {getStatusBadge()}
      
      {(currentStatus === "pending" || currentStatus === "processing") && (
        <div className="w-full">
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>{Math.round(progress)}% complete</span>
            {enableRealTimeUpdates && lastUpdate && (
              <span className="thai-text">{lastUpdate.message}</span>
            )}
            {error && (
              <span className="text-red-500">Connection Error</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
