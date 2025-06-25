// React Query hooks for transcriptions and queue management
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// Types
export interface Transcription {
  id: string
  title: string
  description?: string
  backend: string
  language: string
  transcriptionText: string
  processingTimeMs?: number
  riskDetectionStatus: string
  riskDetectionResult?: string
  riskConfidence?: number
  fileSizeBytes?: number
  durationSeconds?: number
  completedAt: string
  createdAt: string
}

export interface QueueTask {
  id: string
  taskId: string
  title: string
  status: string
  progress?: number
  startedAt?: string
  createdAt: string
}

export interface QueueStatus {
  pending: number
  processing: number
  completed24h: number
  failed24h: number
  processingTasks: QueueTask[]
}

// Risk Analysis Types
export interface RiskAnalysisRequest {
  text: string
  priority?: number
}

export interface RiskAnalysisResult {
  text: string
  risk_analysis: {
    is_risky: boolean
    confidence: number
    detected_keywords: string[]
    raw_response: string
  }
  metadata: {
    endpoint: string
    model: string
    prompt_type: string
    text_length: number
    timestamp: string
  }
}

export interface RiskAnalysisResponse {
  task_id: string
  status: string
  message: string
  request_id: string
  endpoints: {
    status: string
    websocket: string
  }
}

// Query keys
export const queryKeys = {
  transcriptions: ['transcriptions'] as const,
  transcriptionsList: (params: any) => ['transcriptions', 'list', params] as const,
  transcription: (id: string) => ['transcriptions', id] as const,
  queueStatus: ['queue', 'status'] as const,
  queueTasks: ['queue', 'tasks'] as const,
  riskAnalysis: ['risk-analysis'] as const,
  riskAnalysisStatus: (taskId: string) => ['risk-analysis', 'status', taskId] as const,
}

// Hooks for transcriptions
export function useTranscriptions(params: {
  page?: number
  limit?: number
  search?: string
  risk?: string
} = {}) {
  return useQuery({
    queryKey: queryKeys.transcriptionsList(params),
    queryFn: async () => {
      const searchParams = new URLSearchParams()
      if (params.page) searchParams.set('page', params.page.toString())
      if (params.limit) searchParams.set('limit', params.limit.toString())
      if (params.search) searchParams.set('search', params.search)
      if (params.risk) searchParams.set('risk', params.risk)

      const response = await fetch(`/api/transcriptions-new?${searchParams}`)
      if (!response.ok) {
        throw new Error('Failed to fetch transcriptions')
      }
      return response.json()
    },
    staleTime: 30 * 1000, // 30 seconds
  })
}

export function useTranscription(id: string) {
  return useQuery({
    queryKey: queryKeys.transcription(id),
    queryFn: async () => {
      const response = await fetch(`/api/transcriptions-new/${id}`)
      if (!response.ok) {
        throw new Error('Failed to fetch transcription')
      }
      return response.json()
    },
    enabled: !!id,
  })
}

// Hooks for queue management
export function useQueueStatus() {
  return useQuery({
    queryKey: queryKeys.queueStatus,
    queryFn: async () => {
      const response = await fetch('/api/queue-status')
      if (!response.ok) {
        throw new Error('Failed to fetch queue status')
      }
      return response.json()
    },
    refetchInterval: 60000, // Increased to 60 seconds since WebSocket provides real-time updates
    staleTime: 30000, // Consider data stale after 30 seconds
    refetchOnWindowFocus: false, // Disable since we have WebSocket
    refetchIntervalInBackground: false, // Don't poll in background
  })
}

export function useQueueTasks(status?: string) {
  return useQuery({
    queryKey: [...queryKeys.queueTasks, status],
    queryFn: async () => {
      const searchParams = new URLSearchParams()
      if (status) searchParams.set('status', status)

      const response = await fetch(`/api/queue-tasks?${searchParams}`)
      if (!response.ok) {
        throw new Error('Failed to fetch queue tasks')
      }
      return response.json()
    },
    refetchInterval: 60000, // Increased to 60 seconds since WebSocket provides real-time updates
    staleTime: 30000,
    refetchOnWindowFocus: false, // Disable since we have WebSocket
    refetchIntervalInBackground: false, // Don't poll in background
  })
}

