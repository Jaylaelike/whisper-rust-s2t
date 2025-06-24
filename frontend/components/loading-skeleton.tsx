"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("animate-pulse rounded-md bg-muted", className)} />
  )
}

export function TranscriptionListSkeleton() {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[30px]"></TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Audio File</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead>Risk</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, index) => (
            <TableRow key={index}>
              <TableCell>
                <Skeleton className="h-4 w-4" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-32" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-40" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-6 w-20 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-24" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-24" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-6 w-20 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-8 w-24 rounded-md" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function TranscriptionDetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-64" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      </div>

      {/* Risk Detection Card */}
      <Card className="border-l-4 border-l-orange-400">
        <CardContent className="p-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-64" />
              </div>
              <Skeleton className="h-8 w-32 rounded-md" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Description */}
      <Skeleton className="h-4 w-full" />

      {/* Meta info */}
      <div className="flex flex-col sm:flex-row gap-4">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-48" />
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Audio Player */}
        <div className="lg:col-span-2 space-y-4">
          <div className="p-4 border rounded-lg">
            <Skeleton className="h-12 w-full rounded-md" />
          </div>
        </div>

        {/* Transcript */}
        <div className="lg:col-span-1">
          <Card className="h-full">
            <CardContent className="p-0">
              <div className="p-4 border-b bg-muted/50">
                <Skeleton className="h-6 w-24" />
              </div>
              <div className="p-4 space-y-4">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div key={index} className="space-y-2">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export function QueueProgressSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-5" />
                <Skeleton className="h-6 w-32" />
              </div>
              <Skeleton className="h-4 w-48" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-24 rounded-md" />
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          </div>

          {/* Queue Stats */}
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-16" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>

          {/* Server Status */}
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
            <Skeleton className="h-3 w-32" />
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}