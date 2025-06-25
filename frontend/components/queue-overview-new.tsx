"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Progress } from "@/components/ui/progress"
import { RefreshCw, Clock, Cpu, AlertCircle, CheckCircle, Loader2, Trash2, Wifi, WifiOff, Wrench, ListMusic } from "lucide-react"
import { useQueueStatus, useQueueTasks, useDeleteQueueTask, type QueueTask } from "@/hooks/use-transcriptions"
import { useWebSocketContext } from "@/contexts/websocket-context"
import { formatDistanceToNow } from "date-fns"
import { toast } from "sonner"
import { useEffect, useState, useCallback } from "react"
import { isUsingRedisApi } from "@/lib/api-config"
import { useQueryClient } from "@tanstack/react-query"

export function QueueOverviewNew() {
  const queryClient = useQueryClient()
  
  const { 
    data: queueStatus, 
    isLoading: isLoadingStatus, 
    error: statusError, 
    refetch: refetchStatus 
  } = useQueueStatus()

  const { 
    data: queueTasks, 
    isLoading: isLoadingTasks, 
    error: tasksError,
    refetch: refetchTasks 
  } = useQueueTasks()

  const deleteQueueTask = useDeleteQueueTask()
  const { isConnected: isWebSocketConnected, lastMessage } = useWebSocketContext()

  // Remove local state and use TanStack Query cache directly
  const [lastUpdated, setLastUpdated] = useState(new Date())
  const [updateCount, setUpdateCount] = useState(0)

  // Enhanced debounced update function
  const debouncedUpdateMetrics = useCallback(() => {
    const timer = setTimeout(() => {
      setLastUpdated(new Date())
      setUpdateCount(prev => prev + 1)
    }, 300) // Reduced delay for more responsive updates
    
    return () => clearTimeout(timer)
  }, [])

  // Enhanced WebSocket message handling with direct cache updates
  useEffect(() => {
    if (!lastMessage || !isWebSocketConnected) return

    const { type, task_id, status, progress, result, message } = lastMessage

    switch (type) {
      case 'queue_stats_update':
        // Update queue status cache directly
        if (lastMessage.stats) {
          queryClient.setQueryData(['queue-status'], (oldData: any) => {
            if (!oldData) return oldData
            return {
              ...oldData,
              queue: {
                ...oldData.queue,
                pending: lastMessage.stats.pending_count || 0,
                processing: lastMessage.stats.processing_count || 0,
              }
            }
          })
          debouncedUpdateMetrics()
        }
        break

      case 'new_task':
        // Update pending count and invalidate tasks
        if (task_id) {
          queryClient.setQueryData(['queue-status'], (oldData: any) => {
            if (!oldData) return oldData
            return {
              ...oldData,
              queue: {
                ...oldData.queue,
                pending: (oldData.queue?.pending || 0) + 1
              }
            }
          })
          
          // Invalidate queue tasks to refetch with new task
          queryClient.invalidateQueries({ queryKey: ['queue-tasks'] })
          debouncedUpdateMetrics()
          toast.info(`📋 New task queued: ${task_id.slice(-8)}`)
        }
        break

      case 'task_status_update':
        if (task_id && status === 'processing') {
          // Update queue status counts
          queryClient.setQueryData(['queue-status'], (oldData: any) => {
            if (!oldData) return oldData
            return {
              ...oldData,
              queue: {
                ...oldData.queue,
                pending: Math.max((oldData.queue?.pending || 0) - 1, 0),
                processing: (oldData.queue?.processing || 0) + 1
              }
            }
          })
          
          // Update specific task in tasks cache
          queryClient.setQueryData(['queue-tasks'], (oldData: any) => {
            if (!oldData?.tasks) return oldData
            return {
              ...oldData,
              tasks: oldData.tasks.map((task: any) => 
                task.taskId === task_id 
                  ? { ...task, status: 'processing', startedAt: new Date().toISOString() }
                  : task
              )
            }
          })
          debouncedUpdateMetrics()
        }
        break

      case 'task_progress':
        if (task_id && progress !== undefined) {
          // Update task progress in both caches
          queryClient.setQueryData(['queue-tasks'], (oldData: any) => {
            if (!oldData?.tasks) return oldData
            return {
              ...oldData,
              tasks: oldData.tasks.map((task: any) =>
                task.taskId === task_id
                  ? { ...task, progress: progress }
                  : task
              )
            }
          })
          
          queryClient.setQueryData(['queue-status'], (oldData: any) => {
            if (!oldData?.queue?.processingTasks) return oldData
            return {
              ...oldData,
              queue: {
                ...oldData.queue,
                processingTasks: oldData.queue.processingTasks.map((task: any) =>
                  task.taskId === task_id
                    ? { ...task, progress: progress }
                    : task
                )
              }
            }
          })
          debouncedUpdateMetrics()
        }
        break

      case 'task_completed':
        if (task_id) {
          // Update queue status counts
          queryClient.setQueryData(['queue-status'], (oldData: any) => {
            if (!oldData) return oldData
            return {
              ...oldData,
              queue: {
                ...oldData.queue,
                processing: Math.max((oldData.queue?.processing || 0) - 1, 0),
                completed24h: (oldData.queue?.completed24h || 0) + 1,
                // Remove from processing tasks
                processingTasks: oldData.queue?.processingTasks?.filter((task: any) => task.taskId !== task_id) || []
              }
            }
          })

          // Update task status in tasks cache
          queryClient.setQueryData(['queue-tasks'], (oldData: any) => {
            if (!oldData?.tasks) return oldData
            return {
              ...oldData,
              tasks: oldData.tasks.map((task: any) =>
                task.taskId === task_id
                  ? { 
                      ...task, 
                      status: status || 'completed',
                      progress: 1.0,
                      completedAt: new Date().toISOString()
                    }
                  : task
              )
            }
          })

          debouncedUpdateMetrics()
          
          if (status === 'completed') {
            toast.success(`🎉 Task ${task_id.slice(-8)} completed successfully`)
          } else {
            toast.error(`❌ Task ${task_id.slice(-8)} failed`)
          }
          
          // Invalidate transcriptions to show new completed transcription
          queryClient.invalidateQueries({ queryKey: ['transcriptions'] })
        }
        break
    }
  }, [lastMessage, isWebSocketConnected, queryClient, debouncedUpdateMetrics])

  const handleDeleteTask = async (taskId: string) => {
    try {
      await deleteQueueTask.mutateAsync(taskId)
      toast.success("Queue task deleted successfully")
    } catch (error) {
      toast.error("Failed to delete queue task")
    }
  }

  const handleRefresh = () => {
    // Invalidate and refetch all queue-related queries
    queryClient.invalidateQueries({ queryKey: ['queue-status'] })
    queryClient.invalidateQueries({ queryKey: ['queue-tasks'] })
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

  // Helper function to check if a task is taking too long
  const getTaskTimeoutStatus = (task: any) => {
    if (!task.startedAt) return null
    
    const now = new Date()
    const startTime = new Date(task.startedAt)
    const elapsedMinutes = (now.getTime() - startTime.getTime()) / (1000 * 60)
    
    // Estimate timeout based on task progress
    let estimatedTimeout = 15 // Default 15 minutes
    
    if (task.progress && task.progress > 10) {
      // If we have some progress, assume it's a larger file
      estimatedTimeout = 30
    }
    
    if (elapsedMinutes > estimatedTimeout) {
      return {
        level: 'error',
        message: `Task may have timed out (running for ${Math.round(elapsedMinutes)} minutes)`
      }
    } else if (elapsedMinutes > estimatedTimeout * 0.7) {
      return {
        level: 'warning', 
        message: `Long-running task (${Math.round(elapsedMinutes)} minutes elapsed)`
      }
    }
    
    return null
  }

  if (statusError || tasksError) {
    return (
      <div className="animate-fade-in">
        <Card className="card-enhanced border-red-200/50 bg-red-50/30">
          <CardHeader className="text-center space-y-4">
            <div className="flex justify-center">
              <div className="p-4 rounded-full bg-red-100 text-red-600">
                <AlertCircle className="h-8 w-8" />
              </div>
            </div>
            <div>
              <CardTitle className="text-red-700 text-xl">Error Loading Queue</CardTitle>
              <CardDescription className="text-red-600/80 mt-2">
                Failed to load queue information. Please check your connection and try again.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <div className="text-sm text-red-600/70 bg-red-100/50 p-3 rounded-lg">
              {statusError?.message || tasksError?.message || "Unknown error occurred"}
            </div>
            <Button 
              onClick={handleRefresh} 
              variant="outline"
              className="btn-enhanced hover:shadow-lg border-red-200 text-red-700 hover:bg-red-50"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry Connection
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Enhanced Header with Gradient Background */}
      <div className="relative p-6 rounded-2xl bg-gradient-to-br from-primary/10 via-background to-secondary/5 border border-border/50 backdrop-blur-sm">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent rounded-2xl" />
        <div className="relative flex items-center justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Cpu className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
                  Queue Overview
                </h1>
                <p className="text-muted-foreground/80 text-sm">
                  Real-time processing queue status with live updates
                </p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {isWebSocketConnected && (
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-green-100/80 text-green-700 border border-green-200/50 backdrop-blur-sm ws-indicator-live">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse-glow" />
                  Live updates • Last: {formatDistanceToNow(lastUpdated, { addSuffix: true })}
                </div>
              )}
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100/80 text-blue-700 border border-blue-200/50 backdrop-blur-sm">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                Source: {isUsingRedisApi() ? 'Redis API Server' : 'Database'}
              </div>
              {updateCount > 0 && (
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-purple-100/80 text-purple-700 border border-purple-200/50 backdrop-blur-sm">
                  <div className="w-2 h-2 rounded-full bg-purple-500" />
                  Updates: {updateCount}
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Enhanced WebSocket Status */}
            <Badge 
              variant={isWebSocketConnected ? "default" : "destructive"}
              className={`status-indicator ${isWebSocketConnected ? 'animate-pulse-glow' : ''} transition-all duration-300`}
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
              className="btn-enhanced hover:shadow-lg transition-all duration-300"
            >
              <Wrench className="h-4 w-4 mr-2" />
              Cleanup
            </Button>
            
            <Button
              onClick={handleRefresh}
              variant="outline"
              size="sm"
              disabled={isLoadingStatus}
              className="btn-enhanced hover:shadow-lg transition-all duration-300"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingStatus ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Enhanced Status Cards with Gradients and Animations */}
      {queueStatus && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-slide-up">
          <Card className="card-enhanced group hover:scale-105 transition-all duration-300">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
              <div className="p-2 rounded-lg bg-yellow-100 text-yellow-600 group-hover:bg-yellow-200 transition-colors duration-300">
                <Clock className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-600 mb-1 group-hover:scale-110 transition-transform duration-300">
                {queueStatus.queue.pending}
              </div>
              <p className="text-xs text-muted-foreground">
                Tasks waiting to process
              </p>
              <div className="mt-2 h-1 bg-yellow-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-yellow-400 to-yellow-500 rounded-full animate-pulse" 
                     style={{ width: `${Math.min(queueStatus.queue.pending * 10, 100)}%` }} />
              </div>
            </CardContent>
          </Card>

          <Card className="card-enhanced group hover:scale-105 transition-all duration-300">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Processing</CardTitle>
              <div className="p-2 rounded-lg bg-blue-100 text-blue-600 group-hover:bg-blue-200 transition-colors duration-300">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600 mb-1 group-hover:scale-110 transition-transform duration-300">
                {queueStatus.queue.processing}
              </div>
              <p className="text-xs text-muted-foreground">
                Currently being processed
              </p>
              <div className="mt-2 h-1 bg-blue-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-400 to-blue-500 rounded-full progress-enhanced" 
                     style={{ width: `${Math.min(queueStatus.queue.processing * 20, 100)}%` }} />
              </div>
            </CardContent>
          </Card>

          <Card className="card-enhanced group hover:scale-105 transition-all duration-300">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Completed (24h)</CardTitle>
              <div className="p-2 rounded-lg bg-green-100 text-green-600 group-hover:bg-green-200 transition-colors duration-300">
                <CheckCircle className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600 mb-1 group-hover:scale-110 transition-transform duration-300">
                {queueStatus.queue.completed24h}
              </div>
              <p className="text-xs text-muted-foreground">
                Completed in last 24 hours
              </p>
              <div className="mt-2 h-1 bg-green-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-green-400 to-green-500 rounded-full" 
                     style={{ width: `${Math.min(queueStatus.queue.completed24h * 5, 100)}%` }} />
              </div>
            </CardContent>
          </Card>

          <Card className="card-enhanced group hover:scale-105 transition-all duration-300">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Failed (24h)</CardTitle>
              <div className="p-2 rounded-lg bg-red-100 text-red-600 group-hover:bg-red-200 transition-colors duration-300">
                <AlertCircle className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600 mb-1 group-hover:scale-110 transition-transform duration-300">
                {queueStatus.queue.failed24h}
              </div>
              <p className="text-xs text-muted-foreground">
                Failed in last 24 hours
              </p>
              <div className="mt-2 h-1 bg-red-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-red-400 to-red-500 rounded-full" 
                     style={{ width: `${Math.min(queueStatus.queue.failed24h * 10, 100)}%` }} />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Enhanced Active Processing Tasks */}
      {queueStatus && queueStatus.queue.processingTasks.length > 0 && (
        <Card className="card-enhanced animate-slide-up">
          <CardHeader className="border-b border-border/50 bg-gradient-to-r from-blue-50/50 to-purple-50/50">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                <Cpu className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Active Processing Tasks</CardTitle>
                <CardDescription>
                  Tasks currently being processed with real-time progress updates
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-6">
              {queueStatus.queue.processingTasks.map((task: QueueTask, index: number) => (
                <div 
                  key={task.id} 
                  className="relative p-5 border border-border/60 rounded-xl bg-gradient-to-br from-blue-50/30 to-white shadow-sm hover:shadow-md transition-all duration-300 animate-scale-in"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  {/* Animated border glow for processing */}
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-400/20 via-purple-400/20 to-blue-400/20 opacity-75 animate-pulse-glow" />
                  
                  <div className="relative">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                          <div className="absolute inset-0 rounded-full bg-blue-400/20 animate-ping" />
                        </div>
                        <div>
                          <span className="font-semibold text-foreground">{task.title}</span>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge className="status-processing animate-pulse">
                              Processing
                            </Badge>
                            {isWebSocketConnected && (
                              <Badge variant="outline" className="status-indicator ws-indicator-live text-green-600 border-green-600 text-xs">
                                Live
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
                        Started {formatDistanceToNow(new Date(task.startedAt!), { addSuffix: true })}
                      </div>
                    </div>
                    
                    {task.progress !== null && task.progress !== undefined && (                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium text-blue-600">{Math.round(task.progress * 100)}%</span>
                      </div>
                      <div className="relative">
                        <Progress 
                          value={task.progress * 100} 
                          className="h-3 progress-enhanced bg-blue-100/50" 
                        />
                        <div 
                          className="absolute top-0 left-0 h-3 bg-gradient-to-r from-blue-400 to-blue-500 rounded-full transition-all duration-300 progress-glow"
                          style={{ width: `${task.progress * 100}%` }}
                        />
                      </div>
                      
                      {/* Timeout Warning */}
                      {(() => {
                        const timeoutStatus = getTaskTimeoutStatus(task)
                        if (!timeoutStatus) return null
                        
                        const bgColor = timeoutStatus.level === 'error' ? 'bg-red-50/80 border-red-200/50' : 'bg-yellow-50/80 border-yellow-200/50'
                        const textColor = timeoutStatus.level === 'error' ? 'text-red-700' : 'text-yellow-700'
                        const iconColor = timeoutStatus.level === 'error' ? 'text-red-500' : 'text-yellow-500'
                        
                        return (
                          <div className={`flex items-center gap-2 p-2 border rounded-lg ${bgColor} animate-fade-in mt-2`}>
                            <AlertCircle className={`h-4 w-4 ${iconColor}`} />
                            <span className={`text-xs ${textColor}`}>
                              {timeoutStatus.message}
                            </span>
                          </div>
                        )
                      })()}
                    </div>
                    )}
                    
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/40 text-xs text-muted-foreground">
                      <div className="flex items-center gap-4">
                        <span className="font-mono bg-muted/30 px-2 py-1 rounded">
                          Task: {task.taskId.slice(-8)}
                        </span>
                        <span className="font-mono bg-muted/30 px-2 py-1 rounded">
                          Queue: {task.id}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-green-600">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        Real-time updates
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Enhanced All Queue Tasks Table */}
      {queueTasks && (
        <Card className="card-enhanced animate-slide-up">
          <CardHeader className="border-b border-border/50 bg-gradient-to-r from-slate-50/50 to-gray-50/50">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-slate-100 text-slate-600">
                <ListMusic className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">All Queue Tasks</CardTitle>
                <CardDescription>
                  Complete list of queue tasks with real-time status updates
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-hidden rounded-b-xl">
              <Table className="table-enhanced">
                <TableHeader>
                  <TableRow className="border-none bg-muted/30">
                    <TableHead className="font-semibold text-foreground">Title</TableHead>
                    <TableHead className="font-semibold text-foreground">Status</TableHead>
                    <TableHead className="font-semibold text-foreground">Progress</TableHead>
                    <TableHead className="font-semibold text-foreground">Created</TableHead>
                    <TableHead className="font-semibold text-foreground">Task ID</TableHead>
                    <TableHead className="font-semibold text-foreground">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queueTasks.tasks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12">
                        <div className="flex flex-col items-center gap-4 animate-fade-in">
                          <div className="p-4 rounded-full bg-green-100 text-green-600">
                            <CheckCircle className="h-12 w-12" />
                          </div>
                          <div className="space-y-2 text-center">
                            <p className="text-lg font-medium text-muted-foreground">No tasks in queue</p>
                            <p className="text-sm text-muted-foreground/60">All tasks have been processed successfully</p>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    queueTasks.tasks.map((task: QueueTask, index: number) => (
                      <TableRow 
                        key={task.id} 
                        className="group hover:bg-muted/20 transition-all duration-200 animate-fade-in border-border/30"
                        style={{ animationDelay: `${index * 0.05}s` }}
                      >
                        <TableCell className="py-4">
                          <div className="space-y-1">
                            <div className="font-medium text-foreground group-hover:text-primary transition-colors duration-200">
                              {task.title}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono bg-muted/30 px-2 py-1 rounded w-fit">
                              Queue: {task.id}
                            </div>
                          </div>
                        </TableCell>
                        
                        <TableCell className="py-4">
                          <div className="flex items-center gap-2">
                            <Badge 
                              className={`status-indicator transition-all duration-200 ${
                                task.status === 'pending' ? 'status-pending' :
                                task.status === 'processing' ? 'status-processing' :
                                task.status === 'completed' ? 'status-completed' : 'status-failed'
                              }`}
                            >
                              {getStatusIcon(task.status)}
                              {task.status}
                            </Badge>
                            {task.status === 'processing' && isWebSocketConnected && (
                              <Badge variant="outline" className="status-indicator ws-indicator-live text-green-600 border-green-600 text-xs animate-pulse">
                                Live
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        
                        <TableCell className="py-4">
                          {task.progress !== null && task.progress !== undefined ? (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <div className="relative flex-1 max-w-24">
                                  <Progress 
                                    value={task.progress * 100} 
                                    className={`h-2 progress-enhanced ${
                                      task.status === 'processing' && isWebSocketConnected ? 'bg-blue-100' : ''
                                    }`} 
                                  />
                                  {task.status === 'processing' && (
                                    <div 
                                      className="absolute top-0 left-0 h-2 bg-gradient-to-r from-blue-400 to-blue-500 rounded-full transition-all duration-300 progress-glow"
                                      style={{ width: `${task.progress * 100}%` }}
                                    />
                                  )}
                                </div>
                                <span className="text-xs font-medium text-foreground min-w-[3rem] text-right">
                                  {Math.round(task.progress * 100)}%
                                </span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        
                        <TableCell className="py-4">
                          <div className="text-sm text-muted-foreground">
                            {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}
                          </div>
                        </TableCell>
                        
                        <TableCell className="py-4">
                          <div className="text-xs font-mono bg-muted/30 px-2 py-1 rounded w-fit">
                            {task.taskId ? task.taskId.slice(-12) : "Not assigned"}
                          </div>
                        </TableCell>
                        
                        <TableCell className="py-4">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeleteTask(task.taskId)}
                            disabled={deleteQueueTask.isPending || task.status === "processing"}
                            className="btn-enhanced hover:shadow-md transition-all duration-200 disabled:opacity-50"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Enhanced Loading States */}
      {(isLoadingStatus || isLoadingTasks) && (
        <Card className="card-enhanced animate-fade-in">
          <CardContent className="p-12">
            <div className="flex flex-col items-center justify-center space-y-6">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                <div className="absolute inset-2 border-4 border-secondary/20 border-b-secondary rounded-full animate-spin animation-direction-reverse" />
              </div>
              <div className="text-center space-y-2">
                <div className="text-lg font-medium">Loading queue information...</div>
                <div className="text-sm text-muted-foreground">
                  Fetching real-time data from {isUsingRedisApi() ? 'Redis API Server' : 'Database'}
                </div>
              </div>
              <div className="w-48 h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-primary/60 to-primary rounded-full loading-shimmer" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
