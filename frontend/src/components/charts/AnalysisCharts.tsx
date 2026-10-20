"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { deg, yearLabel } from "@/lib/format";

const AXIS = { stroke: "var(--color-rule)", tick: { fill: "var(--color-mist)", fontSize: 11 } };
const TOOLTIP = {
  contentStyle: { background: "var(--color-night)", border: "1px solid var(--color-rule)", borderRadius: 2, fontSize: 12, color: "var(--color-ivory)" },
  labelStyle: { color: "var(--color-ivory-dim)" },
  cursor: { fill: "rgba(128,153,181,0.08)" },
};

/** Distribution of propagated signed residuals with central intervals. */
export function ResidualHistogram({ counts, edges, q025, q975, q16, q84, median }: { counts: number[]; edges: number[]; q025: number; q975: number; q16: number; q84: number; median: number }) {
  const data = counts.map((c, i) => ({ x: (edges[i] + edges[i + 1]) / 2, c }));
  const summary = `Histogram of signed residuals. Median ${deg(median, 2, true)}, 68% interval ${deg(q16, 2, true)} to ${deg(q84, 2, true)}, 95% interval ${deg(q025, 2, true)} to ${deg(q975, 2, true)}.`;
  return (
    <figure className="m-0">
      <div className="h-56 w-full" role="img" aria-label={summary}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 16, left: 0 }} barCategoryGap={0}>
            <CartesianGrid vertical={false} stroke="var(--color-rule)" strokeDasharray="1 4" />
            <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v: number) => `${v.toFixed(1)}°`} {...AXIS}
              label={{ value: "signed residual (axis − prediction)", position: "insideBottom", offset: -10, fill: "var(--color-mist)", fontSize: 11 }} />
            <YAxis width={44} {...AXIS} />
            <ReferenceArea x1={q025} x2={q975} fill="var(--color-sky)" fillOpacity={0.07} />
            <ReferenceArea x1={q16} x2={q84} fill="var(--color-sky)" fillOpacity={0.1} />
            <ReferenceLine x={0} stroke="var(--color-gold)" strokeDasharray="3 3" label={{ value: "0°", fill: "var(--color-gold-bright)", fontSize: 11, position: "top" }} />
            <ReferenceLine x={median} stroke="var(--color-ivory)" />
            <Tooltip {...TOOLTIP} formatter={(v) => [String(v), "samples"]} labelFormatter={(l) => `residual ≈ ${Number(l).toFixed(2)}°`} />
            <Bar dataKey="c" fill="var(--color-sky)" isAnimationActive animationDuration={700} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-2xs text-mist">{summary} Shaded: 68% and 95% central intervals. Dashed gold: zero residual.</figcaption>
    </figure>
  );
}

/** Predicted azimuth across the sourced chronology versus the measured axis. */
export function PredictionByYear({ years, azimuths, measured, sigma }: { years: number[]; azimuths: number[]; measured: number; sigma: number | null }) {
  const data = years.map((y, i) => ({ y, az: azimuths[i] }));
  const all = [...azimuths, measured + (sigma ?? 0) * 2, measured - (sigma ?? 0) * 2];
  const lo = Math.floor(Math.min(...all) - 0.5);
  const hi = Math.ceil(Math.max(...all) + 0.5);
  const summary = `Predicted azimuth from ${deg(azimuths[0], 3)} (${yearLabel(years[0])}) to ${deg(azimuths[azimuths.length - 1], 3)} (${yearLabel(years[years.length - 1])}); measured axis ${deg(measured, 2)}.`;
  return (
    <figure className="m-0">
      <div className="h-56 w-full" role="img" aria-label={summary}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 16, left: 0 }}>
            <CartesianGrid stroke="var(--color-rule)" strokeDasharray="1 4" />
            <XAxis dataKey="y" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(v: number) => yearLabel(v)} {...AXIS} />
            <YAxis domain={[lo, hi]} tickFormatter={(v: number) => `${v}°`} width={48} {...AXIS} />
            {sigma ? <ReferenceArea y1={measured - 2 * sigma} y2={measured + 2 * sigma} fill="var(--color-terracotta)" fillOpacity={0.12} /> : null}
            <ReferenceLine y={measured} stroke="var(--color-gold)" strokeWidth={2} label={{ value: "measured axis", fill: "var(--color-gold-bright)", fontSize: 11, position: "insideBottomRight" }} />
            <Tooltip {...TOOLTIP} formatter={(v) => [`${Number(v).toFixed(3)}°`, "predicted"]} labelFormatter={(l) => yearLabel(Number(l))} />
            <Line type="monotone" dataKey="az" stroke="var(--color-sky)" strokeWidth={2} dot={{ r: 2, fill: "var(--color-sky)" }} isAnimationActive animationDuration={800} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-2xs text-mist">{summary}{sigma ? " Terracotta band: measured axis ± 2σ." : ""}</figcaption>
    </figure>
  );
}

/** One-at-a-time sensitivity: how far each assumption moves the predicted azimuth. */
export function SensitivityBars({ rows }: { rows: { parameter: string; value: string; delta_vs_baseline_deg?: number; error?: string }[] }) {
  const valid = rows.filter((r) => typeof r.delta_vs_baseline_deg === "number");
  const max = Math.max(0.05, ...valid.map((r) => Math.abs(r.delta_vs_baseline_deg!)));
  return (
    <figure className="m-0">
      <div className="table-frame"><table className="dtable">
        <caption className="sr-only">Sensitivity of the predicted azimuth to each assumption, relative to the baseline configuration.</caption>
        <thead>
          <tr><th scope="col">Assumption</th><th scope="col">Setting</th><th scope="col" className="w-[45%]">Shift in predicted azimuth</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const d = r.delta_vs_baseline_deg;
            return (
              <tr key={i}>
                <td className="text-ivory-dim">{r.parameter}</td>
                <td>{r.value}</td>
                <td>
                  {r.error ? <span className="text-terracotta">{r.error}</span> : (
                    <div className="flex items-center gap-3">
                      <div className="relative h-2.5 flex-1 bg-night-2">
                        <span className="absolute inset-y-0 left-1/2 w-px bg-rule" />
                        <span className="absolute inset-y-0 bg-sky" style={{
                          left: d! < 0 ? `${50 - (Math.abs(d!) / max) * 50}%` : "50%",
                          width: `${(Math.abs(d!) / max) * 50}%`,
                        }} />
                      </div>
                      <span className="num w-16 text-right text-xs">{deg(d, 3, true)}</span>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
    </figure>
  );
}
