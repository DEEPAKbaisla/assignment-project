"use client";

/** Request state machine (idle -> loading -> success | error) for /api/customize. */

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, customizeResume, isAbortError, toApiError } from "@/lib/api";
import type { CustomizeResponse, RequestStatus, SectionKey } from "@/lib/types";

export interface CustomizeRequest {
  jd: string;
  resume: File;
  sections: SectionKey[];
}

export interface UseCustomizeResult {
  status: RequestStatus;
  data: CustomizeResponse | null;
  error: ApiError | null;
  /** Run the request. In-flight requests are aborted first. */
  run: (input: CustomizeRequest) => Promise<void>;
  /** Back to idle, dropping data, error and any in-flight request. */
  reset: () => void;
}

export function useCustomize(): UseCustomizeResult {
  const [status, setStatus] = useState<RequestStatus>("idle");
  const [data, setData] = useState<CustomizeResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const run = useCallback(async (input: CustomizeRequest): Promise<void> => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setStatus("loading");
    setData(null);
    setError(null);

    try {
      const response = await customizeResume({ ...input, signal: controller.signal });
      if (controller.signal.aborted) return;
      setData(response);
      setStatus("success");
    } catch (caught: unknown) {
      // Cancelled by the user (start over) or by unmount: keep it silent.
      if (isAbortError(caught) || controller.signal.aborted) return;
      setError(toApiError(caught));
      setStatus("error");
    }
  }, []);

  const reset = useCallback((): void => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setStatus("idle");
    setData(null);
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  return { status, data, error, run, reset };
}
