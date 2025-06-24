import { useState, useEffect, useCallback } from 'react'

interface SyncStatus {
  isActive: boolean
  lastSyncTime: Date | null
  pendingCount: number
  error: string | null
}

export function useSyncStatus() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isActive: false,
    lastSyncTime: null,
    pendingCount: 0,
    error: null
  })

  const updateSyncStatus = useCallback(async () => {
    try {
      // Get sync service status
      const response = await fetch('/api/sync-tasks')
      if (response.ok) {
        const data = await response.json()
        setSyncStatus(prev => ({
          ...prev,
          isActive: data.isRunning,
          error: null
        }))
      }
    } catch (error) {
      setSyncStatus(prev => ({
        ...prev,
        error: 'Failed to get sync status'
      }))
    }
  }, [])

  const updatePendingCount = useCallback(async () => {
    try {
      // Get count of pending/processing transcriptions
      const response = await fetch('/api/transcriptions?status=pending,processing&limit=1')
      if (response.ok) {
        const data = await response.json()
        setSyncStatus(prev => ({
          ...prev,
          pendingCount: data.pagination?.total || 0
        }))
      }
    } catch (error) {
      console.error('Failed to get pending count:', error)
    }
  }, [])

  const triggerSync = useCallback(async () => {
    try {
      setSyncStatus(prev => ({ ...prev, error: null }))
      
      const response = await fetch('/api/sync-tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ syncAll: true })
      })

      if (response.ok) {
        const result = await response.json()
        setSyncStatus(prev => ({
          ...prev,
          lastSyncTime: new Date(),
          error: null
        }))
        
        // Update pending count after sync
        await updatePendingCount()
        
        return result
      } else {
        throw new Error('Sync failed')
      }
    } catch (error) {
      setSyncStatus(prev => ({
        ...prev,
        error: 'Sync failed'
      }))
      throw error
    }
  }, [updatePendingCount])

  // Update status periodically
  useEffect(() => {
    updateSyncStatus()
    updatePendingCount()

    const interval = setInterval(() => {
      updateSyncStatus()
      updatePendingCount()
    }, 30000) // Update every 30 seconds

    return () => clearInterval(interval)
  }, [updateSyncStatus, updatePendingCount])

  return {
    syncStatus,
    triggerSync,
    updatePendingCount
  }
}
