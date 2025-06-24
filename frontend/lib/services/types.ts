// Updated types to match the backend queue system

export interface Word {
  text: string
  start: number
  end: number
  confidence: number
}

export interface Segment {
  id: number
  seek?: number
  start: number
  end: number
  text: string
  tokens?: number[]
  temperature?: number
  avg_logprob?: number
  compression_ratio?: number
  no_speech_prob?: number
  confidence: number
  words: Word[]
}

export interface TranscriptionResult {
  text: string
  segments: Segment[]
  language?: string
  metadata?: {
    backend: string
    model_path: string
    model: string
    processing_time: string
    file_size: string
    file_name: string
    use_gpu: boolean
    use_coreml: boolean
    sample_rate: number
    num_segments: number
    note: string
  }
}

export interface RiskAnalysis {
  is_risky: boolean
  raw_response: string
  confidence: number
  detected_keywords: string[]
}

export interface RiskAnalysisResult {
  text: string
  risk_analysis: RiskAnalysis
  metadata: {
    model: string
    endpoint?: string
    timestamp: string
    text_length: number
    prompt_type?: string
    note?: string
  }
}

// Queue System Types
export enum TaskType {
  Transcription = "Transcription",
  RiskAnalysis = "RiskAnalysis"
}

export enum TaskStatus {
  Pending = "Pending",
  Processing = "Processing", 
  Completed = "Completed",
  Failed = "Failed",
  Cancelled = "Cancelled"
}

export interface TaskResult {
  id: string
  status: TaskStatus
  created_at: string
  updated_at: string
  started_at?: string
  completed_at?: string
  result?: TranscriptionResult | RiskAnalysisResult
  error?: string
  progress: number
}

export interface QueueStats {
  queue_stats: {
    pending_count: number
    processing_count: number
    completed_count: number
    failed_count: number
    total_tasks: number
  }
  timestamp: string
}

export interface TaskSubmissionResponse {
  task_id: string
  status: string
  message: string
  request_id: string
  endpoints: {
    status: string
    websocket: string
  }
}

// API Request/Response Types
export interface TranscribeRequest {
  language?: string
  backend?: 'cpu' | 'gpu' | 'coreml'
  priority?: number
}

export interface RiskAnalysisRequest {
  text: string
  priority?: number
}

// WebSocket Message Types
export interface WebSocketMessage {
  type: 'new_task' | 'task_status_update' | 'task_progress' | 'task_completed' | 'queue_stats'
  task_id?: string
  status?: TaskStatus
  progress?: number
  result?: any
  queue_stats?: QueueStats['queue_stats']
  timestamp?: string
}

// Legacy types for database integration (if still needed)
export interface TranscriptionJob {
  id: string
  title: string
  description: string | null
  originalAudioFileName: string
  status: string
  transcriptionResultJson: TranscriptionResult | null
  createdAt: Date
  updatedAt: Date
}

// API Configuration
export interface ApiConfig {
  baseUrl: string
  websocketUrl: string
  timeout?: number
  retryAttempts?: number
}

// Error Types
export interface ApiError {
  message: string
  status?: number
  code?: string
  details?: any
}

export class TranscriptionApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string,
    public details?: any
  ) {
    super(message)
    this.name = 'TranscriptionApiError'
  }
}
