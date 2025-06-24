"use client"

import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface MiniLoadingProps {
  size?: "sm" | "md" | "lg"
  text?: string
  className?: string
  showText?: boolean
}

export function MiniLoading({ 
  size = "md", 
  text = "Loading...", 
  className,
  showText = true 
}: MiniLoadingProps) {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-6 h-6", 
    lg: "w-8 h-8"
  }

  const textSizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base"
  }

  return (
    <div className={cn("flex items-center justify-center gap-2", className)}>
      <Loader2 className={cn("animate-spin text-muted-foreground", sizeClasses[size])} />
      {showText && (
        <span className={cn("text-muted-foreground thai-text", textSizeClasses[size])}>
          {text}
        </span>
      )}
    </div>
  )
}

// Page Loading Component
interface PageLoadingProps {
  title?: string
  description?: string
}

export function PageLoading({ 
  title = "กำลังโหลด...", 
  description = "โปรดรอสักครู่" 
}: PageLoadingProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
      <div className="relative">
        <div className="w-16 h-16 border-4 border-gray-200 rounded-full"></div>
        <div className="absolute top-0 left-0 w-16 h-16 border-4 border-t-blue-600 rounded-full animate-spin"></div>
      </div>
      <div className="text-center space-y-2">
        <h3 className="text-lg font-medium text-gray-900 thai-text">{title}</h3>
        <p className="text-sm text-gray-600 thai-text">{description}</p>
      </div>
    </div>
  )
}

// Button Loading State
interface ButtonLoadingProps {
  isLoading: boolean
  children: React.ReactNode
  loadingText?: string
}

export function ButtonLoading({ 
  isLoading, 
  children, 
  loadingText = "กำลังดำเนินการ..." 
}: ButtonLoadingProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="thai-text">{loadingText}</span>
      </div>
    )
  }

  return <>{children}</>
}