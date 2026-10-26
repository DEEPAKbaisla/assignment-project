/** Pure formatting + file-download helpers (no React, no network). */

import type { CustomizedResume } from "./types";

export const DOCX_FILENAME = "customized_resume.docx";
export const TXT_FILENAME = "customized_resume.txt";

/** Human readable file size, e.g. 512 -> "512 B", 1_536_000 -> "1.5 MB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

/** Render a structured resume as the plain text used for the .txt download. */
export function resumeToPlainText(resume: CustomizedResume): string {
  const lines: string[] = [];

  if (resume.summary.trim()) {
    lines.push("SUMMARY", resume.summary.trim(), "");
  }

  if (resume.skills.length > 0) {
    lines.push("SKILLS", resume.skills.join(" | "), "");
  }

  if (resume.experience.length > 0) {
    lines.push("EXPERIENCE");
    for (const job of resume.experience) {
      const heading = [job.title, job.company].filter(Boolean).join(" - ");
      const meta = job.duration.trim() ? ` (${job.duration.trim()})` : "";
      lines.push(`${heading}${meta}`);
      for (const bullet of job.bullets) {
        lines.push(`  - ${bullet}`);
      }
      lines.push("");
    }
  }

  if (resume.projects.length > 0) {
    lines.push("PROJECTS");
    for (const project of resume.projects) {
      lines.push(project.name);
      for (const bullet of project.bullets) {
        lines.push(`  - ${bullet}`);
      }
      lines.push("");
    }
  }

  if (resume.education.length > 0) {
    lines.push("EDUCATION");
    for (const entry of resume.education) {
      lines.push(`  - ${entry}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

/** Trigger a browser download for an in-memory Blob. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** Convenience: turn text into a .txt download. */
export function saveTextFile(content: string, filename: string): void {
  saveBlob(new Blob([content], { type: "text/plain;charset=utf-8" }), filename);
}

/** Open the print dialog; the browser's "Save as PDF" produces the PDF export. */
export function printResume(): void {
  window.print();
}
