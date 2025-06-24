'use client'

import React, { createContext, useContext } from 'react'
import { useWebSocket } from '@/hooks/use-websocket'

interface WebSocketContextType {
  isConnected: boolean
  lastMessage: any
  sendMessage: (message: any) => boolean
  connect: () => void
  disconnect: () => void
}

const WebSocketContext = createContext<WebSocketContextType | null>(null)

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const webSocket = useWebSocket()

  return (
    <WebSocketContext.Provider value={webSocket}>
      {children}
    </WebSocketContext.Provider>
  )
}

export function useWebSocketContext() {
  const context = useContext(WebSocketContext)
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider')
  }
  return context
}
