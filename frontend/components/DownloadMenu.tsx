"use client";

/** Export menu: .txt, PDF (print dialog), .docx (backend export). */

import { useState } from "react";
import { Download, FileText, FileType2, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ApiError, exportDocx, toApiError } from "@/lib/api";
import {
  DOCX_FILENAME,
  printResume,
  resumeToPlainText,
  saveBlob,
  saveTextFile,
  TXT_FILENAME,
} from "@/lib/format";
import type { CustomizedResume } from "@/lib/types";

interface DownloadMenuProps {
  resume: CustomizedResume;
  /** Defaults to window.print(); the page passes a version that switches tabs first. */
  onPrint?: () => void;
  disabled?: boolean;
}

export function DownloadMenu({ resume, onPrint, disabled }: DownloadMenuProps) {
  const [exporting, setExporting] = useState(false);

  const downloadDocx = (): void => {
    setExporting(true);
    exportDocx(resume)
      .then((blob) => {
        saveBlob(blob, DOCX_FILENAME);
        toast.success("Word document downloaded");
      })
      .catch((caught: unknown) => {
        const error: ApiError = toApiError(caught);
        toast.error(error.message);
      })
      .finally(() => setExporting(false));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" disabled={disabled || exporting}>
          {exporting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Download className="size-4" aria-hidden />
          )}
          Download
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Export your resume</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem
          onSelect={() => {
            saveTextFile(resumeToPlainText(resume), TXT_FILENAME);
            toast.success("Plain text downloaded");
          }}
        >
          <FileText className="size-4" aria-hidden />
          <span className="flex flex-col">
            <span>Plain text</span>
            <span className="text-xs text-muted-foreground">.txt - paste into any editor</span>
          </span>
        </DropdownMenuItem>

        <DropdownMenuItem onSelect={() => (onPrint ?? printResume)()}>
          <Printer className="size-4" aria-hidden />
          <span className="flex flex-col">
            <span>PDF</span>
            <span className="text-xs text-muted-foreground">
              opens the print dialog - choose &quot;Save as PDF&quot;
            </span>
          </span>
        </DropdownMenuItem>

        <DropdownMenuItem onSelect={downloadDocx} disabled={exporting}>
          {exporting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <FileType2 className="size-4" aria-hidden />
          )}
          <span className="flex flex-col">
            <span>Word document</span>
            <span className="text-xs text-muted-foreground">.docx - built by the backend</span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
