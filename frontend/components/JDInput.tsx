"use client";

/** Job description textarea with live counter and inline validation. */

import { AlertCircle } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MAX_JD_CHARS, MIN_JD_CHARS, validateJd } from "@/lib/validation";

interface JDInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function JDInput({ value, onChange, disabled }: JDInputProps) {
  const error = validateJd(value);
  const count = value.length;
  const approachingLimit = count >= MAX_JD_CHARS * 0.9;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="job-description">Job description</Label>
        <span
          aria-live="polite"
          className={cn(
            "text-xs tabular-nums text-muted-foreground transition-colors",
            approachingLimit && !error && "text-amber-600 dark:text-amber-400",
            error && "text-destructive",
          )}
        >
          {count.toLocaleString()} / {MAX_JD_CHARS.toLocaleString()}
        </span>
      </div>

      <Textarea
        id="job-description"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder="Paste the full job posting here: role, responsibilities, requirements, nice-to-haves..."
        className="min-h-64 resize-y"
        spellCheck
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "jd-error" : "jd-hint"}
      />

      <p id="jd-hint" className="text-xs text-muted-foreground">
        Minimum {MIN_JD_CHARS.toLocaleString()} characters - the more detail you
        paste, the better the tailoring.
      </p>

      {error ? (
        <p
          id="jd-error"
          role="alert"
          className="flex items-start gap-1.5 text-xs font-medium text-destructive"
        >
          <AlertCircle className="mt-px size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
