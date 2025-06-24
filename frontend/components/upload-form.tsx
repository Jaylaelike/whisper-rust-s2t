"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { useState, useEffect, useRef } from "react"
import { Loader2, Upload, CheckCircle, AlertTriangle, Clock, Activity } from "lucide-react"
import { useRouter } from "next/navigation"
import { ButtonLoading } from "@/components/mini-loading"
import { QueueService } from "@/lib/services/queue-service"
import { TaskResult, WebSocketMessage, TaskStatus } from "@/lib/services/types"

const formSchema = z.object({
  title: z.string().min(2, {
    message: "Title must be at least 2 characters.",
  }),
  description: z.string().optional(),
  language: z.string().default("th"),
  priority: z.string().default("0"),
  audioFile: z
    .instanceof(FileList)
    .refine((files) => files.length > 0, {
      message: "Audio file is required.",
    })
    .refine(
      (files) => {
        const file = files[0]
        return (
          file &&
          (file.type === "audio/mp3" ||
            file.type === "audio/wav" ||
            file.type === "audio/x-m4a" ||
            file.type.includes("audio"))
        )
      },
      {
        message: "File must be an audio file (MP3, WAV, M4A).",
      },
    ),
})

type FormData = z.infer<typeof formSchema>

interface UploadProgress {
  stage: 'idle' | 'uploading' | 'queued' | 'processing' | 'completed' | 'failed'
  message: string
  progress: number
  transcriptionId?: string
  taskId?: string
  queuePosition?: number
}

