import type React from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import Navbar from "@/components/navbar";
import { Kanit } from "next/font/google";
import { Providers } from "@/lib/providers";
import { LoadingProvider } from "@/contexts/loading-context";
import { AppWithSplash } from "@/components/app-with-splash";
const inter = Inter({ subsets: ["latin"] });

// Configure Google font Kanit for Thai
const kanit = Kanit({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"], // common weights
  variable: "--font-kanit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "RRS Audio Transcriber",
  description: "Transcribe your audio files with ease",
  generator: "v0.dev",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${kanit.className} antialiased`} suppressHydrationWarning>
        <Providers>
          <LoadingProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
            >
              <AppWithSplash>
                {/* Background gradient overlay */}
                <div className="fixed inset-0 -z-10 bg-gradient-to-br from-background via-background to-muted/10" />
                <div className="fixed inset-0 -z-10 bg-grid-pattern opacity-[0.02]" />
                
                <div className="relative min-h-screen flex flex-col">
                  <Navbar />
                  <main className="flex-1 container mx-auto py-6 px-4 animate-fade-in">
                    {children}
                  </main>
                  
                  {/* Subtle footer */}
                  <footer className="border-t border-border/40 bg-muted/20 py-4">
                    <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
                      <p>© 2024 RRS Audio Transcriber. Powered by Whisper AI</p>
                    </div>
                  </footer>
                </div>
              </AppWithSplash>
            </ThemeProvider>
          </LoadingProvider>
        </Providers>
      </body>
    </html>
  );
}
