"use client"

import { useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, RefreshCw, Clock, AlertTriangle, CheckCircle, Activity } from "lucide-react"
import { useSyncStatus } from "@/hooks/use-sync-status"

interface SyncStatusWidgetProps {
  onSyncComplete?: () => void
  showDetailedStatus?: boolean
}

export function SyncStatusWidget({ onSyncComplete, showDetailedStatus = false }: SyncStatusWidgetProps) {
  const { syncStatus, triggerSync } = useSyncStatus()
  const [isSyncing, setIsSyncing] = useState(false)

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      await triggerSync()
      onSyncComplete?.()
    } catch (error) {
      console.error('Sync failed:', error)
    } finally {
      setIsSyncing(false)
    }
  }

  if (!showDetailedStatus) {
    // Compact widget for header
    return (
      <div className="flex items-center gap-2">
        {syncStatus.pendingCount > 0 && (
          <Badge variant="outline" className="gap-1">
            <Activity className="h-3 w-3" />
            {syncStatus.pendingCount} pending
          </Badge>
        )}
        
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSync}
          disabled={isSyncing}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Syncing...' : 'Sync'}
        </Button>
        
        {syncStatus.lastSyncTime && (
          <span className="text-xs text-muted-foreground">
            Last: {formatDistanceToNow(syncStatus.lastSyncTime, { addSuffix: true })}
          </span>
        )}
        
        {syncStatus.error && (
          <div className="flex items-center gap-1 text-red-600 text-xs">
            <AlertTriangle className="h-3 w-3" />
            <span>{syncStatus.error}</span>
          </div>
        )}
      </div>
    )
  }

  // Detailed status card
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Sync Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-sm text-muted-foreground">Pending Tasks</span>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{syncStatus.pendingCount}</span>
              {syncStatus.pendingCount > 0 && (
                <Badge variant="outline">
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  Active
                </Badge>
              )}
            </div>
          </div>
          
          <div>
            <span className="text-sm text-muted-foreground">Service Status</span>
            <div className="flex items-center gap-2">
              {syncStatus.isActive ? (
                <Badge variant="default" className="gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Running
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <Clock className="h-3 w-3" />
                  Idle
                </Badge>
              )}
            </div>
          </div>
        </div>

        {syncStatus.lastSyncTime && (
          <div>
            <span className="text-sm text-muted-foreground">Last Sync</span>
            <div className="text-sm">
              {formatDistanceToNow(syncStatus.lastSyncTime, { addSuffix: true })}
            </div>
          </div>
        )}

        {syncStatus.error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-medium">Sync Error</span>
            </div>
            <div className="text-red-600 text-sm mt-1">{syncStatus.error}</div>
          </div>
        )}

        <Button 
          onClick={handleSync} 
          disabled={isSyncing}
          className="w-full"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Syncing Tasks...' : 'Sync All Tasks'}
        </Button>
      </CardContent>
    </Card>
  )
}
