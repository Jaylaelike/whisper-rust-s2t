"use client"

import { useState, useEffect } from "react"
import { formatDistanceToNow } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import Link from "next/link"
import { FileAudio, AlertTriangle, Shield, Loader2, RefreshCw, Search, Clock, Cpu, RotateCcw, Zap } from "lucide-react"
import { useImmediateSync } from "@/hooks/use-immediate-sync"

interface TranscriptionJob {
  id: string
  title: string
  description?: string | null
  originalAudioFileName: string
  taskId?: string | null
  queueStatus: string
  backend: string
  language: string
  priority: number
  transcriptionText?: string | null
  transcriptionResultJson?: any
  processingTimeMs?: number | null
  riskDetectionStatus: string
  riskDetectionResult?: string | null
  riskConfidence?: number | null
  fileSizeBytes?: number | null
  durationSeconds?: number | null
  errorMessage?: string | null
  startedAt?: Date | null
  completedAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

interface TranscriptionsListProps {
  initialTranscriptions?: TranscriptionJob[]
}

export function TranscriptionsListNew({ initialTranscriptions = [] }: TranscriptionsListProps) {
  const [reAnalyzingRisk, setReAnalyzingRisk] = useState<Set<string>>(new Set())
  const [transcriptions, setTranscriptions] = useState<TranscriptionJob[]>(initialTranscriptions)
  const [isLoading, setIsLoading] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [autoSyncActive, setAutoSyncActive] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    pages: 0
  })
  
  const { isSyncing: isImmediateSyncing, syncTranscription } = useImmediateSync()

  // Fetch transcriptions from database
  const fetchTranscriptions = async (page = 1, search = "", status = "all") => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: pagination.limit.toString(),
        ...(search && { search }),
        ...(status !== "all" && { status })
      })

      const response = await fetch(`/api/transcriptions?${params}`)
      if (!response.ok) throw new Error('Failed to fetch transcriptions')
      
      const data = await response.json()
      setTranscriptions(data.transcriptions || [])
      setPagination(data.pagination || pagination)
    } catch (error) {
      console.error('Error fetching transcriptions:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Initial fetch
  useEffect(() => {
    fetchTranscriptions()
  }, [])

  // Handle search and filter changes
  useEffect(() => {
    const delayedSearch = setTimeout(() => {
      fetchTranscriptions(1, searchQuery, statusFilter)
    }, 300)
    
    return () => clearTimeout(delayedSearch)
  }, [searchQuery, statusFilter])

  // Handle manual risk re-analysis
  const handleReAnalyzeRisk = async (job: TranscriptionJob) => {
    if (!job.transcriptionResultJson) return

    setReAnalyzingRisk(prev => new Set(prev).add(job.id))

    try {
      const text = typeof job.transcriptionResultJson === 'string' 
        ? JSON.parse(job.transcriptionResultJson).text 
        : job.transcriptionResultJson.text

      // Call risk analysis API from backend server
      const response = await fetch('http://localhost:8000/api/risk-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          text,
          priority: 1
        })
      })
      
      if (!response.ok) throw new Error('Risk analysis failed')
      
      const result = await response.json()
      
      // Update the job in the database with analyzing status and task ID first
      await fetch(`/api/transcriptions/${job.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          riskDetectionStatus: 'analyzing',
          taskId: result.task_id,
          updatedAt: new Date().toISOString()
        })
      })
      
      // Refresh the list
      await fetchTranscriptions(pagination.page, searchQuery, statusFilter)
    } catch (error) {
      console.error('Error in risk re-analysis:', error)
    } finally {
      setReAnalyzingRisk(prev => {
        const newSet = new Set(prev)
        newSet.delete(job.id)
        return newSet
      })
    }
  }

  // Handle syncing task statuses from backend
  const handleSyncTasks = async () => {
    setIsSyncing(true)
    setSyncError(null)
    try {
      const response = await fetch('/api/sync-tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ syncAll: true })
      })

      if (response.ok) {
        const result = await response.json()
        console.log('Sync result:', result)
        setLastSyncTime(new Date())
        
        // Refresh the transcriptions list after sync
        await fetchTranscriptions(pagination.page, searchQuery, statusFilter)
      } else {
        console.error('Failed to sync tasks')
        setSyncError('Failed to sync tasks from backend')
      }
    } catch (error) {
      console.error('Error syncing tasks:', error)
      setSyncError('Error connecting to sync service')
    } finally {
      setIsSyncing(false)
    }
  }

  // Handle immediate sync for individual job
  const handleImmediateSync = async (job: TranscriptionJob) => {
    if (!job.taskId) return
    
    try {
      await syncTranscription(job.id, {
        onSuccess: (result) => {
          console.log('Immediate sync successful:', result)
          // Refresh the list to show updated results
          fetchTranscriptions(pagination.page, searchQuery, statusFilter)
        },
        onError: (error) => {
          console.error('Immediate sync failed:', error)
          setSyncError(`Failed to sync ${job.title}`)
        }
      })
    } catch (error) {
      console.error('Error in immediate sync:', error)
    }
  }

  // Auto-sync pending tasks periodically with adaptive frequency
  useEffect(() => {
    const hasPendingTasks = transcriptions.some(t => 
      t.queueStatus === 'pending' || t.queueStatus === 'processing'
    )
    
    setAutoSyncActive(hasPendingTasks)

    if (!hasPendingTasks) {
      return // No auto-sync needed
    }

    const getAutoSyncInterval = () => {
      // Check if there are any very recently created pending tasks (less than 2 minutes old)
      const hasVeryRecentTasks = transcriptions.some(t => 
        (t.queueStatus === 'pending' || t.queueStatus === 'processing') &&
        new Date().getTime() - new Date(t.createdAt).getTime() < 2 * 60 * 1000
      )
      
      // Check if there are any recently created pending tasks (less than 5 minutes old)
      const hasRecentTasks = transcriptions.some(t => 
        (t.queueStatus === 'pending' || t.queueStatus === 'processing') &&
        new Date().getTime() - new Date(t.createdAt).getTime() < 5 * 60 * 1000
      )
      
      // Use very aggressive sync for very new tasks, moderate for recent, slower for older
      if (hasVeryRecentTasks) return 5000  // 5 seconds for very recent tasks
      if (hasRecentTasks) return 15000     // 15 seconds for recent tasks  
      return 30000                         // 30 seconds for older tasks
    }

    const autoSyncInterval = setInterval(async () => {
      if (!isLoading && !isSyncing) {
        try {
          const response = await fetch('/api/sync-tasks', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ syncAll: true })
          })
          
          if (response.ok) {
            setLastSyncTime(new Date())
            setSyncError(null)
            // Refresh the list silently
            await fetchTranscriptions(pagination.page, searchQuery, statusFilter)
          }
        } catch (error) {
          console.error('Auto-sync failed:', error)
          setSyncError('Auto-sync failed')
        }
      }
    }, getAutoSyncInterval())

    return () => clearInterval(autoSyncInterval)
  }, [transcriptions, isLoading, isSyncing, pagination.page, searchQuery, statusFilter])

  // Render risk detection status badge
  const RiskBadge = ({ detectionStatus, detectionResult }: { 
    detectionStatus: string; 
    detectionResult: string | null | undefined 
  }) => {
    switch (detectionStatus) {
      case 'completed':
        if (detectionResult === 'risky' || detectionResult === 'เข้าข่ายผิด') {
          return (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              <span>มีความเสี่ยง</span>
            </Badge>
          )
        } else if (detectionResult === 'safe' || detectionResult === 'ไม่ผิด') {
          return (
            <Badge variant="secondary" className="gap-1">
              <Shield className="h-3 w-3" />
              <span>ไม่มีความเสี่ยง</span>
            </Badge>
          )
        }
        return (
          <Badge variant="outline" className="gap-1">
            <span>ไม่ทราบผล</span>
          </Badge>
        )
      case 'analyzing':
        return (
          <Badge variant="outline" className="gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>กำลังวิเคราะห์</span>
          </Badge>
        )
      case 'failed':
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            <span>วิเคราะห์ล้มเหลว</span>
          </Badge>
        )
      default:
        return (
          <Badge variant="outline" className="gap-1">
            <RefreshCw className="h-3 w-3" />
            <span>ยังไม่ได้วิเคราะห์</span>
          </Badge>
        )
    }
  }

  // Get status badge variant
  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return <Badge variant="default">Completed</Badge>
      case 'processing':
        return <Badge variant="secondary">Processing</Badge>
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>
      case 'pending':
        return <Badge variant="outline">Pending</Badge>
      case 'cancelled':
        return <Badge variant="outline">Cancelled</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  // Format file size
  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return '-'
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
  }

  // Format duration
  const formatDuration = (seconds?: number | null) => {
    if (!seconds) return '-'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Transcriptions</h2>
        <div className="flex items-center gap-2">
          <Button onClick={() => fetchTranscriptions(pagination.page, searchQuery, statusFilter)} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          
          <Button 
            onClick={handleSyncTasks} 
            disabled={isSyncing || isLoading}
            variant="outline"
          >
            <RotateCcw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing...' : 'Sync Tasks'}
          </Button>
        </div>
      </div>

      {/* Status indicators */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        {lastSyncTime && (
          <div className="flex items-center gap-1">
            <span>Last sync:</span>
            <span>{formatDistanceToNow(lastSyncTime, { addSuffix: true })}</span>
          </div>
        )}
        {syncError && (
          <div className="flex items-center gap-1 text-red-600">
            <AlertTriangle className="h-4 w-4" />
            <span>{syncError}</span>
          </div>
        )}
        {isImmediateSyncing && (
          <div className="flex items-center gap-1 text-blue-600">
            <Zap className="h-4 w-4" />
            <span>Force syncing...</span>
          </div>
        )}
        {transcriptions.some(t => t.queueStatus === 'pending' || t.queueStatus === 'processing') && (
          <div className="flex items-center gap-1">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Auto-sync active ({transcriptions.filter(t => t.queueStatus === 'pending' || t.queueStatus === 'processing').length} pending)</span>
          </div>
        )}
      </div>

      {/* Search and Filter Controls */}
      <div className="flex gap-4 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search transcriptions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Transcriptions Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>File</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Backend</TableHead>
              <TableHead>Processing Time</TableHead>
              <TableHead>Risk Analysis</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transcriptions.map((job) => (
              <TableRow key={job.id}>
                <TableCell>
                  <div className="space-y-1">
                    <Link
                      href={`/transcriptions/${job.id}`}
                      className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {job.title}
                    </Link>
                    {job.description && (
                      <p className="text-sm text-muted-foreground">{job.description}</p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <FileAudio className="h-4 w-4 text-muted-foreground" />
                    <div className="space-y-1">
                      <div className="text-sm font-medium">
                        {job.originalAudioFileName.startsWith('/uploads/') ? (
                          <a 
                            href={job.originalAudioFileName} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {job.originalAudioFileName.split('/').pop()}
                          </a>
                        ) : (
                          job.originalAudioFileName
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatFileSize(job.fileSizeBytes)} • {formatDuration(job.durationSeconds)}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {job.queueStatus === 'processing' && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    {getStatusBadge(job.queueStatus)}
                  </div>
                  {job.errorMessage && (
                    <div className="text-xs text-red-600 mt-1">{job.errorMessage}</div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Cpu className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm uppercase">{job.backend}</span>
                  </div>
                </TableCell>
                <TableCell>
                  {job.processingTimeMs ? (
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{(job.processingTimeMs / 1000).toFixed(2)}s</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <RiskBadge
                      detectionStatus={job.riskDetectionStatus}
                      detectionResult={job.riskDetectionResult || null}
                    />
                    {job.transcriptionResultJson && job.riskDetectionStatus !== 'analyzing' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleReAnalyzeRisk(job)}
                        disabled={reAnalyzingRisk.has(job.id)}
                        className="h-6 px-2"
                      >
                        {reAnalyzingRisk.has(job.id) ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                      </Button>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
                  </div>
                  {job.completedAt && (
                    <div className="text-xs text-muted-foreground">
                      Completed {formatDistanceToNow(new Date(job.completedAt), { addSuffix: true })}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Link href={`/transcriptions/${job.id}`}>
                      <Button variant="outline" size="sm">
                        View
                      </Button>
                    </Link>
                    
                    {/* Immediate sync button for pending/processing jobs */}
                    {(job.queueStatus === 'pending' || job.queueStatus === 'processing') && job.taskId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleImmediateSync(job)}
                        disabled={isImmediateSyncing}
                        className="gap-1"
                        title="Force sync this task now"
                      >
                        {isImmediateSyncing ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Zap className="h-3 w-3" />
                        )}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            onClick={() => fetchTranscriptions(Math.max(1, pagination.page - 1), searchQuery, statusFilter)}
            disabled={pagination.page === 1 || isLoading}
          >
            Previous
          </Button>
          <span className="flex items-center px-4">
            Page {pagination.page} of {pagination.pages}
          </span>
          <Button
            variant="outline"
            onClick={() => fetchTranscriptions(Math.min(pagination.pages, pagination.page + 1), searchQuery, statusFilter)}
            disabled={pagination.page === pagination.pages || isLoading}
          >
            Next
          </Button>
        </div>
      )}

      {/* Empty State */}
      {transcriptions.length === 0 && !isLoading && (
        <div className="text-center py-8">
          <FileAudio className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No transcriptions found</h3>
          <p className="text-muted-foreground">
            {searchQuery || statusFilter !== "all" 
              ? "Try adjusting your search or filter criteria."
              : "Upload an audio file to get started with transcription."
            }
          </p>
        </div>
      )}
    </div>
  )
}
