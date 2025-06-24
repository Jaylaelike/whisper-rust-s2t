import { BaseApiService } from './base-api'
import {
  TaskSubmissionResponse,
  TaskResult,
  QueueStats,
  TranscribeRequest,
  RiskAnalysisRequest,
  TaskType,
  WebSocketMessage,
  ApiConfig
} from './types'

export class QueueService extends BaseApiService {
  private ws: WebSocket | null = null
  private wsListeners: ((message: WebSocketMessage) => void)[] = []
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5

  constructor(config?: Partial<ApiConfig>) {
    super(config)
  }

  // Task Submission
  async submitTranscriptionTask(
    audioFile: File,
    options: TranscribeRequest = {}
  ): Promise<TaskSubmissionResponse> {
    const formData = new FormData()
    formData.append('audio', audioFile)
    
    if (options.language) {
      formData.append('language', options.language)
    }
    if (options.backend) {
      formData.append('backend', options.backend)
    }
    if (options.priority !== undefined) {
      formData.append('priority', options.priority.toString())
    }

    return this.requestWithFormData<TaskSubmissionResponse>('/api/transcribe', formData)
  }

  async submitRiskAnalysisTask(
    options: RiskAnalysisRequest
  ): Promise<TaskSubmissionResponse> {
    return this.request<TaskSubmissionResponse>('/api/risk-analysis', {
      method: 'POST',
      body: JSON.stringify(options),
    })
  }

  // Task Status and Results
  async getTaskStatus(taskId: string): Promise<TaskResult> {
    return this.request<TaskResult>(`/api/task/${taskId}/status`)
  }

  async getQueueStats(): Promise<QueueStats> {
    return this.request<QueueStats>('/api/queue/stats')
  }

  async getTaskHistory(limit?: number): Promise<TaskResult[]> {
    const queryParam = limit ? `?limit=${limit}` : ''
    const response = await this.request<{tasks: TaskResult[], count: number, timestamp: string}>(`/api/queue/history${queryParam}`)
    return response.tasks || []
  }

  // WebSocket Real-time Updates
  connectWebSocket(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return // Already connected
    }

    const wsUrl = this.config.websocketUrl
    this.ws = new WebSocket(wsUrl)

    this.ws.onopen = () => {
      console.log('WebSocket connected')
      this.reconnectAttempts = 0
    }

    this.ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data)
        this.notifyListeners(message)
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error)
      }
    }

    this.ws.onclose = () => {
      console.log('WebSocket disconnected')
      this.attemptReconnect()
    }

    this.ws.onerror = () => {
      // WebSocket error occurred, will attempt to reconnect on close
    }
  }

  disconnectWebSocket(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  onWebSocketMessage(listener: (message: WebSocketMessage) => void): () => void {
    this.wsListeners.push(listener)
    
    // Return unsubscribe function
    return () => {
      const index = this.wsListeners.indexOf(listener)
      if (index > -1) {
        this.wsListeners.splice(index, 1)
      }
    }
  }

  private notifyListeners(message: WebSocketMessage): void {
    this.wsListeners.forEach(listener => {
      try {
        listener(message)
      } catch (error) {
        console.error('Error in WebSocket message listener:', error)
      }
    })
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnection attempts reached')
      return
    }

    this.reconnectAttempts++
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000)
    
    console.log(`Attempting to reconnect WebSocket in ${delay}ms (attempt ${this.reconnectAttempts})`)
    
    setTimeout(() => {
      this.connectWebSocket()
    }, delay)
  }

  // Task Management Utilities
  async waitForTaskCompletion(
    taskId: string,
    onProgress?: (progress: number) => void,
    pollInterval: number = 1000
  ): Promise<TaskResult> {
    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const result = await this.getTaskStatus(taskId)
          
          if (onProgress && typeof result.progress === 'number') {
            onProgress(result.progress)
          }

          if (result.status === 'Completed') {
            resolve(result)
          } else if (result.status === 'Failed') {
            reject(new Error(result.error || 'Task failed'))
          } else if (result.status === 'Cancelled') {
            reject(new Error('Task was cancelled'))
          } else {
            // Still processing, continue polling
            setTimeout(poll, pollInterval)
          }
        } catch (error) {
          reject(error)
        }
      }

      poll()
    })
  }

  // Real-time task monitoring with WebSocket
  monitorTask(
    taskId: string,
    onProgress?: (progress: number) => void,
    onComplete?: (result: TaskResult) => void,
    onError?: (error: string) => void
  ): () => void {
    const unsubscribe = this.onWebSocketMessage((message) => {
      if (message.task_id === taskId) {
        switch (message.type) {
          case 'task_progress':
            if (onProgress && typeof message.progress === 'number') {
              onProgress(message.progress)
            }
            break
          case 'task_completed':
            if (onComplete && message.result) {
              onComplete(message.result)
            }
            break
          case 'task_status_update':
            if (message.status === 'Failed' && onError) {
              onError('Task failed')
            }
            break
        }
      }
    })

    // Ensure WebSocket is connected
    this.connectWebSocket()

    return unsubscribe
  }

  // Batch operations
  async submitMultipleTranscriptions(
    files: File[],
    options: TranscribeRequest = {}
  ): Promise<TaskSubmissionResponse[]> {
    const promises = files.map(file => 
      this.submitTranscriptionTask(file, options)
    )
    
    return Promise.all(promises)
  }

  async getMultipleTaskStatuses(taskIds: string[]): Promise<TaskResult[]> {
    const promises = taskIds.map(id => this.getTaskStatus(id))
    return Promise.all(promises)
  }
}
