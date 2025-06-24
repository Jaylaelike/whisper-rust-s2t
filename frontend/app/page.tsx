import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { QueueOverview } from "@/components/queue-overview"
import Link from "next/link"
import { ArrowRight, FileAudio, ListMusic, Activity, TrendingUp } from "lucide-react"

export default function Home() {
  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex flex-col items-center justify-center">
        <Card className="w-full max-w-3xl">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl">RRS Audio Transcriber</CardTitle>
            <CardDescription>Upload your audio files and get accurate transcriptions with our modern queue-based system</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link href="/upload" className="w-full">
                <Button variant="outline" className="w-full h-32 flex flex-col gap-2">
                  <FileAudio className="h-8 w-8" />
                  <span>Upload Audio</span>
                </Button>
              </Link>
              <Link href="/transcriptions" className="w-full">
                <Button variant="outline" className="w-full h-32 flex flex-col gap-2">
                  <ListMusic className="h-8 w-8" />
                  <span>View Transcriptions</span>
                </Button>
              </Link>
              <Link href="/queue" className="w-full">
                <Button variant="outline" className="w-full h-32 flex flex-col gap-2">
                  <Activity className="h-8 w-8" />
                  <span>Queue Status</span>
                </Button>
              </Link>
            </div>
            <Link href="/upload">
              <Button className="w-full">
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
      
      {/* Queue Overview Section */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">System Overview</h2>
            <p className="text-muted-foreground">Current status of transcription services</p>
          </div>
          <Link href="/queue">
            <Button variant="outline" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              View Details
            </Button>
          </Link>
        </div>
        <QueueOverview />
      </div>
    </div>
  )
}
