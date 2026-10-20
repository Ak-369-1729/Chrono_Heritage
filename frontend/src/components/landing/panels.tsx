"use client";

import Link from "next/link";
import { AngularTape, AzimuthDial } from "@/components/charts/Azimuth";
import { Glyph } from "@/components/Glyph";
import { gateLabel } from "@/components/GateCard";
import { StatusBadge } from "@/components/ui";
import { deg, yearLabel } from "@/lib/format";
import type { Gates } from "@/lib/types";
import { ILLUSTRATIVE, OBSERVER } from "./choreography";
import { LEGEND } from "./copy";
import { useLandingData, type EpochSeries } from "./data";

/* ------------------------------------------------------------------------------------ chart geometry (shared) */

export const CHART = { x0: 64, x1: 496, y0: 236, y1: 36, w: 520, h: 280 };
const YEAR0 = -3000;
const YEAR1 = 2000;

export function chartScales(points: EpochSeries["points"] | null) {
  const az = points?.map((p) => p.azimuth) ?? [];
  const lo = Math.floor((Math.min(ILLUSTRATIVE.axisBearing, ...(az.length ? az : [62])) - 0.25) * 4) / 4;
  const hi = Math.ceil((Math.max(ILLUSTRATIVE.axisBearing, ...(az.length ? az : [63.2])) + 0.25) * 4) / 4;
  const x = (year: number) => CHART.x0 + ((year - YEAR0) / (YEAR1 - YEAR0)) * (CHART.x1 - CHART.x0);
  const y = (a: number) => CHART.y0 - ((a - lo) / (hi - lo)) * (CHART.y0 - CHART.y1);
  const ticks: number[] = [];
  for (let t = Math.ceil(lo * 2) / 2; t <= hi + 1e-9; t += 0.5) ticks.push(Number(t.toFixed(2)));
  const path = points?.length ? points.map((p, i) => `${i ? "L" : "M"}${x(p.year).toFixed(1)},${y(p.azimuth).toFixed(1)}`).join(" ") : "";
  return { x, y, lo, hi, ticks, path, axisY: y(ILLUSTRATIVE.axisBearing) };
}

export const YEAR_TICKS = [-2999, -1999, -999, 1, 1000, 2000];

/** Frame, ticks and labels of the epoch chart (drawn in SVG units of CHART). */
export function ChartFrame({ scales, fontSize = 11 }: { scales: ReturnType<typeof chartScales>; fontSize?: number }) {
  const big = fontSize > 13;
  return (
    <g fontSize={fontSize} fill="var(--color-ivory-dim)">
      <line x1={CHART.x0} y1={CHART.y0} x2={CHART.x1} y2={CHART.y0} stroke="var(--color-rule-strong)" />
      <line x1={CHART.x0} y1={CHART.y0} x2={CHART.x0} y2={CHART.y1} stroke="var(--color-rule-strong)" />
      {scales.ticks.map((t) => (
        <g key={t}>
          <line x1={CHART.x0 - 4} x2={CHART.x0} y1={scales.y(t)} y2={scales.y(t)} stroke="var(--color-sandstone-dim)" />
          <text x={CHART.x0 - 8} y={scales.y(t) + 4} textAnchor="end">{t.toFixed(1)}°</text>
        </g>
      ))}
      {YEAR_TICKS.filter((_, i) => !big || i % 2 === 0).map((yv) => (
        <g key={yv}>
          <line x1={scales.x(yv)} x2={scales.x(yv)} y1={CHART.y0} y2={CHART.y0 + 4} stroke="var(--color-sandstone-dim)" />
          <text x={scales.x(yv)} y={CHART.y0 + 18} textAnchor="middle">{yearLabel(yv)}</text>
        </g>
      ))}
    </g>
  );
}

/* ---------------------------------------------------------------------------------------- scene C: epochs */

function Unavailable({ what, error }: { what: string; error: string }) {
  return (
    <p role="status" className="flex items-start gap-2 text-sm text-ivory-dim">
      <span className="mt-1 text-uncertain"><Glyph kind="blocked" /></span>
      <span>{what} is unavailable: {error} No values are shown in its place.</span>
    </p>
  );
}

