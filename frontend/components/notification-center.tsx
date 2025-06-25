"use client"

import { useEffect, useState } from "react"
import { Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import Link from "next/link"

type Notification = {
  id: string
  title: string
  message: string
  status: string
  read: boolean
  timestamp: Date
  jobId: string
}

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  // Fetch all transcriptions to check for status changes
  const { data: responseData } = useQuery({
    queryKey: ["transcriptions"],
    queryFn: async () => {
      const response = await fetch("/api/transcriptions")
      if (!response.ok) {
        throw new Error("Failed to fetch transcriptions")
      }
      return response.json()
    },
    refetchInterval: 10000, // Refetch every 10 seconds
  })

  const transcriptions = responseData?.transcriptions || []

  // Track previous statuses to detect changes
  const [prevStatuses, setPrevStatuses] = useState<Record<string, string>>({})

  useEffect(() => {
    if (transcriptions) {
      const newNotifications: Notification[] = []
      const newStatuses: Record<string, string> = {}

      transcriptions.forEach((job: any) => {
        newStatuses[job.id] = job.status

        // If we have a previous status and it's different, create a notification
        if (prevStatuses[job.id] && prevStatuses[job.id] !== job.status) {
          const notification: Notification = {
            id: `${job.id}-${Date.now()}`,
            title: "Transcription Status Update",
            message: `"${job.title}" is now ${job.status}`,
            status: job.status,
            read: false,
            timestamp: new Date(),
            jobId: job.id,
          }

          newNotifications.push(notification)

          // Show toast for status changes
          toast(notification.title, {
            description: notification.message,
            action: {
              label: "View",
              onClick: () => (window.location.href = `/transcriptions/${job.id}`),
            },
          })
        }
      })

      // Update notifications
      if (newNotifications.length > 0) {
        setNotifications((prev) => [...newNotifications, ...prev].slice(0, 10))
      }

      // Update previous statuses
      setPrevStatuses(newStatuses)
    }
  }, [transcriptions])

  // Calculate unread count
  useEffect(() => {
    setUnreadCount(notifications.filter((n) => !n.read).length)
  }, [notifications])

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnreadCount(0)
  }

  const markAsRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    setUnreadCount((prev) => Math.max(0, prev - 1))
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "success"
      case "processing":
        return "warning"
      case "failed":
        return "destructive"
      default:
        return "secondary"
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative btn-enhanced hover:bg-muted/50 transition-all duration-200">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-r from-red-500 to-pink-500 text-xs text-white font-semibold animate-pulse shadow-colored-error">
              {unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 card-enhanced border-0 shadow-2xl bg-background/95 backdrop-blur-xl">
        <DropdownMenuLabel className="flex items-center justify-between p-4 border-b border-border/50 bg-muted/20">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <span className="font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-xs bg-primary/10 text-primary">
                {unreadCount} new
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={markAllAsRead} 
              className="h-auto py-1 px-2 text-xs btn-enhanced hover:bg-primary/10 hover:text-primary"
            >
              Mark all read
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <div className="py-8 text-center">
            <div className="flex flex-col items-center gap-2">
              <div className="p-3 rounded-full bg-muted/50">
                <Bell className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No notifications</p>
              <p className="text-xs text-muted-foreground/60">You're all caught up!</p>
            </div>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {notifications.map((notification, index) => (
              <DropdownMenuItem 
                key={notification.id} 
                className="cursor-pointer p-0 focus:bg-muted/30" 
                asChild
              >
                <Link 
                  href={`/transcriptions/${notification.jobId}`} 
                  onClick={() => markAsRead(notification.id)}
                  className="block"
                >
                  <div className={`p-4 border-b border-border/30 transition-all duration-200 hover:bg-muted/20 ${
                    notification.read ? "opacity-60" : "bg-primary/5"
                  } ${index === 0 ? "animate-fade-in" : ""}`}>
                    <div className="flex items-start justify-between mb-2">
                      <span className="font-medium text-sm text-foreground">{notification.title}</span>
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant={getStatusColor(notification.status)} 
                          className={`text-xs ${
                            notification.status === 'completed' ? 'status-completed' :
                            notification.status === 'processing' ? 'status-processing' :
                            notification.status === 'failed' ? 'status-failed' : 'status-pending'
                          }`}
                        >
                          {notification.status}
                        </Badge>
                        {!notification.read && (
                          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{notification.message}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground/80">
                        {new Date(notification.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="text-xs text-primary/60 hover:text-primary transition-colors duration-200">
                        View details →
                      </span>
                    </div>
                  </div>
                </Link>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
