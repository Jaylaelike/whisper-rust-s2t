import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { QueueOverview } from "@/components/queue-overview"
import Link from "next/link"
import { ArrowRight, FileAudio, ListMusic, Activity, TrendingUp, Sparkles } from "lucide-react"

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto py-8 space-y-12">
        {/* Enhanced Hero Section */}
        <div className="flex flex-col items-center justify-center animate-fade-in">
          <Card className="w-full max-w-4xl card-enhanced shadow-2xl border-0 bg-gradient-to-br from-white/80 via-white/90 to-white/80 backdrop-blur-xl">
            {/* Hero Header with Gradient Background */}
            <CardHeader className="text-center space-y-6 bg-gradient-to-br from-primary/5 via-secondary/5 to-background rounded-t-xl border-b border-border/30">
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-3">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 text-primary">
                    <Sparkles className="h-8 w-8" />
                  </div>
                  <CardTitle className="text-4xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                    RRS Audio Transcriber
                  </CardTitle>
                </div>
                <CardDescription className="text-lg text-muted-foreground/80 max-w-2xl mx-auto leading-relaxed">
                  Upload your audio files and get accurate transcriptions with our modern, real-time queue-based system powered by Whisper AI
                </CardDescription>
              </div>
            </CardHeader>
            
            <CardContent className="p-8 space-y-8">
              {/* Enhanced Action Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Link href="/upload" className="w-full group">
                  <Card className="h-full card-enhanced hover:scale-105 transition-all duration-300 border-blue-200/50 hover:border-blue-300/50 bg-gradient-to-br from-blue-50/50 to-white">
                    <CardContent className="flex flex-col items-center justify-center gap-4 p-8 text-center">
                      <div className="p-4 rounded-xl bg-blue-100 text-blue-600 group-hover:bg-blue-200 transition-colors duration-300">
                        <FileAudio className="h-8 w-8" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="font-semibold text-lg text-blue-700">Upload Audio</h3>
                        <p className="text-sm text-muted-foreground">Start transcribing your audio files</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
                
                <Link href="/transcriptions" className="w-full group">
                  <Card className="h-full card-enhanced hover:scale-105 transition-all duration-300 border-green-200/50 hover:border-green-300/50 bg-gradient-to-br from-green-50/50 to-white">
                    <CardContent className="flex flex-col items-center justify-center gap-4 p-8 text-center">
                      <div className="p-4 rounded-xl bg-green-100 text-green-600 group-hover:bg-green-200 transition-colors duration-300">
                        <ListMusic className="h-8 w-8" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="font-semibold text-lg text-green-700">View Transcriptions</h3>
                        <p className="text-sm text-muted-foreground">Browse your completed transcriptions</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
                
                <Link href="/queue" className="w-full group">
                  <Card className="h-full card-enhanced hover:scale-105 transition-all duration-300 border-purple-200/50 hover:border-purple-300/50 bg-gradient-to-br from-purple-50/50 to-white">
                    <CardContent className="flex flex-col items-center justify-center gap-4 p-8 text-center">
                      <div className="p-4 rounded-xl bg-purple-100 text-purple-600 group-hover:bg-purple-200 transition-colors duration-300">
                        <Activity className="h-8 w-8" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="font-semibold text-lg text-purple-700">Queue Status</h3>
                        <p className="text-sm text-muted-foreground">Monitor real-time processing</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </div>
              
              {/* Enhanced CTA Button */}
              <div className="flex justify-center">
                <Link href="/upload" className="w-full max-w-md">
                  <Button className="w-full h-14 text-lg btn-enhanced bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 shadow-lg hover:shadow-xl transition-all duration-300">
                    <Sparkles className="mr-3 h-5 w-5" />
                    Get Started Now
                    <ArrowRight className="ml-3 h-5 w-5 group-hover:translate-x-1 transition-transform duration-300" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Enhanced Queue Overview Section */}
        <div className="animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <div className="flex items-center justify-between mb-8">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <TrendingUp className="h-6 w-6" />
                </div>
                Live Queue Status
              </h2>
              <p className="text-muted-foreground">
                Real-time monitoring of your transcription queue with live updates
              </p>
            </div>
            <Link href="/queue">
              <Button variant="outline" className="btn-enhanced hover:shadow-lg">
                View Details
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
          <QueueOverview />
        </div>
      </div>
    </div>
  )
}
