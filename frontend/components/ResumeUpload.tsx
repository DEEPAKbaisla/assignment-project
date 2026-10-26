"use client";

/** Drag-and-drop resume uploader (.pdf / .docx, max 5 MB) with keyboard support. */

import { useId, useRef, useState } from "react";
import { FileText, UploadCloud, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ACCEPTED_EXTENSIONS, validateResumeFile } from "@/lib/validation";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/format";

interface ResumeUploadProps {
  file: File | null;
  onSelect: (file: File) => void;
  onRemove: () => void;
  disabled?: boolean;
}

export function ResumeUpload({ file, onSelect, onRemove, disabled }: ResumeUploadProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const error = validateResumeFile(file);

  const openPicker = (): void => {
    if (!disabled) inputRef.current?.click();
  };

  const handleFiles = (files: FileList | null): void => {
    const next = files?.[0];
    if (next) onSelect(next);
  };

  if (file) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <FileText className="size-5 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            disabled={disabled}
            aria-label={`Remove ${file.name}`}
          >
            <X className="size-4" />
          </Button>
        </div>

        {error ? (
          <p role="alert" className="text-xs font-medium text-destructive">
            {error}
          </p>
        ) : null}

        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className="sr-only"
          accept={ACCEPTED_EXTENSIONS.join(",")}
          disabled={disabled}
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={openPicker}
          disabled={disabled}
          className="self-start text-xs font-medium text-primary underline-offset-4 hover:underline"
        >
          Choose a different file
        </button>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Upload your resume, PDF or DOCX, up to 5 MB"
      aria-disabled={disabled}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        openPicker();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openPicker();
        }
      }}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragging(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        handleFiles(event.dataTransfer.files);
      }}
      className={cn(
        "flex min-h-64 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-colors outline-none",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        dragging
          ? "border-primary bg-primary/5"
          : "border-border bg-muted/20 hover:border-primary/40 hover:bg-muted/40",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        className="sr-only"
        accept={ACCEPTED_EXTENSIONS.join(",")}
        disabled={disabled}
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = "";
        }}
      />

      <span className="flex size-12 items-center justify-center rounded-full bg-primary/10">
        <UploadCloud className="size-6 text-primary" aria-hidden />
      </span>

      <div className="space-y-1">
        <p className="text-sm font-medium">
          Drag and drop your resume here, or{" "}
          <span className="text-primary underline underline-offset-4">browse</span>
        </p>
        <p className="text-xs text-muted-foreground">
          Accepts .pdf and .docx only - up to 5 MB
        </p>
      </div>
    </div>
  );
}
