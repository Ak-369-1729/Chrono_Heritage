"use client";

import { useLayoutEffect, useMemo, useRef, type MutableRefObject } from "react";
import { cuspedArchPath } from "@/components/motifs";
import { layerState } from "./choreography";

/**
 * The layered 2D renderer: an SVG composition of desert dusk, fortress, gateway and courtyard whose layers are
 * moved by scroll progress. It needs no WebGL, so it serves phones, low-power devices and browsers without WebGL,
 * and (rendered at a fixed progress) the still images of the static mode. All geometry is illustrative.
 */

const VW = 1600;
const VH = 1000;
const GATE = { cx: 800, base: 742, w: 92, h: 150 }; // gate opening in the outside view
const f = (n: number) => n.toFixed(1);

const EXTERIOR_STARS = [
  [91, 108, 1.3, 0.42], [218, 76, 1.7, 0.48], [339, 155, 1.1, 0.36],
  [462, 95, 1.2, 0.4], [568, 188, 1.6, 0.48], [686, 119, 1.1, 0.35],
  [921, 84, 1.5, 0.45], [1048, 152, 1.1, 0.37], [1176, 96, 1.8, 0.5],
  [1302, 188, 1.2, 0.4], [1459, 111, 1.4, 0.43], [1530, 232, 1, 0.34],
  [158, 292, 1, 0.33], [793, 274, 1.3, 0.4], [1124, 317, 1, 0.32],
] as const;

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
  set("starsOut", "transform", `rotate(${(-s.skyTurnDeg * 0.25).toFixed(2)} 800 300)`);
  set("instrument", "opacity", s.instrument.toFixed(3));
  set("plan", "opacity", s.plan.toFixed(3));
  set("gallery", "opacity", s.gallery.toFixed(3));
  set("horizons", "opacity", s.horizons.toFixed(3));
  set("vaultRoom", "opacity", s.vault.toFixed(3));
  set("terrace", "opacity", s.terrace.toFixed(3));
  set("city", "opacity", s.terrace.toFixed(3));
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
          <stop offset="0" stopColor="#34364e" />
          <stop offset="0.3" stopColor="#55516a" />
          <stop offset="0.51" stopColor="#806477" />
          <stop offset="0.68" stopColor="#b77b70" />
          <stop offset="0.82" stopColor="#df9a6c" />
          <stop offset="1" stopColor="#bd765b" />
        </linearGradient>
        <radialGradient id="nl-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffe0a0" stopOpacity="0.72" />
          <stop offset="0.4" stopColor="#e89a70" stopOpacity="0.3" />
          <stop offset="1" stopColor="#c97962" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="nl-lamp" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffd89a" stopOpacity="0.9" />
          <stop offset="1" stopColor="#d6b16d" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="nl-stone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#986c5c" />
          <stop offset="0.28" stopColor="#68474a" />
          <stop offset="1" stopColor="#392c33" />
        </linearGradient>
        <linearGradient id="nl-gate" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4b3945" />
          <stop offset="1" stopColor="#241e28" />
        </linearGradient>
        <linearGradient id="nl-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#98735e" />
          <stop offset="0.2" stopColor="#896d61" />
          <stop offset="0.56" stopColor="#746365" />
          <stop offset="1" stopColor="#62575e" />
        </linearGradient>
        <linearGradient id="nl-track" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#aa835e" />
          <stop offset="0.52" stopColor="#92745f" />
          <stop offset="1" stopColor="#776b70" />
        </linearGradient>
        <linearGradient id="nl-court" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8c6c5c" />
          <stop offset="0.35" stopColor="#785e58" />
          <stop offset="1" stopColor="#66585a" />
        </linearGradient>
        <linearGradient id="nl-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e4a17c" stopOpacity="0" />
          <stop offset="0.55" stopColor="#d39378" stopOpacity="0.2" />
          <stop offset="1" stopColor="#d39378" stopOpacity="0" />
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
        <clipPath id="nl-arcade-view">
          {Array.from({ length: 9 }, (_, i) => 70 + i * 180).map((x) => (
            <path key={x} d={geo.courtArch} transform={`translate(${x} 600)`} />
          ))}
        </clipPath>
      </defs>

      <g ref={reg("root")}>
      {/* ---------------------------------------------------------------- inside: courtyard, instrument, plan */}
      <g ref={reg("inside")}>
        <rect y="-300" width={VW} height={VH + 600} fill="url(#nl-sky)" />
        <ellipse cx="800" cy="635" rx="730" ry="205" fill="url(#nl-glow)" opacity="0.64" />
        {/* courtyard arcade */}
        <rect x="0" y="720" width={VW} height="280" fill="#3c3033" />
        {Array.from({ length: 9 }, (_, i) => 70 + i * 180).map((x) => (
          <path key={x} d={geo.courtArch} transform={`translate(${x} 600)`} fill="#493c3e" stroke="#806454" />
        ))}
        <g ref={reg("city")} opacity="0" clipPath="url(#nl-arcade-view)" fill="#705453">
          <path d="M0 715 V680 H45 V655 H82 V681 H116 V642 H151 V669 H188 V650 H226 V688 H264 V660 H306 V675 H348 V636 H386 V669 H428 V650 H462 V682 H503 V646 H547 V677 H594 V657 H636 V690 H684 V643 H724 V667 H762 V651 H800 V680 H842 V650 H881 V676 H923 V638 H963 V667 H1004 V649 H1046 V688 H1088 V656 H1126 V680 H1171 V642 H1212 V674 H1250 V652 H1292 V686 H1330 V649 H1374 V670 H1414 V640 H1454 V676 H1490 V652 H1534 V680 H1600 V760 H0 Z" />
          <path d="M0 716 V692 H1600 V760 H0 Z" fill="#493b40" />
          {[112, 252, 424, 583, 746, 918, 1082, 1251, 1423, 1534].map((x) => (
            <g key={x} fill="#e2b485" opacity="0.55">
              <rect x={x} y="681" width="5" height="8" />
              <rect x={x + 11} y="697" width="4" height="7" />
            </g>
          ))}
        </g>
        {Array.from({ length: 8 }, (_, i) => 160 + i * 180).map((x) => (
          <g key={x}>
            <rect x={x - 5} y="603" width="10" height="114" fill="#30272d" stroke="#806454" strokeWidth="2" />
            <rect x={x - 13} y="596" width="26" height="8" fill="#806454" />
            <rect x={x - 12} y="714" width="24" height="9" fill="#6f564e" />
          </g>
        ))}
        <rect x="0" y="584" width={VW} height="16" fill="#2a2329" />
        {[110, 1490].map((x) => <Chhatri key={x} x={x} y={584} s={1.8} />)}
        <path d="M0 760 C 280 756 530 766 800 760 S 1320 756 1600 762 L1600 1300 L0 1300 Z" fill="url(#nl-court)" />
        <path d="M770 760 L830 760 L1132 1300 L468 1300 Z" fill="url(#nl-track)" opacity="0.38" />
        <g fill="none" stroke="#c49a6c" strokeOpacity="0.2">
          {[790, 824, 868, 924, 994, 1080].map((y, i) => (
            <path key={y} d={`M${260 - i * 30} ${y} Q800 ${y + (i % 2 ? 5 : -3)} ${1340 + i * 30} ${y}`} />
          ))}
          <path d="M520 760 Q570 890 470 1200" />
          <path d="M1080 760 Q1030 890 1130 1200" />
        </g>
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
        <g ref={reg("gallery")} opacity="0">
          <rect width={VW} height={VH} fill="#49383a" />
          <path d="M0 140 L800 320 L1600 140 V760 L800 660 L0 760 Z" fill="#6d5148" />
          <path d="M0 760 L800 660 L1600 760 V1000 H0 Z" fill="url(#nl-court)" />
          <path d="M0 135 Q800 -110 1600 135" fill="none" stroke="#c49a6c" strokeWidth="34" />
          {[0, 1, 2, 3, 4].map((i) => (
            <path key={i} d={`M${i * 400} 160 Q800 ${-20 + i * 18} ${1600 - i * 400} 160`} fill="none" stroke="#9c765e" strokeWidth="9" opacity="0.8" />
          ))}
          {[235, 510, 800, 1090, 1365].map((x) => (
            <g key={x} transform={`translate(${x} 286)`}>
              <path d={geo.courtArch} transform="translate(-38 0) scale(1.08 1.25)" fill="#30272d" stroke="#d0a477" strokeWidth="4" />
              <rect x="-31" y="28" width="62" height="72" fill="url(#nl-jali)" opacity="0.85" />
              <path d="M-52 118 H52 L62 132 H-62 Z" fill="#c49a6c" />
            </g>
          ))}
          <path d="M0 745 L800 650 L1600 745" fill="none" stroke="#d2ae82" strokeWidth="7" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <path key={i} d={`M${220 + i * 175} 1000 L${690 + i * 44} 666`} fill="none" stroke="#c49a6c" strokeOpacity="0.35" strokeWidth="3" />
          ))}
        </g>
        <g ref={reg("horizons")} opacity="0">
          <rect width={VW} height={VH} fill="#302b35" />
          <path d="M0 180 Q800 -70 1600 180 V740 L800 660 L0 740 Z" fill="#74554e" />
          <path d="M0 632 Q290 596 545 624 T1080 618 T1600 628 V760 H0 Z" fill="#5d5557" />
          <path d="M0 760 L800 654 L1600 760 V1000 H0 Z" fill="url(#nl-court)" />
          <path d={geo.courtArch} transform="translate(558 168) scale(6.9 4.8)" fill="#282630" stroke="#d0a477" strokeWidth="7" />
          <path d="M680 520 Q800 475 920 520 V640 H680 Z" fill="#d99668" />
          <path d="M680 532 Q800 510 920 532" fill="none" stroke="#f1c38c" strokeWidth="5" />
          <g fill="#e9c48f" opacity="0.72">
            {[716, 756, 800, 844, 884].map((x) => <circle key={x} cx={x} cy={552 - Math.abs(800 - x) * 0.16} r="3" />)}
          </g>
          {[180, 320, 480, 1120, 1280, 1420].map((x) => (
            <path key={x} d={`M${x} 1000 L${800 + (x - 800) * 0.14} 660`} stroke="#d4b086" strokeOpacity="0.35" strokeWidth="3" />
          ))}
          <path d="M0 1000 H1600 M0 910 Q800 790 1600 910 M0 830 Q800 720 1600 830" fill="none" stroke="#c49a6c" strokeOpacity="0.32" strokeWidth="3" />
        </g>
        <g ref={reg("vaultRoom")} opacity="0">
          <rect width={VW} height={VH} fill="#2c262a" />
          <path d="M0 0 H1600 V720 L800 630 L0 720 Z" fill="#49383a" />
          <path d="M0 720 L800 630 L1600 720 V1000 H0 Z" fill="url(#nl-court)" />
          <path d="M530 750 V160 Q800 60 1070 160 V750" fill="#30272d" stroke="#b18a64" strokeWidth="10" />
          {[110, 275, 1325, 1490].map((x) => (
            <g key={x}>
              <rect x={x} y="190" width="145" height="490" fill="#332a2d" stroke="#8e6b52" strokeWidth="5" />
              {[270, 375, 480, 585].map((y) => (
                <g key={y}>
                  <path d={`M${x + 10} ${y} h125`} stroke="#b18a64" strokeWidth="8" />
                  {[0, 1, 2, 3].map((i) => (
                    <ellipse key={i} cx={x + 30 + i * 29} cy={y - 14} rx="10" ry="17" fill={i % 2 ? "#d6b16d" : "#d5c09e"} />
                  ))}
                </g>
              ))}
            </g>
          ))}
          <path d="M620 700 V190 Q800 120 980 190 V700" fill="#45383a" stroke="#c49a6c" strokeWidth="6" />
          <path d="M700 700 V290 Q800 240 900 290 V700" fill="#d49468" opacity="0.24" />
          {[0, 1, 2, 3].map((i) => (
            <path key={i} d={`M${620 + i * 30} 700 L${760 + i * 10} 640 M${980 - i * 30} 700 L${840 - i * 10} 640`} stroke="#d6b16d" strokeOpacity="0.55" strokeWidth="3" />
          ))}
          <path d="M0 895 Q800 760 1600 895 M0 960 Q800 820 1600 960" fill="none" stroke="#c49a6c" strokeOpacity="0.3" strokeWidth="3" />
        </g>
      </g>
      {/* ---------------------------------------------------------------- outside: desert and fortress */}
      <g ref={reg("outside")} mask="url(#nl-gatemask)">
        <rect y="-300" width={VW} height={VH + 600} fill="url(#nl-sky)" />
        <g ref={reg("starsOut")}>
          {EXTERIOR_STARS.map(([x, y, radius, opacity], i) => (
            <circle key={i} cx={x} cy={y} r={radius} fill="#fff0da" opacity={opacity} />
          ))}
        </g>
        <ellipse ref={reg("glow")} cx="800" cy="700" rx="520" ry="120" fill="url(#nl-glow)" />
        <g ref={reg("far")}>
          <path d="M0 708 C 200 690 340 712 520 698 S900 704 1080 694 S1420 706 1600 690 V1000 H0Z" fill="#65535b" />
          <path d="M0 738 C 170 716 260 744 430 725 S730 736 900 718 S1260 740 1600 716 V1000 H0Z" fill="#745957" opacity="0.68" />
          <path d="M0 770 C 220 780 360 756 540 774 S900 760 1080 776 S1400 758 1600 772 V1300 H0Z" fill="url(#nl-ground)" />
          <rect x="0" y="690" width={VW} height="120" fill="url(#nl-haze)" />
        </g>
        <g ref={reg("fort")}>
          {/* terrace */}
          <path d="M380 760 L1220 760 L1260 790 L340 790 Z" fill="#382b30" />
          <path d="M340 790 L1260 790 L1280 802 L320 802 Z" fill="#59443f" />
          <path d="M346 791 L1254 791" fill="none" stroke="#c49a6c" strokeOpacity="0.42" strokeWidth="2" />
          {/* stepped jharokha tiers give the fallback the same palace facade as the 3D scene. */}
          <rect x="460" y="450" width="680" height="150" fill="url(#nl-stone)" stroke="#b18a64" strokeWidth="3" />
          {[0, 1, 2, 3].map((row) => (
            <g key={row}>
              {Array.from({ length: 9 }, (_, i) => 502 + i * 70).map((x) => (
                <g key={x}>
                  <path d={geo.smallArch} transform={`translate(${x - 13} ${574 - row * 34}) scale(1 0.72)`} fill="#30272d" stroke="#c49a6c" strokeWidth="1.5" />
                  <rect x={x - 9} y={557 - row * 34} width="18" height="17" fill="url(#nl-jali)" opacity="0.9" />
                  <path d={`M${x - 19} ${576 - row * 34} h38 l5 5 h-48 Z`} fill="#8e6654" />
                </g>
              ))}
              <path d={`M460 ${580 - row * 34} H1140`} stroke="#c49a6c" strokeOpacity="0.75" strokeWidth="3" />
            </g>
          ))}
          {/* outer wall with crenellations */}
          <rect x="460" y="640" width="680" height="122" fill="url(#nl-stone)" />
          {crenels.map((x) => <rect key={x} x={x} y="628" width="12" height="13" fill="#654a45" />)}
          {/* bastions with chhatris */}
          {[440, 1160].map((x) => (
            <g key={x}>
              <rect x={x - 40} y="600" width="80" height="162" fill="#49363a" />
              <rect x={x - 46} y="594" width="92" height="8" fill="#795a4c" />
              <Chhatri x={x} y={594} s={1.25} />
            </g>
          ))}
          {/* gate pishtaq (rectangular frame) */}
          <rect x={GATE.cx - 78} y="566" width="156" height="196" fill="#644943" />
          <rect x={GATE.cx - 84} y="558" width="168" height="10" fill="#99705a" />
          <path d={geo.archFrame} transform={`translate(${GATE.cx - (GATE.w + 34) / 2} ${GATE.base - GATE.h - 20})`} fill="#382b33" stroke="#b18a64" strokeWidth="1.2" />
          <path d={geo.arch} transform={`translate(${GATE.cx - GATE.w / 2} ${GATE.base - GATE.h})`} fill="none" stroke="#b18a64" strokeWidth="1" />
          {/* jharokha balcony above the gate with a jali screen */}
          <g transform={`translate(${GATE.cx} 548)`}>
            <path d="M-34 0 h68 l-6 10 h-56 Z" fill="#99705a" />
            <rect x="-26" y="-40" width="52" height="40" fill="url(#nl-jali)" stroke="#a78163" />
            <path d="M-32 -40 C -30 -66, 30 -66, 32 -40 Z" fill="#795a4c" />
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
        <path d="M770 790 C 764 866 674 1002 468 1300 L1132 1300 C926 1002 836 866 830 790 Z" fill="url(#nl-track)" />
        <g fill="none" stroke="#d3ae82" strokeOpacity="0.42">
          <path d="M770 790 C764 866 674 1002 468 1300" />
          <path d="M830 790 C836 866 926 1002 1132 1300" />
        </g>
        <g fill="none" stroke="#443b42" strokeOpacity="0.44" strokeWidth="2">
          {[
            [808, 812, 18],
            [806, 838, 44],
            [804, 871, 74],
            [802, 913, 112],
            [800, 966, 160],
            [798, 1032, 216],
            [796, 1112, 282],
            [794, 1208, 360],
          ].map(([x, y, half], i) => (
            <path key={i} d={`M${x - half} ${y} Q${x} ${y + 4} ${x + half} ${y}`} />
          ))}
        </g>
        <g fill="#55464a" stroke="#a08062" strokeOpacity="0.5">
          <path d="M170 835 l24 -12 19 9 -8 19 -30 3 Z" />
          <path d="M1378 824 l28 -13 17 13 -9 19 -31 -2 Z" />
          <path d="M286 914 l16 -10 18 8 -6 15 -24 2 Z" />
          <path d="M1308 938 l22 -12 18 12 -8 17 -28 -3 Z" />
        </g>
        <g fill="none" stroke="#b69a70" strokeOpacity="0.62" strokeLinecap="round">
          <path d="M240 850 l-7 -20 m7 20 8 -24 m-8 24 16 -17 M1320 870 l-5 -21 m5 21 12 -25 m-12 25 19 -18" />
          <path d="M126 944 l-8 -23 m8 23 11 -27 m-11 27 18 -16 M1450 920 l-5 -20 m5 20 12 -22 m-12 22 18 -15" strokeOpacity="0.42" />
        </g>
        {/* the brass reference line: from the viewer into the gate */}
        <g ref={reg("refline")} opacity="0">
          <line x1="800" y1="1300" x2="800" y2={GATE.base - 6} stroke="#d6b16d" strokeWidth="2.2" strokeDasharray="10 8" />
        </g>
      </g>

      <g ref={reg("terrace")} opacity="0" aria-hidden="true">
        <path d="M0 861 Q800 838 1600 861 V1000 H0 Z" fill="url(#nl-ground)" />
        <path d="M0 865 Q800 842 1600 865" fill="none" stroke="#9a705a" strokeWidth="22" />
        <path d="M0 850 Q800 827 1600 850" fill="none" stroke="#dbb489" strokeWidth="6" />
        {Array.from({ length: 17 }, (_, i) => 48 + i * 94).map((x) => (
          <g key={x}>
            <path d={`M${x} 852 v-50 l-7 -9 h14 l-7 9`} fill="#9a705a" />
            <path d={`M${x - 9} 855 h18`} stroke="#dfb891" strokeWidth="3" />
          </g>
        ))}
        <path d="M0 925 Q800 902 1600 925" fill="none" stroke="#c49a6c" strokeWidth="3" opacity="0.72" />
        <g fill="#e2b485" opacity="0.68">
          <circle cx="94" cy="844" r="3" /><circle cx="1506" cy="844" r="3" />
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
