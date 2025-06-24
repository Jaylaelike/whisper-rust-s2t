import { useState, useCallback } from 'react'

interface UseLoadingStateOptions {
  onStart?: () => void
  onComplete?: () => void
  onError?: (error: Error) => void
}

export function useLoadingState(options: UseLoadingStateOptions = {}) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const execute = useCallback(async <T>(
    asyncFunction: () => Promise<T>
  ): Promise<T | null> => {
    try {
      setIsLoading(true)
      setError(null)
      options.onStart?.()
      
      const result = await asyncFunction()
      
      options.onComplete?.()
      return result
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error')
      setError(error)
      options.onError?.(error)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [options])

  const reset = useCallback(() => {
    setIsLoading(false)
    setError(null)
  }, [])

  return {
    isLoading,
    error,
    execute,
    reset,
  }
}