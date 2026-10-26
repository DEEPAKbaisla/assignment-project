"use client";

/** Skeleton of the result area + rotating status text while the LLM runs. */

import { useEffect, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";

const STATUS_MESSAGES = [
  "Reading your resume...",
  "Analyzing the job description...",
  "Tailoring your resume...",
] as const;

const ROTATE_EVERY_MS = 2_200;

export function LoadingState() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((current) => (current + 1) % STATUS_MESSAGES.length);
    }, ROTATE_EVERY_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-busy="true">
      <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <span className="size-2 animate-ping rounded-full bg-primary" aria-hidden />
        {STATUS_MESSAGES[index]}
        <span className="sr-only">
          This can take up to a minute for long resumes.
        </span>
      </p>

      <div className="rounded-xl border bg-card p-5">
        <Skeleton className="mb-4 h-4 w-40" />
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-2 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-2 w-full" />
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border bg-card p-5">
        <div className="flex gap-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-7 w-24" />
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}