/** Live: June-solstice sunrise azimuth across five millennia, computed by the platform's engine. */
export function EpochPanel({ compact = false }: { compact?: boolean }) {
  const { epoch } = useLandingData();
  const pts = epoch.data?.points ?? null;
  const s = chartScales(pts);
  const first = pts?.[0];
  const last = pts?.[pts.length - 1];
  return (
    <figure className="m-0">
      {epoch.loading ? (
        <p role="status" className="text-sm text-ivory-dim">Calculating with the ephemeris engine…</p>
      ) : epoch.error || !pts ? (
        <Unavailable what="The live calculation" error={epoch.error ?? "no data returned."} />
      ) : (
        <>
          <svg viewBox={`0 0 ${CHART.w} ${CHART.h}`} className="w-full" role="img"
            aria-label={`Line chart: predicted June-solstice sunrise azimuth for ${OBSERVER.label}, flat horizon, from ${deg(first!.azimuth, 2)} in ${yearLabel(first!.year)} to ${deg(last!.azimuth, 2)} in ${yearLabel(last!.year)}.`}>
            <ChartFrame scales={s} fontSize={compact ? 17 : 11} />
            <path d={s.path} fill="none" stroke="var(--color-evidence)" strokeWidth="2" />
            {pts.map((p) => <circle key={p.year} cx={s.x(p.year)} cy={s.y(p.azimuth)} r="2.6" fill="var(--color-evidence)" />)}
            <text x={CHART.x1} y={CHART.y1 - 10} textAnchor="end" fontSize={compact ? 17 : 11} fill="var(--color-evidence)">predicted, computed live</text>
          </svg>
          {!compact && (
            <p className="num mt-2 text-sm text-ivory">
              {deg(first!.azimuth, 2)} in {yearLabel(first!.year)} → {deg(last!.azimuth, 2)} in {yearLabel(last!.year)}: a drift of {deg(last!.azimuth - first!.azimuth, 2)}.
            </p>
          )}
          <table className="sr-only">
            <caption>Predicted June-solstice sunrise azimuth by year</caption>
            <thead><tr><th>Year</th><th>Azimuth</th></tr></thead>
            <tbody>{pts.map((p) => <tr key={p.year}><td>{yearLabel(p.year)}</td><td>{deg(p.azimuth, 3)}</td></tr>)}</tbody>
          </table>
        </>
      )}
      <figcaption className="mt-2 text-2xs text-mist">
        June-solstice sunrise for {OBSERVER.label} (not a site record), flat horizon, standard refraction, upper limb.
        {epoch.data ? ` ${epoch.data.engine}.` : ""} Exploratory, not a reviewed result.
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------------------------ scene D: instrument */

export function InstrumentPanel({ compact = false }: { compact?: boolean }) {
  return (
    <figure className="m-0">
      <div className={`flex ${compact ? "items-center gap-3" : "flex-col gap-4 sm:flex-row sm:items-center"}`}>
        <AzimuthDial measured={ILLUSTRATIVE.axisBearing} measuredSigma={ILLUSTRATIVE.measurementSigma} predicted={ILLUSTRATIVE.predictedBearing}
          predictedRange={ILLUSTRATIVE.chronologySpan} axisMode="directed" size={compact ? 132 : 188} />
        <ul className="space-y-1.5 text-xs text-ivory/90">
          {LEGEND.map((l) => <li key={l.label} className="flex items-center gap-2"><span className="h-2 w-6 shrink-0" style={{ background: l.color }} />{l.label}</li>)}
        </ul>
      </div>
      {!compact && (
        <div className="mt-3">
          <AngularTape measured={ILLUSTRATIVE.axisBearing} measuredSigma={ILLUSTRATIVE.measurementSigma} predicted={ILLUSTRATIVE.predictedBearing}
            predictedRange={ILLUSTRATIVE.chronologySpan} axisMode="directed" halfWidth={3} height={96} />
        </div>
      )}
      <figcaption className="mt-2 flex flex-wrap items-center gap-2 text-2xs text-mist">
        <StatusBadge status="illustrative" label="Illustrative numbers" /> Invented to explain the instrument. Real analyses use sourced records.
      </figcaption>
    </figure>
  );
}

/* ----------------------------------------------------------------------------------------- scene E: vault */

const GATE_ORDER: (keyof Gates)[] = ["phase0", "phase0_5", "differentiation", "behavioral", "cross_site", "ml"];

export function LedgerPanel({ compact = false }: { compact?: boolean }) {
  const { gates, bench, sites } = useLandingData();
  const classes = bench.data?.summary.classes;
  const totals = classes
    ? Object.values(classes).reduce((a, c) => ({ pass: a.pass + c.pass, fail: a.fail + c.fail, blocked: a.blocked + c.blocked }), { pass: 0, fail: 0, blocked: 0 })
    : null;
  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="text-xs text-sandstone">Site records</p>
        {sites.error ? <Unavailable what="The site count" error={sites.error} /> : !sites.data ? <p className="text-ivory-dim">Loading…</p> : (
          <p className="num mt-1 text-ivory">
            {sites.data.real} real record{sites.data.real === 1 ? "" : "s"} ({sites.data.reviewed} reviewed) and {sites.data.illustrative} illustrative.
          </p>
        )}
      </div>
      <div>
        <p className="text-xs text-sandstone">Benchmarks, latest run</p>
        {bench.error ? <Unavailable what="The benchmark ledger" error={bench.error} /> : !totals ? <p className="text-ivory-dim">Loading…</p> : (
          <p className="num mt-1 flex flex-wrap gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1.5 text-copper-bright"><Glyph kind="solid" />{totals.pass} passed</span>
            <span className="inline-flex items-center gap-1.5 text-uncertain"><Glyph kind="blocked" />{totals.blocked} blocked</span>
            <span className="inline-flex items-center gap-1.5 text-uncertain"><Glyph kind="cross" />{totals.fail} failed</span>
          </p>
        )}
      </div>
      <div>
        <p className="text-xs text-sandstone">Evidence gates</p>
        {gates.error ? <Unavailable what="The gate ledger" error={gates.error} /> : !gates.data ? <p className="text-ivory-dim">Loading…</p> : (
          <ul className="mt-1">
            {GATE_ORDER.slice(0, compact ? 4 : 6).map((k) => {
              const g = gates.data![k];
              return (
                <li key={k} className="flex items-center justify-between gap-3 border-b border-rule/70 py-1.5 last:border-0">
                  <span className="min-w-0 truncate text-ivory/90">{g.title}</span>
                  <StatusBadge status={g.status} label={gateLabel(g.status)} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------- scene F: workspace */

export const DOORS = [
  { href: "/atlas", title: "Heritage Atlas", body: "Browse site records with their sources, conventions and gaps." },
  { href: "/sky", title: "Sky Explorer", body: "Reconstruct where the Sun met the horizon for a place and date range." },
  { href: "/analysis/new", title: "Register a hypothesis", body: "State the question first, then run the uncertainty-aware analysis." },
  { href: "/gates", title: "Evidence gates", body: "See what has been shown, what is blocked, and what is still open." },
];
