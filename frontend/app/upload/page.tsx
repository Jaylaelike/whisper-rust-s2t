import { UploadFormReactQuery } from "@/components/upload-form-react-query"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Upload, Sparkles, Zap } from "lucide-react"

export default function UploadPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center animate-fade-in">
      <div className="w-full max-w-2xl space-y-8">
        {/* Enhanced Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-600">
              <Upload className="h-8 w-8" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Upload Audio
            </h1>
            <Sparkles className="h-6 w-6 text-yellow-500 animate-pulse" />
          </div>
          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            Transform your audio files into accurate transcriptions with our AI-powered processing
          </p>
        </div>

        {/* Features List */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="card-enhanced text-center p-4 hover:scale-105 transition-all duration-300">
            <div className="flex flex-col items-center gap-2">
              <div className="p-2 rounded-lg bg-green-100 text-green-600">
                <Zap className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold text-sm">Fast Processing</h3>
                <p className="text-xs text-muted-foreground">Lightning-fast AI transcription</p>
              </div>
            </div>
          </Card>
          
          <Card className="card-enhanced text-center p-4 hover:scale-105 transition-all duration-300">
            <div className="flex flex-col items-center gap-2">
              <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                <Upload className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold text-sm">Multiple Formats</h3>
                <p className="text-xs text-muted-foreground">MP3, WAV, M4A, and more</p>
              </div>
            </div>
          </Card>
          
          <Card className="card-enhanced text-center p-4 hover:scale-105 transition-all duration-300">
            <div className="flex flex-col items-center gap-2">
              <div className="p-2 rounded-lg bg-purple-100 text-purple-600">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold text-sm">High Accuracy</h3>
                <p className="text-xs text-muted-foreground">Powered by Whisper AI</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Upload Form */}
        <UploadFormReactQuery />
      </div>
    </div>
  )
}
