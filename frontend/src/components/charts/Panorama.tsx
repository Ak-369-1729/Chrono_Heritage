"use client";

import { deg } from "@/lib/format";

interface Props {
  horizonAz?: number[];
  horizonAlt?: number[];
  horizonKind: string;
  dayPath: { az_deg: number; apparent_alt_deg: number }[];
  eventAz: number;
  eventAlt?: number;
  measuredAz?: number | null;
  measuredSigma?: number | null;
  halfWidth?: number;
  showEvent?: boolean;
}

const wrap = (a: number, centre: number) => ((((a - centre + 180) % 360) + 360) % 360) - 180 + centre;
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Horizon panorama around the predicted event: azimuth on x, altitude on y (exaggerated vertically).
 * Shows the horizon profile (or the declared flat assumption), the Sun's apparent path,
 * the predicted event point and the measured axis.
 */
export function HorizonPanorama({ horizonAz, horizonAlt, horizonKind, dayPath, eventAz, eventAlt = 0, measuredAz, measuredSigma, halfWidth = 30, showEvent = true }: Props) {
  const W = 720;
  const H = 260;
  const pad = { l: 40, r: 14, t: 16, b: 34 };
  const aMin = eventAz - halfWidth;
  const aMax = eventAz + halfWidth;
  const altMin = -3;
  const altMax = 14;
  const x = (a: number) => r2(pad.l + ((wrap(a, eventAz) - aMin) / (aMax - aMin)) * (W - pad.l - pad.r));
  const y = (h: number) => r2(pad.t + ((altMax - Math.max(altMin, Math.min(altMax, h))) / (altMax - altMin)) * (H - pad.t - pad.b));
  const flat = horizonKind === "none_declared" || !horizonAz?.length;

  let horizonPath = `M${x(aMin)},${y(0)} L${x(aMax)},${y(0)}`;
  if (!flat && horizonAz && horizonAlt) {
    const pts: [number, number][] = [];
    for (let a = aMin; a <= aMax; a += 0.5) {
      // periodic linear interpolation, matching the backend
      const az = ((a % 360) + 360) % 360;
      const xs = horizonAz.map((v) => ((v % 360) + 360) % 360);
      const order = xs.map((v, i) => [v, horizonAlt[i]] as const).sort((p, q) => p[0] - q[0]);
      const ext = [[order[order.length - 1][0] - 360, order[order.length - 1][1]], ...order, [order[0][0] + 360, order[0][1]]] as const;
      let alt = 0;
      for (let i = 0; i < ext.length - 1; i++) {
        if (az >= ext[i][0] && az <= ext[i + 1][0]) {
          const t = (az - ext[i][0]) / (ext[i + 1][0] - ext[i][0] || 1);
          alt = ext[i][1] + t * (ext[i + 1][1] - ext[i][1]);
          break;
        }
      }
      pts.push([x(a), y(alt)]);
    }
    horizonPath = `M${pts.map((p) => p.join(",")).join(" L")}`;
  }
  const ground = `${horizonPath} L${x(aMax)},${H - pad.b} L${x(aMin)},${H - pad.b}Z`;

  const path = dayPath
    .filter((p) => Math.abs(wrap(p.az_deg, eventAz) - eventAz) <= halfWidth + 2 && p.apparent_alt_deg > altMin - 2 && p.apparent_alt_deg < altMax + 2)
    .map((p) => [x(p.az_deg), y(p.apparent_alt_deg)] as const);

  const ticks: number[] = [];
  const step = halfWidth > 20 ? 10 : 5;
  for (let t = Math.ceil(aMin / step) * step; t <= aMax; t += step) ticks.push(t);
  const label = `Horizon panorama ${deg(aMin, 0)} to ${deg(aMax, 0)}. ${flat ? "Flat 0° horizon assumed." : `${horizonKind} horizon profile.`} Predicted event at azimuth ${deg(eventAz, 2)}${measuredAz != null ? `; measured axis at ${deg(measuredAz, 2)}` : ""}.`;

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
        <defs>
          <linearGradient id="pano-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#151d30" />
            <stop offset="1" stopColor="#2a2f45" />
          </linearGradient>
        </defs>
        <rect x={pad.l} y={pad.t} width={W - pad.l - pad.r} height={H - pad.t - pad.b} fill="url(#pano-sky)" />
        {[0, 5, 10].map((h) => (
          <g key={h}>
            <line x1={pad.l} x2={W - pad.r} y1={y(h)} y2={y(h)} stroke="var(--color-rule)" strokeDasharray={h === 0 ? "4 4" : "1 5"} />
            <text x={pad.l - 6} y={y(h) + 4} textAnchor="end" fontSize="10" fill="var(--color-mist)">{h}°</text>
          </g>
        ))}
        <path d={ground} fill="#2b2622" />
        <path d={horizonPath} fill="none" stroke={flat ? "var(--color-mist)" : "var(--color-sandstone)"} strokeWidth="1.5" strokeDasharray={flat ? "6 4" : undefined} />
        {measuredAz != null && measuredSigma ? (
          <rect x={x(measuredAz - 2 * measuredSigma)} y={pad.t} width={Math.max(1, x(measuredAz + 2 * measuredSigma) - x(measuredAz - 2 * measuredSigma))} height={H - pad.t - pad.b} fill="var(--color-terracotta)" opacity="0.16" />
        ) : null}
        {path.length > 1 && (
          <polyline points={path.map((p) => p.join(",")).join(" ")} fill="none" stroke="var(--color-sky)" strokeWidth="1.5" strokeDasharray="3 3" />
        )}
        {measuredAz != null && <line x1={x(measuredAz)} x2={x(measuredAz)} y1={pad.t} y2={H - pad.b} stroke="var(--color-gold)" strokeWidth="2" />}
        {showEvent && <circle cx={x(eventAz)} cy={y(eventAlt)} r="6" fill="var(--color-gold-bright)" stroke="#fff3d9" />}
        {showEvent && <line x1={x(eventAz)} x2={x(eventAz)} y1={y(eventAlt) + 7} y2={H - pad.b} stroke="var(--color-sky)" strokeWidth="1.5" />}
        {ticks.map((t) => (
          <text key={t} x={x(t)} y={H - pad.b + 16} textAnchor="middle" fontSize="10" fill="var(--color-mist)" className="num">
            {(((t % 360) + 360) % 360).toFixed(0)}°
          </text>
        ))}
        <text x={W - pad.r} y={H - 4} textAnchor="end" fontSize="10" fill="var(--color-mist)">azimuth (true north) · altitude exaggerated</text>
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-2xs text-ivory-dim">
        <span><span className="mr-1.5 inline-block h-0.5 w-4 bg-gold align-middle" />measured axis</span>
        <span><span className="mr-1.5 inline-block h-0.5 w-4 bg-sky align-middle" />predicted event and Sun&apos;s apparent path</span>
        <span><span className="mr-1.5 inline-block h-0.5 w-4 align-middle" style={{ background: flat ? "var(--color-mist)" : "var(--color-sandstone)" }} />{flat ? "flat 0° horizon (assumption)" : `${horizonKind} horizon`}</span>
        <span className="sr-only">{label}</span>
      </figcaption>
    </figure>
  );
}
