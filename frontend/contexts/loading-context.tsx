"use client"

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface LoadingContextType {
  isLoading: boolean
  setIsLoading: (loading: boolean) => void
  showSplash: boolean
  setShowSplash: (show: boolean) => void
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined)

interface LoadingProviderProps {
  children: ReactNode
  initialLoading?: boolean
}

export function LoadingProvider({ children, initialLoading = true }: LoadingProviderProps) {
  const [isLoading, setIsLoading] = useState(initialLoading)
  const [showSplash, setShowSplash] = useState(initialLoading)

  // Auto-hide splash screen after initial load
  useEffect(() => {
    if (initialLoading) {
      const timer = setTimeout(() => {
        setIsLoading(false)
      }, 100) // Small delay to ensure proper mounting

      return () => clearTimeout(timer)
    }
  }, [initialLoading])

  const value = {
    isLoading,
    setIsLoading,
    showSplash,
    setShowSplash,
  }

  return (
    <LoadingContext.Provider value={value}>
      {children}
    </LoadingContext.Provider>
  )
}

export function useLoading() {
  const context = useContext(LoadingContext)
  if (context === undefined) {
    throw new Error('useLoading must be used within a LoadingProvider')
  }
  return context
}