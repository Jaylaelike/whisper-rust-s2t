"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Card, CardContent } from "@/components/ui/card"
import { Play, Pause, Volume2, VolumeX, RotateCcw, SkipBack, SkipForward } from "lucide-react"
import { cn } from "@/lib/utils"

interface Segment {
  id: number
  start: number
  end: number
  text: string
}

interface AudioPlayerProps {
  src: string
  title?: string
  className?: string
  transcript?: {
    segments: Segment[]
  }
  onSegmentClick?: (segment: Segment) => void
}

export function AudioPlayer({ src, title, className, transcript, onSegmentClick }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentSegment, setCurrentSegment] = useState<Segment | null>(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleLoadedMetadata = () => {
      setDuration(audio.duration)
      setIsLoading(false)
    }

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
      
      // Find current segment based on current time
      if (transcript?.segments) {
        const current = transcript.segments.find(
          segment => audio.currentTime >= segment.start && audio.currentTime <= segment.end
        )
        setCurrentSegment(current || null)
      }
    }

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
    }

    const handleError = () => {
      setError("Failed to load audio file")
      setIsLoading(false)
    }

    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
    }
  }, [])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.pause()
    } else {
      audio.play()
    }
  }

  const handleSeek = (value: number[]) => {
    const audio = audioRef.current
    if (!audio) return

    const newTime = value[0]
    audio.currentTime = newTime
    setCurrentTime(newTime)
  }

  const handleVolumeChange = (value: number[]) => {
    const audio = audioRef.current
    if (!audio) return

    const newVolume = value[0]
    setVolume(newVolume)
    audio.volume = newVolume
    setIsMuted(newVolume === 0)
  }

  const toggleMute = () => {
    const audio = audioRef.current
    if (!audio) return

    if (isMuted) {
      audio.volume = volume
      setIsMuted(false)
    } else {
      audio.volume = 0
      setIsMuted(true)
    }
  }

  const skipBackward = () => {
    const audio = audioRef.current
    if (!audio) return

    audio.currentTime = Math.max(0, audio.currentTime - 10)
  }

  const skipForward = () => {
    const audio = audioRef.current
    if (!audio) return

    audio.currentTime = Math.min(duration, audio.currentTime + 10)
  }

  const reset = () => {
    const audio = audioRef.current
    if (!audio) return

    audio.currentTime = 0
    setCurrentTime(0)
    if (isPlaying) {
      audio.pause()
    }
  }

  const jumpToSegment = (segment: Segment) => {
    const audio = audioRef.current
    if (!audio) return

    audio.currentTime = segment.start
    setCurrentTime(segment.start)
    setCurrentSegment(segment)
    
    if (onSegmentClick) {
      onSegmentClick(segment)
    }
  }

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00"
    
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-destructive">
            <VolumeX className="h-4 w-4" />
            <span className="text-sm">{error}</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardContent className="p-4">
        <audio ref={audioRef} src={src} preload="metadata" />
        
        {title && (
          <div className="mb-4">
            <h3 className="font-medium text-sm truncate">{title}</h3>
          </div>
        )}

        <div className="space-y-4">
          {/* Progress Bar */}
          <div className="space-y-2">
            <Slider
              value={[currentTime]}
              max={duration || 100}
              step={1}
              onValueChange={handleSeek}
              disabled={isLoading}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={skipBackward}
                disabled={isLoading}
                className="h-8 w-8 p-0"
              >
                <SkipBack className="h-4 w-4" />
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={togglePlay}
                disabled={isLoading}
                className="h-8 w-8 p-0"
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={skipForward}
                disabled={isLoading}
                className="h-8 w-8 p-0"
              >
                <SkipForward className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={reset}
                disabled={isLoading}
                className="h-8 w-8 p-0"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>

            {/* Volume Control */}
            <div className="flex items-center gap-2 w-24">
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleMute}
                className="h-8 w-8 p-0"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </Button>
              <Slider
                value={[isMuted ? 0 : volume]}
                max={1}
                step={0.1}
                onValueChange={handleVolumeChange}
                className="flex-1"
              />
            </div>
          </div>

          {/* Transcript Segments */}
          {transcript?.segments && transcript.segments.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Transcript</h4>
              <div className="max-h-40 overflow-y-auto space-y-1 p-2 bg-muted/30 rounded-lg">
                {transcript.segments.map((segment) => (
                  <div
                    key={segment.id}
                    onClick={() => jumpToSegment(segment)}
                    className={cn(
                      "p-2 rounded text-sm cursor-pointer transition-all duration-200 hover:bg-muted",
                      currentSegment?.id === segment.id
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "hover:bg-muted/60"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-muted-foreground min-w-[50px] font-mono">
                        {formatTime(segment.start)}
                      </span>
                      <span className="flex-1">{segment.text}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
