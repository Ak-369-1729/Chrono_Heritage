"use client";

import { useLayoutEffect, useMemo, useRef, type MutableRefObject } from "react";
import { cuspedArchPath } from "@/components/motifs";
import { layerState } from "./choreography";

/**
 * The layered 2D renderer: an SVG composition of desert night, fortress, gateway and courtyard whose layers are
 * moved by scroll progress. It needs no WebGL, so it serves phones, low-power devices and browsers without WebGL,
 * and (rendered at a fixed progress) the still images of the static mode. All geometry is illustrative.
 */

const VW = 1600;
const VH = 1000;
const GATE = { cx: 800, base: 742, w: 92, h: 150 }; // gate opening in the outside view
const POLE = { x: 330, y: 300 }; // where the decorative star field turns (north, ~27° up)

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}
const f = (n: number) => n.toFixed(1);

function stars(seed: number, n: number, box: [number, number, number, number]) {
  const r = rng(seed);
  return Array.from({ length: n }, () => {
    const b = r();
    return { x: box[0] + r() * box[2], y: box[1] + r() * box[3], r: 0.6 + b * b * 2.1, o: 0.3 + b * 0.7 };
  });
}

type Refs = Record<string, SVGGElement | SVGElement | null>;

export function paintLayers(p: number, el: Refs) {
  const s = layerState(p);
  const set = (k: string, attr: string, v: string) => el[k]?.setAttribute(attr, v);
  const gx = GATE.cx;
  const gy = GATE.base - GATE.h * 0.45;
  // the fortress grows about the gate centre, which rises toward the middle of the screen
  const fortT = `translate(${f(gx)} ${f(gy - s.fortLift * 4)}) scale(${s.fortScale.toFixed(4)}) translate(${f(-gx)} ${f(-gy)})`;
  set("fort", "transform", fortT);
  set("fortMask", "transform", fortT);
  set("far", "transform", `translate(800 700) scale(${s.farScale.toFixed(4)}) translate(-800 -700)`);
  set("outside", "opacity", s.outsideOpacity.toFixed(3));
  set("inside", "opacity", s.insideOpacity.toFixed(3));
  set("refline", "opacity", s.refLine.toFixed(3));
  set("starsIn", "transform", `rotate(${(-s.skyTurnDeg).toFixed(2)} ${POLE.x} ${POLE.y})`);
  set("starsOut", "transform", `rotate(${(-s.skyTurnDeg * 0.25).toFixed(2)} ${POLE.x} ${POLE.y})`);
  set("instrument", "opacity", s.instrument.toFixed(3));
  set("plan", "opacity", s.plan.toFixed(3));
  set("glow", "opacity", s.dawn.toFixed(3));
}

