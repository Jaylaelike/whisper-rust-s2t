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
import { FileAudio, AlertTriangle, Shield, Loader2, Search, Clock, Cpu, RefreshCw, ScanSearch } from "lucide-react"
import { useTranscriptions, useTranscriptionRiskAnalysis, type Transcription } from "@/hooks/use-transcriptions"
import { TranscriptionListSkeleton } from "./loading-skeleton"
import { toast } from "sonner"

export function TranscriptionsListNew() {
  const [search, setSearch] = useState("")
  const [riskFilter, setRiskFilter] = useState("all")
  const [page, setPage] = useState(1)
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
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Transcriptions</h1>
          <p className="text-muted-foreground">
            {data ? `${data.pagination.total} transcriptions` : "Loading..."}
          </p>
        </div>
        
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search transcriptions..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full md:w-64"
            />
          </div>
          
          <Select value={riskFilter} onValueChange={handleRiskFilter}>
            <SelectTrigger className="w-full md:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Risk Levels</SelectItem>
              <SelectItem value="safe">Safe</SelectItem>
              <SelectItem value="risky">Risky</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
          
          <Button
            onClick={handleRefresh}
            variant="outline"
            size="sm"
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <TranscriptionListSkeleton />
      )}

      {/* Data Table */}
      {data && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Language</TableHead>
                  <TableHead>Backend</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Risk Status</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.transcriptions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <div className="flex flex-col items-center gap-2">
                        <FileAudio className="h-8 w-8 text-muted-foreground" />
                        <p className="text-muted-foreground">
                          {search || riskFilter !== "all" 
                            ? "No transcriptions match your filters" 
                            : "No transcriptions found"}
                        </p>
                        {(search || riskFilter !== "all") && (
                          <Button 
                            variant="outline" 
                            onClick={() => {
                              setSearch("")
                              setRiskFilter("all")
                              setPage(1)
                            }}
                          >
                            Clear Filters
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  data.transcriptions.map((transcription: Transcription) => (
                    <TableRow key={transcription.id}>
                      <TableCell>
                        <div className="max-w-xs">
                          <div className="font-medium truncate">{transcription.title}</div>
                          {transcription.description && (
                            <div className="text-sm text-muted-foreground truncate">
                              {transcription.description}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <Badge variant="outline">{transcription.language.toUpperCase()}</Badge>
                      </TableCell>
                      
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Cpu className="h-3 w-3" />
                          <span className="text-sm">{transcription.backend.toUpperCase()}</span>
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <div className="text-sm">
                          {formatDuration(transcription.durationSeconds)}
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <div className="text-sm">
                          {formatFileSize(transcription.fileSizeBytes)}
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <Badge 
                          variant={getRiskBadgeVariant(transcription.riskDetectionResult)}
                          className="flex items-center gap-1 w-fit"
                        >
                          {getRiskIcon(transcription.riskDetectionResult)}
                          {transcription.riskDetectionResult || "Unknown"}
                          {transcription.riskConfidence && (
                            <span className="ml-1">
                              ({Math.round(transcription.riskConfidence * 100)}%)
                            </span>
                          )}
                        </Badge>
                      </TableCell>
                      
                      <TableCell>
                        <div className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(transcription.completedAt), { addSuffix: true })}
                        </div>
                        {transcription.processingTimeMs && (
                          <div className="text-xs text-muted-foreground">
                            Processed in {Math.round(transcription.processingTimeMs / 1000)}s
                          </div>
                        )}
                      </TableCell>
                      
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" asChild>
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
                          >
                            {riskAnalysisMutation.isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <ScanSearch className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {data && data.pagination.pages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Page {data.pagination.page} of {data.pagination.pages}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(data.pagination.pages, p + 1))}
              disabled={page === data.pagination.pages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
