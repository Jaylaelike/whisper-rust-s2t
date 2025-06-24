"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Progress } from "@/components/ui/progress"
import { RefreshCw, Clock, Cpu, AlertCircle, CheckCircle, Loader2, Trash2, Wifi, WifiOff, Wrench } from "lucide-react"
import { useQueueStatus, useQueueTasks, useDeleteQueueTask, type QueueTask } from "@/hooks/use-transcriptions"
import { useWebSocketContext } from "@/contexts/websocket-context"
import { formatDistanceToNow } from "date-fns"
import { toast } from "sonner"

export function QueueOverviewNew() {
  const { 
    data: queueStatus, 
    isLoading: isLoadingStatus, 
    error: statusError, 
    refetch: refetchStatus 
  } = useQueueStatus()

  const { 
    data: queueTasks, 
    isLoading: isLoadingTasks, 
    error: tasksError 
  } = useQueueTasks()

  const deleteQueueTask = useDeleteQueueTask()
  const { isConnected: isWebSocketConnected } = useWebSocketContext()

  const handleDeleteTask = async (taskId: string) => {
    try {
      await deleteQueueTask.mutateAsync(taskId)
      toast.success("Queue task deleted successfully")
    } catch (error) {
      toast.error("Failed to delete queue task")
    }
  }

  const handleRefresh = () => {
    refetchStatus()
    toast.success("Queue status refreshed")
  }

  const handleCleanupStaleTasks = async () => {
    try {
      const response = await fetch('/api/queue/cleanup', {
        method: 'POST',
      })
      
      if (!response.ok) {
        throw new Error('Failed to cleanup stale tasks')
      }
      
      const result = await response.json()
      toast.success(`🧹 Cleaned up ${result.cleaned_count} stale tasks`)
      
      // Refresh the data
      refetchStatus()
    } catch (error) {
      toast.error("Failed to cleanup stale tasks")
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending": return <Clock className="h-4 w-4" />
      case "processing": return <Loader2 className="h-4 w-4 animate-spin" />
      case "completed": return <CheckCircle className="h-4 w-4" />
      case "failed": return <AlertCircle className="h-4 w-4" />
      default: return <Clock className="h-4 w-4" />
    }
  }

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "pending": return "outline"
      case "processing": return "secondary"
      case "completed": return "default"
      case "failed": return "destructive"
      default: return "secondary"
    }
  }

  if (statusError || tasksError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-red-600">Error Loading Queue</CardTitle>
          <CardDescription>
            Failed to load queue information. Please try again.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleRefresh} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Queue Overview</h1>
          <p className="text-muted-foreground">
            Real-time processing queue status
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* WebSocket Status */}
          <Badge 
            variant={isWebSocketConnected ? "default" : "destructive"}
            className="flex items-center gap-1"
          >
            {isWebSocketConnected ? (
              <Wifi className="h-3 w-3" />
            ) : (
              <WifiOff className="h-3 w-3" />
            )}
            {isWebSocketConnected ? "Live" : "Offline"}
          </Badge>
          
          <Button
            onClick={handleCleanupStaleTasks}
            variant="outline"
            size="sm"
          >
            <Wrench className="h-4 w-4 mr-2" />
            Cleanup
          </Button>
          
          <Button
            onClick={handleRefresh}
            variant="outline"
            size="sm"
            disabled={isLoadingStatus}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingStatus ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Status Cards */}
      {queueStatus && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{queueStatus.queue.pending}</div>
              <p className="text-xs text-muted-foreground">
                Tasks waiting to process
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Processing</CardTitle>
              <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{queueStatus.queue.processing}</div>
              <p className="text-xs text-muted-foreground">
                Currently being processed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed (24h)</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{queueStatus.queue.completed24h}</div>
              <p className="text-xs text-muted-foreground">
                Completed in last 24 hours
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Failed (24h)</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{queueStatus.queue.failed24h}</div>
              <p className="text-xs text-muted-foreground">
                Failed in last 24 hours
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Active Processing Tasks */}
      {queueStatus && queueStatus.queue.processingTasks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Active Processing Tasks</CardTitle>
            <CardDescription>
              Tasks currently being processed with progress information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {queueStatus.queue.processingTasks.map((task: QueueTask) => (
                <div key={task.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="font-medium">{task.title}</span>
                      <Badge variant="secondary">Processing</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Started {formatDistanceToNow(new Date(task.startedAt!), { addSuffix: true })}
                    </div>
                  </div>
                  {task.progress !== null && task.progress !== undefined && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>Progress</span>
                        <span>{Math.round(task.progress * 100)}%</span>
                      </div>
                      <Progress value={task.progress * 100} className="h-2" />
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                    <span>Task ID: {task.taskId}</span>
                    <span>Queue ID: {task.id}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Queue Tasks */}
      {queueTasks && (
        <Card>
          <CardHeader>
            <CardTitle>All Queue Tasks</CardTitle>
            <CardDescription>
              Complete list of queue tasks with management options
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Task ID</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queueTasks.tasks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <div className="flex flex-col items-center gap-2">
                        <CheckCircle className="h-8 w-8 text-muted-foreground" />
                        <p className="text-muted-foreground">No tasks in queue</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  queueTasks.tasks.map((task: QueueTask) => (
                    <TableRow key={task.id}>
                      <TableCell>
                        <div className="font-medium">{task.title}</div>
                        <div className="text-sm text-muted-foreground">
                          Queue ID: {task.id}
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(task.status)} className="flex items-center gap-1 w-fit">
                          {getStatusIcon(task.status)}
                          {task.status}
                        </Badge>
                      </TableCell>
                      
                      <TableCell>
                        {task.progress !== null && task.progress !== undefined ? (
                          <div className="space-y-1">
                            <Progress value={task.progress * 100} className="h-2 w-20" />
                            <div className="text-xs text-center">{Math.round(task.progress * 100)}%</div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      
                      <TableCell>
                        <div className="text-sm">
                          {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <div className="text-sm font-mono">
                          {task.taskId || "Not assigned"}
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteTask(task.taskId)}
                          disabled={deleteQueueTask.isPending || task.status === "processing"}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Loading States */}
      {(isLoadingStatus || isLoadingTasks) && (
        <Card>
          <CardContent className="p-8">
            <div className="flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="ml-2">Loading queue information...</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
