"use client"

import { TranscriptionsListNew } from "@/components/transcriptions-list-react-query"
import { Button } from "@/components/ui/button"
import { Activity, Upload } from "lucide-react"
import Link from "next/link"

export default function TranscriptionsPage() {
  return (
    <div className="container mx-auto py-6 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Transcriptions</h1>
          <p className="text-muted-foreground mt-2">
            View and manage all completed transcriptions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/queue">
            <Button variant="outline" className="gap-2">
              <Activity className="h-4 w-4" />
              Queue Status
            </Button>
          </Link>
          <Link href="/upload">
            <Button className="gap-2">
              <Upload className="h-4 w-4" />
              Upload Audio
            </Button>
          </Link>
        </div>
      </div>
      
      {/* Transcriptions List */}
      <TranscriptionsListNew />
    </div>
  )
}
