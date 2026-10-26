"use client";

/** Lazily generated cover letter: fetches once, when first requested. */

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, coverLetter, isAbortError, toApiError } from "@/lib/api";
import type { RequestStatus } from "@/lib/types";

export interface UseCoverLetterResult {
  status: RequestStatus;
  letter: string;
  error: ApiError | null;
  /** Re-run the request after an error. */
  retry: () => void;
}

/**
 * @param jd - Job description text captured at customize time.
 * @param resume - Resume file captured at customize time.
 * @param enabled - Flip to true when the user opens the Cover Letter tab.
 */
export function useCoverLetter(
  jd: string,
  resume: File | null,
  enabled: boolean,
): UseCoverLetterResult {
  const [status, setStatus] = useState<RequestStatus>("idle");
  const [letter, setLetter] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const startedRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback((): void => {
    if (!resume) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setStatus("loading");
    setError(null);

    coverLetter({ jd, resume, signal: controller.signal })
      .then((text: string) => {
        if (controller.signal.aborted) return;
        setLetter(text);
        setStatus("success");
      })
      .catch((caught: unknown) => {
        if (isAbortError(caught) || controller.signal.aborted) return;
        setError(toApiError(caught));
        setStatus("error");
      });
  }, [jd, resume]);

  useEffect(() => {
    if (!enabled || startedRef.current || !resume) return;
    startedRef.current = true;
    load();
  }, [enabled, resume, load]);

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  return { status, letter, error, retry: load };
}
