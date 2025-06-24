"use client"

import React, { createContext, useContext, useRef } from 'react'
import { QueueService } from '@/lib/services/queue-service'

interface QueueContextType {
  queueService: QueueService
}

const QueueContext = createContext<QueueContextType | null>(null)

export function QueueProvider({ children }: { children: React.ReactNode }) {
  const queueServiceRef = useRef(new QueueService())

  return (
    <QueueContext.Provider value={{ queueService: queueServiceRef.current }}>
      {children}
    </QueueContext.Provider>
  )
}

export function useQueueService() {
  const context = useContext(QueueContext)
  if (!context) {
    throw new Error('useQueueService must be used within a QueueProvider')
  }
  return context.queueService
}
