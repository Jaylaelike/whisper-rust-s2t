// Configuration utilities for API server integration

export const API_CONFIG = {
  // Server URLs
  API_SERVER_URL: process.env.NEXT_PUBLIC_API_SERVER_URL || 'http://localhost:8000',
  WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws',
  
  // API endpoints
  endpoints: {
    health: '/api/health',
    queueStats: '/api/queue/stats', 
    queueHistory: '/api/queue/history',
    queueCleanup: '/api/queue/cleanup',
    taskStatus: (taskId: string) => `/api/task/${taskId}/status`,
    transcribe: '/api/transcribe',
    riskAnalysis: '/api/risk-analysis',
    websocket: '/ws'
  }
}

// Helper function to build full API URLs
export function buildApiUrl(endpoint: string): string {
  return `${API_CONFIG.API_SERVER_URL}${endpoint}`
}

// Helper function to build WebSocket URL
export function buildWsUrl(): string {
  return API_CONFIG.WS_URL
}

// Check if we're using the Redis-backed API server
export function isUsingRedisApi(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_API_SERVER_URL || process.env.NEXT_PUBLIC_WS_URL)
}

export default API_CONFIG
