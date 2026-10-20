"use client";

import Link from "next/link";
import { Arch, ScaleRule } from "@/components/motifs";
import { useAuth } from "@/lib/auth";
import { DOORS } from "./panels";

const STEPS = [
  { title: "Document the site", body: "Coordinates, the definition of the architectural axis, its north reference, the measurement method and its uncertainty, each tied to a source. Missing values stay visibly missing.", href: "/atlas", link: "Heritage Atlas" },
  { title: "State the hypothesis first", body: "The target event and the reasoning are registered before anything is computed, so a result cannot quietly choose its own question.", href: "/analysis/new", link: "Register a hypothesis" },
  { title: "Reconstruct the sky", body: "Positions come from Skyfield with JPL's DE406 ephemeris, historical ΔT, refraction and the site's measured horizon, checked against two independent reference methods.", href: "/sky", link: "Sky Explorer" },
  { title: "Propagate uncertainty", body: "Monte Carlo sampling over orientation, chronology and horizon, with a recorded seed, turns single numbers into intervals and sensitivity tables.", href: "/analysis", link: "Analyses" },
  { title: "Review and report", body: "Reviewers check records and runs. Reports carry inputs, sources, software versions, parameters, warnings and limitations, in PDF, CSV and JSON.", href: "/reports", link: "Reports" },
];

const WILL = [
  "This axis lies within 1.7° of December-solstice sunrise for 2900–2600 BCE, assuming the measured horizon and standard refraction.",
  "The residual moves by up to 0.75° depending on the refraction model; here is the sensitivity table.",
  "This site cannot be analysed: its north reference is unspecified.",
];
const WONT = [
  "The builders aligned the temple to the solstice.",
  "The site must date to 2900 BCE because the alignment fits best then.",
  "p < 0.05, without a declared null model, a sample of compatible sites, and a correction for every test tried.",
];

const RESEARCH_SIGNALS = [
  { label: "Live horizon model", value: "±0.27°", tone: "text-brass-bright" },
  { label: "Cross-checks", value: "2 independent references", tone: "text-evidence" },
  { label: "Evidence gate", value: "Pass / review / block", tone: "text-ivory" },
  { label: "Recorded uncertainty", value: "Monte Carlo seeded", tone: "text-uncertain" },
];

/** Where to begin: the chambers of the workspace, reached directly after the journey (or by skipping it). */
export function WorkspaceSection() {
  const { user } = useAuth();
  return (
    <section id="after-journey" aria-labelledby="begin-h" className="mx-auto max-w-[1400px] scroll-mt-24 px-[var(--gutter)] pt-24 md:px-12 lg:px-20">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div className="max-w-md">
          <h2 id="begin-h" className="display text-[clamp(2.3rem,4.4vw,3.6rem)]">Where to begin</h2>
          <p className="prose-serif mt-5 text-[1.06rem] text-ivory-dim">
            Each chamber of the observatory does one job. Browsing is open to everyone; recording sites, running
            analyses and keeping reports need an account.
          </p>
          {!user && (
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/register" className="btn btn-primary">Create account</Link>
              <Link href="/login" className="btn btn-quiet">Sign in</Link>
            </div>
          )}
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
          {DOORS.map((d) => (
            <li key={d.href}>
              <Link href={d.href} className="niche group flex h-full items-start gap-4 p-5 transition-colors hover:border-sandstone-dim hover:bg-indigo-2">
                <Arch width={30} height={44} lobes={5} inset={false} className="mt-1 h-11 w-auto shrink-0 opacity-80" />
                <span>
                  <span className="heading block text-xl text-ivory group-hover:text-brass-bright">{d.title}</span>
                  <span className="mt-1 block text-sm text-ivory-dim">{d.body}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function ResearchSignalsSection() {
  return (
    <section aria-labelledby="signals-h" className="mx-auto max-w-[1400px] px-[var(--gutter)] pt-24 md:px-12 lg:px-20">
      <div className="niche overflow-hidden bg-indigo/60 px-5 py-5 md:px-8 md:py-7">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="max-w-xl">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-brass-bright">Research signals</p>
            <h2 id="signals-h" className="display mt-3 text-[clamp(2rem,3.6vw,3.1rem)]">Evidence remains legible at every stage.</h2>
          </div>
          <div className="rounded-xs border border-rule bg-obsidian/40 px-3 py-2 text-xs uppercase tracking-[0.18em] text-ivory-dim">
            Scientific workflow
          </div>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {RESEARCH_SIGNALS.map((item) => (
            <div key={item.label} className="border border-rule bg-obsidian/35 p-4">
              <p className="text-[0.7rem] uppercase tracking-[0.2em] text-mist">{item.label}</p>
              <p className={`mt-3 text-lg font-medium md:text-xl ${item.tone}`}>{item.value}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function MethodSection() {
  return (
    <section id="method" aria-labelledby="method-h" className="mx-auto max-w-[1400px] scroll-mt-20 px-[var(--gutter)] pt-28 md:px-12 lg:px-20">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <div className="max-w-md">
          <h2 id="method-h" className="display text-[clamp(2.2rem,4.2vw,3.4rem)]">A workflow that keeps every assumption in view</h2>
          <p className="prose-serif mt-5 text-[1.06rem] text-ivory-dim">
            Researchers often stitch together field notes, GIS layers, planetarium software and spreadsheets. Each
            hand-off can lose a source, a convention or an error bar. ChronoHeritage keeps them attached from the
            survey to the report.
          </p>
        </div>
        <ol>
          {STEPS.map((s, i) => (
            <li key={s.title} className="rule-t grid grid-cols-[2.5rem_1fr] gap-4 py-5">
              <span className="num heading text-2xl text-brass">{i + 1}</span>
              <div>
                <h3 className="heading text-xl text-ivory">{s.title}</h3>
                <p className="mt-1.5 max-w-xl text-ivory-dim">{s.body}</p>
                <Link href={s.href} className="btn-link mt-2 inline-block text-sm">{s.link}</Link>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function ClaimsSection() {
  return (
    <section aria-labelledby="claims-h" className="mx-auto max-w-[1400px] px-[var(--gutter)] pt-28 md:px-12 lg:px-20">
      <h2 id="claims-h" className="display max-w-3xl text-[clamp(2.2rem,4.2vw,3.4rem)]">What the platform will say, and what it never will</h2>
      <ScaleRule className="mt-8 max-w-3xl" />
      <div className="mt-8 grid gap-10 md:grid-cols-2">
        <div>
          <p className="text-sm font-medium text-evidence">Statements a report can support</p>
          <ul className="mt-4 space-y-4">
            {WILL.map((w) => <li key={w} className="prose-serif border-l-2 border-evidence/60 pl-4 text-[1.04rem] text-ivory/90">“{w}”</li>)}
          </ul>
        </div>
        <div>
          <p className="text-sm font-medium text-uncertain">Statements it refuses to make</p>
          <ul className="mt-4 space-y-4">
            {WONT.map((w) => (
              <li key={w} className="prose-serif border-l-2 border-uncertain/70 pl-4 text-[1.04rem] text-ivory/60">
                <span className="sr-only">Refused: </span><s className="decoration-uncertain/60">“{w}”</s>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