export function UploadForm() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    stage: 'idle',
    message: '',
    progress: 0
  })
  const [showProgress, setShowProgress] = useState(false)
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null)
  const queueService = useRef(new QueueService())
  const router = useRouter()

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      language: "th",
      priority: "0",
    },
  })

  // Set up WebSocket connection for real-time updates
  useEffect(() => {
    queueService.current.connectWebSocket()
    
    const unsubscribe = queueService.current.onWebSocketMessage((message: WebSocketMessage) => {
      if ((message.type === 'task_status_update' || message.type === 'task_progress' || message.type === 'task_completed') 
          && message.task_id === currentTaskId) {
        
        const status = message.status
        const progress = message.progress || 0
        
        setUploadProgress(prev => ({
          ...prev,
          stage: status === TaskStatus.Completed ? 'completed' : 
                 status === TaskStatus.Failed ? 'failed' :
                 status === TaskStatus.Processing ? 'processing' : 'queued',
          message: status === TaskStatus.Completed ? 'Transcription completed! Redirecting...' :
                   status === TaskStatus.Failed ? 'Transcription failed' :
                   status === TaskStatus.Processing ? 'Transcribing audio...' :
                   'Waiting in queue...',
          progress: progress || (status === TaskStatus.Completed ? 100 : 
                                status === TaskStatus.Processing ? 75 : 
                                status === TaskStatus.Pending ? 50 : 0)
        }))

        if (status === TaskStatus.Completed && message.result && 'text' in message.result) {
          // Navigate to transcription detail page after a short delay
          // For now, redirect to transcriptions list since we don't have transcription_id in task result
          setTimeout(() => {
            router.push('/transcriptions')
          }, 2000)
        } else if (status === TaskStatus.Failed) {
          setIsSubmitting(false)
        }
      }
    })

    return () => {
      unsubscribe()
      queueService.current.disconnectWebSocket()
    }
  }, [currentTaskId, router])

  async function onSubmit(values: FormData) {
    setIsSubmitting(true)
    setShowProgress(true)
    
    setUploadProgress({
      stage: 'uploading',
      message: 'Uploading file and submitting to queue...',
      progress: 10
    })

    try {
      // Submit transcription task using the new service
      const response = await queueService.current.submitTranscriptionTask(
        values.audioFile[0],
        {
          language: values.language,
          priority: parseInt(values.priority)
        }
      )

      setCurrentTaskId(response.task_id)
      
      setUploadProgress({
        stage: 'queued',
        message: 'Task queued successfully! Monitoring progress...',
        progress: 30,
        taskId: response.task_id
      })

      // Poll task status as fallback in case WebSocket fails
      pollTaskStatus(response.task_id)

    } catch (error) {
      console.error("Error submitting transcription task:", error)
      setUploadProgress({
        stage: 'failed',
        message: error instanceof Error ? error.message : 'Upload failed',
        progress: 0
      })
      setIsSubmitting(false)
    }
  }

  // Fallback polling mechanism if WebSocket fails
  const pollTaskStatus = async (taskId: string) => {
    const maxAttempts = 120 // 10 minutes max (5s intervals)
    let attempts = 0

    while (attempts < maxAttempts) {
      try {
        await new Promise(resolve => setTimeout(resolve, 5000)) // Wait 5 seconds
        
        const taskResult = await queueService.current.getTaskStatus(taskId)
        
        // Only update if WebSocket hasn't already provided updates
        if (taskResult.status === TaskStatus.Completed || taskResult.status === TaskStatus.Failed) {
          if (taskResult.status === TaskStatus.Completed) {
            setTimeout(() => {
              router.push('/transcriptions')
            }, 2000)
          } else if (taskResult.status === TaskStatus.Failed) {
            setIsSubmitting(false)
          }
          break
        }

        attempts++
        
      } catch (error) {
        console.error('Error polling task status:', error)
        attempts++
      }
    }

    // Timeout fallback
    if (attempts >= maxAttempts) {
      setUploadProgress(prev => ({
        ...prev,
        stage: 'failed',
        message: 'Polling timeout - please check queue status',
        progress: 0
      }))
      setIsSubmitting(false)
    }
  }

  const getProgressIcon = () => {
    switch (uploadProgress.stage) {
      case 'uploading':
      case 'queued':
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin" />
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'failed':
        return <AlertTriangle className="h-4 w-4 text-red-500" />
      default:
        return <Upload className="h-4 w-4" />
    }
  }

  const getProgressColor = () => {
    switch (uploadProgress.stage) {
      case 'completed':
        return 'text-green-600'
      case 'failed':
        return 'text-red-600'
      case 'processing':
        return 'text-blue-600'
      default:
        return 'text-orange-600'
    }
  }

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input placeholder="Enter a title for this transcription" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description (Optional)</FormLabel>
                <FormControl>
                  <Textarea placeholder="Add additional details about this audio file" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="language"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Language</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select language" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="th">Thai (ไทย)</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="zh">Chinese (中文)</SelectItem>
                      <SelectItem value="ja">Japanese (日本語)</SelectItem>
                      <SelectItem value="ko">Korean (한국어)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>Select the primary language of the audio</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="priority"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Priority</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select priority" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="0">Normal</SelectItem>
                      <SelectItem value="1">High</SelectItem>
                      <SelectItem value="2">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>Higher priority tasks are processed first</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="audioFile"
            render={({ field: { onChange, value, ...rest } }) => (
              <FormItem>
                <FormLabel>Audio File</FormLabel>
                <FormControl>
                  <Input
                    type="file"
                    accept=".mp3,.wav,.m4a,audio/*"
                    onChange={(e) => onChange(e.target.files)}
                    {...rest}
                  />
                </FormControl>
                <FormDescription>Upload an audio file (MP3, WAV, M4A - Should be less than 20 MB)</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            <ButtonLoading 
              isLoading={isSubmitting} 
              loadingText="กำลังอัปโหลดและเตรียมการถอดเสียง..."
            >
              Upload and Transcribe
            </ButtonLoading>
          </Button>
        </form>
      </Form>

      {/* Progress Display */}
      {showProgress && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {getProgressIcon()}
              Transcription Progress
            </CardTitle>
            <CardDescription>
              Real-time status of your transcription and risk analysis
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Progress</span>
                <span className="text-sm text-muted-foreground">{Math.round(uploadProgress.progress)}%</span>
              </div>
              <Progress value={uploadProgress.progress} className="h-2" />
            </div>

            {/* Status Message */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                <span className="text-sm font-medium">Status</span>
              </div>
              <p className={`text-sm ${getProgressColor()}`}>
                {uploadProgress.message}
              </p>
            </div>

            {/* Stage Indicators */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span>Upload & Database</span>
                <Badge variant={uploadProgress.stage === 'uploading' || 
                               uploadProgress.stage === 'queued' || 
                               uploadProgress.stage === 'processing' || 
                               uploadProgress.stage === 'completed' ? 'default' : 'secondary'}>
                  {uploadProgress.stage === 'uploading' ? 'Active' : 'Done'}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <span>Queue Submission</span>
                <Badge variant={uploadProgress.stage === 'queued' || 
                               uploadProgress.stage === 'processing' || 
                               uploadProgress.stage === 'completed' ? 'default' : 'secondary'}>
                  {uploadProgress.stage === 'queued' ? 'Queued' :
                   uploadProgress.stage === 'processing' || uploadProgress.stage === 'completed' ? 'Done' : 'Waiting'}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <span>Transcription</span>
                <Badge variant={uploadProgress.stage === 'processing' ? 'default' : 
                               uploadProgress.stage === 'completed' ? 'default' : 'secondary'}>
                  {uploadProgress.stage === 'processing' ? 'Processing' :
                   uploadProgress.stage === 'completed' ? 'Done' : 'Waiting'}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <span>Risk Analysis</span>
                <Badge variant={uploadProgress.stage === 'completed' ? 'default' : 'secondary'}>
                  {uploadProgress.stage === 'completed' ? 'Auto-running' : 'Waiting'}
                </Badge>
              </div>
            </div>

            {/* Task Information */}
            {uploadProgress.transcriptionId && (
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Transcription ID: {uploadProgress.transcriptionId}</p>
              </div>
            )}

            {/* Action Buttons */}
            {uploadProgress.stage === 'completed' && (
              <div className="flex gap-2">
                <Button 
                  onClick={() => router.push(`/transcriptions/${uploadProgress.transcriptionId}`)}
                  className="flex-1"
                >
                  View Transcription
                </Button>
              </div>
            )}

            {uploadProgress.stage === 'failed' && (
              <div className="flex gap-2">
                <Button 
                  onClick={() => {
                    setShowProgress(false)
                    setUploadProgress({ stage: 'idle', message: '', progress: 0 })
                  }}
                  variant="outline"
                  className="flex-1"
                >
                  Try Again
                </Button>
                <Button 
                  onClick={() => router.push('/transcriptions')}
                  variant="outline"
                  className="flex-1"
                >
                  View All
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Queue Information */}
      {!showProgress && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Queue Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground space-y-2">
              <p>• Audio files are processed using a queue system for better reliability</p>
              <p>• Higher priority tasks are processed first</p>
              <p>• Automatic risk detection will run after transcription completes</p>
              <p>• You can monitor progress in real-time during upload</p>
              <p>• Backup and recovery ensures no tasks are lost during server restarts</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
