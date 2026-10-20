"use client";

import { deg, residual } from "@/lib/format";

/* Colour semantics: gold = measured axis, blue = prediction, terracotta = measurement uncertainty. */

const rad = (d: number) => ((d - 90) * Math.PI) / 180; // SVG: 0° (north) at the top, clockwise
const r2 = (n: number) => Math.round(n * 100) / 100; // stable across server and client renders

interface DialProps {
  measured: number;
  measuredSigma?: number | null;
  predicted: number;
  predictedRange?: [number, number] | null;
  axisMode: "directed" | "bidirectional";
  size?: number;
  title?: string;
}

/** Compass context view (angles to scale). */
export function AzimuthDial({ measured, measuredSigma, predicted, predictedRange, axisMode, size = 260, title }: DialProps) {
  const c = size / 2;
  const R = c - 22;
  const pt = (a: number, r: number) => [r2(c + r * Math.cos(rad(a))), r2(c + r * Math.sin(rad(a)))] as const;
  const wedge = (a1: number, a2: number, r: number) => {
    const [x1, y1] = pt(a1, r);
    const [x2, y2] = pt(a2, r);
    const large = ((a2 - a1 + 360) % 360) > 180 ? 1 : 0;
    return `M${c},${c} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2}Z`;
  };
  const res = residual(measured, predicted, axisMode);
  const [mx, my] = pt(measured, R);
  const [bx, by] = pt(measured + 180, R);
  const [px, py] = pt(predicted, R);
  const label = title ?? `Compass: measured axis ${deg(measured, 1)}, predicted ${deg(predicted, 1)}, residual ${deg(res, 2, true)}.`;
  return (
    <figure className="m-0">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
        <circle cx={c} cy={c} r={R} fill="none" stroke="var(--color-rule)" />
        <circle cx={c} cy={c} r={R * 0.62} fill="none" stroke="var(--color-rule)" strokeDasharray="2 4" />
        {Array.from({ length: 72 }).map((_, i) => {
          const a = i * 5;
          const major = a % 90 === 0;
          const [x1, y1] = pt(a, R);
          const [x2, y2] = pt(a, R - (major ? 9 : a % 30 === 0 ? 6 : 3));
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={major ? "var(--color-ivory-dim)" : "var(--color-rule)"} />;
        })}
        {(["N", "E", "S", "W"] as const).map((l, i) => {
          const [x, y] = pt(i * 90, R + 12);
          return <text key={l} x={x} y={y + 4} textAnchor="middle" fontSize="11" fill="var(--color-ivory-dim)">{l}</text>;
        })}
        {predictedRange && <path d={wedge(predictedRange[0], predictedRange[1], R)} fill="var(--color-sky)" opacity="0.28" />}
        {measuredSigma ? <path d={wedge(measured - 2 * measuredSigma, measured + 2 * measuredSigma, R * 0.92)} fill="var(--color-terracotta)" opacity="0.32" /> : null}
        {axisMode === "bidirectional" && <line x1={c} y1={c} x2={bx} y2={by} stroke="var(--color-gold)" strokeWidth="1.5" strokeDasharray="5 4" />}
        <line x1={c} y1={c} x2={mx} y2={my} stroke="var(--color-gold)" strokeWidth="2.2" className="draw-in" style={{ ["--len" as string]: R }} />
        <line x1={c} y1={c} x2={px} y2={py} stroke="var(--color-sky)" strokeWidth="2" className="draw-in" style={{ ["--len" as string]: R }} />
        <circle cx={c} cy={c} r="3" fill="var(--color-ivory)" />
      </svg>
      <figcaption className="sr-only">{label}</figcaption>
    </figure>
  );
}

interface TapeProps {
  measured: number;
  measuredSigma?: number | null;
  predicted: number;
  predictedRange?: [number, number] | null;
  axisMode: "directed" | "bidirectional";
  halfWidth?: number;
  height?: number;
}

