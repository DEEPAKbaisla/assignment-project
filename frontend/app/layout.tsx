import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { FilePenLine } from "lucide-react";

import { ThemeToggle } from "@/components/ThemeToggle";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Resume Customizer - Tailor your resume to any job",
  description:
    "Paste a job description, upload your resume, and get a customized resume, keyword analysis, ATS tips, and a cover letter.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-dvh flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <a
            href="#main-content"
            className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm shadow-lg focus:not-sr-only focus:absolute focus:left-4 focus:top-4"
          >
            Skip to content
          </a>

          <header className="no-print border-b">
            <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <FilePenLine className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="text-base font-semibold leading-tight">
                    Resume Customizer
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Tailor your resume to any job description in seconds.
                  </p>
                </div>
              </div>
              <ThemeToggle />
            </div>
          </header>

          <main id="main-content" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
            {children}
          </main>

          <footer className="no-print mt-8 border-t">
            <div className="mx-auto w-full max-w-5xl px-4 py-5 text-xs text-muted-foreground sm:px-6">
              Your resume is processed in memory and not stored.
            </div>
          </footer>

          <Toaster position="bottom-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
