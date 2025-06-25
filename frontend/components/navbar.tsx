import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Headphones, Sparkles } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { NotificationCenter } from "@/components/notification-center"
import { SystemStatusIndicator } from "@/components/system-status-indicator"

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-sm">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="p-2 rounded-lg bg-gradient-to-br from-primary/10 to-secondary/10 text-primary group-hover:from-primary/20 group-hover:to-secondary/20 transition-all duration-300">
            <Headphones className="h-5 w-5" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              RRS Audio Transcriber
            </span>
            <Sparkles className="h-4 w-4 text-primary/60 animate-pulse" />
          </div>
        </Link>
        
        <div className="flex items-center gap-6">
          <nav className="flex gap-2">
            <Link href="/upload">
              <Button variant="ghost" className="btn-enhanced hover:bg-blue-50 hover:text-blue-700 transition-all duration-200">
                Upload
              </Button>
            </Link>
            <Link href="/transcriptions">
              <Button variant="ghost" className="btn-enhanced hover:bg-green-50 hover:text-green-700 transition-all duration-200">
                Transcriptions
              </Button>
            </Link>
            <Link href="/queue">
              <Button variant="ghost" className="btn-enhanced hover:bg-purple-50 hover:text-purple-700 transition-all duration-200">
                Queue Status
              </Button>
            </Link>
          </nav>
          
          <div className="flex items-center gap-3 pl-2 border-l border-border/50">
            <SystemStatusIndicator />
            <NotificationCenter />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  )
}
