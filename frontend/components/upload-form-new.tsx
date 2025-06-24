"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { useState, useEffect, useRef } from "react"
import { Loader2, Upload, CheckCircle, AlertTriangle } from "lucide-react"
import { useRouter } from "next/navigation"
import { QueueService } from "@/lib/services/queue-service"
import { TaskStatus, WebSocketMessage } from "@/lib/services/types"

const formSchema = z.object({
  title: z.string().min(2, {
    message: "Title must be at least 2 characters.",
  }),
  description: z.string().optional(),
  language: z.string().min(1, "Language is required"),
  priority: z.string().min(1, "Priority is required"),
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
  taskId?: string
}

export function UploadFormNew() {
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

        if (status === TaskStatus.Completed) {
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
                  <Textarea 
                    placeholder="Optional description for this transcription" 
                    {...field} 
                  />
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
                      <SelectItem value="auto">Auto-detect</SelectItem>
                    </SelectContent>
                  </Select>
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
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="audioFile"
            render={({ field: { value, onChange, ...fieldProps } }) => (
              <FormItem>
                <FormLabel>Audio File</FormLabel>
                <FormControl>
                  <Input
                    {...fieldProps}
                    type="file"
                    accept="audio/*"
                    onChange={(event) => {
                      onChange(event.target.files)
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button 
            type="submit" 
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Submit for Transcription
              </>
            )}
          </Button>
        </form>
      </Form>

      {showProgress && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {getProgressIcon()}
              Upload Progress
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className={`text-sm font-medium ${getProgressColor()}`}>
                  {uploadProgress.message}
                </span>
                <span className="text-sm text-muted-foreground">
                  {uploadProgress.progress}%
                </span>
              </div>
              <Progress value={uploadProgress.progress} className="w-full" />
            </div>
            
            {uploadProgress.taskId && (
              <div className="text-xs text-muted-foreground">
                Task ID: {uploadProgress.taskId}
              </div>
            )}

            <div className="flex items-center gap-2">
              <Badge 
                variant={
                  uploadProgress.stage === 'completed' ? 'default' :
                  uploadProgress.stage === 'failed' ? 'destructive' :
                  uploadProgress.stage === 'processing' ? 'secondary' : 'outline'
                }
              >
                {uploadProgress.stage}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
