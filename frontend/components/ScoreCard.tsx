"use client";

/** Before / after match score with Progress bars and the improvement delta. */

import type { ReactElement } from "react";
import { ArrowRight, TrendingUp } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface ScoreCardProps {
  before: number;
  after: number;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function ScoreRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "before" | "after";
}): ReactElement {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span
          className={cn(
            "text-lg font-semibold tabular-nums",
            tone === "after" && "text-emerald-600 dark:text-emerald-400",
          )}
        >
          {value}
          <span className="text-sm font-normal text-muted-foreground">%</span>
        </span>
      </div>
      <Progress
        value={value}
        aria-label={`${label} match score: ${value} percent`}
        className={cn(
          "h-2",
          tone === "before" && "[&_[data-slot=progress-indicator]]:bg-muted-foreground/40",
          tone === "after" && "[&_[data-slot=progress-indicator]]:bg-emerald-500",
        )}
      />
    </div>
  );
}

export function ScoreCard({ before, after }: ScoreCardProps) {
  const delta = clamp(after) - clamp(before);

  return (
    <div className="rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Job description match</h2>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
            delta > 0
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : delta < 0
                ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                : "bg-muted text-muted-foreground",
          )}
        >
          {delta > 0 ? <TrendingUp className="size-3.5" aria-hidden /> : null}
          {delta > 0 ? `+${delta}` : delta === 0 ? "No change" : delta}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-5">
        <ScoreRow label="Before" value={clamp(before)} tone="before" />
        <ArrowRight
          className="mx-auto size-4 text-muted-foreground max-sm:hidden"
          aria-hidden
        />
        <ScoreRow label="After" value={clamp(after)} tone="after" />
      </div>
    </div>
  );
}
