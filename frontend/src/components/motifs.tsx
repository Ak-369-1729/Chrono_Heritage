/**
 * Architectural motifs for the "Astronomical Fortress" design language.
 *
 * Every shape here is drawn procedurally from simple geometry (pointed arcs, scallops, an eight-point lattice). They
 * evoke Rajasthani fort and observatory architecture in general — cusped arches, jharokha screens, chhatri
 * pavilions, engraved instrument scales — without reproducing any particular monument.
 */

type Pt = [number, number];

/** Points along a pointed (two-centred) arch from the left springing point to the right, apex at top centre. */
export function pointedArchPoints(w: number, rise: number, n: number): Pt[] {
  // Two circles of radius r centred on the springing line meet at the apex (w/2, -rise).
  const half = w / 2;
  const r = (half * half + rise * rise) / (2 * half);
  const cL: Pt = [r, 0];
  const cR: Pt = [w - r, 0];
  const a0 = -Math.PI; // left springing point (0, 0), measured from cL
  const aApexL = Math.atan2(-rise, half - r);
  const aApexR = Math.atan2(-rise, half - cR[0]);
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (t <= 0.5) {
      const a = a0 + (aApexL - a0) * (t / 0.5);
      pts.push([cL[0] + r * Math.cos(a), cL[1] + r * Math.sin(a)]);
    } else {
      const a = aApexR + (0 - aApexR) * ((t - 0.5) / 0.5);
      pts.push([cR[0] + r * Math.cos(a), cR[1] + r * Math.sin(a)]);
    }
  }
  return pts;
}

/**
 * SVG path of a cusped (multifoil) arch opening: jambs from the base to the springing line, then a pointed arch
 * whose inner edge is scalloped into ``lobes`` cusps. Origin top-left; the opening spans (0..w, 0..h).
 */
