'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from './use-transcriptions'
import { toast } from 'sonner'

interface WebSocketMessage {
  type: string
  task_id?: string
  status?: string
  progress?: number
  result?: any
  error?: string
  [key: string]: any
}

export function useWebSocket(url: string = process.env.NEXT_PUBLIC_WS_URL || '/ws') {
  const [isConnected, setIsConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const queryClient = useQueryClient()
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const maxReconnectAttempts = 5

  const connect = useCallback(() => {
    try {
      // Create WebSocket URL
      let wsUrl: string;
      
      if (url.startsWith('ws://') || url.startsWith('wss://')) {
        // Full WebSocket URL provided
        wsUrl = url;
      } else if (url.startsWith('/')) {
        // Relative URL - construct full URL
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = process.env.NEXT_PUBLIC_API_SERVER_URL?.replace(/^https?:\/\//, '') || 'localhost:8000';
        wsUrl = `${protocol}//${host}${url}`;
      } else {
        // Assume it's a host:port format
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//${url}`;
      }

      console.log('🔌 Connecting to WebSocket:', wsUrl)
      
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('✅ WebSocket connected')
        setIsConnected(true)
        reconnectAttemptsRef.current = 0
        
        // Optional: Send initial message or subscribe to updates
        ws.send(JSON.stringify({ type: 'subscribe', topics: ['task_updates'] }))
      }

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          console.log('📨 WebSocket message received:', message)
          setLastMessage(message)
          
          // Handle different message types
          handleWebSocketMessage(message)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      ws.onclose = (event) => {
        console.log('🔌 WebSocket disconnected:', event.code, event.reason)
        setIsConnected(false)
        wsRef.current = null
        
        // Attempt to reconnect if not manually closed
        if (event.code !== 1000 && reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000)
          console.log(`🔄 Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`)
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++
            connect()
          }, delay)
        }
      }

      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error)
      }

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error)
    }
  }, [url])

  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    const { type, task_id, status, progress, result, error } = message

    switch (type) {
      case 'task_status_update':
        if (task_id) {
          console.log(`📊 Task ${task_id}: ${status} started`)
          
          // Update queue status and tasks in cache
          queryClient.invalidateQueries({ queryKey: queryKeys.queueStatus })
          queryClient.invalidateQueries({ queryKey: queryKeys.queueTasks })
          
          toast.info(`🚀 Task ${task_id.slice(-8)} started processing`)
        }
        break

      case 'task_progress':
        if (task_id && progress !== undefined) {
          console.log(`📊 Task ${task_id}: ${Math.round(progress)}% complete`)
          
          // Update queue status and tasks in cache
          queryClient.invalidateQueries({ queryKey: queryKeys.queueStatus })
          queryClient.invalidateQueries({ queryKey: queryKeys.queueTasks })
          
          // Show progress toast for major milestones (every 25%)
          if (progress > 0 && progress % 25 === 0) {
            const statusMessage = message.message || `${Math.round(progress)}% complete`
            toast.info(`⏳ Task ${task_id.slice(-8)}: ${statusMessage}`)
          }
        }
        break

      case 'task_completed':
        if (task_id) {
          const processingTime = message.processing_time_ms 
            ? `(${Math.round(message.processing_time_ms / 1000)}s)`
            : ''
          
          console.log(`✅ Task ${task_id} completed ${processingTime}`)
          
          // Invalidate all relevant queries to refresh data
          queryClient.invalidateQueries({ queryKey: queryKeys.queueStatus })
          queryClient.invalidateQueries({ queryKey: queryKeys.queueTasks })
          queryClient.invalidateQueries({ queryKey: queryKeys.transcriptions })
          
          if (status === 'completed' && !error) {
            toast.success(`🎉 Transcription completed for task ${task_id.slice(-8)} ${processingTime}`)
          } else if (error) {
            toast.error(`❌ Task ${task_id.slice(-8)} failed: ${error}`)
          }
        }
        break

      case 'new_task':
        if (task_id) {
          console.log(`🆕 New task queued: ${task_id}`)
          
          // Refresh queue data
          queryClient.invalidateQueries({ queryKey: queryKeys.queueStatus })
          queryClient.invalidateQueries({ queryKey: queryKeys.queueTasks })
          
          const priority = message.priority ? ` (priority: ${message.priority})` : ''
          toast.info(`📋 New task queued: ${task_id.slice(-8)}${priority}`)
        }
        break

      case 'queue_stats_update':
        console.log('📊 Queue stats updated')
        queryClient.invalidateQueries({ queryKey: queryKeys.queueStatus })
        
        // Show periodic queue stats (optional, could be configurable)
        if (message.stats) {
          const { pending_count, processing_count } = message.stats
          if (pending_count > 0 || processing_count > 0) {
            console.log(`Queue: ${pending_count} pending, ${processing_count} processing`)
          }
        }
        break

      default:
        console.log('📨 Unknown message type:', type, message)
    }
  }, [queryClient])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'Manual disconnect')
      wsRef.current = null
    }
    
    setIsConnected(false)
  }, [])

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
      return true
    }
    return false
  }, [])

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect()
    
    return () => {
      disconnect()
    }
  }, [connect, disconnect])

  return {
    isConnected,
    lastMessage,
    sendMessage,
    connect,
    disconnect,
  }
}
