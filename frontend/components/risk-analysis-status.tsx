"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, Shield, Loader2, Clock, ScanSearch } from "lucide-react"
import { useRiskAnalysisStatus } from "@/hooks/use-transcriptions"

interface RiskAnalysisStatusProps {
  taskId: string
  onComplete?: (result: any) => void
}

export function RiskAnalysisStatus({ taskId, onComplete }: RiskAnalysisStatusProps) {
  const { data: status, isLoading } = useRiskAnalysisStatus(taskId)

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading risk analysis status...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!status) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            <span>Risk analysis status not found</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  const isCompleted = status.status === 'Completed'
  const isFailed = status.status === 'Failed'
  const isProcessing = status.status === 'Processing' || status.status === 'Pending'

  if (isCompleted && status.result && onComplete) {
    onComplete(status.result)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScanSearch className="h-5 w-5" />
          Risk Analysis Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge variant={isCompleted ? "default" : isProcessing ? "secondary" : "destructive"}>
            {isProcessing && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            {isCompleted && <Shield className="h-3 w-3 mr-1" />}
            {isFailed && <AlertTriangle className="h-3 w-3 mr-1" />}
            {status.status}
          </Badge>
          {status.progress && (
            <span className="text-sm text-muted-foreground">
              {Math.round(status.progress)}% complete
            </span>
          )}
        </div>

        {status.result && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge 
                variant={status.result.risk_analysis.is_risky ? "destructive" : "default"}
                className="flex items-center gap-1"
              >
                {status.result.risk_analysis.is_risky ? (
                  <AlertTriangle className="h-3 w-3" />
                ) : (
                  <Shield className="h-3 w-3" />
                )}
                {status.result.risk_analysis.is_risky ? "Risky" : "Safe"}
              </Badge>
              <span className="text-sm text-muted-foreground">
                Confidence: {Math.round(status.result.risk_analysis.confidence * 100)}%
              </span>
            </div>

            {status.result.risk_analysis.detected_keywords.length > 0 && (
              <div>
                <p className="text-sm font-medium">Detected Keywords:</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {status.result.risk_analysis.detected_keywords.map((keyword, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {keyword}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="text-xs text-muted-foreground">
              <p>Model: {status.result.metadata.model}</p>
              <p>Text Length: {status.result.metadata.text_length} characters</p>
              <p>Analyzed: {new Date(status.result.metadata.timestamp).toLocaleString()}</p>
            </div>
          </div>
        )}

        {status.error && (
          <div className="p-2 bg-destructive/10 border border-destructive/20 rounded">
            <p className="text-sm text-destructive">{status.error}</p>
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          <p>Task ID: {status.task_id}</p>
          <p>Created: {new Date(status.created_at).toLocaleString()}</p>
          {status.completed_at && (
            <p>Completed: {new Date(status.completed_at).toLocaleString()}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