export function cuspedArchPath(w: number, h: number, { lobes = 7, riseRatio = 0.55, depth = 0.32 } = {}): string {
  const rise = w * riseRatio;
  const spring = h - rise >= 0 ? rise : h * 0.6;
  const pts = pointedArchPoints(w, spring, lobes).map(([x, y]) => [x, y + spring] as Pt);
  const f = (v: number) => v.toFixed(2);
  let d = `M0 ${f(h)} L0 ${f(spring)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const chord = Math.hypot(x1 - x0, y1 - y0);
    // each lobe is a shallow arc bulging outward (into the wall); the cusps between lobes point inward
    const half = Math.max(0.3, Math.min(1.3, 0.35 + depth * 0.9));
    const r = chord / (2 * Math.sin(half));
    d += ` A${f(r)} ${f(r)} 0 0 1 ${f(x1)} ${f(y1)}`;
  }
  d += ` L${f(w)} ${f(h)} Z`;
  return d;
}

/**
 * The same cusped arch as a closed polyline (for 3D shapes): points run from the bottom-left jamb, over the
 * scalloped arch, down to the bottom-right jamb. y grows upward here (three.js convention), origin bottom-left.
 */
export function cuspedArchPoints(w: number, h: number, { lobes = 7, riseRatio = 0.55, depth = 0.32, perLobe = 6 } = {}): Pt[] {
  const rise = Math.min(w * riseRatio, h * 0.6);
  const spring = h - rise;
  const pts = pointedArchPoints(w, rise, lobes); // y negative upward from springing line, svg-style
  const out: Pt[] = [[0, 0], [0, spring]];
  const half = Math.max(0.3, Math.min(1.3, 0.35 + depth * 0.9));
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    // convert to y-up coordinates above the springing line
    const a: Pt = [x0, spring - y0];
    const b: Pt = [x1, spring - y1];
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const chord = Math.hypot(dx, dy);
    const r = chord / (2 * Math.sin(half));
    const sag = r - Math.sqrt(Math.max(0, r * r - (chord / 2) ** 2));
    // outward normal (away from the opening's centre line below)
    let nx = -dy / chord;
    let ny = dx / chord;
    if (nx * (mx - w / 2) + ny * (my - spring) < 0) {
      nx = -nx;
      ny = -ny;
    }
    for (let k = 1; k <= perLobe; k++) {
      const t = k / perLobe;
      const bulge = 4 * sag * t * (1 - t);
      out.push([a[0] + dx * t + nx * bulge, a[1] + dy * t + ny * bulge]);
    }
  }
  out.push([w, 0]);
  return out;
}

/** A cusped arch drawn as an engraved outline (decorative; aria-hidden). */
export function Arch({ width = 120, height = 180, lobes = 7, className = "", stroke = "var(--color-sandstone)", strokeWidth = 1, inset = true }: {
  width?: number; height?: number; lobes?: number; className?: string; stroke?: string; strokeWidth?: number; inset?: boolean;
}) {
  const pad = strokeWidth * 2 + (inset ? 10 : 0);
  return (
    <svg viewBox={`${-pad} ${-pad} ${width + pad * 2} ${height + pad}`} className={className} aria-hidden focusable="false" preserveAspectRatio="xMidYMax meet">
      {inset && <path d={cuspedArchPath(width + 16, height + 8, { lobes: lobes + 2 })} transform="translate(-8 -8)" fill="none" stroke={stroke} strokeOpacity={0.35} strokeWidth={strokeWidth} />}
      <path d={cuspedArchPath(width, height, { lobes })} fill="none" stroke={stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * Engraved instrument scale: a graduated rule with minor ticks every degree-equivalent and major ticks every ten.
 * Used under chamber headings in place of a plain hairline.
 */
export function ScaleRule({ className = "", labels = false }: { className?: string; labels?: boolean }) {
  return (
    <div aria-hidden className={`relative h-3 w-full ${className}`}>
      <div className="absolute inset-x-0 top-0 h-px bg-sandstone-dim/80" />
      <div
        className="absolute inset-x-0 top-0 h-[5px] opacity-70"
        style={{ backgroundImage: "repeating-linear-gradient(90deg, var(--color-sandstone-dim) 0 1px, transparent 1px 8px)" }}
      />
      <div
        className="absolute inset-x-0 top-0 h-[10px]"
        style={{ backgroundImage: "repeating-linear-gradient(90deg, var(--color-sandstone) 0 1px, transparent 1px 80px)" }}
      />
      {labels && <div className="absolute right-0 top-3 text-[10px] text-mist">°</div>}
    </div>
  );
}

/** Chhatri mark: a domed pavilion on four pillars standing on the horizon, with a single star at its axis. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden focusable="false">
      <circle cx="16" cy="3.6" r="1.25" fill="var(--color-brass-bright)" />
      <path d="M16 6.2 v1.6" stroke="var(--color-brass)" strokeWidth="1" />
      {/* dome with finial */}
      <path d="M8.4 15.2 C8.4 10.6 11.8 8 16 8 C20.2 8 23.6 10.6 23.6 15.2 Z" fill="var(--color-sandstone)" />
      {/* chhajja (eave) */}
      <path d="M6 15.2 h20 l-1.6 1.8 H7.6 Z" fill="var(--color-brass)" />
      {/* pillars and cusped openings */}
      <path d="M8.6 17 v7.4 M13.2 17 v7.4 M18.8 17 v7.4 M23.4 17 v7.4" stroke="var(--color-sandstone)" strokeWidth="1.4" />
      <path d="M8.6 19.6 q2.3 -2.4 4.6 0 M18.8 19.6 q2.3 -2.4 4.6 0" stroke="var(--color-sandstone-dim)" strokeWidth="0.9" fill="none" />
      {/* plinth on the horizon */}
      <path d="M2.5 26.4 h27" stroke="var(--color-sandstone-dim)" strokeWidth="1.1" />
      <path d="M7 24.4 h18 v2 H7 Z" fill="var(--color-sandstone-dim)" />
      {/* sightline */}
      <path d="M16 26.4 V8.8" stroke="var(--color-brass)" strokeWidth="0.6" strokeDasharray="1 1.2" opacity="0.8" />
    </svg>
  );
}

/** An eight-point jali rosette (single tile), used as a small separator or bullet. */
export function Rosette({ size = 12, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden focusable="false" className={className}>
      <path d="M14 2 L18 10 L26 14 L18 18 L14 26 L10 18 L2 14 L10 10 Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="14" cy="14" r="3" fill="currentColor" />
    </svg>
  );
}
