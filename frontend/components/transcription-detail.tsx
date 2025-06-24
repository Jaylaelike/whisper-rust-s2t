"use client"

import { useState, useRef, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { formatDistanceToNow, format } from "date-fns"
import { ProcessingStatus } from "@/components/ui/progressing-status"
import { AlertTriangle, Shield, Loader2, AlertCircle, ChevronDown, Clock, Zap, ScanSearch } from "lucide-react"
import { AudioPlayer } from "@/components/audio-player"
import { RiskAnalysisStatus } from "@/components/risk-analysis-status"
import { useTranscriptionRiskAnalysis } from "@/hooks/use-transcriptions"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

// Add custom styles for animations
const styles = `
  @keyframes wordHighlight {
    0% { background-color: transparent; transform: scale(1); }
    50% { background-color: hsl(var(--primary)); color: hsl(var(--primary-foreground)); transform: scale(1.05); }
    100% { background-color: hsl(var(--primary)); color: hsl(var(--primary-foreground)); transform: scale(1.05); }
  }
  
  .word-active {
    animation: wordHighlight 0.3s ease-in-out;
  }
  
  .segment-pulse {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
  
  @keyframes slideInLeft {
    0% { transform: translateX(-20px); opacity: 0; }
    100% { transform: translateX(0); opacity: 1; }
  }
  
  .segment-enter {
    animation: slideInLeft 0.3s ease-out;
  }
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style');
  styleElement.textContent = styles;
  if (!document.head.querySelector('style[data-transcript-styles]')) {
    styleElement.setAttribute('data-transcript-styles', 'true');
    document.head.appendChild(styleElement);
  }
}

interface Word {
  text: string
  start: number
  end: number
  confidence: number
}

interface Segment {
  id: number
  start: number
  end: number
  text: string
  words: Word[]
}

interface TranscriptionResult {
  text: string
  segments: Segment[]
  language?: string
}

interface TranscriptionJob {
  id: string
  title: string
  description: string | null
  originalAudioFileName: string
  status: string
  transcriptionResultJson: TranscriptionResult | null
  riskDetectionStatus: string
  riskDetectionResult: string | null
  riskDetectionResponse: string | null
  riskAnalyzedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

interface TranscriptionDetailProps {
  transcription: TranscriptionJob
}

export function TranscriptionDetail({ transcription }: TranscriptionDetailProps) {
  const [selectedSegmentId, setSelectedSegmentId] = useState<number | null>(null)
  const [activeWordIndex, setActiveWordIndex] = useState<{ segmentId: number; wordIndex: number } | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentRiskTaskId, setCurrentRiskTaskId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const segmentRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const router = useRouter()

  // Risk analysis hooks
  const riskAnalysisMutation = useTranscriptionRiskAnalysis()

  // Track audio play/pause state
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleEnded = () => setIsPlaying(false)

    audio.addEventListener("play", handlePlay)
    audio.addEventListener("pause", handlePause)
    audio.addEventListener("ended", handleEnded)

    return () => {
      audio.removeEventListener("play", handlePlay)
      audio.removeEventListener("pause", handlePause)
      audio.removeEventListener("ended", handleEnded)
    }
  }, [])

  // Track audio playback time to highlight current word
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !transcription.transcriptionResultJson) return

    const updateHighlight = () => {
      if (!transcription.transcriptionResultJson) return

      const currentTime = audio.currentTime

      // Find the segment and word that corresponds to the current time
      for (const segment of transcription.transcriptionResultJson.segments) {
        if (currentTime >= segment.start && currentTime <= segment.end) {
          // Update selected segment if changed
          if (segment.id !== selectedSegmentId) {
            setSelectedSegmentId(segment.id)
            const segmentElement = segmentRefs.current.get(segment.id)
            segmentElement?.scrollIntoView({ behavior: "smooth", block: "center" })
          }

          // Find the specific word in this segment
          if (segment.words && segment.words.length > 0) {
            for (let i = 0; i < segment.words.length; i++) {
              const word = segment.words[i]
              if (currentTime >= word.start && currentTime <= word.end) {
                setActiveWordIndex({ segmentId: segment.id, wordIndex: i })
                return
              }
            }
          }
          
          // If no specific word is found but we're in the segment, clear active word
          setActiveWordIndex(null)
          return
        }
      }

      // If we're not in any segment, clear highlights
      setActiveWordIndex(null)
      setSelectedSegmentId(null)
    }

    // Update every 50ms for smoother highlighting and progress bars
    const interval = setInterval(updateHighlight, 50)
    audio.addEventListener("timeupdate", updateHighlight)
    audio.addEventListener("play", updateHighlight)
    audio.addEventListener("pause", updateHighlight)

    return () => {
      clearInterval(interval)
      audio.removeEventListener("timeupdate", updateHighlight)
      audio.removeEventListener("play", updateHighlight)
      audio.removeEventListener("pause", updateHighlight)
    }
  }, [transcription.transcriptionResultJson, selectedSegmentId])

  const handleWordClick = (segmentId: number, wordIndex: number, startTime: number) => {
    setSelectedSegmentId(segmentId)
    setActiveWordIndex({ segmentId, wordIndex })

    if (audioRef.current) {
      audioRef.current.currentTime = startTime
      audioRef.current.play()
    }
  }

  // New dedicated handler for segment clicks
  const handleSegmentClick = (segment: Segment) => {
    console.log(`Clicking segment ${segment.id} at timestamp ${segment.start}s`); // Debug log
    
    setSelectedSegmentId(segment.id)
    setActiveWordIndex(null) // Clear word-level highlighting when clicking segment
    
    if (audioRef.current) {
      try {
        audioRef.current.currentTime = segment.start
        audioRef.current.play().catch(error => {
          console.log("Auto-play failed (this is normal for some browsers):", error)
          // Auto-play might be blocked by browser, that's OK
        })
      } catch (error) {
        console.error("Error setting audio time:", error)
      }
    } else {
      console.warn("Audio ref not available")
    }
  }

  // Format confidence as percentage
  const formatConfidence = (confidence: number): string => {
    return `${(confidence * 100).toFixed(0)}%`
  }

  // Parse Ollama response to extract Thinking, Summary, and Final Answer sections
  const parseOllamaResponse = (response: string) => {
    const sections = {
      thinking: '',
      summary: '',
      finalAnswer: ''
    }

    // Extract Thinking section from <think>...</think> tags
    const thinkTagMatch = response.match(/<think>([\s\S]*?)<\/think>/i)
    if (thinkTagMatch) {
      sections.thinking = thinkTagMatch[1].trim()
      
      // Extract the final answer after </think> tag
      const afterThinkMatch = response.match(/<\/think>\s*([\s\S]*?)$/i)
      if (afterThinkMatch) {
        sections.finalAnswer = afterThinkMatch[1].trim()
      }
    } else {
      // Fallback: Extract Thinking section (between "Thinking..." and "...done thinking.")
      const thinkingMatch = response.match(/Thinking\.\.\.([\s\S]*?)\.\.\.done thinking\./i)
      if (thinkingMatch) {
        sections.thinking = thinkingMatch[1].trim()
      }

      // Extract Summary section - handle both **Summary:** and Summary: formats
      const summaryMatch = response.match(/\*\*Summary:\*\*\s*([\s\S]*?)(?=\*\*Final Answer:\*\*|Final Answer:|$)/i) ||
                          response.match(/Summary:\s*([\s\S]*?)(?=\*\*Final Answer:\*\*|Final Answer:|$)/i)
      if (summaryMatch) {
        sections.summary = summaryMatch[1].trim()
      }

      // Extract Final Answer - handle both **Final Answer:** and Final Answer: formats
      const finalAnswerMatch = response.match(/\*\*Final Answer:\*\*\s*([\s\S]*?)$/i) ||
                               response.match(/Final Answer:\s*([\s\S]*?)$/i)
      if (finalAnswerMatch) {
        let finalText = finalAnswerMatch[1].trim()
        
        // Check for boxed answer
        const boxedMatch = finalText.match(/\\?boxed\s*\{\s*([^}]+)\s*\}/i)
        if (boxedMatch) {
          sections.finalAnswer = boxedMatch[1].trim()
        } else {
          sections.finalAnswer = finalText
        }
      }
    }

    return sections
  }

  // Handle risk detection using hooks
  const handleRiskDetection = async (priority: number = 1) => {
    if (!transcription.transcriptionResultJson) {
      toast.error('No transcription available for analysis')
      return
    }

    try {
      // First, immediately set status to "analyzing"
      const statusResponse = await fetch(`/api/transcriptions-new/${transcription.id}/risk-status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'analyzing' }),
      })

      if (!statusResponse.ok) {
        throw new Error('Failed to update risk status')
      }

      const result = await riskAnalysisMutation.mutateAsync({
        transcriptionId: transcription.id,
        text: transcription.transcriptionResultJson.text,
        priority
      })
      
      setCurrentRiskTaskId(result.task_id)
      toast.success(`Risk analysis started for "${transcription.title}"`)
      toast.info(`Task ID: ${result.task_id.slice(-8)}`)
      console.log('🔍 Risk analysis task created:', result.task_id)
      
      // Trigger a page refresh to show updated status
      setTimeout(() => {
        router.refresh()
      }, 1000)
    } catch (error) {
      console.error('Risk analysis error:', error)
      toast.error("Failed to start risk analysis")
    }
  }

  // Get risk status badge
  const getRiskStatusBadge = () => {
    switch (transcription.riskDetectionStatus) {
      case 'completed':
        if (transcription.riskDetectionResult === 'เข้าข่ายผิด' || transcription.riskDetectionResult === 'risky') {
          return (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              <span className="thai-text">มีความเสี่ยง</span>
            </Badge>
          )
        } else if (transcription.riskDetectionResult === 'ไม่ผิด' || transcription.riskDetectionResult === 'safe') {
          return (
            <Badge variant="secondary" className="gap-1">
              <Shield className="h-3 w-3" />
              <span className="thai-text">ไม่มีความเสี่ยง</span>
            </Badge>
          )
        } else {
          return (
            <Badge variant="outline" className="gap-1">
              <AlertCircle className="h-3 w-3" />
              <span className="thai-text">ไม่สามารถวิเคราะห์ได้</span>
            </Badge>
          )
        }
      case 'analyzing':
        return (
          <Badge variant="outline" className="gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span className="thai-text">กำลังวิเคราะห์...</span>
          </Badge>
        )
      case 'failed':
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="h-3 w-3" />
            <span className="thai-text">วิเคราะห์ไม่สำเร็จ</span>
          </Badge>
        )
      default:
        return (
          <Badge variant="outline">
            <span className="thai-text">ยังไม่ได้วิเคราะห์</span>
          </Badge>
        )
    }
  }

  return (
    <div className="flex flex-col space-y-4 thai-content">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold thai-text">{transcription.title}</h1>
        <div className="flex items-center gap-3">
          {getRiskStatusBadge()}
          <ProcessingStatus status={transcription.status} jobId={transcription.id} />
        </div>
      </div>

      {/* Audio Player */}
      {transcription.originalAudioFileName && transcription.originalAudioFileName.startsWith('/uploads/') && (
        <AudioPlayer
          src={`http://localhost:3000${transcription.originalAudioFileName}`}
          title={transcription.originalAudioFileName.split('/').pop()}
          transcript={transcription.transcriptionResultJson || undefined}
          onSegmentClick={(segment) => {
            // Scroll to segment in the main transcript view if needed
            const segmentElement = document.getElementById(`segment-${segment.id}`)
            if (segmentElement) {
              segmentElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }
          }}
        />
      )}

      {/* Risk Detection Section */}
      {transcription.status === "completed" && (
        <Card className="border-l-4 border-l-orange-400">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-sm font-medium thai-text">การตรวจสอบความเสี่ยงทางกฎหมาย</h3>
                <p className="text-xs text-muted-foreground thai-text">
                  ตรวจสอบเนื้อหาที่อาจเสี่ยงต่อการฝ่าฝืนกฎหมาย
                </p>
              </div>
              <div className="flex items-center gap-2">
                {(transcription.riskDetectionStatus === 'not_analyzed' || !transcription.riskDetectionStatus) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        disabled={riskAnalysisMutation.isPending}
                        size="sm"
                        variant="outline"
                        className="gap-1"
                      >
                        {riskAnalysisMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="thai-text">กำลังวิเคราะห์...</span>
                          </>
                        ) : (
                          <>
                            <ScanSearch className="h-4 w-4" />
                            <span className="thai-text">ตรวจสอบความเสี่ยง</span>
                            <ChevronDown className="h-3 w-3" />
                          </>
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    {!riskAnalysisMutation.isPending && (
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleRiskDetection(1)} className="gap-2">
                          <Clock className="h-4 w-4" />
                          <span className="thai-text">ปกติ (Normal)</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleRiskDetection(2)} className="gap-2">
                          <AlertTriangle className="h-4 w-4" />
                          <span className="thai-text">สำคัญ (High)</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleRiskDetection(3)} className="gap-2">
                          <Zap className="h-4 w-4" />
                          <span className="thai-text">เร่งด่วน (Urgent)</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    )}
                  </DropdownMenu>
                )}
                {(transcription.riskDetectionStatus === 'failed' || transcription.riskDetectionStatus === 'completed') && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        disabled={riskAnalysisMutation.isPending}
                        size="sm"
                        variant="outline"
                        className="gap-1"
                      >
                        {riskAnalysisMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="thai-text">กำลังวิเคราะห์...</span>
                          </>
                        ) : (
                          <>
                            <ScanSearch className="h-4 w-4" />
                            <span className="thai-text">{transcription.riskDetectionStatus === 'failed' ? 'ลองใหม่' : 'วิเคราะห์ใหม่'}</span>
                            <ChevronDown className="h-3 w-3" />
                          </>
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    {!riskAnalysisMutation.isPending && (
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleRiskDetection(1)} className="gap-2">
                          <Clock className="h-4 w-4" />
                          <span className="thai-text">ปกติ (Normal)</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleRiskDetection(2)} className="gap-2">
                          <AlertTriangle className="h-4 w-4" />
                          <span className="thai-text">สำคัญ (High)</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleRiskDetection(2)} className="gap-2">
                          <Zap className="h-4 w-4" />
                          <span className="thai-text">เร่งด่วน (Urgent)</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    )}
                  </DropdownMenu>
                )}
              </div>
            </div>
            
            {/* Show analysis result */}
            {transcription.riskDetectionStatus === 'completed' && transcription.riskAnalyzedAt && transcription.riskDetectionResponse && (
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="thai-text">ผลการวิเคราะห์:</span>
                  <span>
                    {format(new Date(transcription.riskAnalyzedAt), "dd/MM/yyyy HH:mm")}
                  </span>
                </div>
                
                {(() => {
                  const parsedResponse = parseOllamaResponse(transcription.riskDetectionResponse)
                  
                  return (
                    <div className="space-y-3">
                      {/* Debug: Show database result vs parsed result */}
                      <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                        <h4 className="text-sm font-semibold text-yellow-700 mb-2 thai-text">🔍 ข้อมูลการวิเคราะห์</h4>
                        <div className="space-y-1 text-xs">
                          <p><span className="font-medium">ผลจากฐานข้อมูล:</span> <span className="thai-text">{transcription.riskDetectionResult}</span></p>
                          <p><span className="font-medium">ผลที่แยกได้จากการตอบ:</span> <span className="thai-text">{parsedResponse.finalAnswer}</span></p>
                        </div>
                      </div>

                      {/* Final Answer - Most Important */}
                      {parsedResponse.finalAnswer && (
                        <div className="p-3 bg-primary/10 border border-primary/20 rounded-md">
                          <h4 className="text-sm font-semibold text-primary mb-2 thai-text">📋 คำตอบสุดท้าย</h4>
                          <p className="text-sm font-medium thai-text">{parsedResponse.finalAnswer}</p>
                        </div>
                      )}
                      
                      {/* Summary */}
                      {parsedResponse.summary && (
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                          <h4 className="text-sm font-semibold text-blue-700 mb-2 thai-text">📝 สรุป</h4>
                          <p className="text-sm text-blue-800 thai-text">{parsedResponse.summary}</p>
                        </div>
                      )}
                      
                      {/* Thinking Process - Collapsible */}
                      {parsedResponse.thinking && (
                        <details className="group">
                          <summary className="cursor-pointer p-3 bg-gray-50 border border-gray-200 rounded-md hover:bg-gray-100 transition-colors">
                            <span className="text-sm font-semibold text-gray-700 thai-text">🤔 กระบวนการคิด (คลิกเพื่อดู)</span>
                          </summary>
                          <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-md">
                            <p className="text-sm text-gray-700 whitespace-pre-wrap thai-text">{parsedResponse.thinking}</p>
                          </div>
                        </details>
                      )}
                      
                      {/* Raw Response - Collapsible for debugging */}
                      <details className="group">
                        <summary className="cursor-pointer p-2 bg-muted/50 border border-muted rounded-md hover:bg-muted transition-colors">
                          <span className="text-xs text-muted-foreground thai-text">🔍 คำตอบแบบเต็ม (สำหรับการตรวจสอบ)</span>
                        </summary>
                        <div className="mt-2 p-3 bg-muted/30 border border-muted rounded-md">
                          <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono overflow-x-auto thai-text">
                            {transcription.riskDetectionResponse}
                          </pre>
                        </div>
                      </details>
                    </div>
                  )
                })()}
              </div>
            )}

          </CardContent>
        </Card>
      )}

      {/* Show current risk analysis status */}
      {currentRiskTaskId && (
        <RiskAnalysisStatus 
          taskId={currentRiskTaskId} 
          onComplete={async (result) => {
            toast.success(`Risk analysis completed! Result: ${result.risk_analysis.is_risky ? "Risky" : "Safe"}`)
            setCurrentRiskTaskId(null) // Clear the task ID when completed
            
            // Manually update the database with the risk analysis results
            try {
              await fetch(`/api/transcriptions-new/update-risk`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  riskDetectionStatus: 'completed',
                  riskDetectionResult: result.risk_analysis.is_risky ? 'risky' : 'safe',
                  riskDetectionResponse: result,
                  riskConfidence: result.risk_analysis.confidence || 0.0,
                  transcription_text: result.text,
                  auto_triggered: false // Manual re-analysis
                }),
              })
              
              console.log('✅ Manually updated risk analysis results')
            } catch (error) {
              console.error('❌ Failed to update risk analysis results:', error)
            }
            
            // Refresh the page to show updated risk analysis results
            setTimeout(() => {
              router.refresh()
            }, 2000) // Wait 2 seconds to allow database update
          }}
        />
      )}

      {/* Transcription Text Result */}
      {transcription.transcriptionResultJson?.text && (
        <Card>
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium thai-text">ผลการถอดเสียง (Transcription Result)</h3>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {transcription.transcriptionResultJson.language || 'th'}
                  </Badge>
                  {/* Re-analyze button */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        disabled={riskAnalysisMutation.isPending}
                        size="sm"
                        variant="outline"
                        className="gap-1"
                      >
                        {riskAnalysisMutation.isPending ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span className="thai-text">กำลังวิเคราะห์...</span>
                          </>
                        ) : (
                          <>
                            <ScanSearch className="h-3 w-3" />
                            <span className="thai-text">วิเคราะห์ความเสี่ยงใหม่</span>
                            <ChevronDown className="h-2 w-2" />
                          </>
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    {!riskAnalysisMutation.isPending && (
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleRiskDetection(1)} className="gap-2">
                          <Clock className="h-3 w-3" />
                          <span className="thai-text">ปกติ (Normal)</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleRiskDetection(2)} className="gap-2">
                          <AlertTriangle className="h-3 w-3" />
                          <span className="thai-text">สำคัญ (High)</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleRiskDetection(3)} className="gap-2">
                          <Zap className="h-3 w-3" />
                          <span className="thai-text">เร่งด่วน (Urgent)</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    )}
                  </DropdownMenu>
                </div>
              </div>
              <textarea
                readOnly
                value={transcription.transcriptionResultJson.text}
                className="w-full min-h-[200px] p-3 text-sm border rounded-md bg-muted/30 resize-none focus:outline-none thai-text"
                placeholder="ไม่มีข้อความ..."
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="thai-text">
                  จำนวนตัวอักษร: {transcription.transcriptionResultJson.text.length.toLocaleString()}
                </span>
                <span className="thai-text">
                  จำนวนส่วน: {transcription.transcriptionResultJson.segments?.length || 0}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

     


 
    </div>
  )
}

// Helper function to format time in MM:SS format
function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`
}
