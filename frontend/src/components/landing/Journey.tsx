"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { motionReduced } from "@/lib/prefs";
import type { Preferences } from "@/lib/types";
import { captionOpacity, ramp, SCENE_ORDER, SCENES, sceneAnchor, sceneAt, window4, type SceneKey } from "./choreography";
import { HERO, ILLUSTRATIVE_CAPTION, SCENE_COPY } from "./copy";
import { LandingDataProvider, useLandingData } from "./data";
import { LABELS } from "./labels";
import type { Quality } from "./fortress/FortressScene";
import { NightLayers } from "./NightLayers";
import { FireflyNavigation } from "./FireflyNavigation";
import { CHART, ChartFrame, chartScales, EpochPanel, InstrumentPanel, LedgerPanel } from "./panels";

const FortressScene = dynamic(() => import("./fortress/FortressScene"), { ssr: false });

type Mode = "detecting" | "3d" | "layers" | "static";
interface ModeState { mode: Mode; quality: Quality; reason: string | null; forced?: boolean }

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function lowPower(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return (navigator.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4;
}

/** Decide how to render the journey for this device and these preferences. */
export function decideMode(prefs: Preferences, env: { webgl: boolean; width: number; lowPower: boolean; reduced: boolean; query: string | null }): ModeState {
  if (env.query === "static" || prefs.landing === "static") return { mode: "static", quality: "lite", reason: "You chose still images." };
  if (env.reduced) return { mode: "static", quality: "lite", reason: "Motion is reduced (by your device or your preferences), so the scroll-driven scenes are shown as still images." };
  if (env.query === "layers" || prefs.landing === "layers") return { mode: "layers", quality: "lite", reason: null };
  if (!env.webgl) return { mode: "layers", quality: "lite", reason: "WebGL is not available, so the journey uses layered illustrations instead of 3D." };
  if (env.query === "3d" || prefs.landing === "3d") return { mode: "3d", quality: env.lowPower ? "lite" : "high", reason: null, forced: true };
  if (env.width < 768) return { mode: "layers", quality: "lite", reason: null };
  return { mode: "3d", quality: env.lowPower ? "lite" : "high", reason: null };
}

export function Journey() {
  const { preferences, ready, savePreferences } = useAuth();
  const [state, setState] = useState<ModeState>({ mode: "detecting", quality: "high", reason: null });

  useEffect(() => {
    if (!ready) return;
    setState(decideMode(preferences, {
      webgl: hasWebGL(), width: window.innerWidth, lowPower: lowPower(), reduced: motionReduced(preferences.motion),
      query: new URLSearchParams(window.location.search).get("view"),
    }));
  }, [ready, preferences]);

  const choose = (landing: NonNullable<Preferences["landing"]>) => void savePreferences({ landing }).catch(() => undefined);

  return (
    <LandingDataProvider>
      {state.mode === "static" ? (
        <StaticJourney reason={state.reason} onAnimate={!motionReduced(preferences.motion) ? () => choose("auto") : undefined} />
      ) : (
        <PinnedJourney
          state={state}
          // Only a scene that is still showing can fail: unmounting the canvas (after a switch) also loses its context.
          onFail={() => setState((s) => s.mode === "3d" ? { mode: "layers", quality: "lite", reason: "The 3D scene could not start on this device, so layered illustrations are shown." } : s)}
          onSlow={() => setState((s) => s.mode === "3d" ? { mode: "layers", quality: "lite", reason: "This device rendered the 3D scene too slowly, so the lighter layered illustrations are shown instead." } : s)}
          onChooseStatic={() => choose("static")}
        />
      )}
    </LandingDataProvider>
  );
}

/* --------------------------------------------------------------------------------------------- hero text */

function HeroText({ exploreHref, onExplore }: { exploreHref: string; onExplore?: (e: React.MouseEvent) => void }) {
  const { user } = useAuth();
  return (
    <div className="max-w-[56rem]">
      <h1 className="inscription text-ivory [text-shadow:0_2px_30px_rgba(5,7,11,.7)]" style={{ fontSize: "clamp(1.55rem, calc((100vw - 2.5rem) / 11.4), 6.2rem)" }}>
        {HERO.title}
      </h1>
      <p className="prose-serif mt-5 text-[1.25rem] italic text-brass-bright [text-shadow:0_1px_14px_rgba(5,7,11,.85)] md:text-[1.6rem]">{HERO.lede}</p>
      <p className="mt-4 max-w-[36rem] text-[0.98rem] text-ivory/85 [text-shadow:0_1px_12px_rgba(5,7,11,.9)]">{HERO.sub}</p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Link href="/atlas" className="btn btn-primary px-6 py-3 text-[0.95rem]">Enter the Observatory</Link>
        <a href={exploreHref} onClick={onExplore} className="btn btn-quiet border-ivory/30 bg-obsidian/40 px-6 py-3 text-[0.95rem] backdrop-blur-[2px]">Explore the Science</a>
        {!user && <Link href="/register" className="btn px-3 text-[0.95rem] text-ivory/85 underline decoration-ivory/30 underline-offset-4 hover:text-ivory">Create account</Link>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------- pinned mode */

function PinnedJourney({ state, onFail, onSlow, onChooseStatic }: { state: ModeState; onFail: () => void; onSlow: () => void; onChooseStatic: () => void }) {
  const section = useRef<HTMLElement>(null);
  const progress = useRef(0);
  const painter = useRef<((p: number) => void) | null>(null);
  const [active, setActive] = useState(true);
  const [canvasReady, setCanvasReady] = useState(false);
  const [current, setCurrent] = useState<SceneKey>("threshold");
  const els = useRef<Record<string, HTMLElement | SVGElement | null>>({});
  const labels = useRef<(HTMLElement | null)[]>([]);
  const narrow = useRef(false);
  const [isNarrow, setNarrow] = useState(false);
  const reg = (k: string) => (el: HTMLElement | SVGElement | null) => {
    els.current[k] = el;
  };
  const ready = state.mode === "3d" || state.mode === "layers";
  const { preferences } = useAuth();
  const data = useLandingData();
  const scales = chartScales(data.epoch.data?.points ?? null);

  useEffect(() => {
    const el = section.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setActive(e.isIntersecting), { rootMargin: "100px" });
    io.observe(el);
    const onResize = () => {
      narrow.current = window.innerWidth < 768;
      setNarrow(narrow.current);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => {
      io.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const repaint = useCallback((p: number) => {
    progress.current = p;
    painter.current?.(p);
    paintOverlay(p, els.current, narrow.current, scales.axisY);
    const k = sceneAt(p);
    setCurrent((c) => (c === k ? c : k));
  }, [scales.axisY]);

  useLayoutEffect(() => {
    if (!ready) return;
    let ctx: { revert: () => void } | undefined;
    let cancelled = false;
    (async () => {
      const { gsap } = await import("gsap");
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      if (cancelled || !section.current) return;
      gsap.registerPlugin(ScrollTrigger);
      ctx = gsap.context(() => {
        const proxy = { p: 0 };
        gsap.to(proxy, {
          p: 1,
          ease: "none",
          scrollTrigger: { trigger: section.current, start: "top top", end: "bottom bottom", scrub: 0.6 },
          onUpdate: () => repaint(proxy.p),
        });
      }, section);
      repaint(progress.current);
    })();
    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, [ready, repaint]);

  const goTo = (k: SceneKey) => {
    const el = section.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const y = top + sceneAnchor(k) * (el.offsetHeight - window.innerHeight);
    window.scrollTo({ top: y, behavior: motionReduced(preferences.motion) ? "auto" : "smooth" });
  };

  const use3d = state.mode === "3d";
  return (
    <section ref={section} aria-label="Introduction: a journey into the observatory" data-mode={state.mode} className="relative" style={{ height: "760vh" }}>
      <div className="sticky top-0 h-[100svh] overflow-hidden bg-obsidian">
        {/* background renderer: layered 2D always paints first; 3D fades in over it when ready */}
        <NightLayers painter={painter} className={`absolute inset-0 h-full w-full transition-opacity duration-700 ${use3d && canvasReady ? "opacity-0" : "opacity-100"}`} />
        {use3d && (
          <div className={`absolute inset-0 transition-opacity duration-1000 ${canvasReady ? "opacity-100" : "opacity-0"}`}>
            <FortressScene progress={progress} labels={labels} quality={state.quality} active={active} onFail={onFail} onReady={() => setCanvasReady(true)}
              onSlow={state.forced ? undefined : onSlow} />
          </div>
        )}
        {use3d && (
          <div aria-hidden className="pointer-events-none absolute inset-0">
            {LABELS.map((t, i) => (
              <span key={t} ref={(el) => { labels.current[i] = el; }} style={{ opacity: 0, visibility: "hidden" }}
                className={`absolute left-0 top-0 whitespace-nowrap text-xs font-medium [text-shadow:0_1px_8px_rgba(5,7,11,.95)] ${["text-brass-bright", "text-evidence", "text-ivory"][i]}`}>
                {t}
              </span>
            ))}
          </div>
        )}
        {/* legibility vignette: left and bottom */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(5,7,11,.58)_0%,rgba(5,7,11,.18)_42%,rgba(5,7,11,0)_64%),linear-gradient(0deg,rgba(5,7,11,.3)_0%,rgba(5,7,11,0)_40%)]" />
        <FireflyNavigation room={current} />

        {/* A: the threshold */}
        <div ref={reg("hero")} className="absolute inset-x-0 bottom-0 px-[var(--gutter)] pb-[max(9vh,4.5rem)] md:px-12 lg:px-20">
          <HeroText exploreHref="#journey-gateway" onExplore={(e) => { e.preventDefault(); goTo("gateway"); }} />
        </div>

        {/* B–E captions */}
        {SCENE_COPY.slice(1, 5).map((s, i) => (
          <div key={s.key} ref={reg(`cap-${s.key}`)} style={{ opacity: 0, visibility: "hidden" }}
            className="absolute bottom-[max(7vh,3.5rem)] left-[var(--gutter)] right-[var(--gutter-r)] max-w-[30rem] md:left-12 lg:left-20">
            <p className="num text-sm text-brass-bright">{i + 2} of 6</p>
            <h2 className="heading mt-1 text-[1.75rem] text-ivory md:text-[2.4rem]">{s.title}</h2>
            <p className="prose-serif mt-3 text-[1rem] text-ivory/90 md:text-[1.04rem]">{s.body}</p>
            {"href" in s && <Link href={s.href} className="btn-link mt-3 inline-block text-sm">{s.action}</Link>}
          </div>
        ))}

        {/* C–E data panels */}
        {(["courtyard", "instrument", "vault"] as const).map((k) => (
          <div key={k} ref={reg(`panel-${k}`)} style={{ opacity: 0, visibility: "hidden" }}
            className="niche absolute left-[var(--gutter)] right-[var(--gutter-r)] top-[calc(var(--nav-h)+2.6rem)] bg-obsidian/88 p-4 backdrop-blur-sm md:left-auto md:right-10 md:top-auto md:bottom-[14vh] md:w-[min(460px,42vw)] lg:right-20">
            <p className="mb-2 text-xs text-sandstone">{k === "courtyard" ? "Live calculation" : k === "instrument" ? "The instrument, illustrated" : "Evidence ledger, live"}</p>
            {k === "courtyard" ? <EpochPanel compact={isNarrow} /> : k === "instrument" ? <InstrumentPanel compact={isNarrow} /> : <LedgerPanel compact={isNarrow} />}
          </div>
        ))}

        {/* F: the brass axis swings into the chart's reference line */}
        <div className="pointer-events-none absolute inset-0 flex items-start justify-center px-4 pt-[calc(var(--nav-h)+2vh)] md:justify-end md:pr-[6vw] md:pt-[15vh]">
          <div className="workspace-chart-plate niche pointer-events-none w-[min(760px,94vw)] p-2 md:w-[min(720px,54vw)] md:p-4">
            <svg viewBox={`0 0 ${CHART.w} ${CHART.h}`} className="w-full overflow-visible" aria-hidden>
              <g ref={reg("s6frame")} style={{ opacity: 0 }}><ChartFrame scales={scales} fontSize={isNarrow ? 17 : 11} /></g>
              {data.epoch.data ? (
                <path ref={reg("s6curve")} d={scales.path} fill="none" stroke="var(--color-evidence)" strokeWidth="2.2" pathLength={1} strokeDasharray="1" strokeDashoffset="1" />
              ) : (
                <text ref={reg("s6curve")} x={(CHART.x0 + CHART.x1) / 2} y={(CHART.y0 + CHART.y1) / 2} textAnchor="middle" fontSize="12" fill="var(--color-mist)">
                  Live prediction unavailable{data.epoch.error ? `: ${data.epoch.error}` : ""}
                </text>
              )}
              <line ref={reg("s6axis")} x1={-216} y1={0} x2={216} y2={0} stroke="var(--color-brass)" strokeWidth="2.2" style={{ opacity: 0 }} />
              <g ref={reg("s6labels")} style={{ opacity: 0 }} fontSize={isNarrow ? 16 : 11}>
                <text x={CHART.x1} y={scales.axisY + 16} textAnchor="end" fill="var(--color-brass-bright)">measured axis (illustrative)</text>
                <text x={CHART.x1} y={CHART.y1 - 10} textAnchor="end" fill="var(--color-evidence)">June-solstice sunrise, computed live</text>
              </g>
            </svg>
          </div>
        </div>
        <div ref={reg("cap-workspace")} style={{ opacity: 0, visibility: "hidden" }}
          className="absolute bottom-[max(6vh,3rem)] left-[var(--gutter)] right-[var(--gutter-r)] md:right-auto md:max-w-[32rem] md:left-12 lg:left-20">
          <p className="num text-sm text-brass-bright">6 of 6</p>
          <h2 className="heading mt-1 text-[1.75rem] text-ivory md:text-[2.4rem]">{SCENE_COPY[5].title}</h2>
          <p className="prose-serif mt-3 text-[1rem] text-ivory/90">{SCENE_COPY[5].body}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/analysis/new" className="btn btn-primary">Start an analysis</Link>
            <Link href="/atlas" className="btn btn-quiet">Open the Heritage Atlas</Link>
            <Link href="/sky" className="btn btn-quiet">Explore the sky</Link>
          </div>
        </div>

        {/* scene index (desktop) and controls */}
        <nav aria-label="Introduction scenes" className="absolute right-3 top-1/2 hidden -translate-y-1/2 lg:block">
          <ol className="space-y-1">
            {SCENE_ORDER.map((k, i) => (
              <li key={k}>
                <button onClick={() => goTo(k)} aria-current={current === k ? "step" : undefined}
                  className="group relative flex h-7 w-7 items-center justify-center text-2xs text-ivory/60 hover:text-ivory">
                  <span className="pointer-events-none absolute right-8 whitespace-nowrap rounded-xs bg-obsidian/85 px-2 py-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">{SCENE_COPY[i].title}</span>
                  <span aria-hidden className={`block h-2 w-2 rotate-45 border ${current === k ? "border-brass bg-brass" : "border-ivory/50"}`} />
                  <span className="sr-only">{`Scene ${i + 1}: ${SCENE_COPY[i].title}`}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <div className="absolute right-[var(--gutter-r)] top-[calc(var(--nav-h)+0.6rem)] flex flex-wrap justify-end gap-x-4 gap-y-1 text-2xs [text-shadow:0_1px_6px_#05070b] md:right-6">
          <a href="#after-journey" className="text-ivory/70 underline-offset-2 hover:text-ivory hover:underline">Skip the introduction</a>
          <button onClick={onChooseStatic} className="text-ivory/70 underline-offset-2 hover:text-ivory hover:underline">Use still images</button>
        </div>
        {state.reason && (
          <p role="status" className="absolute left-[var(--gutter)] top-[calc(var(--nav-h)+0.6rem)] hidden max-w-[24rem] md:block text-2xs text-ivory/70 [text-shadow:0_1px_6px_#05070b] md:left-12 lg:left-20">{state.reason}</p>
        )}
        <p ref={reg("caption")} className="absolute bottom-2 right-[var(--gutter-r)] hidden max-w-[24rem] text-right text-2xs text-ivory/55 md:block md:right-6">
          {ILLUSTRATIVE_CAPTION}
        </p>
        <div ref={reg("scroll")} aria-hidden className="absolute bottom-5 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-2xs text-ivory/70 md:flex">
          <span>Scroll to cross the threshold</span>
          <span className="h-8 w-px bg-gradient-to-b from-ivory/70 to-transparent" />
        </div>
      </div>

      {/* anchors for in-page links (B) and the narrative in full for assistive technology */}
      <span id="journey-gateway" className="absolute left-0" style={{ top: `${sceneAnchor("gateway") * 100}%` }} />
      <div className="sr-only">
        {SCENE_COPY.slice(1).map((s) => (
          <section key={s.key}>
            <h2>{s.title}</h2>
            <p>{s.body}</p>
            {s.key === "courtyard" && <EpochPanel />}
            {s.key === "vault" && <LedgerPanel />}
          </section>
        ))}
        <p>{ILLUSTRATIVE_CAPTION}</p>
      </div>
    </section>
  );
}

/** Imperatively update overlay elements for a scroll progress value (no React re-render per frame). */
function paintOverlay(p: number, el: Record<string, HTMLElement | SVGElement | null>, narrow: boolean, axisY: number) {
  const show = (key: string, o: number, y = 0) => {
    const e = el[key] as HTMLElement | null;
    if (!e) return;
    e.style.opacity = o.toFixed(3);
    e.style.visibility = o < 0.01 ? "hidden" : "visible";
    if (y) e.style.transform = `translateY(${((1 - o) * y).toFixed(1)}px)`;
    e.style.pointerEvents = o > 0.6 ? "auto" : "none";
  };
  const S = SCENES;
  show("hero", captionOpacity("threshold", p));
  if (el.hero) (el.hero as HTMLElement).style.transform = `translateY(${(-ramp(p, 0, S.threshold[1]) * 40).toFixed(1)}px)`;
  show("scroll", 1 - ramp(p, 0.01, 0.04));
  for (const k of ["gateway", "courtyard", "instrument", "vault"] as const) {
    const [a, b] = S[k];
    const mid = a + (b - a) * 0.52;
    // On phones the caption and the data panel take turns; on wider screens they share the view.
    const cap = narrow && k !== "gateway" ? window4(p, a + 0.015, a + 0.04, mid - 0.02, mid) : captionOpacity(k, p);
    show(`cap-${k}`, cap, 18);
    if (k !== "gateway") {
      const panel = narrow ? window4(p, mid, mid + 0.02, b - 0.03, b - 0.005) : window4(p, a + 0.03, a + 0.06, b - 0.025, b);
      show(`panel-${k}`, panel, 12);
    }
  }
  show("caption", 1 - ramp(p, S.workspace[0], S.workspace[0] + 0.04));

  const w0 = S.workspace[0];
  const swing = ramp(p, w0 + 0.02, w0 + 0.09);
  const axis = el.s6axis as SVGLineElement | null;
  if (axis) {
    const cx = 260 + ((CHART.x0 + CHART.x1) / 2 - 260) * swing;
    const cy = 140 + (axisY - 140) * swing;
    const scale = 0.62 + (1 - 0.62) * swing;
    axis.setAttribute("transform", `translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${(90 - 90 * swing).toFixed(1)}) scale(${scale.toFixed(3)} 1)`);
    axis.style.opacity = ramp(p, w0 + 0.005, w0 + 0.03).toFixed(3);
  }
  if (el.s6frame) (el.s6frame as SVGElement).style.opacity = ramp(p, w0 + 0.08, w0 + 0.12).toFixed(3);
  const curve = el.s6curve as SVGElement | null;
  if (curve) {
    if (curve.tagName === "path") curve.setAttribute("stroke-dashoffset", (1 - ramp(p, w0 + 0.1, w0 + 0.16)).toFixed(4));
    else curve.style.opacity = ramp(p, w0 + 0.1, w0 + 0.14).toFixed(3);
  }
  if (el.s6labels) (el.s6labels as SVGElement).style.opacity = ramp(p, w0 + 0.14, w0 + 0.18).toFixed(3);
  show("cap-workspace", captionOpacity("workspace", p), 18);
}

/* -------------------------------------------------------------------------------------------- static mode */

function StaticJourney({ reason, onAnimate }: { reason: string | null; onAnimate?: () => void }) {
  return (
    <section aria-label="Introduction" data-mode="static">
      <div className="relative flex min-h-[100svh] items-end overflow-hidden px-[var(--gutter)] pb-16 pt-28 md:px-12 lg:px-20">
        <NightLayers at={0} className="absolute inset-0 h-full w-full"
          label="Illustration: a desert dusk beneath an indigo and rose sky, with an original sandstone fortress-observatory on the ridge, its gateway lit by two lanterns." />
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,7,11,.72)_0%,rgba(5,7,11,.2)_55%,transparent_72%),linear-gradient(0deg,rgba(5,7,11,.72),transparent_38%)]" />
        <FireflyNavigation />
        <div className="relative"><HeroText exploreHref="#science" /></div>
        <p className="absolute bottom-3 right-4 hidden max-w-[22rem] text-right text-2xs text-ivory/60 md:block">{ILLUSTRATIVE_CAPTION}</p>
      </div>
      {reason && (
        <p className="mx-auto mt-6 max-w-[1400px] px-[var(--gutter)] text-xs text-mist md:px-12 lg:px-20">
          {reason}{" "}
          {onAnimate && <button className="btn-link text-xs" onClick={onAnimate}>Show the animated journey</button>}
        </p>
      )}
      <ol id="science" className="mx-auto max-w-[1400px] scroll-mt-24 space-y-20 px-[var(--gutter)] py-16 md:px-12 lg:px-20">
        {SCENE_COPY.slice(1).map((s, i) => (
          <li key={s.key} className="grid items-center gap-8 md:grid-cols-[minmax(0,26rem)_1fr] md:gap-16">
            <div>
              <p className="num text-sm text-brass-bright">{i + 2} of 6</p>
              <h2 className="heading mt-1 text-[1.9rem] text-ivory">{s.title}</h2>
              <p className="prose-serif mt-3 text-[1.02rem] text-ivory/90">{s.body}</p>
            </div>
            <div className="min-w-0">
              {s.key === "gateway" && (
                <div className="niche overflow-hidden">
                  <NightLayers at={0.27} className="aspect-[16/10] w-full" label="Illustration: the gateway seen up close, its cusped arch framing the night, with the brass reference line running through the opening." />
                </div>
              )}
              {s.key === "courtyard" && <div className="niche p-4"><EpochPanel /></div>}
              {s.key === "instrument" && <div className="niche p-4"><InstrumentPanel /></div>}
              {s.key === "vault" && <div className="niche p-4"><LedgerPanel /></div>}
              {s.key === "workspace" && (
                <>
                  <div className="niche mb-4 overflow-hidden">
                    <NightLayers at={0.98} className="aspect-[16/9] w-full" label="Illustration: an open sandstone terrace looking out toward a distant Rajasthani-inspired skyline at dusk." />
                  </div>
                  <StaticChart />
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function StaticChart() {
  const { epoch } = useLandingData();
  const s = chartScales(epoch.data?.points ?? null);
  return (
    <figure className="niche m-0 p-4">
      <svg viewBox={`0 0 ${CHART.w} ${CHART.h}`} className="w-full" role="img"
        aria-label="Chart: the illustrative measured axis as a brass reference line against the live-computed June-solstice sunrise azimuth across five millennia.">
        <ChartFrame scales={s} />
        {epoch.data && <path d={s.path} fill="none" stroke="var(--color-evidence)" strokeWidth="2.2" />}
        <line x1={CHART.x0} x2={CHART.x1} y1={s.axisY} y2={s.axisY} stroke="var(--color-brass)" strokeWidth="2.2" />
        <text x={CHART.x1} y={s.axisY + 16} textAnchor="end" fontSize="11" fill="var(--color-brass-bright)">measured axis (illustrative)</text>
        {!epoch.data && <text x={(CHART.x0 + CHART.x1) / 2} y={CHART.y1 + 30} textAnchor="middle" fontSize="12" fill="var(--color-mist)">{epoch.loading ? "Calculating…" : "Live prediction unavailable"}</text>}
      </svg>
      <figcaption className="mt-2 text-2xs text-mist">The blue line is computed by the platform's engine; the brass line is an invented axis for illustration.</figcaption>
    </figure>
  );
}
