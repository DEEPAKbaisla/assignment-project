"use client";

/** Lazily generated cover letter with copy + download actions. */

import { Check, Copy, Download, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { saveTextFile } from "@/lib/format";
import { useCoverLetter } from "@/hooks/useCoverLetter";

interface CoverLetterPanelProps {
  jd: string;
  file: File | null;
  /** True once the user has opened this tab (triggers the first request). */
  active: boolean;
}

export function CoverLetterPanel({ jd, file, active }: CoverLetterPanelProps) {
  const { status, letter, error, retry } = useCoverLetter(jd, file, active);

  if (status === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="space-y-3 rounded-xl border bg-card p-6"
      >
        <span className="sr-only">Generating your cover letter...</span>
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-[92%]" />
        <Skeleton className="h-3 w-[85%]" />
        <Skeleton className="h-3 w-[95%]" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="space-y-3">
        <Alert variant="destructive">
          <AlertTitle>Cover letter failed</AlertTitle>
          <AlertDescription>{error?.message}</AlertDescription>
        </Alert>
        <Button type="button" variant="outline" size="sm" onClick={retry}>
          <RotateCcw className="size-4" />
          Try again
        </Button>
      </div>
    );
  }

  if (status !== "success") {
    return (
      <div className="rounded-xl border bg-muted/30 p-6 text-sm text-muted-foreground">
        Open this tab to generate a cover letter for the same job description and
        resume.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Tailored cover letter</h2>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard
                .writeText(letter)
                .then(() => toast.success("Cover letter copied to clipboard"))
                .catch(() => toast.error("Could not copy - select the text manually"));
            }}
          >
            <Copy className="size-4" />
            Copy
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              saveTextFile(letter, "customized_cover_letter.txt");
              toast.success("Cover letter downloaded");
            }}
          >
            <Download className="size-4" />
            Download .txt
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6">
        {letter.split(/\n{2,}/).map((paragraph, index) => (
          <p
            key={index}
            className="mb-4 text-sm leading-relaxed text-pretty last:mb-0"
          >
            {paragraph.trim()}
          </p>
        ))}
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Check className="size-3.5" aria-hidden />
        Generated from your resume and this job description - always personalize
        before sending.
      </p>
    </div>
  );
}