// Mutation for uploading transcription
export function useUploadTranscription() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch('/api/transcribe-job', {
        method: 'POST',
        body: formData,
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to upload transcription')
      }
      
      return response.json()
    },
    onSuccess: () => {
      // Invalidate and refetch transcriptions list
      queryClient.invalidateQueries({ queryKey: queryKeys.transcriptions })
      queryClient.invalidateQueries({ queryKey: queryKeys.queueStatus })
    },
  })
}

// Mutation for deleting queue task
export function useDeleteQueueTask() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (taskId: string) => {
      const response = await fetch(`/api/queue-tasks?taskId=${taskId}`, {
        method: 'DELETE',
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete queue task')
      }
      
      return response.json()
    },
    onSuccess: () => {
      // Invalidate queue-related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.queueTasks })
      queryClient.invalidateQueries({ queryKey: queryKeys.queueStatus })
    },
  })
}

// Mutation for deleting transcription
export function useDeleteTranscription() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (transcriptionId: string) => {
      const response = await fetch(`/api/transcriptions-new/${transcriptionId}`, {
        method: 'DELETE',
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete transcription')
      }
      
      return response.json()
    },
    onSuccess: (data, transcriptionId) => {
      // Invalidate and refetch transcriptions list
      queryClient.invalidateQueries({ queryKey: queryKeys.transcriptions })
      // Remove the specific transcription from cache
      queryClient.removeQueries({ queryKey: queryKeys.transcription(transcriptionId) })
    },
  })
}

// Risk Analysis Hooks
export function useRiskAnalysis() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (request: RiskAnalysisRequest): Promise<RiskAnalysisResponse> => {
      const response = await fetch('/api/risk-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to submit risk analysis')
      }
      
      return response.json()
    },
    onSuccess: () => {
      // Optionally invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: queryKeys.queueStatus })
    },
  })
}

// Hook to check risk analysis task status
export function useRiskAnalysisStatus(taskId?: string) {
  return useQuery({
    queryKey: ['risk-analysis', 'status', taskId],
    queryFn: async (): Promise<{
      task_id: string
      status: string
      result?: RiskAnalysisResult
      error?: string
      progress?: number
      created_at: string
      updated_at: string
      completed_at?: string
    }> => {
      const response = await fetch(`/api/task/${taskId}/status`)
      if (!response.ok) {
        throw new Error('Failed to fetch risk analysis status')
      }
      return response.json()
    },
    enabled: !!taskId,
    refetchInterval: 2000, // Poll every 2 seconds
    refetchIntervalInBackground: false,
  })
}

// Hook to trigger risk analysis on transcription text
export function useTranscriptionRiskAnalysis() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ 
      transcriptionId, 
      text, 
      priority = 1 
    }: { 
      transcriptionId: string
      text: string
      priority?: number 
    }): Promise<RiskAnalysisResponse> => {
      const response = await fetch('/api/risk-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, priority }),
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to analyze transcription')
      }
      
      return response.json()
    },
    onSuccess: (_, variables) => {
      // Invalidate the specific transcription to refresh its data
      queryClient.invalidateQueries({ 
        queryKey: queryKeys.transcription(variables.transcriptionId) 
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.transcriptions })
    },
  })
}

// Custom hook for real-time notifications
export function useNotifications() {
  const queryClient = useQueryClient()
  
  return {
    showSuccess: (message: string) => {
      // You can integrate with your notification system here
      console.log('Success:', message)
    },
    showError: (message: string) => {
      console.error('Error:', message)
    },
    showInfo: (message: string) => {
      console.log('Info:', message)
    },
    invalidateTranscriptions: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transcriptions })
    },
    invalidateQueue: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.queueStatus })
      queryClient.invalidateQueries({ queryKey: queryKeys.queueTasks })
    }
  }
}
