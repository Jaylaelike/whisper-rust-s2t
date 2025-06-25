"use client"

import { QueueOverviewNew } from "@/components/queue-overview-new"
import { WebSocketProvider } from "@/contexts/websocket-context"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useState } from "react"
import { toast } from "sonner"

export default function QueueTestPage() {
  const [testUploading, setTestUploading] = useState(false)

  const handleTestUpload = async () => {
    setTestUploading(true)
    try {
      // Create a small test audio file blob
      const audioBlob = new Blob(['test audio data'], { type: 'audio/wav' })
      const formData = new FormData()
      formData.append('file', audioBlob, 'test-audio.wav')
      formData.append('backend', 'auto')
      formData.append('language', 'auto')

      const response = await fetch('/api/transcribe-job', {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        const result = await response.json()
        toast.success(`Test task submitted: ${result.taskId?.slice(-8)}`)
      } else {
        toast.error('Failed to submit test task')
      }
    } catch (error) {
      toast.error('Error submitting test task')
    } finally {
      setTestUploading(false)
    }
  }

  return (
    <WebSocketProvider>
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Queue Test Page</h1>
            <p className="text-muted-foreground">
              Test real-time WebSocket queue updates
            </p>
          </div>
          <Button
            onClick={handleTestUpload}
            disabled={testUploading}
            variant="outline"
          >
            {testUploading ? "Submitting..." : "Submit Test Task"}
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>WebSocket Real-time Queue Overview</CardTitle>
            <CardDescription>
              This component demonstrates real-time queue updates via WebSocket. 
              Submit a test task to see live progress updates.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Badge variant="secondary">Real-time Updates</Badge>
                <Badge variant="outline">WebSocket Connected</Badge>
                <Badge variant="outline">Debounced UI Updates</Badge>
              </div>
              
              <div className="text-sm text-muted-foreground">
                <h4 className="font-medium mb-2">Features demonstrated:</h4>
                <ul className="list-disc list-inside space-y-1">
                  <li>Real-time queue status count updates</li>
                  <li>Live task progress tracking</li>
                  <li>Instant status changes (pending → processing → completed)</li>
                  <li>WebSocket connection status indicator</li>
                  <li>Debounced UI updates for performance</li>
                  <li>Reduced polling with real-time data</li>
                  <li>Toast notifications for task events</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <QueueOverviewNew />
      </div>
    </WebSocketProvider>
  )
}
