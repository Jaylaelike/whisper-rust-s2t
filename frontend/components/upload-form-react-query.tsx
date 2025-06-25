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
    <div className="max-w-2xl mx-auto space-y-8 animate-slide-up">
      <Card className="card-enhanced shadow-2xl border-0 bg-gradient-to-br from-white/95 via-white/98 to-white/95 backdrop-blur-xl">
        <CardHeader className="space-y-4 bg-gradient-to-br from-blue-50/50 via-indigo-50/30 to-purple-50/50 rounded-t-xl border-b border-border/30">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-600">
              <Upload className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-xl bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                Upload Audio for Transcription
              </CardTitle>
              <CardDescription className="text-muted-foreground/80">
                Configure your audio transcription with advanced settings for optimal results
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              {/* Enhanced Title Field */}
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel className="text-sm font-semibold text-foreground">Title</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Enter a descriptive title for this transcription" 
                        {...field}
                        disabled={uploadMutation.isPending}
                        className="input-enhanced h-12 text-base focus-enhanced"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Enhanced Description Field */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel className="text-sm font-semibold text-foreground">Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Add context, notes, or additional details about this audio..."
                        {...field}
                        disabled={uploadMutation.isPending}
                        className="input-enhanced min-h-[100px] resize-y focus-enhanced"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Enhanced Audio File Upload */}
              <FormField
                control={form.control}
                name="audioFile"
                render={({ field: { onChange, value, ...field } }) => (
                  <FormItem className="space-y-3">
                    <FormLabel className="text-sm font-semibold text-foreground">Audio File</FormLabel>
                    <FormControl>
                      <div className="space-y-4">
                        {/* Custom File Upload Area */}
                        <div className="relative">
                          <Input
                            type="file"
                            accept="audio/*,.mp3,.wav,.m4a"
                            onChange={(e) => {
                              onChange(e.target.files)
                              handleFileChange(e.target.files)
                            }}
                            disabled={uploadMutation.isPending}
                            className="sr-only"
                            id="audio-upload"
                            {...field}
                          />
                          <label 
                            htmlFor="audio-upload"
                            className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border/50 rounded-xl cursor-pointer bg-gradient-to-br from-muted/20 to-muted/10 hover:bg-muted/30 hover:border-primary/50 transition-all duration-300 group"
                          >
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                              <div className="p-3 rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors duration-300 mb-3">
                                <FileAudio className="h-8 w-8" />
                              </div>
                              <p className="mb-2 text-sm text-foreground font-medium">
                                <span className="font-semibold">Click to upload</span> or drag and drop
                              </p>
                              <p className="text-xs text-muted-foreground">MP3, WAV, M4A (max 100MB)</p>
                            </div>
                          </label>
                        </div>
                        
                        {/* Selected File Display */}
                        {selectedFile && (
                          <div className="flex items-center gap-4 p-4 bg-green-50/50 border border-green-200/50 rounded-xl animate-fade-in">
                            <div className="p-2 rounded-lg bg-green-100 text-green-600">
                              <CheckCircle className="h-5 w-5" />
                            </div>
                            <div className="flex-1">
                              <div className="font-medium text-green-800">{selectedFile.name}</div>
                              <div className="text-sm text-green-600">
                                Size: {formatFileSize(selectedFile.size)} • Type: {selectedFile.type || 'audio/*'}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Enhanced Settings Grid */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-foreground">Processing Settings</h3>
                  <div className="h-px flex-1 bg-border/50" />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Enhanced Language Select */}
                  <FormField
                    control={form.control}
                    name="language"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel className="text-sm font-semibold text-foreground">Language</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          defaultValue={field.value}
                          disabled={uploadMutation.isPending}
                        >
                          <FormControl>
                            <SelectTrigger className="input-enhanced h-12 focus-enhanced">
                              <SelectValue placeholder="Select language" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="th">🇹🇭 Thai (ไทย)</SelectItem>
                            <SelectItem value="en">🇺🇸 English</SelectItem>
                            <SelectItem value="auto">🌐 Auto-detect</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Enhanced Backend Select */}
                  <FormField
                    control={form.control}
                    name="backend"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel className="text-sm font-semibold text-foreground">Processing Backend</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          defaultValue={field.value}
                          disabled={uploadMutation.isPending}
                        >
                          <FormControl>
                            <SelectTrigger className="input-enhanced h-12 focus-enhanced">
                              <SelectValue placeholder="Select backend" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="cpu">💻 CPU</SelectItem>
                            <SelectItem value="gpu">⚡ GPU</SelectItem>
                            <SelectItem value="coreml">🍎 CoreML</SelectItem>
                            <SelectItem value="auto">🤖 Auto</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Enhanced Priority Select */}
                  <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel className="text-sm font-semibold text-foreground">Priority</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          defaultValue={field.value}
                          disabled={uploadMutation.isPending}
                        >
                          <FormControl>
                            <SelectTrigger className="input-enhanced h-12 focus-enhanced">
                              <SelectValue placeholder="Select priority" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="0">📝 Normal</SelectItem>
                            <SelectItem value="1">⭐ High</SelectItem>
                            <SelectItem value="2">🚨 Urgent</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Enhanced Submit Section */}
              <div className="space-y-6 pt-4">
                <Button 
                  type="submit" 
                  className="w-full h-14 text-lg btn-enhanced bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-colored-primary hover:shadow-xl transition-all duration-300" 
                  disabled={uploadMutation.isPending}
                >
                  {uploadMutation.isPending ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-3 animate-spin" />
                      Processing Transcription...
                    </>
                  ) : (
                    <>
                      <Upload className="h-5 w-5 mr-3" />
                      Upload and Transcribe
                    </>
                  )}
                </Button>

                {/* Enhanced Processing Status */}
                {uploadMutation.isPending && (
                  <Card className="card-enhanced border-blue-200/50 bg-blue-50/30 animate-fade-in">
                    <CardContent className="p-6">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-blue-800">Processing your audio file...</span>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                          </div>
                        </div>
                        <div className="w-full bg-blue-100 rounded-full h-2">
                          <div className="bg-gradient-to-r from-blue-400 to-blue-500 h-2 rounded-full loading-shimmer" />
                        </div>
                        <div className="text-sm text-blue-700/80">
                          This may take several minutes depending on the file size and backend processing speed.
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Enhanced Success State */}
                {uploadMutation.isSuccess && (
                  <Card className="card-enhanced border-green-200/50 bg-green-50/30 animate-scale-in">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-3 text-green-700">
                        <div className="p-2 rounded-lg bg-green-100 text-green-600">
                          <CheckCircle className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="font-medium">Transcription completed successfully!</div>
                          <div className="text-sm text-green-600">Redirecting to results...</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Enhanced Error State */}
                {uploadMutation.isError && (
                  <Card className="card-enhanced border-red-200/50 bg-red-50/30 animate-scale-in">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-3 text-red-700">
                        <div className="p-2 rounded-lg bg-red-100 text-red-600">
                          <AlertTriangle className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="font-medium">Processing failed</div>
                          <div className="text-sm text-red-600">
                            {uploadMutation.error instanceof Error 
                              ? uploadMutation.error.message 
                              : "An error occurred during processing"}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Enhanced Information Card */}
      <Card className="card-enhanced bg-gradient-to-br from-slate-50/50 to-gray-50/50">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <div className="p-2 rounded-lg bg-indigo-100 text-indigo-600">
              <FileAudio className="h-5 w-5" />
            </div>
            How it works
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-semibold mt-0.5">1</div>
              <p className="text-sm text-muted-foreground">Your audio file will be processed synchronously with real-time updates</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs font-semibold mt-0.5">2</div>
              <p className="text-sm text-muted-foreground">Processing typically takes 1-5 minutes depending on file length and backend</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-semibold mt-0.5">3</div>
              <p className="text-sm text-muted-foreground">Results are automatically saved and you'll be redirected to view them</p>
            </div>
          </div>
          <div className="mt-4 p-3 bg-blue-50/50 rounded-lg border border-blue-200/30">
            <p className="text-xs text-blue-700 font-medium">💡 Tip: Use GPU backend for faster processing of longer audio files</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
