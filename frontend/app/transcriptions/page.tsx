"use client"

import { TranscriptionsListNew } from "@/components/transcriptions-list-react-query"
import { Button } from "@/components/ui/button"
import { Activity, Upload, FileText, Sparkles } from "lucide-react"
import Link from "next/link"

export default function TranscriptionsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/10">
      <div className="container mx-auto py-8 space-y-8 animate-fade-in">
        {/* Enhanced Header */}
        <div className="relative p-6 rounded-2xl bg-gradient-to-br from-green-50/50 via-background to-emerald-50/20 border border-border/50 backdrop-blur-sm">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent rounded-2xl" />
          <div className="relative flex justify-between items-center">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-gradient-to-br from-green-100 to-emerald-100 text-green-600">
                  <FileText className="h-7 w-7" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                    Transcriptions
                  </h1>
                  <p className="text-muted-foreground/80 text-lg mt-1">
                    View, search, and manage all your completed transcriptions
                  </p>
                </div>
                <Sparkles className="h-6 w-6 text-yellow-500 animate-pulse" />
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <Link href="/queue">
                <Button 
                  variant="outline" 
                  className="btn-enhanced hover:bg-purple-50 hover:text-purple-700 hover:border-purple-200 transition-all duration-300"
                >
                  <Activity className="h-4 w-4 mr-2" />
                  Queue Status
                </Button>
              </Link>
              <Link href="/upload">
                <Button className="btn-enhanced bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 shadow-colored-success hover:shadow-xl transition-all duration-300">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Audio
                </Button>
              </Link>
            </div>
          </div>
        </div>
        
        {/* Transcriptions List */}
        <div className="animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <TranscriptionsListNew />
        </div>
      </div>
    </div>
  )
}