export function NightLayers({ at = 0, painter, className = "", label }: {
  /** Fixed progress for still images (static mode). */
  at?: number;
  /** Animated use: receives a function that repaints the layers for a progress value (no React re-render). */
  painter?: MutableRefObject<((p: number) => void) | null>;
  className?: string;
  label?: string;
}) {
  const el = useRef<Refs>({});
  const reg = (k: string) => (node: SVGGElement | SVGElement | null) => {
    el.current[k] = node;
  };
  const geo = useMemo(() => ({
    out: stars(5, 170, [0, 0, VW, 600]),
    inn: stars(9, 260, [-400, -400, VW + 800, 1150]),
    arch: cuspedArchPath(GATE.w, GATE.h, { lobes: 7, riseRatio: 0.62 }),
    archFrame: cuspedArchPath(GATE.w + 34, GATE.h + 20, { lobes: 9, riseRatio: 0.62 }),
    smallArch: cuspedArchPath(26, 44, { lobes: 5, riseRatio: 0.6 }),
    courtArch: cuspedArchPath(70, 120, { lobes: 7, riseRatio: 0.62 }),
  }), []);

  // Portrait screens show the full height and crop the sides; lift the composition so the fortress clears the text.
  const svgRef = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    const layout = () => {
      const svg = svgRef.current;
      if (!svg || !svg.clientWidth) return;
      const r = svg.clientHeight / svg.clientWidth;
      const shift = r > 1.2 ? -Math.min(260, 110 + (r - 1.2) * 260) : 0;
      el.current.root?.setAttribute("transform", `translate(0 ${shift.toFixed(0)})`);
    };
    layout();
    window.addEventListener("resize", layout);
    return () => window.removeEventListener("resize", layout);
  }, []);

  useLayoutEffect(() => {
    paintLayers(at, el.current);
    if (painter) {
      painter.current = (p: number) => paintLayers(p, el.current);
      return () => {
        painter.current = null;
      };
    }
  }, [at, painter]);

  const crenels = Array.from({ length: 34 }, (_, i) => 470 + i * 20);
  return (
    <svg ref={svgRef} viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid slice" className={className}
      role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <defs>
        <linearGradient id="nl-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#06080c" />
          <stop offset="0.45" stopColor="#10182a" />
          <stop offset="0.68" stopColor="#1b2236" />
          <stop offset="0.76" stopColor="#3a3242" />
        </linearGradient>
        <radialGradient id="nl-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#d6b16d" stopOpacity="0.55" />
          <stop offset="0.4" stopColor="#c97962" stopOpacity="0.18" />
          <stop offset="1" stopColor="#c97962" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="nl-lamp" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffd89a" stopOpacity="0.9" />
          <stop offset="1" stopColor="#d6b16d" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="nl-stone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b3138" />
          <stop offset="1" stopColor="#1c181f" />
        </linearGradient>
        <linearGradient id="nl-gate" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b0f18" />
          <stop offset="1" stopColor="#241e20" />
        </linearGradient>
        {/* the gate opening is cut out of the outside layer, so the courtyard shows through it */}
        <mask id="nl-gatemask" maskUnits="userSpaceOnUse" x="-2000" y="-2000" width="6000" height="6000">
          <rect x="-2000" y="-2000" width="6000" height="6000" fill="#fff" />
          <g ref={reg("fortMask")}>
            <path d={geo.arch} transform={`translate(${GATE.cx - GATE.w / 2} ${GATE.base - GATE.h})`} fill="#000" />
          </g>
        </mask>
        <pattern id="nl-jali" width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M4 0 L5.2 2.8 L8 4 L5.2 5.2 L4 8 L2.8 5.2 L0 4 L2.8 2.8 Z" fill="none" stroke="#7a6550" strokeWidth="0.6" />
        </pattern>
      </defs>

      <g ref={reg("root")}>
      {/* ---------------------------------------------------------------- inside: courtyard, instrument, plan */}
      <g ref={reg("inside")}>
        <rect y="-300" width={VW} height={VH + 600} fill="url(#nl-sky)" />
        <g ref={reg("starsIn")}>
          {geo.inn.map((s, i) => <circle key={i} cx={f(s.x)} cy={f(s.y)} r={s.r.toFixed(2)} fill="#eee7d9" opacity={s.o.toFixed(2)} />)}
        </g>
        <circle cx={POLE.x} cy={POLE.y} r="2.5" fill="none" stroke="#d6b16d" strokeOpacity="0.5" />
        {/* courtyard arcade */}
        <rect x="0" y="720" width={VW} height="280" fill="#16131a" />
        {Array.from({ length: 9 }, (_, i) => 70 + i * 180).map((x) => (
          <path key={x} d={geo.courtArch} transform={`translate(${x} 600)`} fill="#0e0c12" stroke="#3b3138" />
        ))}
        <rect x="0" y="584" width={VW} height="16" fill="#2a2329" />
        {[110, 1490].map((x) => <Chhatri key={x} x={x} y={584} s={1.8} />)}
        <path d="M0 760 L1600 760 L1600 1300 L0 1300 Z" fill="#1d1920" />
        {/* the instrument: a gnomon wall pointing at the pole, with quadrant scales (original design) */}
        <g ref={reg("instrument")} opacity="0">
          <path d="M520 900 L1040 900 L1040 610 Z" fill="#3a3036" stroke="#6d5840" />
          <path d="M520 900 L1040 610" stroke="#d6b16d" strokeWidth="1.6" strokeDasharray="6 6" />
          {[0, 1].map((side) => (
            <path key={side} d={side ? "M1060 900 A 170 170 0 0 1 1230 730" : "M500 900 A 170 170 0 0 0 330 730"} fill="none" stroke="#c49a6c" strokeWidth="2" />
          ))}
          {Array.from({ length: 10 }, (_, i) => i).map((i) => {
            const a = (i / 9) * (Math.PI / 2);
            const r1 = 170;
            const r2 = i % 3 === 0 ? 184 : 177;
            return (
              <g key={i} stroke="#c49a6c" strokeWidth="1">
                <line x1={f(1060 + Math.sin(a) * r1)} y1={f(900 - Math.cos(a) * r1 + 0)} x2={f(1060 + Math.sin(a) * r2)} y2={f(900 - Math.cos(a) * r2)} />
                <line x1={f(500 - Math.sin(a) * r1)} y1={f(900 - Math.cos(a) * r1)} x2={f(500 - Math.sin(a) * r2)} y2={f(900 - Math.cos(a) * r2)} />
              </g>
            );
          })}
          {/* measured vs predicted, with uncertainty, fanned to the horizon (angles exaggerated, illustrative) */}
          <path d="M800 990 L700 760 L760 760 Z" fill="#c97962" opacity="0.32" />
          <path d="M800 990 L770 760 L842 760 Z" fill="#6da7d9" opacity="0.25" />
          <line x1="800" y1="990" x2="730" y2="760" stroke="#d6b16d" strokeWidth="2.4" />
          <line x1="800" y1="990" x2="806" y2="760" stroke="#6da7d9" strokeWidth="2.4" />
        </g>
        {/* the engraved plan of the courtyard (vault scene) */}
        <g ref={reg("plan")} opacity="0" transform="translate(800 820)">
          <ellipse rx="560" ry="150" fill="#0d1018" opacity="0.92" />
          {[150, 300, 450, 540].map((r) => <ellipse key={r} rx={r} ry={(r * 150) / 560} fill="none" stroke="#c49a6c" strokeOpacity="0.55" />)}
          {Array.from({ length: 72 }, (_, i) => (i * Math.PI * 2) / 72).map((a, i) => (
            <line key={i} x1={f(Math.cos(a) * 540)} y1={f(Math.sin(a) * 145)} x2={f(Math.cos(a) * (i % 6 ? 520 : 500))} y2={f(Math.sin(a) * (i % 6 ? 139 : 134))} stroke="#c49a6c" strokeOpacity="0.7" />
          ))}
          <line x1="0" y1="0" x2="-420" y2="-60" stroke="#d6b16d" strokeWidth="2" />
          <circle r="4" fill="#d6b16d" />
        </g>
      </g>
      {/* ---------------------------------------------------------------- outside: desert and fortress */}
      <g ref={reg("outside")} mask="url(#nl-gatemask)">
        <rect y="-300" width={VW} height={VH + 600} fill="url(#nl-sky)" />
        <g ref={reg("starsOut")}>
          {geo.out.map((s, i) => <circle key={i} cx={f(s.x)} cy={f(s.y)} r={s.r.toFixed(2)} fill="#eee7d9" opacity={s.o.toFixed(2)} />)}
        </g>
        <ellipse ref={reg("glow")} cx="800" cy="700" rx="520" ry="120" fill="url(#nl-glow)" />
        <g ref={reg("far")}>
          <path d="M0 708 C 200 690, 340 712, 520 698 S 900 704, 1080 694 S 1420 706, 1600 690 V 1000 H 0 Z" fill="#1a1820" />
        </g>
        <g ref={reg("fort")}>
          {/* terrace */}
          <path d="M380 760 L1220 760 L1260 790 L340 790 Z" fill="#17141a" />
          {/* outer wall with crenellations */}
          <rect x="460" y="640" width="680" height="122" fill="url(#nl-stone)" />
          {crenels.map((x) => <rect key={x} x={x} y="628" width="12" height="13" fill="#2c252c" />)}
          {/* bastions with chhatris */}
          {[440, 1160].map((x) => (
            <g key={x}>
              <rect x={x - 40} y="600" width="80" height="162" fill="#2a2329" />
              <rect x={x - 46} y="594" width="92" height="8" fill="#3d3236" />
              <Chhatri x={x} y={594} s={1.25} />
            </g>
          ))}
          {/* gate pishtaq (rectangular frame) */}
          <rect x={GATE.cx - 78} y="566" width="156" height="196" fill="#332a2f" />
          <rect x={GATE.cx - 84} y="558" width="168" height="10" fill="#4a3c3a" />
          <path d={geo.archFrame} transform={`translate(${GATE.cx - (GATE.w + 34) / 2} ${GATE.base - GATE.h - 20})`} fill="#2a2227" stroke="#6d5840" strokeWidth="1.2" />
          <path d={geo.arch} transform={`translate(${GATE.cx - GATE.w / 2} ${GATE.base - GATE.h})`} fill="none" stroke="#6d5840" strokeWidth="1" />
          {/* jharokha balcony above the gate with a jali screen */}
          <g transform={`translate(${GATE.cx} 548)`}>
            <path d="M-34 0 h68 l-6 10 h-56 Z" fill="#4a3c3a" />
            <rect x="-26" y="-40" width="52" height="40" fill="url(#nl-jali)" stroke="#5b4a40" />
            <path d="M-32 -40 C -30 -66, 30 -66, 32 -40 Z" fill="#3d3236" />
            <path d="M0 -60 v-8" stroke="#6d5840" strokeWidth="2" />
          </g>
          {/* small cusped windows */}
          {[540, 620, 980, 1060].map((x) => <path key={x} d={geo.smallArch} transform={`translate(${x - 13} 680)`} fill="#0f1119" />)}
          {/* lanterns either side of the gate */}
          {[GATE.cx - 64, GATE.cx + 64].map((x) => (
            <g key={x}>
              <circle cx={x} cy="700" r="22" fill="url(#nl-lamp)" />
              <circle cx={x} cy="700" r="2.4" fill="#ffe2b0" />
            </g>
          ))}
        </g>
        <path d="M0 860 C 260 830, 520 880, 800 856 S 1300 840, 1600 868 V 1000 H 0 Z" fill="#121016" />
        <path d="M0 930 C 300 900, 700 960, 1000 928 S 1400 920, 1600 940 V 1300 H 0 Z" fill="#0c0b0f" />
        {/* the brass reference line: from the viewer into the gate */}
        <g ref={reg("refline")} opacity="0">
          <line x1="800" y1="1300" x2="800" y2={GATE.base - 6} stroke="#d6b16d" strokeWidth="2.2" strokeDasharray="10 8" />
        </g>
      </g>

      </g>
    </svg>
  );
}

/** A chhatri (domed pavilion on pillars) silhouette standing on y. */
function Chhatri({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill="#2f282d">
      <rect x="-22" y="-4" width="44" height="4" />
      {[-18, -6, 6, 18].map((px) => <rect key={px} x={px - 1.6} y="-22" width="3.2" height="18" />)}
      <path d="M-26 -22 h52 l-4 -4 h-44 Z" fill="#3d3236" />
      <path d="M-18 -26 C -18 -44, 18 -44, 18 -26 Z" />
      <path d="M0 -42 v-7" stroke="#2f282d" strokeWidth="2" />
      <circle cx="0" cy="-50" r="1.6" fill="#6d5840" />
    </g>
  );
}
