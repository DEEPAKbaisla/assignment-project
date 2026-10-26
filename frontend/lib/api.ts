/**
 * Typed fetch wrappers for the Resume Customizer backend.
 *
 * - Reads the base URL from NEXT_PUBLIC_API_URL (never hardcoded elsewhere).
 * - Enforces a 5-minute client timeout with AbortController.
 * - Turns HTTP `{"detail": "..."}` payloads, network failures, and timeouts
 *   into a single `ApiError` the UI can render in a destructive Alert.
 */

import type {
  CoverLetterResponse,
  CustomizedResume,
  CustomizeResponse,
  SectionKey,
} from "./types";

/** Base URL of the FastAPI backend, without a trailing slash. */
export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
).replace(/\/+$/, "");

/**
 * Hard client-side limit for every request.
 *
 * Must exceed the backend's worst case: CALL_TIMEOUT_SECONDS (90s) x 3
 * attempts + backoff ≈ 271s, so the server's real result (or its enriched
 * error message) reaches the UI instead of a client-side timeout.
 */
export const REQUEST_TIMEOUT_MS = 300_000;

/** What went wrong, so the UI can phrase the message accordingly. */
export type ApiErrorKind = "http" | "network" | "timeout";

/** Error raised by this module. Always safe to show to the user. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;

  constructor(message: string, kind: ApiErrorKind, status: number | null = null) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }
}

/** True when a request was aborted (start over, unmount, or caller cancel). */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Normalize any thrown value into an ApiError. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError(
    error instanceof Error ? error.message : "Something went wrong.",
    "network",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Extract the backend's `{"detail": "message"}` payload. */
async function readDetail(response: Response): Promise<string> {
  try {
    const data: unknown = await response.json();
    if (isRecord(data) && typeof data.detail === "string" && data.detail.trim()) {
      return data.detail;
    }
  } catch {
    // Non-JSON body (proxy HTML page, empty response, ...) -> fall through.
  }
  return `Request failed with status ${response.status} ${response.statusText}.`;
}

/**
 * Fetch with timeout + abort plumbing.
 *
 * @param path - Path appended to API_BASE_URL.
 * @param init - Standard fetch init (body may be FormData).
 * @param externalSignal - Caller's signal (component unmount / start over).
 * @returns The successful (2xx) Response.
 * @throws ApiError for HTTP errors, network failures, and timeouts.
 */
async function request(
  path: string,
  init: RequestInit,
  externalSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  const forwardAbort = (): void => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", forwardAbort, { once: true });
  }

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ApiError(await readDetail(response), "http", response.status);
    }
    return response;
  } catch (error: unknown) {
    if (error instanceof ApiError) throw error;
    if (timedOut) {
      throw new ApiError(
        `The request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds. The server may be busy - please try again.`,
        "timeout",
      );
    }
    if (externalSignal?.aborted) {
      // Caller cancelled deliberately: rethrow so the hook can ignore it.
      throw error;
    }
    throw new ApiError(
      `Can't reach the server at ${API_BASE_URL}. Make sure the backend is running and NEXT_PUBLIC_API_URL is correct.`,
      "network",
    );
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", forwardAbort);
  }
}

export interface CustomizeInput {
  jd: string;
  resume: File;
  sections: SectionKey[];
  signal?: AbortSignal;
}

/** POST /api/customize (multipart/form-data). */
export async function customizeResume({
  jd,
  resume,
  sections,
  signal,
}: CustomizeInput): Promise<CustomizeResponse> {
  const form = new FormData();
  form.append("jd", jd);
  form.append("resume", resume, resume.name);
  if (sections.length > 0) {
    // Omitting the field makes the backend rewrite every section.
    form.append("sections", sections.join(","));
  }
  const response = await request("/api/customize", { method: "POST", body: form }, signal);
  return (await response.json()) as CustomizeResponse;
}

export interface CoverLetterInput {
  jd: string;
  resume: File;
  signal?: AbortSignal;
}

/** POST /api/cover-letter (multipart/form-data). */
export async function coverLetter({
  jd,
  resume,
  signal,
}: CoverLetterInput): Promise<string> {
  const form = new FormData();
  form.append("jd", jd);
  form.append("resume", resume, resume.name);
  const response = await request(
    "/api/cover-letter",
    { method: "POST", body: form },
    signal,
  );
  const data = (await response.json()) as CoverLetterResponse;
  return data.cover_letter;
}

/** POST /api/export/docx (JSON body = the `customized` object) -> .docx bytes. */
export async function exportDocx(
  customized: CustomizedResume,
  signal?: AbortSignal,
): Promise<Blob> {
  const response = await request(
    "/api/export/docx",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(customized),
    },
    signal,
  );
  return response.blob();
}

/** GET /health - used to give a friendlier network error message. */
export async function pingBackend(signal?: AbortSignal): Promise<boolean> {
  try {
    await request("/health", { method: "GET" }, signal);
    return true;
  } catch {
    return false;
  }
}
