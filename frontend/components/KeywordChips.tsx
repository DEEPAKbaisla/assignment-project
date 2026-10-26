"use client";

/** Matched (green) and missing (amber) keyword chips with the honesty note. */

import type { ReactNode } from "react";
import { Info, Sparkles, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";

interface KeywordChipsProps {
  matched: string[];
  missing: string[];
}

function ChipGroup({
  title,
  icon,
  keywords,
  className,
}: {
  title: string;
  icon: ReactNode;
  keywords: string[];
  className: string;
}) {
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {title} ({keywords.length})
      </p>
      {keywords.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {keywords.map((keyword) => (
            <li key={keyword}>
              <Badge variant="outline" className={className}>
                {keyword}
              </Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">None found.</p>
      )}
    </div>
  );
}

export function KeywordChips({ matched, missing }: KeywordChipsProps) {
  return (
    <div className="space-y-4">
      <ChipGroup
        title="Matched keywords"
        icon={<Sparkles className="size-3.5 text-emerald-600 dark:text-emerald-400" />}
        keywords={matched}
        className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      />
      <ChipGroup
        title="Missing keywords"
        icon={<TriangleAlert className="size-3.5 text-amber-600 dark:text-amber-400" />}
        keywords={missing}
        className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
      />
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
        Missing keywords are suggestions only - add them only if they are true
        for you. Never claim skills you do not have.
      </p>
    </div>
  );
}
