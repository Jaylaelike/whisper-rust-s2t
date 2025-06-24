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
      <body className={kanit.className} suppressHydrationWarning>
        <Providers>
          <LoadingProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
            >
              <AppWithSplash>
                <Navbar />
                <main className="container mx-auto py-6 px-4">{children}</main>
              </AppWithSplash>
            </ThemeProvider>
          </LoadingProvider>
        </Providers>
      </body>
    </html>
  );
}
