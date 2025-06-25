"use client"

import { useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { FileAudio, AlertTriangle, Shield, Loader2, Search, Clock, Cpu, RefreshCw, ScanSearch, Trash2, AlertCircle } from "lucide-react"
import { useTranscriptions, useTranscriptionRiskAnalysis, useDeleteTranscription, type Transcription } from "@/hooks/use-transcriptions"
import { TranscriptionListSkeleton } from "./loading-skeleton"
import { toast } from "sonner"

export function TranscriptionsListNew() {
  const [search, setSearch] = useState("")
  const [riskFilter, setRiskFilter] = useState("all")
  const [page, setPage] = useState(1)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const limit = 20

  const { 
    data, 
    isLoading, 
    error, 
    refetch, 
    isFetching 
  } = useTranscriptions({ 
    page, 
    limit, 
    search: search || undefined, 
    risk: riskFilter === "all" ? undefined : riskFilter 
  })

  const riskAnalysisMutation = useTranscriptionRiskAnalysis()
  const deleteTranscriptionMutation = useDeleteTranscription()

  const handleSearch = (value: string) => {
    setSearch(value)
    setPage(1) // Reset to first page when searching
  }

  const handleRiskFilter = (value: string) => {
    setRiskFilter(value)
    setPage(1) // Reset to first page when filtering
  }

  const handleRefresh = () => {
    refetch()
    toast.success("Transcriptions refreshed")
  }

  const handleRiskAnalysis = async (transcription: Transcription) => {
    try {
      const result = await riskAnalysisMutation.mutateAsync({
        transcriptionId: transcription.id,
        text: transcription.transcriptionText,
        priority: 1
      })
      
      toast.success(`Risk analysis queued for "${transcription.title}"`)
      toast.info(`Task ID: ${result.task_id.slice(-8)}`)
    } catch (error) {
      toast.error("Failed to start risk analysis")
    }
  }

  const handleDeleteTranscription = async (transcription: Transcription) => {
    if (!confirm(`Are you sure you want to delete "${transcription.title}"? This action cannot be undone.`)) {
      return
    }

    setDeletingId(transcription.id)
    try {
      await deleteTranscriptionMutation.mutateAsync(transcription.id)
      toast.success(`"${transcription.title}" deleted successfully`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete transcription")
    } finally {
      setDeletingId(null)
    }
  }

  const getRiskBadgeVariant = (result?: string) => {
    switch (result) {
      case "risky": return "destructive"
      case "safe": return "default"
      default: return "secondary"
    }
  }

  const getRiskIcon = (result?: string) => {
    switch (result) {
      case "risky": return <AlertTriangle className="h-3 w-3" />
      case "safe": return <Shield className="h-3 w-3" />
      default: return <Clock className="h-3 w-3" />
    }
  }

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "completed": return "default"
      case "processing": return "secondary"
      case "pending": return "outline"
      case "failed": return "destructive"
      default: return "secondary"
    }
  }

  const formatDuration = (seconds?: number) => {
    if (!seconds) return "Unknown"
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "Unknown"
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(1)} MB`
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-red-600">Error Loading Transcriptions</CardTitle>
          <CardDescription>
            {error instanceof Error ? error.message : "An unexpected error occurred"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleRefresh} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Enhanced Header and Controls */}
      <div className="relative p-6 rounded-2xl bg-gradient-to-br from-blue-50/30 via-background to-indigo-50/20 border border-border/50 backdrop-blur-sm">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent rounded-2xl" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Your Transcriptions
            </h2>
            <p className="text-muted-foreground">
              {data ? (
                <span className="flex items-center gap-2">
                  <FileAudio className="h-4 w-4" />
                  {data.pagination.total} transcriptions found
                </span>
              ) : (
                "Loading transcriptions..."
              )}
            </p>
          </div>
          
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="flex items-center gap-2 bg-background/80 backdrop-blur-sm rounded-lg px-3 py-2 border border-border/50">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by title or content..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full md:w-64 border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
            
            <Select value={riskFilter} onValueChange={handleRiskFilter}>
              <SelectTrigger className="w-full md:w-40 bg-background/80 backdrop-blur-sm border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Risk Levels</SelectItem>
                <SelectItem value="safe">✅ Safe</SelectItem>
                <SelectItem value="risky">⚠️ Risky</SelectItem>
                <SelectItem value="unknown">❓ Unknown</SelectItem>
              </SelectContent>
            </Select>
            
            <Button
              onClick={handleRefresh}
              variant="outline"
              size="sm"
              disabled={isFetching}
              className="btn-enhanced hover:shadow-lg transition-all duration-300"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <TranscriptionListSkeleton />
      )}

      {/* Enhanced Data Table */}
      {data && (
        <Card className="card-enhanced animate-slide-up shadow-xl border-0">
          <CardContent className="p-0">
            <div className="overflow-hidden rounded-xl">
              <Table className="table-enhanced">
                <TableHeader>
                  <TableRow className="border-none bg-gradient-to-r from-muted/40 to-muted/20">
                    <TableHead className="font-semibold text-foreground">Title & Details</TableHead>
                    <TableHead className="font-semibold text-foreground">Configuration</TableHead>
                    <TableHead className="font-semibold text-foreground">File Info</TableHead>
                    <TableHead className="font-semibold text-foreground">Risk Status</TableHead>
                    <TableHead className="font-semibold text-foreground">Completed</TableHead>
                    <TableHead className="font-semibold text-foreground">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.transcriptions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12">
                        <div className="flex flex-col items-center gap-4 animate-fade-in">
                          <div className="p-4 rounded-full bg-muted/50">
                            <FileAudio className="h-12 w-12 text-muted-foreground" />
                          </div>
                          <div className="space-y-2 text-center">
                            <p className="text-lg font-medium text-muted-foreground">
                              {search || riskFilter !== "all" 
                                ? "No transcriptions match your filters" 
                                : "No transcriptions found"}
                            </p>
                            <p className="text-sm text-muted-foreground/60">
                              {search || riskFilter !== "all" 
                                ? "Try adjusting your search criteria" 
                                : "Upload your first audio file to get started"}
                            </p>
                          </div>
                          {(search || riskFilter !== "all") && (
                            <Button 
                              variant="outline" 
                              onClick={() => {
                                setSearch("")
                                setRiskFilter("all")
                                setPage(1)
                              }}
                              className="btn-enhanced"
                            >
                              Clear Filters
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.transcriptions.map((transcription: Transcription, index: number) => (
                      <TableRow 
                        key={transcription.id}
                        className="group hover:bg-muted/20 transition-all duration-200 animate-fade-in border-border/30"
                        style={{ animationDelay: `${index * 0.05}s` }}
                      >
                        <TableCell className="py-4">
                          <div className="space-y-2 max-w-xs">
                            <div className="font-semibold text-foreground group-hover:text-primary transition-colors duration-200 truncate">
                              {transcription.title}
                            </div>
                            {transcription.description && (
                              <div className="text-sm text-muted-foreground line-clamp-2">
                                {transcription.description}
                              </div>
                            )}
                            <div className="text-xs text-muted-foreground font-mono bg-muted/30 px-2 py-1 rounded w-fit">
                              ID: {transcription.id.slice(-8)}
                            </div>
                          </div>
                        </TableCell>
                        
                        <TableCell className="py-4">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                🌐 {transcription.language.toUpperCase()}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <Cpu className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">
                                {transcription.backend.toUpperCase()}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        
                        <TableCell className="py-4">
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              <span>{formatDuration(transcription.durationSeconds)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <FileAudio className="h-3 w-3 text-muted-foreground" />
                              <span>{formatFileSize(transcription.fileSizeBytes)}</span>
                            </div>
                          </div>
                        </TableCell>
                        
                        <TableCell className="py-4">
                          <Badge 
                            className={`status-indicator ${
                              transcription.riskDetectionResult === 'risky' ? 'status-failed' :
                              transcription.riskDetectionResult === 'safe' ? 'status-completed' : 'status-pending'
                            } transition-all duration-200`}
                          >
                            {getRiskIcon(transcription.riskDetectionResult)}
                            <span className="capitalize">
                              {transcription.riskDetectionResult || "Unknown"}
                            </span>
                            {transcription.riskConfidence && (
                              <span className="ml-1 text-xs opacity-80">
                                ({Math.round(transcription.riskConfidence * 100)}%)
                              </span>
                            )}
                          </Badge>
                        </TableCell>
                        
                        <TableCell className="py-4">
                          <div className="space-y-1">
                            <div className="text-sm text-muted-foreground">
                              {formatDistanceToNow(new Date(transcription.completedAt), { addSuffix: true })}
                            </div>
                            {transcription.processingTimeMs && (
                              <div className="text-xs text-muted-foreground bg-muted/30 px-2 py-1 rounded">
                                ⚡ {Math.round(transcription.processingTimeMs / 1000)}s
                              </div>
                            )}
                          </div>
                        </TableCell>
                        
                        <TableCell className="py-4">
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" asChild className="btn-enhanced hover:shadow-md transition-all duration-200">
                              <Link href={`/transcriptions/${transcription.id}`}>
                                View Details
                              </Link>
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleRiskAnalysis(transcription)}
                              disabled={riskAnalysisMutation.isPending}
                              title="Analyze risk content"
                              className="btn-enhanced hover:shadow-md hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 transition-all duration-200"
                            >
                              {riskAnalysisMutation.isPending ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <ScanSearch className="h-3 w-3" />
                              )}
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleDeleteTranscription(transcription)}
                              disabled={deletingId === transcription.id || deleteTranscriptionMutation.isPending}
                              title="Delete transcription"
                              className="btn-enhanced hover:shadow-md text-red-600 hover:text-red-700 hover:border-red-300 hover:bg-red-50 transition-all duration-200"
                            >
                              {deletingId === transcription.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Enhanced Pagination */}
      {data && data.pagination.pages > 1 && (
        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-muted/20 to-muted/10 rounded-xl border border-border/50 animate-slide-up">
          <div className="text-sm text-muted-foreground">
            <span className="font-medium">
              Page {data.pagination.page} of {data.pagination.pages}
            </span>
            <span className="ml-2 text-muted-foreground/60">
              ({data.pagination.total} total)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn-enhanced hover:shadow-md transition-all duration-200"
            >
              ← Previous
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, data.pagination.pages) }, (_, i) => {
                const pageNum = i + 1
                return (
                  <Button
                    key={pageNum}
                    variant={page === pageNum ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPage(pageNum)}
                    className={`w-8 h-8 p-0 btn-enhanced transition-all duration-200 ${
                      page === pageNum ? 'bg-primary text-primary-foreground shadow-colored-primary' : ''
                    }`}
                  >
                    {pageNum}
                  </Button>
                )
              })}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(data.pagination.pages, p + 1))}
              disabled={page === data.pagination.pages}
              className="btn-enhanced hover:shadow-md transition-all duration-200"
            >
              Next →
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
