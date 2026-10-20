"use client";

import { useCallback, useState } from "react";
import { ApiError } from "./api";

/** Wrap an async action with pending / error / success state for forms and buttons. */
export function useSubmit<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState<R | null>(null);
  const run = useCallback(
    async (...args: A): Promise<R | null> => {
      setPending(true);
      setError(null);
      try {
        const r = await fn(...args);
        setDone(r);
        return r;
      } catch (e) {
        setError(e instanceof ApiError ? e : new ApiError(0, "error", e instanceof Error ? e.message : String(e)));
        return null;
      } finally {
        setPending(false);
      }
    },
    [fn],
  );
  return { run, pending, error, done, reset: () => { setError(null); setDone(null); } };
}
