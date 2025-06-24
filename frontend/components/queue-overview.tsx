"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Activity, Clock, Cpu, CheckCircle, AlertTriangle, TrendingUp } from "lucide-react"

interface QueueOverviewStats {
  activeTasks: number
  queueLength: number
  completedToday: number
  failedToday: number
  avgProcessingTime: number
  backendLoad: 'low' | 'medium' | 'high'
  totalProcessed: number
}

export function QueueOverview() {
  const [stats, setStats] = useState<QueueOverviewStats>({
    activeTasks: 0,
    queueLength: 0,
    completedToday: 0,
    failedToday: 0,
    avgProcessingTime: 0,
    backendLoad: 'low',
    totalProcessed: 0
  })
  const [isLoading, setIsLoading] = useState(true)

  const fetchQueueStats = async () => {
    try {
      // Fetch basic queue stats
      const queueResponse = await fetch('http://localhost:8000/api/queue/stats')
      let queueData = null
      if (queueResponse.ok) {
        queueData = await queueResponse.json()
      }

      // Fetch database stats for today
      const today = new Date().toISOString().split('T')[0]
      const dbResponse = await fetch(`/api/transcriptions?createdAfter=${today}`)
      let dbData = null
      if (dbResponse.ok) {
        dbData = await dbResponse.json()
      }

      // Calculate stats
      const transcriptions = dbData?.transcriptions || []
      const completedToday = transcriptions.filter((t: any) => t.queueStatus === 'completed').length
      const failedToday = transcriptions.filter((t: any) => t.queueStatus === 'failed').length
      const processingTimes = transcriptions
        .filter((t: any) => t.processingTimeMs)
        .map((t: any) => t.processingTimeMs)
      
      const avgProcessingTime = processingTimes.length > 0 
        ? processingTimes.reduce((a: number, b: number) => a + b, 0) / processingTimes.length / 1000
        : 0

      // Determine backend load based on queue length and active tasks
      const activeTasks = queueData?.queue_stats?.processing || 0
      const queueLength = queueData?.queue_stats?.pending || 0
      let backendLoad: 'low' | 'medium' | 'high' = 'low'
      
      if (activeTasks > 3 || queueLength > 10) {
        backendLoad = 'high'
      } else if (activeTasks > 1 || queueLength > 5) {
        backendLoad = 'medium'
      }

      setStats({
        activeTasks,
        queueLength,
        completedToday,
        failedToday,
        avgProcessingTime,
        backendLoad,
        totalProcessed: transcriptions.length
      })

    } catch (error) {
      console.error('Error fetching queue stats:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchQueueStats()
    
    // Refresh stats every 10 seconds
    const interval = setInterval(fetchQueueStats, 10000)
    return () => clearInterval(interval)
  }, [])

  const getLoadColor = (load: string) => {
    switch (load) {
      case 'high': return 'text-red-600'
      case 'medium': return 'text-yellow-600'
      default: return 'text-green-600'
    }
  }

  const getLoadBadge = (load: string) => {
    switch (load) {
      case 'high': return <Badge variant="destructive">High</Badge>
      case 'medium': return <Badge variant="secondary">Medium</Badge>
      default: return <Badge variant="default">Low</Badge>
    }
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            </CardHeader>
            <CardContent className="animate-pulse">
              <div className="h-8 bg-gray-200 rounded w-1/2"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
      {/* Active Tasks */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Active Tasks</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.activeTasks}</div>
          <p className="text-xs text-muted-foreground">
            Currently processing
          </p>
          {stats.activeTasks > 0 && (
            <Progress value={(stats.activeTasks / 5) * 100} className="mt-2" />
          )}
        </CardContent>
      </Card>

      {/* Queue Length */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Queue Length</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.queueLength}</div>
          <p className="text-xs text-muted-foreground">
            Tasks waiting
          </p>
          {stats.queueLength > 0 && (
            <div className="text-xs text-blue-600 mt-1">
              Est. {Math.ceil(stats.queueLength * stats.avgProcessingTime / 60)}min wait
            </div>
          )}
        </CardContent>
      </Card>

      {/* Backend Load */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Backend Load</CardTitle>
          <Cpu className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {getLoadBadge(stats.backendLoad)}
          </div>
          <p className="text-xs text-muted-foreground">
            Current system load
          </p>
        </CardContent>
      </Card>

      {/* Today's Stats */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Today's Progress</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3 text-green-600" />
                <span className="text-sm">Completed</span>
              </div>
              <span className="text-sm font-bold">{stats.completedToday}</span>
            </div>
            {stats.failedToday > 0 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-red-600" />
                  <span className="text-sm">Failed</span>
                </div>
                <span className="text-sm font-bold">{stats.failedToday}</span>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Avg: {stats.avgProcessingTime.toFixed(1)}s per task
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
