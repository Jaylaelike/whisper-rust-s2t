"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Loader2, FileAudio, Mic, Shield, Clock } from "lucide-react"

interface SplashScreenProps {
  onComplete?: () => void
  duration?: number
  showProgress?: boolean
}

export function SplashScreen({ onComplete, duration = 3000, showProgress = true }: SplashScreenProps) {
  const [progress, setProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState(0)
  const [isComplete, setIsComplete] = useState(false)

  const steps = [
    { icon: FileAudio, label: "กำลังโหลดระบบ...", delay: 0 },
    { icon: Mic, label: "เตรียมระบบถอดเสียง...", delay: 800 },
    { icon: Shield, label: "เตรียมระบบตรวจสอบความเสี่ยง...", delay: 1600 },
    { icon: Clock, label: "กำลังเชื่อมต่อ Queue...", delay: 2400 },
  ]

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        const newProgress = prev + (100 / (duration / 50))
        if (newProgress >= 100) {
          setIsComplete(true)
          clearInterval(interval)
          setTimeout(() => {
            onComplete?.()
          }, 500)
          return 100
        }
        return newProgress
      })
    }, 50)

    // Update steps based on progress
    const stepInterval = setInterval(() => {
      const currentTime = Date.now()
      const stepIndex = steps.findIndex((step, index) => {
        const nextStep = steps[index + 1]
        return !nextStep || currentTime < nextStep.delay + Date.now()
      })
      if (stepIndex !== -1 && stepIndex !== currentStep) {
        setCurrentStep(stepIndex)
      }
    }, 100)

    // Step animation timers
    const stepTimers = steps.map((step, index) => 
      setTimeout(() => setCurrentStep(index), step.delay)
    )

    return () => {
      clearInterval(interval)
      clearInterval(stepInterval)
      stepTimers.forEach(timer => clearTimeout(timer))
    }
  }, [duration, onComplete, currentStep, steps])

  const CurrentIcon = steps[currentStep]?.icon || FileAudio

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center z-50">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-blue-500 rounded-full blur-3xl"></div>
        <div className="absolute top-3/4 right-1/4 w-24 h-24 bg-indigo-500 rounded-full blur-2xl"></div>
        <div className="absolute bottom-1/4 left-1/3 w-40 h-40 bg-purple-500 rounded-full blur-3xl"></div>
      </div>

      <Card className="w-full max-w-md mx-4 shadow-2xl border-0 bg-white/80 backdrop-blur-sm animate-fade-in-scale">
        <CardContent className="p-8">
          <div className="text-center space-y-6">
            {/* Logo/Icon */}
            <div className="relative mx-auto w-20 h-20 mb-6 animate-float">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl shadow-lg animate-pulse-glow"></div>
              <div className="relative flex items-center justify-center w-full h-full">
                <FileAudio className="w-10 h-10 text-white" />
              </div>
            </div>

            {/* Title */}
            <div className="space-y-2 animate-fade-in-up">
              <h1 className="text-2xl font-bold text-gray-900">RRS Audio Transcriber</h1>
              <p className="text-sm text-gray-600 thai-text">
                ระบบถอดเสียงและตรวจสอบความเสี่ยงทางกฎหมาย
              </p>
            </div>

            {/* Current Step */}
            <div className="flex items-center justify-center space-x-3 py-4">
              <div className={`p-2 rounded-full transition-all duration-500 ${
                isComplete 
                  ? 'bg-green-100 text-green-600' 
                  : 'bg-blue-100 text-blue-600'
              }`}>
                {isComplete ? (
                  <div className="w-5 h-5 rounded-full bg-green-600 flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : (
                  <CurrentIcon className="w-5 h-5" />
                )}
              </div>
              <span className="text-sm font-medium text-gray-700 thai-text">
                {isComplete ? 'เสร็จสิ้น!' : steps[currentStep]?.label}
              </span>
            </div>

            {/* Progress Bar */}
            {showProgress && (
              <div className="space-y-2 animate-fade-in-up">
                <Progress 
                  value={progress} 
                  className="w-full h-2 progress-glow"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>0%</span>
                  <span className="font-medium">{Math.round(progress)}%</span>
                  <span>100%</span>
                </div>
              </div>
            )}

            {/* Loading Spinner */}
            {!isComplete && (
              <div className="flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              </div>
            )}

            {/* Features */}
            <div className="pt-4 space-y-2">
              <div className="grid grid-cols-2 gap-3 text-xs text-gray-600">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="thai-text">ถอดเสียงอัตโนมัติ</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span className="thai-text">ตรวจสอบความเสี่ยง</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                  <span className="thai-text">ระบบ Queue</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                  <span className="thai-text">Real-time Updates</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Floating Elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-10 w-3 h-3 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
        <div className="absolute top-1/3 right-20 w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '1s' }}></div>
        <div className="absolute bottom-1/4 left-20 w-4 h-4 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '2s' }}></div>
        <div className="absolute bottom-1/3 right-10 w-2 h-2 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: '0.5s' }}></div>
      </div>
    </div>
  )
}

// Loading Screen Wrapper Component
interface LoadingScreenWrapperProps {
  children: React.ReactNode
  isLoading: boolean
  loadingDuration?: number
}

export function LoadingScreenWrapper({ 
  children, 
  isLoading, 
  loadingDuration = 3000 
}: LoadingScreenWrapperProps) {
  const [showSplash, setShowSplash] = useState(isLoading)

  useEffect(() => {
    if (isLoading) {
      setShowSplash(true)
    }
  }, [isLoading])

  const handleSplashComplete = () => {
    setShowSplash(false)
  }

  if (showSplash) {
    return (
      <SplashScreen 
        onComplete={handleSplashComplete}
        duration={loadingDuration}
      />
    )
  }

  return <>{children}</>
}