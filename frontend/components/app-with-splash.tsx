"use client"

import { useEffect, useState } from 'react'
import { useLoading } from '@/contexts/loading-context'
import { SplashScreen } from '@/components/splash-screen'
import { ClientOnly } from '@/components/client-only'

interface AppWithSplashProps {
  children: React.ReactNode
}

export function AppWithSplash({ children }: AppWithSplashProps) {
  const { showSplash, setShowSplash } = useLoading()
  const [isInitialLoad, setIsInitialLoad] = useState(true)

  useEffect(() => {
    // Check if this is the first load (only on client)
    const hasShownSplash = sessionStorage.getItem('hasShownSplash')
    
    if (hasShownSplash) {
      // If splash was already shown in this session, don't show it again
      setShowSplash(false)
      setIsInitialLoad(false)
    } else {
      // First load, show splash screen
      setShowSplash(true)
      setIsInitialLoad(true)
    }
  }, [setShowSplash])

  const handleSplashComplete = () => {
    setShowSplash(false)
    setIsInitialLoad(false)
    // Mark that splash has been shown in this session (only on client)
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('hasShownSplash', 'true')
    }
  }

  return (
    <ClientOnly fallback={<div className="min-h-screen">{children}</div>}>
      {/* Show splash screen on initial load */}
      {showSplash && isInitialLoad ? (
        <SplashScreen 
          onComplete={handleSplashComplete}
          duration={3500}
          showProgress={true}
        />
      ) : (
        children
      )}
    </ClientOnly>
  )
}