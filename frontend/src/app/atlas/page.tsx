"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EligibilityBadges, label, NORTH_LABEL, ProvenanceMeter } from "@/components/site/bits";
import { EmptyState, ErrorState, IllustrativeTag, Loading, Notice, PageHeader, StatusBadge } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { deg, humanize, yearLabel } from "@/lib/format";
import { useResource } from "@/lib/hooks";
import type { SiteSummary } from "@/lib/types";

const SiteMap = dynamic(() => import("@/components/SiteMap").then((m) => m.SiteMap), {
  ssr: false,
  loading: () => <div className="skeleton h-full min-h-[320px]" />,
});

export default function AtlasPage() {
  const { can } = useAuth();
  const sites = useResource<{ sites: SiteSummary[]; count: number }>("/sites");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [elig, setElig] = useState("");
  const [prov, setProv] = useState("");
  const [kind, setKind] = useState<"all" | "real" | "illustrative">("all");
  const [view, setView] = useState<"list" | "map">("list");
  const [selected, setSelected] = useState<string | null>(null);

  const rows = useMemo(() => {
    const all = sites.data?.sites ?? [];
    const needle = q.trim().toLowerCase();
    return all.filter((s) =>
      (!needle || [s.name, s.region, s.country, s.site_type, s.id].some((v) => v?.toLowerCase().includes(needle))) &&
      (!status || s.status === status) &&
      (!elig || (elig === "yes") === s.eligibility.single_site_analysis.eligible) &&
      (!prov || (prov === "qualified") === s.fully_qualified) &&
      (kind === "all" || (kind === "illustrative") === s.is_illustrative),
    );
  }, [sites.data, q, status, elig, prov, kind]);
  const counts = useMemo(() => {
    const all = sites.data?.sites ?? [];
    return {
      real: all.filter((s) => !s.is_illustrative).length,
      illustrative: all.filter((s) => s.is_illustrative).length,
      reviewed: all.filter((s) => !s.is_illustrative && s.status === "reviewed").length,
      analysable: all.filter((s) => s.eligibility.single_site_analysis.eligible).length,
    };
  }, [sites.data]);

  const allIllustrative = !!sites.data?.sites.length && sites.data.sites.every((s) => s.is_illustrative);

  return (
    <main className="chamber">
      <PageHeader
        title="Heritage Atlas"
        lede="Every site with its sources, orientation conventions, chronology and gaps. Missing values are shown as missing, never filled in."
        actions={can("researcher") ? <Link href="/sites/new" className="btn btn-primary">Add a site</Link> : <Link href="/login?next=/sites/new" className="btn btn-quiet">Sign in to add sites</Link>}
      />
      {sites.data && (
        <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden border border-rule bg-rule text-sm sm:grid-cols-4">
          {([["Real records", counts.real, "Entered from sources"], ["Reviewed real records", counts.reviewed, "Approved by a reviewer"],
            ["Analysable", counts.analysable, "Enough data for a single-site analysis"], ["Illustrative", counts.illustrative, "Fictional, never evidence"]] as const).map(([k, v, note]) => (
            <div key={k} className="bg-obsidian px-4 py-3">
              <dt className="text-xs text-ivory-dim">{k}</dt>
              <dd className="num heading mt-0.5 text-2xl text-ivory">{v}</dd>
              <dd className="text-2xs text-mist">{note}</dd>
            </div>
          ))}
        </dl>
      )}
      {allIllustrative && (
        <div className="mb-6">
          <Notice tone="info" title="Demonstration data only">
            Every record currently in the registry is illustrative: fictional sites created to exercise the workflow. No real
            archaeological records have been loaded, so nothing here is evidence.
          </Notice>
        </div>
      )}
      <form role="search" className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr_auto]" onSubmit={(e) => e.preventDefault()}>
        <label className="sr-only" htmlFor="q">Search sites</label>
        <input id="q" className="field" placeholder="Search by name, region, type or id" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="sr-only" htmlFor="status">Review status</label>
        <select id="status" className="field" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any review status</option>
          {["submitted", "unverified", "reviewed", "rejected"].map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
        </select>
        <label className="sr-only" htmlFor="elig">Analysis eligibility</label>
        <select id="elig" className="field" value={elig} onChange={(e) => setElig(e.target.value)}>
          <option value="">Any eligibility</option>
          <option value="yes">Analysable</option>
          <option value="no">Analysis blocked</option>
        </select>
        <label className="sr-only" htmlFor="prov">Provenance</label>
        <select id="prov" className="field" value={prov} onChange={(e) => setProv(e.target.value)}>
          <option value="">Any provenance</option>
          <option value="qualified">All critical fields present</option>
          <option value="missing">Critical fields missing</option>
        </select>
        <fieldset className="flex items-center">
          <legend className="sr-only">Record type</legend>
          <div className="inline-flex w-full border border-rule-strong sm:w-auto">
            {(["all", "real", "illustrative"] as const).map((k) => (
              <label key={k} className={`flex min-h-10 flex-1 cursor-pointer items-center justify-center px-3 text-sm capitalize sm:flex-none ${kind === k ? "bg-indigo-2 text-ivory" : "text-ivory-dim hover:text-ivory"}`}>
                <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
                {k}
              </label>
            ))}
          </div>
        </fieldset>
      </form>
      <div className="mb-3 flex border border-rule-strong lg:hidden" role="group" aria-label="Show as">
        {(["list", "map"] as const).map((v) => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
            className={`min-h-11 flex-1 text-sm capitalize ${view === v ? "bg-indigo-2 text-ivory" : "text-ivory-dim"}`}>{v}</button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <section aria-label="Site list" className={`min-w-0 ${view === "map" ? "hidden lg:block" : ""}`}>
          {sites.loading && <Loading label="Loading sites" lines={6} />}
          {sites.error && <ErrorState error={sites.error} onRetry={sites.reload} />}
          {sites.data && (
            <>
              <p className="mb-2 text-xs text-mist" aria-live="polite">{rows.length} of {sites.data.count} sites shown</p>
              {rows.length === 0 ? (
                <EmptyState title="No sites match these filters">Clear a filter or search for a different name.</EmptyState>
              ) : (
                <ul className="rule-t">
                  {rows.map((s) => (
                    <li key={s.id} className={`rule-b grid gap-2 border-l-2 py-3.5 pl-3 transition-colors ${s.is_illustrative ? "border-dashed border-evidence/50" : "border-sandstone-dim"} ${selected === s.id ? "bg-indigo-2/70" : ""}`}
                      onMouseEnter={() => setSelected(s.id)}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="min-w-0">
                          <Link href={`/sites/${s.id}`} className="heading text-lg text-ivory hover:text-brass-bright" onFocus={() => setSelected(s.id)}>
                            {s.name}
                          </Link>
                          <p className="text-xs text-mist">{[s.site_type, s.region].filter(Boolean).join(", ")} <span className="text-rule-strong">/</span> {s.id}</p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {s.is_illustrative && <IllustrativeTag />}
                          <StatusBadge status={s.status} />
                        </div>
                      </div>
                      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
                        <div><dt className="text-mist">Axis (true)</dt><dd className="num">{s.orientation?.true_azimuth_deg != null ? deg(s.orientation.true_azimuth_deg, 1) : <span className="text-uncertain">not convertible</span>}</dd></div>
                        <div><dt className="text-mist">North reference</dt><dd className={s.orientation?.north_reference === "unspecified" || !s.orientation?.north_reference ? "text-terracotta" : ""}>{label(NORTH_LABEL, s.orientation?.north_reference).replace(" north", "")}</dd></div>
                        <div><dt className="text-mist">Chronology</dt><dd className="num">{s.chronology?.start_year != null ? `${yearLabel(s.chronology.start_year)} – ${yearLabel(s.chronology.end_year)}` : <span className="text-uncertain">missing</span>}</dd></div>
                        <div><dt className="text-mist">Provenance</dt><dd><ProvenanceMeter score={s.provenance_score} qualified={s.fully_qualified} compact /></dd></div>
                      </dl>
                      <EligibilityBadges e={s.eligibility} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
        <aside className={`h-[min(70vh,520px)] lg:sticky lg:top-24 lg:block lg:h-[calc(100vh-8rem)] ${view === "list" ? "hidden" : ""}`} aria-label="Site map">
          <SiteMap sites={rows} selected={selected} onSelect={(id) => setSelected(id)} />
          {selected && (
            <p className="mt-2 text-xs text-ivory-dim">
              Selected: <Link className="inline" href={`/sites/${selected}`}>{rows.find((r) => r.id === selected)?.name ?? selected}</Link>
            </p>
          )}
        </aside>
      </div>
    </main>
  );
}
