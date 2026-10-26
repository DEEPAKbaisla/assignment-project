/**
 * Client-side validation mirroring the backend rules so most errors never hit
 * the server (backend/app/config.py: MIN=100, MAX=15000 chars, MAX_FILE=5MB).
 */

export const MIN_JD_CHARS = 100;
export const MAX_JD_CHARS = 15_000;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Only these extensions (and magic bytes) are accepted by the backend. */
export const ACCEPTED_EXTENSIONS = [".pdf", ".docx"] as const;

/** Validate the job description. Returns a message, or null when valid. */
export function validateJd(jd: string): string | null {
  const text = jd.trim();
  if (text.length === 0) return null; // Empty is handled by the submit button state.
  if (text.length < MIN_JD_CHARS) {
    return `Job description is too short (${text.length.toLocaleString()} characters). Minimum is ${MIN_JD_CHARS.toLocaleString()}.`;
  }
  if (text.length > MAX_JD_CHARS) {
    return `Job description is too long (${text.length.toLocaleString()} characters). Maximum is ${MAX_JD_CHARS.toLocaleString()}.`;
  }
  return null;
}

/** True when the job description alone would be accepted by the backend. */
export function isJdValid(jd: string): boolean {
  const text = jd.trim();
  return text.length >= MIN_JD_CHARS && text.length <= MAX_JD_CHARS;
}

/** Validate the resume upload. Returns a message, or null when valid. */
export function validateResumeFile(file: File | null): string | null {
  if (!file) return null;
  const lower = file.name.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return `"${file.name}" is not supported. Please upload a .pdf or .docx file.`;
  }
  if (file.size === 0) {
    return "That file is empty. Please upload a valid resume.";
  }
  if (file.size > MAX_FILE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return `File is too large (${sizeMb} MB). Maximum allowed is 5 MB.`;
  }
  return null;
}

/** True when a File would be accepted by the backend. */
export function isResumeFileValid(file: File): boolean {
  return validateResumeFile(file) === null;
}
