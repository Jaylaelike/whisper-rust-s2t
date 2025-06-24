"use client"

import { TranscriptionDetail } from "@/components/transcription-detail"
import { AudioPlayer } from "@/components/audio-player"
import { useParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useQueue } from "@/hooks/use-queue"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, AlertTriangle } from "lucide-react"
import { TaskResult } from "@/lib/services/types"

export default function TranscriptionPage() {
  const params = useParams()
  const id = params.id as string
  const [taskResult, setTaskResult] = useState<TaskResult | null>(null)

  // Try to find the transcription in the queue first
  const { taskHistory, currentTask, getTaskStatus, isLoading: queueLoading } = useQueue({
    enableRealTimeUpdates: true
  })

  // Fallback to database API for legacy transcriptions
  const {
    data: transcription,
    isLoading: dbLoading,
    error: dbError,
  } = useQuery({
    queryKey: ["transcription", id],
    queryFn: async () => {
      const response = await fetch(`/api/transcriptions/${id}`)
      if (!response.ok) {
        throw new Error("Failed to fetch transcription")
      }
      return response.json()
    },
    refetchInterval: 10000, // Refetch every 10 seconds
  })

  // Check if this ID corresponds to a task in the queue
  useEffect(() => {
    const checkTaskResult = async () => {
      // First check if it's in the current task history
      const task = taskHistory.find(t => t.id === id)
      if (task) {
        setTaskResult(task)
        return
      }

      // If not in history, try to fetch it as a task ID
      try {
        const task = await getTaskStatus(id)
        setTaskResult(task)
      } catch (error) {
        // Not a valid task ID, will fall back to database transcription
        console.log('ID is not a task ID, using database transcription')
      }
    }

    if (id && !queueLoading) {
      checkTaskResult()
    }
  }, [id, taskHistory, getTaskStatus, queueLoading])

  // Show loading state
  if (queueLoading || dbLoading) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading transcription details...
          </CardContent>
        </Card>
      </div>
    )
  }

  // Show task result if this is a queue task
  if (taskResult) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold">Task Result</h1>
          <Badge variant={
            taskResult.status === 'Completed' ? 'default' :
            taskResult.status === 'Processing' ? 'secondary' :
            taskResult.status === 'Failed' ? 'destructive' : 'outline'
          }>
            {taskResult.status}
          </Badge>
        </div>

        {/* Audio Player - if we have a database transcription with audio file */}
        {transcription?.originalAudioFileName && transcription.originalAudioFileName.startsWith('/uploads/') && (
          <AudioPlayer
            src={`http://localhost:3000${transcription.originalAudioFileName}`}
            title={transcription.title || `Task ${taskResult.id}`}
            transcript={transcription.transcriptionResultJson || taskResult.result || undefined}
          />
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Task Information
              <code className="text-sm bg-muted px-2 py-1 rounded">{taskResult.id}</code>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <span className="text-sm text-muted-foreground">Status</span>
                <div className="font-medium">{taskResult.status}</div>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Progress</span>
                <div className="font-medium">{taskResult.progress}%</div>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Created</span>
                <div className="font-medium">
                  {new Date(taskResult.created_at).toLocaleString()}
                </div>
              </div>
            </div>

            {taskResult.completed_at && (
              <div>
                <span className="text-sm text-muted-foreground">Completed</span>
                <div className="font-medium">
                  {new Date(taskResult.completed_at).toLocaleString()}
                </div>
              </div>
            )}

            {taskResult.error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2 text-red-700">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="font-medium">Error</span>
                </div>
                <div className="text-red-600 mt-1">{taskResult.error}</div>
              </div>
            )}

            {taskResult.result && (
              <div>
                <span className="text-sm text-muted-foreground">Result</span>
                <div className="mt-2 p-4 bg-muted rounded-lg">
                  {taskResult.result && 'text' in taskResult.result ? (
                    <div>
                      <h4 className="font-medium mb-2">Transcription</h4>
                      <p className="text-sm whitespace-pre-wrap">{taskResult.result.text}</p>
                      
                      {'segments' in taskResult.result && taskResult.result.segments && taskResult.result.segments.length > 0 && (
                        <div className="mt-4">
                          <h4 className="font-medium mb-2">Segments ({taskResult.result.segments.length})</h4>
                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {'segments' in taskResult.result && taskResult.result.segments.slice(0, 5).map((segment: any, idx: number) => (
                              <div key={idx} className="text-xs p-2 bg-background rounded border">
                                <div className="font-mono">
                                  [{segment.start.toFixed(2)}s - {segment.end.toFixed(2)}s]
                                </div>
                                <div>{segment.text}</div>
                              </div>
                            ))}
                            {'segments' in taskResult.result && taskResult.result.segments.length > 5 && (
                              <div className="text-xs text-muted-foreground text-center">
                                ... and {taskResult.result.segments.length - 5} more segments
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <pre className="text-sm overflow-auto">
                      {JSON.stringify(taskResult.result, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // Handle database transcription errors
  if (dbError) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="flex items-center justify-center py-10 text-destructive">
            <AlertTriangle className="h-6 w-6 mr-2" />
            Error loading transcription details
          </CardContent>
        </Card>
      </div>
    )
  }

  // Handle not found
  if (!transcription) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="flex items-center justify-center py-10 text-muted-foreground">
            <AlertTriangle className="h-6 w-6 mr-2" />
            Transcription not found
          </CardContent>
        </Card>
      </div>
    )
  }

  // Show legacy database transcription
  return (
    <div className="container mx-auto py-6">
      <TranscriptionDetail transcription={transcription} />
    </div>
  )
}
