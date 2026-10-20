import type { ReactNode } from "react";
import { cuspedArchPath } from "@/components/motifs";

/** Seeded pseudo-random numbers so the decorative star field renders identically on server and client. */
function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

/**
 * A doorway into the observatory: a cusped arch framing a quiet night sky over a desert horizon with a distant
 * pavilion. Decorative only; the stars are random and are not a real constellation.
 */
export function ThresholdArt({ className = "" }: { className?: string }) {
  const W = 320;
  const H = 420;
  const arch = cuspedArchPath(W - 40, H - 30, { lobes: 9, riseRatio: 0.62 });
  const r = rng(11);
  const stars = Array.from({ length: 70 }, () => ({ x: 20 + r() * (W - 40), y: 15 + r() * (H * 0.62), s: r() }));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden focusable="false">
      <defs>
        <clipPath id="thr-clip"><path d={arch} transform="translate(20 15)" /></clipPath>
        <linearGradient id="thr-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0a0d12" />
          <stop offset="0.6" stopColor="#10182a" />
          <stop offset="0.86" stopColor="#2a2a3a" />
          <stop offset="1" stopColor="#5a4636" />
        </linearGradient>
      </defs>
      <g clipPath="url(#thr-clip)">
        <rect width={W} height={H} fill="url(#thr-sky)" />
        {stars.map((s, i) => (
          <circle key={i} cx={s.x.toFixed(1)} cy={s.y.toFixed(1)} r={(0.35 + s.s * 1.05).toFixed(2)} fill="#eee7d9" opacity={(0.25 + s.s * 0.7).toFixed(2)} />
        ))}
        {/* dunes */}
        <path d={`M0 ${H - 95} C 70 ${H - 112}, 130 ${H - 92}, 190 ${H - 104} S 290 ${H - 98}, ${W} ${H - 110} V ${H} H 0 Z`} fill="#1c1a20" />
        <path d={`M0 ${H - 62} C 80 ${H - 80}, 170 ${H - 52}, ${W} ${H - 74} V ${H} H 0 Z`} fill="#141318" />
        {/* distant pavilion on the ridge */}
        <g transform={`translate(${W * 0.62} ${H - 104})`} fill="#0d0f15">
          <path d="M-14 -16 C -14 -27 -7 -32 0 -32 C 7 -32 14 -27 14 -16 Z" />
          <rect x="-17" y="-16" width="34" height="2.5" />
          <rect x="-13" y="-13.5" width="2.2" height="13" /><rect x="-4" y="-13.5" width="2.2" height="13" />
          <rect x="2" y="-13.5" width="2.2" height="13" /><rect x="11" y="-13.5" width="2.2" height="13" />
          <rect x="-16" y="-1" width="32" height="3" />
          <path d="M0 -32 v-4" stroke="#0d0f15" strokeWidth="1.4" />
        </g>
        {/* faint pre-dawn glow on the horizon */}
        <ellipse cx={W * 0.62} cy={H - 100} rx="120" ry="18" fill="#d6b16d" opacity="0.08" />
        {/* the sightline */}
        <line x1={W / 2} y1={H - 30} x2={W * 0.62} y2={H - 140} stroke="#d6b16d" strokeWidth="1" strokeDasharray="3 4" opacity="0.65" />
      </g>
      <path d={arch} transform="translate(20 15)" fill="none" stroke="#c49a6c" strokeWidth="1.2" />
      <path d={cuspedArchPath(W - 16, H - 18, { lobes: 11, riseRatio: 0.62 })} transform="translate(8 6)" fill="none" stroke="#c49a6c" strokeOpacity="0.35" />
    </svg>
  );
}

/** Two-column layout for sign-in and sign-up: the doorway art beside the form (art hidden on small screens). */
export function ThresholdLayout({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-16">
      <div className="min-w-0">{children}</div>
      <div className="hidden lg:block">
        <ThresholdArt className="w-full" />
        {aside && <div className="mt-5 text-sm text-ivory-dim">{aside}</div>}
      </div>
    </div>
  );
}
