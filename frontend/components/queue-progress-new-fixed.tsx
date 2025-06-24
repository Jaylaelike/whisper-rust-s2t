"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RefreshCw, Activity, Database, Server, AlertTriangle, ChevronLeft, ChevronRight, Shield, AlertCircle } from "lucide-react"
import { QueueService } from "@/lib/services/queue-service"
import { QueueStats, TaskResult, TaskStatus, WebSocketMessage } from "@/lib/services/types"
import { formatDistanceToNow } from "date-fns"

export function QueueProgressNew() {
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null)
  const [taskHistory, setTaskHistory] = useState<TaskResult[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalTasks, setTotalTasks] = useState(0)
  const [taskRiskStatus, setTaskRiskStatus] = useState<Record<string, any>>({})
  const tasksPerPage = 5
  const queueService = useRef(new QueueService())

  const fetchQueueData = async (page = currentPage) => {
    try {
      setError(null)
      // Fetch more tasks to support pagination
      const [stats, allHistory] = await Promise.all([
        queueService.current.getQueueStats(),
        queueService.current.getTaskHistory(50) // Get more tasks for pagination
      ])
      
      setQueueStats(stats)
      const historyArray = Array.isArray(allHistory) ? allHistory : []
      setTotalTasks(historyArray.length)
      
      // Calculate pagination
      const startIndex = (page - 1) * tasksPerPage
      const endIndex = startIndex + tasksPerPage
      const paginatedTasks = historyArray.slice(startIndex, endIndex)
      
      setTaskHistory(paginatedTasks)
      
      // Check risk analysis status for completed tasks
      await checkRiskAnalysisStatus(paginatedTasks)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch queue data')
      console.error('Error fetching queue data:', err)
      setTaskHistory([]) // Ensure it's always an array
      setTotalTasks(0)
    } finally {
      setIsLoading(false)
    }
  }

  // Check risk analysis status for tasks
  const checkRiskAnalysisStatus = async (tasks: TaskResult[]) => {
    const newRiskStatus: Record<string, any> = {}
    
    for (const task of tasks) {
      if (task.status === TaskStatus.Completed && task.result?.text) {
        try {
          // First check if there's already a risk analysis result from the backend queue
          if (task.result && 'risk_analysis' in task.result) {
            // Risk analysis is embedded in the task result
            const riskResult = task.result as any
            if (riskResult.risk_analysis) {
              newRiskStatus[task.id] = {
                status: 'completed',
                result: riskResult.risk_analysis.is_risky ? 'risky' : 'safe',
                confidence: riskResult.risk_analysis.confidence
              }
              continue
            }
          }

          // Check database for stored risk analysis
          const dbResponse = await fetch(`/api/transcriptions?search=${task.id}`)
          if (dbResponse.ok) {
            const dbData = await dbResponse.json()
            const transcription = dbData.transcriptions?.find((t: any) => t.taskId === task.id)
            
            if (transcription?.riskDetectionStatus === 'completed') {
              newRiskStatus[task.id] = {
                status: 'completed',
                result: transcription.riskDetectionResult === 'เข้าข่ายผิด' ? 'risky' : 'safe',
                confidence: transcription.riskConfidence
              }
            } else if (transcription?.riskDetectionStatus === 'analyzing') {
              newRiskStatus[task.id] = {
                status: 'analyzing'
              }
            } else {
              // No risk analysis yet - could trigger one
              newRiskStatus[task.id] = {
                status: 'not_analyzed'
              }
            }
          }
        } catch (err) {
          console.error('Error checking risk status for task', task.id, err)
          newRiskStatus[task.id] = {
            status: 'unknown'
          }
        }
      }
    }
    
    setTaskRiskStatus(newRiskStatus)
  }

  // Manually trigger risk analysis for a task
  const triggerRiskAnalysis = async (taskId: string, text: string) => {
    try {
      setTaskRiskStatus(prev => ({
        ...prev,
        [taskId]: { status: 'analyzing' }
      }))

      const riskResponse = await fetch('http://localhost:8000/api/risk-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          priority: 1
        })
      })
      
      if (riskResponse.ok) {
        const riskData = await riskResponse.json()
        setTaskRiskStatus(prev => ({
          ...prev,
          [taskId]: {
            status: 'analyzing',
            task_id: riskData.task_id
          }
        }))
        
        // The WebSocket will notify us when the analysis is complete
        console.log(`Risk analysis queued for task ${taskId} with risk task ID: ${riskData.task_id}`)
      } else {
        throw new Error('Failed to queue risk analysis')
      }
    } catch (error) {
      console.error('Error triggering risk analysis:', error)
      setTaskRiskStatus(prev => ({
        ...prev,
        [taskId]: { status: 'unknown' }
      }))
    }
  }

  // Set up WebSocket for real-time updates
  useEffect(() => {
    queueService.current.connectWebSocket()
    
    const unsubscribe = queueService.current.onWebSocketMessage((message: WebSocketMessage) => {
      if (message.type === 'queue_stats' && message.queue_stats) {
        setQueueStats({
          queue_stats: message.queue_stats,
          timestamp: message.timestamp || new Date().toISOString()
        })
      } else if (message.type === 'task_completed' || message.type === 'new_task') {
        // Refresh task history when tasks are added or completed
        fetchQueueData(currentPage)
      }
    })

    return () => {
      unsubscribe()
      queueService.current.disconnectWebSocket()
    }
  }, [])

  // Initial data fetch
  useEffect(() => {
    fetchQueueData(1)
  }, [])

  // Update data when page changes
  useEffect(() => {
    if (currentPage > 1) {
      fetchQueueData(currentPage)
    }
  }, [currentPage])

  // Auto-refresh mechanism
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => fetchQueueData(currentPage), 5000) // Refresh every 5 seconds
    return () => clearInterval(interval)
  }, [autoRefresh, currentPage])

  const formatTimestamp = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleString()
    } catch {
      return timestamp
    }
  }

  const formatRelativeTime = (timestamp: string) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true })
    } catch {
      return timestamp
    }
  }

  const calculateDuration = (startTime: string, endTime: string | null) => {
    if (!endTime) return null
    try {
      const start = new Date(startTime).getTime()
      const end = new Date(endTime).getTime()
      const durationMs = end - start
      const seconds = Math.floor(durationMs / 1000)
      const minutes = Math.floor(seconds / 60)
      const remainingSeconds = seconds % 60
      
      if (minutes > 0) {
        return `${minutes}m ${remainingSeconds}s`
      } else {
        return `${seconds}s`
      }
    } catch {
      return null
    }
  }

  const totalPages = Math.ceil(totalTasks / tasksPerPage)

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
    }
  }

  const getStatusBadgeVariant = (status: TaskStatus): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case TaskStatus.Completed:
        return 'default'
      case TaskStatus.Processing:
        return 'secondary'
      case TaskStatus.Failed:
        return 'destructive'
      case TaskStatus.Pending:
        return 'outline'
      case TaskStatus.Cancelled:
        return 'outline'
      default:
        return 'outline'
    }
  }

  const getRiskStatusBadge = (taskId: string) => {
    const riskStatus = taskRiskStatus[taskId]
    
    if (!riskStatus) {
      return (
        <Badge variant="outline" className="gap-1">
          <span className="text-xs">ไม่ทราบ</span>
        </Badge>
      )
    }

    switch (riskStatus.status) {
      case 'completed':
        if (riskStatus.result === 'risky' || riskStatus.result === 'เข้าข่ายผิด') {
          return (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              <span className="text-xs">มีความเสี่ยง</span>
            </Badge>
          )
        } else if (riskStatus.result === 'safe' || riskStatus.result === 'ไม่ผิด') {
          return (
            <Badge variant="secondary" className="gap-1">
              <Shield className="h-3 w-3" />
              <span className="text-xs">ไม่มีความเสี่ยง</span>
            </Badge>
          )
        }
        return (
          <Badge variant="outline" className="gap-1">
            <span className="text-xs">ไม่ทราบผล</span>
          </Badge>
        )
      case 'analyzing':
        return (
          <Badge variant="outline" className="gap-1">
            <Activity className="h-3 w-3 animate-spin" />
            <span className="text-xs">กำลังวิเคราะห์</span>
          </Badge>
        )
      case 'not_analyzed':
        return (
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs gap-1"
            onClick={() => {
              const task = taskHistory.find(t => t.id === taskId)
              if (task && task.result?.text) {
                triggerRiskAnalysis(taskId, task.result.text)
              }
            }}
          >
            <AlertCircle className="h-3 w-3" />
            <span>วิเคราะห์</span>
          </Button>
        )
      default:
        return (
          <Badge variant="outline" className="gap-1">
            <span className="text-xs">ไม่ทราบ</span>
          </Badge>
        )
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 animate-pulse" />
            Loading Queue Status...
          </CardTitle>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Queue Status</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <Activity className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-pulse' : ''}`} />
            {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => fetchQueueData(currentPage)}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Queue Statistics */}
      {queueStats && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Queue Statistics
            </CardTitle>
            <CardDescription>
              Last updated: {formatTimestamp(queueStats.timestamp)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">
                  {queueStats.queue_stats.pending_count}
                </div>
                <div className="text-sm text-muted-foreground">Pending</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {queueStats.queue_stats.processing_count}
                </div>
                <div className="text-sm text-muted-foreground">Processing</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {queueStats.queue_stats.completed_count}
                </div>
                <div className="text-sm text-muted-foreground">Completed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">
                  {queueStats.queue_stats.failed_count}
                </div>
                <div className="text-sm text-muted-foreground">Failed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {queueStats.queue_stats.total_tasks}
                </div>
                <div className="text-sm text-muted-foreground">Total</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Tasks */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Recent Tasks
          </CardTitle>
          <CardDescription>
            Showing {taskHistory.length} of {totalTasks} tasks (Page {currentPage} of {totalPages})
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!taskHistory || taskHistory.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No recent tasks
            </div>
          ) : (
            <div className="space-y-4">
              {/* Tasks Table */}
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead>Risk Analysis</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Completed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {taskHistory.map((task: TaskResult) => (
                      <TableRow key={task.id}>
                        <TableCell>
                          <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                            {task.id}
                          </code>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(task.status)}>
                            {task.status}
                          </Badge>
                          {task.error && (
                            <div className="text-xs text-red-600 mt-1 max-w-xs truncate" title={task.error}>
                              {task.error}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-medium">{task.progress}%</div>
                            <div className="w-20 bg-muted rounded-full h-2">
                              <div 
                                className="bg-primary h-2 rounded-full transition-all duration-300"
                                style={{ width: `${task.progress}%` }}
                              />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {task.status === TaskStatus.Completed ? getRiskStatusBadge(task.id) : (
                            <Badge variant="outline" className="gap-1">
                              <span className="text-xs">-</span>
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-muted-foreground">
                            {calculateDuration(task.created_at, task.completed_at || null) || '-'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-muted-foreground">
                            {formatRelativeTime(task.created_at)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-muted-foreground">
                            {task.completed_at ? formatRelativeTime(task.completed_at) : '-'}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Showing {((currentPage - 1) * tasksPerPage) + 1} to {Math.min(currentPage * tasksPerPage, totalTasks)} of {totalTasks} tasks
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        const pageNumber = i + 1
                        return (
                          <Button
                            key={pageNumber}
                            variant={currentPage === pageNumber ? "default" : "outline"}
                            size="sm"
                            onClick={() => handlePageChange(pageNumber)}
                            className="w-8 h-8 p-0"
                          >
                            {pageNumber}
                          </Button>
                        )
                      })}
                      {totalPages > 5 && (
                        <>
                          {totalPages > 6 && <span className="text-muted-foreground">...</span>}
                          <Button
                            variant={currentPage === totalPages ? "default" : "outline"}
                            size="sm"
                            onClick={() => handlePageChange(totalPages)}
                            className="w-8 h-8 p-0"
                          >
                            {totalPages}
                          </Button>
                        </>
                      )}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
