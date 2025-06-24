import { useEffect, useState, useRef, useCallback } from 'react'
import { QueueService } from '@/lib/services/queue-service'
import { TaskResult, QueueStats, WebSocketMessage, TaskStatus } from '@/lib/services/types'

export interface UseQueueProps {
  taskId?: string
  enableRealTimeUpdates?: boolean
  autoRefreshInterval?: number
}

export interface UseQueueReturn {
  // Service instance
  queueService: QueueService
  
  // Queue stats and history
  queueStats: QueueStats | null
  taskHistory: TaskResult[]
  
  // Individual task tracking
  currentTask: TaskResult | null
  
  // Connection state
  isConnected: boolean
  isLoading: boolean
  error: string | null
  
  // Actions
  refreshData: () => Promise<void>
  submitTranscriptionTask: (file: File, options?: any) => Promise<{ task_id: string }>
  submitRiskAnalysisTask: (text: string, options?: any) => Promise<{ task_id: string }>
  getTaskStatus: (taskId: string) => Promise<TaskResult>
  
  // Real-time callbacks
  onTaskUpdate: (callback: (task: TaskResult) => void) => () => void
  onQueueStatsUpdate: (callback: (stats: QueueStats) => void) => () => void
}

export function useQueue({ 
  taskId, 
  enableRealTimeUpdates = true, 
  autoRefreshInterval = 5000 
}: UseQueueProps = {}): UseQueueReturn {
  
  // Service instance
  const queueService = useRef(new QueueService())
  
  // State
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null)
  const [taskHistory, setTaskHistory] = useState<TaskResult[]>([])
  const [currentTask, setCurrentTask] = useState<TaskResult | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Callback refs
  const taskUpdateCallbacks = useRef<((task: TaskResult) => void)[]>([])
  const queueStatsCallbacks = useRef<((stats: QueueStats) => void)[]>([])

  // Sync task to database
  const syncTaskToDatabase = useCallback(async (
    taskId: string, 
    status?: TaskStatus, 
    result?: any, 
    error?: string
  ) => {
    try {
      await fetch('/api/transcriptions/sync-task', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskId,
          status,
          result,
          error
        })
      })
    } catch (syncError) {
      console.warn('Failed to sync task to database:', syncError)
    }
  }, [])

  // Refresh data function
  const refreshData = useCallback(async () => {
    try {
      setError(null)
      const [stats, history] = await Promise.all([
        queueService.current.getQueueStats(),
        queueService.current.getTaskHistory(20)
      ])
      
      setQueueStats(stats)
      
      // Ensure history is an array
      const safeHistory = Array.isArray(history) ? history : []
      setTaskHistory(safeHistory)
      
      // Update current task if we have a taskId
      if (taskId && safeHistory.length > 0) {
        const task = safeHistory.find(t => t.id === taskId)
        if (task) {
          setCurrentTask(task)
        } else {
          // Fetch specific task if not in history
          try {
            const specificTask = await queueService.current.getTaskStatus(taskId)
            setCurrentTask(specificTask)
          } catch (taskError) {
            console.warn(`Could not fetch task ${taskId}:`, taskError)
          }
        }
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch queue data')
      console.error('Error refreshing queue data:', err)
      // Set safe defaults on error
      setTaskHistory([])
    } finally {
      setIsLoading(false)
    }
  }, [taskId])

  // WebSocket setup
  useEffect(() => {
    if (!enableRealTimeUpdates) return

    queueService.current.connectWebSocket()
    setIsConnected(true)
    
    const unsubscribe = queueService.current.onWebSocketMessage((message: WebSocketMessage) => {
      // Handle queue stats updates
      if (message.type === 'queue_stats' && message.queue_stats) {
        const newStats: QueueStats = {
          queue_stats: message.queue_stats,
          timestamp: message.timestamp || new Date().toISOString()
        }
        setQueueStats(newStats)
        
        // Notify callbacks
        queueStatsCallbacks.current.forEach(callback => {
          try {
            callback(newStats)
          } catch (error) {
            console.error('Error in queue stats callback:', error)
          }
        })
      }
      
      // Handle task updates
      if ((message.type === 'task_status_update' || 
           message.type === 'task_progress' || 
           message.type === 'task_completed') && 
          message.task_id) {
        
        // Sync to database for important status changes
        if (message.type === 'task_completed' || message.type === 'task_status_update') {
          syncTaskToDatabase(message.task_id, message.status, message.result, undefined)
        }
        
        // Update current task if it matches
        if (taskId === message.task_id) {
          setCurrentTask(prev => prev ? {
            ...prev,
            status: message.status || prev.status,
            progress: message.progress || prev.progress,
            result: message.result || prev.result,
            updated_at: new Date().toISOString(),
            completed_at: message.status === TaskStatus.Completed ? new Date().toISOString() : prev.completed_at
          } : null)
        }
        
        // Refresh task history on any task completion or new task
        if (message.type === 'task_completed') {
          refreshData()
        }
        
        // Notify task update callbacks
        if (currentTask && message.task_id === currentTask.id) {
          const updatedTask: TaskResult = {
            ...currentTask,
            status: message.status || currentTask.status,
            progress: message.progress || currentTask.progress,
            result: message.result || currentTask.result,
            updated_at: new Date().toISOString()
          }
          
          taskUpdateCallbacks.current.forEach(callback => {
            try {
              callback(updatedTask)
            } catch (error) {
              console.error('Error in task update callback:', error)
            }
          })
        }
      }
    })

    return () => {
      unsubscribe()
      queueService.current.disconnectWebSocket()
      setIsConnected(false)
    }
  }, [enableRealTimeUpdates, taskId, currentTask])

  // Initial data fetch
  useEffect(() => {
    refreshData()
  }, [refreshData])

  // Auto-refresh
  useEffect(() => {
    if (!autoRefreshInterval || enableRealTimeUpdates) return

    const interval = setInterval(refreshData, autoRefreshInterval)
    return () => clearInterval(interval)
  }, [autoRefreshInterval, enableRealTimeUpdates, refreshData])

  // Task update callback management
  const onTaskUpdate = useCallback((callback: (task: TaskResult) => void) => {
    taskUpdateCallbacks.current.push(callback)
    
    return () => {
      const index = taskUpdateCallbacks.current.indexOf(callback)
      if (index > -1) {
        taskUpdateCallbacks.current.splice(index, 1)
      }
    }
  }, [])

  // Queue stats callback management
  const onQueueStatsUpdate = useCallback((callback: (stats: QueueStats) => void) => {
    queueStatsCallbacks.current.push(callback)
    
    return () => {
      const index = queueStatsCallbacks.current.indexOf(callback)
      if (index > -1) {
        queueStatsCallbacks.current.splice(index, 1)
      }
    }
  }, [])

  // Service method wrappers
  const submitTranscriptionTask = useCallback(async (file: File, options: any = {}) => {
    return queueService.current.submitTranscriptionTask(file, options)
  }, [])

  const submitRiskAnalysisTask = useCallback(async (text: string, options: any = {}) => {
    return queueService.current.submitRiskAnalysisTask({ text, ...options })
  }, [])

  const getTaskStatus = useCallback(async (taskId: string) => {
    return queueService.current.getTaskStatus(taskId)
  }, [])

  return {
    queueService: queueService.current,
    queueStats,
    taskHistory,
    currentTask,
    isConnected,
    isLoading,
    error,
    refreshData,
    submitTranscriptionTask,
    submitRiskAnalysisTask,
    getTaskStatus,
    onTaskUpdate,
    onQueueStatsUpdate
  }
}
