"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";

export interface Resource<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => Promise<void>;
}

/** Fetch a resource on mount (and when `path` changes). `path === null` skips the request. */
export function useResource<T>(path: string | null, opts: { pollMs?: number; until?: (d: T) => boolean } = {}): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const alive = useRef(true);
  const { pollMs, until } = opts;
  const untilRef = useRef(until);
  untilRef.current = until;

  const load = useCallback(async () => {
    if (path === null) return;
    try {
      const d = await api<T>(path);
      if (!alive.current) return;
      setData(d);
      setError(null);
    } catch (e) {
      if (!alive.current) return;
      setError(e instanceof ApiError ? e : new ApiError(0, "error", String(e)));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    alive.current = true;
    setLoading(path !== null);
    void load();
    return () => {
      alive.current = false;
    };
  }, [load, path]);

  useEffect(() => {
    if (!pollMs || path === null) return;
    if (data && untilRef.current?.(data)) return;
    const t = setTimeout(() => void load(), pollMs);
    return () => clearTimeout(t);
  }, [data, pollMs, load, path]);

  return { data, error, loading, reload: load };
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}
