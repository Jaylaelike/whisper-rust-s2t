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
import { Progress } from "@/components/ui/progress"
import { useState } from "react"
import { Loader2, Upload, CheckCircle, AlertTriangle, FileAudio } from "lucide-react"
import { useRouter } from "next/navigation"
import { useUploadTranscription } from "@/hooks/use-transcriptions"
import { toast } from "sonner"

const formSchema = z.object({
  title: z.string().min(2, {
    message: "Title must be at least 2 characters.",
  }),
  description: z.string().optional(),
  language: z.string().min(1, "Language is required"),
  backend: z.string().min(1, "Backend is required"),
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

export function UploadFormReactQuery() {
  const router = useRouter()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  
  const uploadMutation = useUploadTranscription()

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      language: "th",
      backend: "cpu",
      priority: "0",
    },
  })

  const onSubmit = async (values: FormData) => {
    try {
      const formData = new FormData()
      formData.append("title", values.title)
      if (values.description) {
        formData.append("description", values.description)
      }
      formData.append("language", values.language)
      formData.append("backend", values.backend)
      formData.append("priority", values.priority)
      formData.append("audioFile", values.audioFile[0])

      const result = await uploadMutation.mutateAsync(formData)
      
      toast.success("Transcription completed successfully!")
      
      // Navigate to the completed transcription
      router.push(`/transcriptions/${result.transcriptionId}`)
      
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed")
    }
  }

  const handleFileChange = (files: FileList | null) => {
    if (files && files.length > 0) {
      setSelectedFile(files[0])
    } else {
      setSelectedFile(null)
    }
  }

  const formatFileSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(1)} MB`
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload Audio for Transcription</CardTitle>
          <CardDescription>
            Upload your audio file and configure transcription settings. 
            Processing will complete synchronously and redirect you to the results.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Title */}
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Enter a title for this transcription" 
                        {...field}
                        disabled={uploadMutation.isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Description */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Add a description or notes about this audio"
                        {...field}
                        disabled={uploadMutation.isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Audio File */}
              <FormField
                control={form.control}
                name="audioFile"
                render={({ field: { onChange, value, ...field } }) => (
                  <FormItem>
                    <FormLabel>Audio File</FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        <Input
                          type="file"
                          accept="audio/*,.mp3,.wav,.m4a"
                          onChange={(e) => {
                            onChange(e.target.files)
                            handleFileChange(e.target.files)
                          }}
                          disabled={uploadMutation.isPending}
                          {...field}
                        />
                        {selectedFile && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted p-2 rounded">
                            <FileAudio className="h-4 w-4" />
                            <span>{selectedFile.name}</span>
                            <span>({formatFileSize(selectedFile.size)})</span>
                          </div>
                        )}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Settings Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Language */}
                <FormField
                  control={form.control}
                  name="language"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Language</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                        disabled={uploadMutation.isPending}
                      >
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

                {/* Backend */}
                <FormField
                  control={form.control}
                  name="backend"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Processing Backend</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                        disabled={uploadMutation.isPending}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select backend" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="cpu">CPU</SelectItem>
                          <SelectItem value="gpu">GPU</SelectItem>
                          <SelectItem value="coreml">CoreML</SelectItem>
                          <SelectItem value="auto">Auto</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Priority */}
                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                        disabled={uploadMutation.isPending}
                      >
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

              {/* Submit Button */}
              <div className="flex flex-col gap-4">
                <Button 
                  type="submit" 
                  className="w-full" 
                  size="lg"
                  disabled={uploadMutation.isPending}
                >
                  {uploadMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing Transcription...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload and Transcribe
                    </>
                  )}
                </Button>

                {/* Processing Status */}
                {uploadMutation.isPending && (
                  <Card>
                    <CardContent className="pt-6">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span>Processing your audio file...</span>
                          <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                        <div className="text-xs text-muted-foreground">
                          This may take several minutes depending on the file size and backend processing speed.
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Success State */}
                {uploadMutation.isSuccess && (
                  <Card className="border-green-200 bg-green-50">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-2 text-green-700">
                        <CheckCircle className="h-4 w-4" />
                        <span>Transcription completed successfully!</span>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Error State */}
                {uploadMutation.isError && (
                  <Card className="border-red-200 bg-red-50">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-2 text-red-700">
                        <AlertTriangle className="h-4 w-4" />
                        <span>
                          {uploadMutation.error instanceof Error 
                            ? uploadMutation.error.message 
                            : "An error occurred during processing"}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Information Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">How it works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• Your audio file will be processed synchronously</p>
          <p>• Processing typically takes 1-5 minutes depending on file length</p>
          <p>• Results will be saved automatically once processing completes</p>
          <p>• You'll be redirected to view the transcription results</p>
          <p>• No manual synchronization required</p>
        </CardContent>
      </Card>
    </div>
  )
}
