import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Headphones } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { NotificationCenter } from "@/components/notification-center"
import { SystemStatusIndicator } from "@/components/system-status-indicator"

export default function Navbar() {
  return (
    <header className="border-b">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <Headphones className="h-6 w-6" />
          <span className="text-xl font-bold">RRS Audio Transcriber</span>
        </Link>
        <div className="flex items-center gap-4">
          <nav className="flex gap-4">
            <Link href="/upload">
              <Button variant="ghost">Upload</Button>
            </Link>
            <Link href="/transcriptions">
              <Button variant="ghost">Transcriptions</Button>
            </Link>
            <Link href="/queue">
              <Button variant="ghost">Queue Status</Button>
            </Link>
          </nav>
          <SystemStatusIndicator />
          <NotificationCenter />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
