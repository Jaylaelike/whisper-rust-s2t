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
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs text-white">
              {unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllAsRead} className="h-auto py-1 px-2 text-xs">
              Mark all as read
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">No notifications</div>
        ) : (
          notifications.map((notification) => (
            <DropdownMenuItem key={notification.id} className="cursor-pointer" asChild>
              <Link href={`/transcriptions/${notification.jobId}`} onClick={() => markAsRead(notification.id)}>
                <div className={`flex flex-col gap-1 w-full ${notification.read ? "opacity-70" : ""}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{notification.title}</span>
                    <Badge variant={getStatusColor(notification.status)} className="text-xs">
                      {notification.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{notification.message}</p>
                  <span className="text-xs text-muted-foreground">
                    {new Date(notification.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </Link>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
