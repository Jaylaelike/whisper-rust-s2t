"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Loader2, Upload, CheckCircle, AlertTriangle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useQueue } from "@/hooks/use-queue"

interface FormData {
  title: string
  description: string
  language: string
  backend: string
  priority: string
  audioFile: File | null
}

interface UploadProgress {
  stage: 'idle' | 'uploading' | 'queued' | 'processing' | 'completed' | 'failed'
  message: string
  progress: number
  taskId?: string
}

export function UploadFormSimple() {
  const [formData, setFormData] = useState<FormData>({
    title: "",
    description: "",
    language: "th",
    backend: "cpu",
    priority: "0",
    audioFile: null
  })
  
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    stage: 'idle',
    message: '',
    progress: 0
  })
  const [showProgress, setShowProgress] = useState(false)
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null)
  
  const router = useRouter()
  const { submitTranscriptionTask, onTaskUpdate } = useQueue({
    taskId: currentTaskId || undefined,
    enableRealTimeUpdates: true
  })

  // Listen for task updates
  useEffect(() => {
    if (!currentTaskId) return

    const unsubscribe = onTaskUpdate((task) => {
      setUploadProgress(prev => ({
        ...prev,
        stage: task.status === 'Completed' ? 'completed' : 
               task.status === 'Failed' ? 'failed' :
               task.status === 'Processing' ? 'processing' : 'queued',
        message: task.status === 'Completed' ? 'Transcription completed! Redirecting...' :
                 task.status === 'Failed' ? task.error || 'Transcription failed' :
                 task.status === 'Processing' ? 'Transcribing audio...' :
                 'Waiting in queue...',
        progress: task.progress || (task.status === 'Completed' ? 100 : 
                                   task.status === 'Processing' ? 75 : 
                                   task.status === 'Pending' ? 50 : 0)
      }))

      if (task.status === 'Completed') {
        setTimeout(() => {
          router.push('/transcriptions')
        }, 2000)
      } else if (task.status === 'Failed') {
        setIsSubmitting(false)
      }
    })

    return unsubscribe
  }, [currentTaskId, onTaskUpdate, router])

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null
    setFormData(prev => ({ ...prev, audioFile: file }))
  }

  const validateForm = (): string | null => {
    if (!formData.title.trim()) return "Title is required"
    if (formData.title.trim().length < 2) return "Title must be at least 2 characters"
    if (!formData.audioFile) return "Audio file is required"
    
    const file = formData.audioFile
    if (!file.type.includes('audio')) {
      return "File must be an audio file"
    }
    
    return null
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    
    const validationError = validateForm()
    if (validationError) {
      setUploadProgress({
        stage: 'failed',
        message: validationError,
        progress: 0
      })
      setShowProgress(true)
      return
    }

    setIsSubmitting(true)
    setShowProgress(true)
    
    setUploadProgress({
      stage: 'uploading',
      message: 'Saving audio file...',
      progress: 10
    })

    try {
      // First, save the audio file to public/uploads/audio/
      const uploadFormData = new FormData()
      uploadFormData.append('audioFile', formData.audioFile!)
      
      const uploadResponse = await fetch('/api/upload-audio', {
        method: 'POST',
        body: uploadFormData
      })
      
      if (!uploadResponse.ok) {
        throw new Error('Failed to save audio file')
      }
      
      const uploadResult = await uploadResponse.json()
      const savedFilePath = uploadResult.filePath // e.g., "/uploads/audio/uuid.mp3"
      
      setUploadProgress({
        stage: 'uploading',
        message: 'Submitting to transcription queue...',
        progress: 30
      })

      const response = await submitTranscriptionTask(
        formData.audioFile!,
        {
          language: formData.language,
          backend: formData.backend as 'cpu' | 'gpu' | 'coreml',
          priority: parseInt(formData.priority)
        }
      )

      // Create database entry for tracking with saved file path
      try {
        await fetch('/api/transcriptions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: formData.title,
            description: formData.description || null,
            originalAudioFileName: savedFilePath, // Store the full path instead of just filename
            taskId: response.task_id,
            backend: formData.backend,
            language: formData.language,
            priority: parseInt(formData.priority),
            fileSizeBytes: formData.audioFile!.size
          })
        })
      } catch (dbError) {
        console.warn('Failed to create database entry:', dbError)
        // Continue anyway since the task is queued
      }

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
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            type="text"
            placeholder="Enter a title for this transcription"
            value={formData.title}
            onChange={(e) => handleInputChange('title', e.target.value)}
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="description">Description (Optional)</Label>
          <Textarea
            id="description"
            placeholder="Optional description for this transcription"
            value={formData.description}
            onChange={(e) => handleInputChange('description', e.target.value)}
            className="mt-1"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="language">Language</Label>
            <Select value={formData.language} onValueChange={(value) => handleInputChange('language', value)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="th">Thai (ไทย)</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="auto">Auto-detect</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="backend">Processing Backend</Label>
            <Select value={formData.backend} onValueChange={(value) => handleInputChange('backend', value)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select backend" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cpu">
                  <div className="flex flex-col">
                    <span>CPU</span>
                    <span className="text-xs text-muted-foreground">Standard processing</span>
                  </div>
                </SelectItem>
                <SelectItem value="gpu">
                  <div className="flex flex-col">
                    <span>GPU</span>
                    <span className="text-xs text-muted-foreground">Faster processing (if available)</span>
                  </div>
                </SelectItem>
                <SelectItem value="coreml">
                  <div className="flex flex-col">
                    <span>CoreML</span>
                    <span className="text-xs text-muted-foreground">Apple Silicon optimized</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="priority">Priority</Label>
            <Select value={formData.priority} onValueChange={(value) => handleInputChange('priority', value)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Normal</SelectItem>
                <SelectItem value="1">High</SelectItem>
                <SelectItem value="2">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="audioFile">Audio File</Label>
          <Input
            id="audioFile"
            type="file"
            accept="audio/*"
            onChange={handleFileChange}
            className="mt-1"
          />
        </div>

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
