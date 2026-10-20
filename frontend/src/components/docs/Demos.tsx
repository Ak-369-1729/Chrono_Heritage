"use client";

import { useMemo, useState } from "react";
import { AngularTape, AzimuthDial } from "@/components/charts/Azimuth";
import { deg, residual } from "@/lib/format";

function Slider({ id, label, value, min, max, step, onChange, unit = "°" }: { id: string; label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; unit?: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[minmax(7rem,9rem)_minmax(0,1fr)_4.5rem]">
      <label htmlFor={id} className="col-span-2 text-ivory-dim sm:col-span-1">{label}</label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="min-h-8 w-full accent-[var(--color-brass)]" />
      <output htmlFor={id} className="num text-right">{value}{unit}</output>
    </div>
  );
}

/** Residual demo: directed vs bidirectional comparison, with wraparound. */
export function ResidualDemo() {
  const [axis, setAxis] = useState(358);
  const [pred, setPred] = useState(181.5);
  const [mode, setMode] = useState<"directed" | "bidirectional">("bidirectional");
  const r = residual(axis, pred, mode);
  return (
    <figure className="niche my-6 p-4 sm:p-5">
      <div className="grid gap-6 md:grid-cols-[auto_1fr] md:items-center">
        <div className="mx-auto"><AzimuthDial measured={axis} predicted={pred} axisMode={mode} size={200} /></div>
        <div className="space-y-3">
          <Slider id="rd-axis" label="Measured axis" value={axis} min={0} max={359.5} step={0.5} onChange={setAxis} />
          <Slider id="rd-pred" label="Prediction" value={pred} min={0} max={359.5} step={0.5} onChange={setPred} />
          <fieldset className="flex flex-wrap gap-4 text-sm">
            <legend className="sr-only">Axis mode</legend>
            {(["directed", "bidirectional"] as const).map((m) => (
              <label key={m} className="flex items-center gap-2"><input type="radio" checked={mode === m} onChange={() => setMode(m)} className="accent-[var(--color-gold)]" />{m}</label>
            ))}
          </fieldset>
          <p className="num text-lg" aria-live="polite">Residual {deg(r, 2, true)}</p>
          <AngularTape measured={axis} predicted={pred} axisMode={mode} halfWidth={Math.max(4, Math.ceil(Math.abs(r)) + 2)} height={110} />
        </div>
      </div>
      <figcaption className="mt-3 text-xs text-mist">
        Try an axis of 358° against a prediction of 181.5°. As a directed axis the residual is about 176.5°; as an undirected line it is
        −3.5°, because the opposite end (178°) is compared. Evaluating both ends doubles the chance of a coincidental match, so
        every analysis of a bidirectional axis says so.
      </figcaption>
    </figure>
  );
}