/**
 * Precision tape: a magnified angular scale centred on the prediction, so a 1–3° residual is legible.
 * For a bidirectional axis the end of the axis nearest the prediction is plotted (and labelled so).
 */
export function AngularTape({ measured, measuredSigma, predicted, predictedRange, axisMode, halfWidth, height = 120 }: TapeProps) {
  const res = residual(measured, predicted, axisMode);
  const shown = predicted + res; // the axis end actually compared
  const span = halfWidth ?? Math.max(4, Math.ceil(Math.abs(res) + 2 * (measuredSigma ?? 0) + 1.5));
  const W = 640;
  const x = (a: number) => r2(30 + ((a - (predicted - span)) / (2 * span)) * (W - 60));
  const step = span > 12 ? 5 : span > 6 ? 2 : 1;
  const ticks: number[] = [];
  for (let t = Math.ceil((predicted - span) / step) * step; t <= predicted + span; t += step) ticks.push(t);
  const y = 58;
  const label = `Angular scale centred on the prediction ${deg(predicted, 2)}. Measured ${axisMode === "bidirectional" ? "axis end" : "axis"} ${deg(((shown % 360) + 360) % 360, 2)}${measuredSigma ? ` ± ${deg(measuredSigma, 2)} (1σ)` : ""}. Residual ${deg(res, 2, true)}.`;
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label={label}>
        <line x1={30} y1={y} x2={W - 30} y2={y} stroke="var(--color-ivory-dim)" />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} y1={y} x2={x(t)} y2={y + 6} stroke="var(--color-ivory-dim)" />
            <text x={x(t)} y={y + 20} textAnchor="middle" fontSize="11" fill="var(--color-ivory-dim)" className="num">{(((t % 360) + 360) % 360).toFixed(0)}°</text>
          </g>
        ))}
        {predictedRange && (
          <rect x={x(predicted + residual(predictedRange[0], predicted, "directed"))} y={y - 22}
            width={Math.max(1, x(predicted + residual(predictedRange[1], predicted, "directed")) - x(predicted + residual(predictedRange[0], predicted, "directed")))}
            height={20} fill="var(--color-sky)" opacity="0.28" />
        )}
        {measuredSigma ? (
          <>
            <rect x={x(shown - 2 * measuredSigma)} y={y - 9} width={x(shown + 2 * measuredSigma) - x(shown - 2 * measuredSigma)} height={8} fill="var(--color-terracotta)" opacity="0.28" />
            <rect x={x(shown - measuredSigma)} y={y - 9} width={x(shown + measuredSigma) - x(shown - measuredSigma)} height={8} fill="var(--color-terracotta)" opacity="0.5" />
          </>
        ) : null}
        <line x1={x(predicted)} y1={y - 34} x2={x(predicted)} y2={y} stroke="var(--color-sky)" strokeWidth="2" />
        <text x={x(predicted)} y={y - 38} textAnchor="middle" fontSize="11" fill="var(--color-sky)">predicted</text>
        <line x1={x(shown)} y1={y - 26} x2={x(shown)} y2={y + 2} stroke="var(--color-gold)" strokeWidth="2.4" />
        <text x={x(shown)} y={y + 36} textAnchor="middle" fontSize="11" fill="var(--color-gold-bright)">
          {axisMode === "bidirectional" ? "axis (nearer end)" : "measured axis"}
        </text>
        <path d={`M${x(predicted)},${y + 44} L${x(predicted)},${y + 50} L${x(shown)},${y + 50} L${x(shown)},${y + 44}`} fill="none" stroke="var(--color-ivory)" />
        <text x={(x(predicted) + x(shown)) / 2} y={y + 62} textAnchor="middle" fontSize="11" fill="var(--color-ivory)" className="num">residual {deg(res, 2, true)}</text>
      </svg>
      <figcaption className="sr-only">{label}</figcaption>
    </figure>
  );
}
