"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import type { BenchmarkRun, Gates, SiteSummary } from "@/lib/types";
import { OBSERVER } from "./choreography";

/** One live calculation from the platform's own engine, for scene C. */
export interface EpochSeries {
  points: { year: number; azimuth: number }[];
  engine: string;
  ephemeris: string;
  warnings: string[];
}

type Slot<T> = { data: T | null; error: string | null; loading: boolean };
const idle = <T,>(): Slot<T> => ({ data: null, error: null, loading: true });

export interface LandingData {
  epoch: Slot<EpochSeries>;
  gates: Slot<Gates>;
  bench: Slot<BenchmarkRun>;
  sites: Slot<{ total: number; illustrative: number; real: number; reviewed: number }>;
}

const Ctx = createContext<LandingData | null>(null);

function message(e: unknown): string {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
}

/**
 * Fetches the live values the journey shows. Nothing is substituted when a request fails: the panel says the
 * value is unavailable and why.
 */
export function LandingDataProvider({ children }: { children: ReactNode }) {
  const [epoch, setEpoch] = useState<Slot<EpochSeries>>(idle);
  const [gates, setGates] = useState<Slot<Gates>>(idle);
  const [bench, setBench] = useState<Slot<BenchmarkRun>>(idle);
  const [sites, setSites] = useState<LandingData["sites"]>(idle);

  useEffect(() => {
    let alive = true;
    const guard = <T,>(set: (s: Slot<T>) => void) => ({
      ok: (d: T) => alive && set({ data: d, error: null, loading: false }),
      fail: (e: unknown) => alive && set({ data: null, error: message(e), loading: false }),
    });
    const g = guard(setGates);
    api<Gates>("/gates").then(g.ok, g.fail);
    const b = guard(setBench);
    api<BenchmarkRun>("/benchmarks/runs/latest").then(b.ok, (e) => {
      if (e instanceof ApiError && e.status === 404) b.fail(new Error("No benchmark run has been recorded yet."));
      else b.fail(e);
    });
    const s = guard(setSites);
    api<{ sites: SiteSummary[] }>("/sites").then((d) => {
      const illustrative = d.sites.filter((x) => x.is_illustrative).length;
      s.ok({ total: d.sites.length, illustrative, real: d.sites.length - illustrative,
        reviewed: d.sites.filter((x) => !x.is_illustrative && x.status === "reviewed").length });
    }, s.fail);
    // The engine calculation is the heaviest request: start it once the page has settled.
    const t = window.setTimeout(() => {
      const ep = guard(setEpoch);
      api<{ events: { year: number; azimuth_deg: number }[]; versions: { engine: string; ephemeris: string }; warnings: { message: string }[] }>(
        "/sky/compute",
        { method: "POST", json: { lat: OBSERVER.lat, lon: OBSERVER.lon, target_key: "sun_june_solstice_rise", year: -2999, year_end: 1999, horizon_mode: "flat" } },
      ).then((d) => ep.ok({
        points: d.events.map((e) => ({ year: e.year, azimuth: e.azimuth_deg })),
        engine: d.versions.engine, ephemeris: d.versions.ephemeris,
        warnings: d.warnings.map((w) => w.message),
      }), ep.fail);
    }, 900);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, []);

  return <Ctx.Provider value={{ epoch, gates, bench, sites }}>{children}</Ctx.Provider>;
}

export function useLandingData(): LandingData {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLandingData must be used inside <LandingDataProvider>");
  return v;
}
