import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"

export default function TranscriptionLoading() {
  return (
    <div className="container mx-auto py-6">
      <div className="flex flex-col space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-1/3" />
          <Skeleton className="h-6 w-24" />
        </div>

        <Skeleton className="h-4 w-1/2" />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column: Video/Image and Audio Player */}
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="aspect-video w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>

          {/* Right column: Transcript */}
          <div className="lg:col-span-1">
            <Card>
              <CardContent className="p-0">
                <div className="p-4 border-b">
                  <Skeleton className="h-6 w-24" />
                </div>
                <div className="p-4 space-y-4">
                  {Array(8)
                    .fill(0)
                    .map((_, i) => (
                      <div key={i} className="space-y-2">
                        <div className="flex justify-between">
                          <Skeleton className="h-3 w-10" />
                          <Skeleton className="h-3 w-8" />
                        </div>
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
    </div>
  )
}
