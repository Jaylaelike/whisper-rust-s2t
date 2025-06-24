// Query client configuration for React Query
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000, // 30 seconds
        gcTime: 5 * 60 * 1000, // 5 minutes
        refetchOnWindowFocus: false,
        refetchOnMount: true,
        retry: (failureCount, error) => {
          // Don't retry for 4xx errors
          if (error instanceof Error && 'status' in error && 
              typeof error.status === 'number' && error.status >= 400 && error.status < 500) {
            return false
          }
          return failureCount < 3
        }
      },
      mutations: {
        retry: 1
      }
    }
  }))

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
