import { ApiConfig, ApiError, TranscriptionApiError } from './types'

export class BaseApiService {
  protected config: ApiConfig

  constructor(config: Partial<ApiConfig> = {}) {
    this.config = {
      baseUrl: config.baseUrl || 'http://localhost:8000',
      websocketUrl: config.websocketUrl || 'ws://localhost:8000/ws',
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      ...config
    }
  }

  protected async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`
    const controller = new AbortController()
    
    const timeoutId = setTimeout(() => {
      controller.abort()
    }, this.config.timeout)

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`
        let errorDetails = null

        try {
          const errorData = await response.json()
          errorMessage = errorData.message || errorData.error || errorMessage
          errorDetails = errorData
        } catch (e) {
          // Response is not JSON, use status text
        }

        throw new TranscriptionApiError(
          errorMessage,
          response.status,
          response.status.toString(),
          errorDetails
        )
      }

      const data = await response.json()
      return data as T
    } catch (error) {
      clearTimeout(timeoutId)
      
      if (error instanceof TranscriptionApiError) {
        throw error
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new TranscriptionApiError(
          'Request timeout',
          408,
          'TIMEOUT'
        )
      }

      const errorMessage = error instanceof Error ? error.message : 'Network error'
      throw new TranscriptionApiError(
        errorMessage,
        0,
        'NETWORK_ERROR',
        error
      )
    }
  }

  protected async requestWithFormData<T>(
    endpoint: string,
    formData: FormData,
    options: Omit<RequestInit, 'body'> = {}
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`
    const controller = new AbortController()
    
    const timeoutId = setTimeout(() => {
      controller.abort()
    }, this.config.timeout)

    try {
      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        body: formData,
        ...options,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`
        let errorDetails = null

        try {
          const errorData = await response.json()
          errorMessage = errorData.message || errorData.error || errorMessage
          errorDetails = errorData
        } catch (e) {
          // Response is not JSON, use status text
        }

        throw new TranscriptionApiError(
          errorMessage,
          response.status,
          response.status.toString(),
          errorDetails
        )
      }

      const data = await response.json()
      return data as T
    } catch (error) {
      clearTimeout(timeoutId)
      
      if (error instanceof TranscriptionApiError) {
        throw error
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new TranscriptionApiError(
          'Request timeout',
          408,
          'TIMEOUT'
        )
      }

      const errorMessage = error instanceof Error ? error.message : 'Network error'
      throw new TranscriptionApiError(
        errorMessage,
        0,
        'NETWORK_ERROR',
        error
      )
    }
  }

  protected async retryRequest<T>(
    requestFn: () => Promise<T>,
    attempts: number = this.config.retryAttempts || 3
  ): Promise<T> {
    let lastError: Error

    for (let i = 0; i < attempts; i++) {
      try {
        return await requestFn()
      } catch (error) {
        lastError = error as Error
        
        // Don't retry on client errors (4xx)
        if (error instanceof TranscriptionApiError && error.status && error.status < 500) {
          throw error
        }

        // Wait before retrying (exponential backoff)
        if (i < attempts - 1) {
          const delay = Math.min(1000 * Math.pow(2, i), 10000)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }

    throw lastError!
  }

  // Health check
  async healthCheck(): Promise<{ status: string; service: string; version: string; timestamp: string }> {
    return this.request<{ status: string; service: string; version: string; timestamp: string }>('/api/health')
  }

  // Get supported languages
  async getSupportedLanguages(): Promise<{
    supported_languages: Record<string, string>
    default_language: string
    auto_detect: string
  }> {
    return this.request<{
      supported_languages: Record<string, string>
      default_language: string
      auto_detect: string
    }>('/api/languages')
  }
}