/** Horizon demo: closed-form rise azimuth as the horizon rises (geocentric, airless, solar centre). */
export function HorizonDemo() {
  const [lat, setLat] = useState(52);
  const [h, setH] = useState(0);
  const [dec, setDec] = useState(-23.9);
  const rad = Math.PI / 180;
  const az = (hh: number) => {
    const c = (Math.sin(dec * rad) - Math.sin(lat * rad) * Math.sin(hh * rad)) / (Math.cos(lat * rad) * Math.cos(hh * rad));
    return Math.abs(c) <= 1 ? Math.acos(c) / rad : null;
  };
  const a0 = az(0);
  const a1 = az(h);
  return (
    <figure className="niche my-6 p-4 sm:p-5">
      <div className="space-y-3">
        <Slider id="hd-lat" label="Latitude" value={lat} min={-60} max={60} step={1} onChange={setLat} />
        <Slider id="hd-dec" label="Solar declination" value={dec} min={-24.2} max={24.2} step={0.1} onChange={setDec} />
        <Slider id="hd-h" label="Horizon altitude" value={h} min={0} max={8} step={0.25} onChange={setH} />
      </div>
      <p className="num mt-4 text-lg" aria-live="polite">
        {a0 === null || a1 === null ? "The Sun does not rise at this latitude and declination." : <>Rise azimuth {deg(a1, 2)}, shifted {deg(a1 - a0, 2, true)} from a flat horizon.</>}
      </p>
      <figcaption className="mt-2 text-xs text-mist">
        Teaching approximation using cos A = (sin δ − sin φ sin h) / (cos φ cos h) for the solar centre, without refraction or parallax.
        The platform itself uses full ephemeris calculations with refraction and a measured profile. A two-degree ridge can move a
        winter sunrise by several degrees at high latitude, which is why a flat horizon is always reported as an assumption.
      </figcaption>
    </figure>
  );
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Monte Carlo demo: residual spread from orientation σ and a chronology-driven prediction drift. */
export function MonteCarloDemo() {
  const [sigma, setSigma] = useState(1);
  const [span, setSpan] = useState(0.6);
  const [seed, setSeed] = useState(42);
  const { bins, lo, hi, q } = useMemo(() => {
    const rnd = mulberry32(seed);
    const n = 6000;
    const xs: number[] = [];
    for (let i = 0; i < n; i++) {
      const u1 = rnd() || 1e-9;
      const u2 = rnd();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      xs.push(-1.5 + sigma * z - span * rnd());
    }
    xs.sort((a, b) => a - b);
    const lo = -8;
    const hi = 5;
    const bins = new Array(52).fill(0);
    for (const x of xs) {
      const k = Math.floor(((x - lo) / (hi - lo)) * bins.length);
      if (k >= 0 && k < bins.length) bins[k]++;
    }
    return { bins, lo, hi, q: [xs[Math.floor(0.025 * n)], xs[Math.floor(0.5 * n)], xs[Math.floor(0.975 * n)]] };
  }, [sigma, span, seed]);
  const max = Math.max(...bins);
  const W = 560;
  const H = 140;
  const x = (v: number) => 10 + ((v - lo) / (hi - lo)) * (W - 20);
  return (
    <figure className="niche my-6 p-4 sm:p-5">
      <div className="space-y-3">
        <Slider id="mc-s" label="Orientation σ" value={sigma} min={0.1} max={3} step={0.1} onChange={setSigma} />
        <Slider id="mc-c" label="Prediction drift across dates" value={span} min={0} max={2} step={0.1} onChange={setSpan} />
        <div className="flex items-center gap-3 text-sm"><span className="text-ivory-dim">Seed {seed}</span><button className="btn btn-quiet px-2 py-1 text-xs" onClick={() => setSeed((s) => s + 1)}>New seed</button></div>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 24}`} className="mt-4 w-full" role="img" aria-label={`Histogram of simulated residuals: median ${q[1].toFixed(2)}°, 95% interval ${q[0].toFixed(2)}° to ${q[2].toFixed(2)}°.`}>
        <rect x={x(q[0])} y={0} width={x(q[2]) - x(q[0])} height={H} fill="var(--color-sky)" opacity="0.1" />
        {bins.map((b, i) => {
          const bw = (W - 20) / bins.length;
          const hgt = (b / max) * (H - 6);
          return <rect key={i} x={10 + i * bw} y={H - hgt} width={bw - 1} height={hgt} fill="var(--color-sky)" />;
        })}
        <line x1={x(0)} x2={x(0)} y1={0} y2={H} stroke="var(--color-gold)" strokeDasharray="3 3" />
        <line x1={x(q[1])} x2={x(q[1])} y1={0} y2={H} stroke="var(--color-ivory)" />
        {[-8, -6, -4, -2, 0, 2, 4].map((t) => <text key={t} x={x(t)} y={H + 16} fontSize="11" textAnchor="middle" fill="var(--color-mist)">{t}°</text>)}
      </svg>
      <p className="num mt-1 text-sm" aria-live="polite">Median {deg(q[1], 2, true)}; 95% interval {deg(q[0], 2, true)} to {deg(q[2], 2, true)}.</p>
      <figcaption className="mt-2 text-xs text-mist">Illustrative simulation in the browser. The same seed always reproduces the same histogram; the platform records the seed and generator with every analysis.</figcaption>
    </figure>
  );
}
