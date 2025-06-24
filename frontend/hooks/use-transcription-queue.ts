import { useEffect, useState, useRef } from 'react'

export interface TaskUpdate {
  type: 'task_update'
  task_id: string
  data: {
    status: string
    progress: number
    message: string
    result?: any
  }
}

export interface UseTranscriptionQueueProps {
  taskId?: string
  onStatusChange?: (update: TaskUpdate['data']) => void
}

export function useTranscriptionQueue({ taskId, onStatusChange }: UseTranscriptionQueueProps) {
  const [isConnected, setIsConnected] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<TaskUpdate['data'] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ws = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!taskId) return

    const connectWebSocket = () => {
      try {
        // Connect to WebSocket endpoint
        const wsUrl = `ws://localhost:8000/ws/${taskId}`
        ws.current = new WebSocket(wsUrl)

        ws.current.onopen = () => {
          console.log(`WebSocket connected for task ${taskId}`)
          setIsConnected(true)
          setError(null)
        }

        ws.current.onmessage = (event) => {
          try {
            const update: TaskUpdate = JSON.parse(event.data)
            
            if (update.type === 'task_update' && update.task_id === taskId) {
              setLastUpdate(update.data)
              onStatusChange?.(update.data)
            }
          } catch (err) {
            console.error('Error parsing WebSocket message:', err)
          }
        }

        ws.current.onclose = () => {
          console.log(`WebSocket disconnected for task ${taskId}`)
          setIsConnected(false)
          
          // Attempt to reconnect after 5 seconds if the task isn't completed
          if (lastUpdate?.status !== 'completed' && lastUpdate?.status !== 'failed') {
            setTimeout(connectWebSocket, 5000)
          }
        }

        ws.current.onerror = (error) => {
          console.error('WebSocket error:', error)
          setError('WebSocket connection error')
          setIsConnected(false)
        }

      } catch (err) {
        console.error('Error creating WebSocket:', err)
        setError('Failed to create WebSocket connection')
      }
    }

    connectWebSocket()

    // Cleanup on unmount or taskId change
    return () => {
      if (ws.current) {
        ws.current.close()
        ws.current = null
      }
    }
  }, [taskId])

  // Send keepalive messages
  useEffect(() => {
    if (!isConnected || !ws.current) return

    const keepAlive = setInterval(() => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send('ping')
      }
    }, 30000) // Send ping every 30 seconds

    return () => clearInterval(keepAlive)
  }, [isConnected])

  return {
    isConnected,
    lastUpdate,
    error,
    disconnect: () => {
      if (ws.current) {
        ws.current.close()
        ws.current = null
      }
    }
  }
}
