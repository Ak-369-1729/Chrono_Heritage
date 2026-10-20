"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { HorizonPanorama } from "@/components/charts/Panorama";
import { EligibilityBadges, label, METHOD_LABEL, Missing, NORTH_LABEL, ProvenanceMeter } from "@/components/site/bits";
import { ChronologyForm, HorizonForm, OrientationForm, PhotoForm, ReadingsForm, SourceForm } from "@/components/site/Editors";
import { CopyButton, ErrorState, Field, IllustrativeTag, KeyValue, Loading, Notice, PageHeader, Panel, StatusBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime, deg, humanize, num, yearLabel } from "@/lib/format";
import { useResource } from "@/lib/hooks";
import type { AnalysisRun, AuditEvent, Compatibility, SiteDetail, SiteSummary, Source } from "@/lib/types";
import { useSubmit } from "@/lib/useSubmit";
import { Glyph } from "@/components/Glyph";

const SECTIONS = [
  ["identity", "Identity and location"], ["orientation", "Orientation"], ["chronology", "Chronology"],
  ["horizon", "Horizon"], ["provenance", "Provenance"], ["eligibility", "Eligibility"], ["sources", "Sources"],
  ["field", "Observations and images"], ["runs", "Analyses"], ["audit", "Review and audit"],
] as const;

/** Contents of the dossier: highlights the section in view; a scrollable row of links on small screens. */
function DossierNav({ extra }: { extra: [string, string][] }) {
  const items: (readonly [string, string])[] = [...SECTIONS, ...extra];
  const [current, setCurrent] = useState<string>("identity");
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setCurrent(vis[0].target.id);
    }, { rootMargin: "-20% 0px -65% 0px" });
    items.forEach(([id]) => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [items.length]);
  return (
    <nav aria-label="Dossier contents" className="dossier-nav -mx-[var(--gutter)] mb-8 overflow-x-auto px-[var(--gutter)] lg:sticky lg:top-24 lg:mx-0 lg:mb-0 lg:max-h-[calc(100vh-8rem)] lg:overflow-visible lg:px-0">
      <ol className="flex gap-1 whitespace-nowrap lg:flex-col lg:gap-0 lg:whitespace-normal">
        {items.map(([id, label]) => (
          <li key={id}>
            <a href={`#${id}`} aria-current={current === id ? "true" : undefined}
              className="block border-b-2 border-transparent px-2 py-2 text-sm text-ivory-dim hover:text-ivory lg:border-b-0 lg:border-l-2 lg:py-1.5 lg:pl-3">
              {label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export default function SitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can, user } = useAuth();
  const site = useResource<SiteDetail>(`/sites/${encodeURIComponent(id)}`);
  const audit = useResource<{ events: AuditEvent[] }>(`/sites/${encodeURIComponent(id)}/audit`);
  const runs = useResource<{ analyses: AnalysisRun[] }>(`/analyses?site_id=${encodeURIComponent(id)}`);
  const sources = useResource<{ sources: Source[] }>(can("researcher") ? "/sources" : null);
  const all = useResource<{ sites: SiteSummary[] }>("/sites");
  const others = (all.data?.sites ?? []).filter((s) => s.id !== id).map((s) => s.id);
  const compat = useResource<Compatibility>(others.length ? `/provenance/compatibility?${[id, ...others].map((x) => `site_ids=${encodeURIComponent(x)}`).join("&")}` : null);

  const reload = () => {
    void site.reload();
    void audit.reload();
  };

  if (site.loading) return <main className="chamber"><Loading label="Loading site" lines={8} /></main>;
  if (site.error || !site.data) return <main className="chamber"><ErrorState error={site.error!} onRetry={site.reload} /></main>;
  const s = site.data;
  const o = s.orientation_record;
  const t = s.orientation_transformation;
  const c = s.chronology_record;
  const h = s.horizon;
  const srcById = Object.fromEntries(s.sources.map((x) => [x.id, x]));
  const cite = (sid: string | null | undefined) => sid && srcById[sid]
    ? <a href={`#src-${sid}`} className="inline">[{s.sources.findIndex((x) => x.id === sid) + 1}]</a>
    : <Missing>no source</Missing>;
  // Server-computed permissions (the same rules the write endpoints enforce); the UI only mirrors them.
  const perm = s.permissions;
  const editable = !!perm?.can_edit;
  const pairs = (compat.data?.pairs ?? []).filter((p) => p.a === id || p.b === id);

  return (
    <main className="chamber">
      <PageHeader
        crumbs={[{ href: "/atlas", label: "Heritage Atlas" }]}
        title={s.name}
        lede={s.description}
        aside={
          <div className="flex flex-wrap items-center gap-2">
            {s.is_illustrative && <IllustrativeTag />}
            <StatusBadge status={s.status} label={`Record ${humanize(s.status)}`} />
            <StatusBadge status={s.visibility === "public" ? "reviewed" : "pending"} label={s.visibility === "public" ? "Public" : "Private"} />
            {s.sensitivity === "restricted" && <StatusBadge status="blocked" label="Restricted location" />}
            <EligibilityBadges e={s.eligibility} />
          </div>
        }
        actions={
          <>
            {s.eligibility.single_site_analysis.eligible && <Link href={`/analysis/new?site=${s.id}`} className="btn btn-primary">Analyse this site</Link>}
            <Link href={`/sky?site=${s.id}`} className="btn btn-quiet">Open in Sky Explorer</Link>
          </>
        }
      />
      {s.is_illustrative && <div className="mb-6"><Notice tone="info" title="Illustrative record">This site, its measurements and its sources are fictional. They demonstrate the workflow and can never be approved as evidence.</Notice></div>}
      {s.generalized && <div className="mb-6"><Notice tone="warning" title="Generalised location">Coordinates are rounded to 0.1° because this location is restricted. Reviewers see full precision.</Notice></div>}

      <div className="lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-12">
      <DossierNav extra={editable ? [["record", "Record measurements"]] : []} />
      <div className="min-w-0">
      {user && perm && <Stewardship site={s} onDone={reload} />}
      <div className="grid gap-x-12 gap-y-10 xl:grid-cols-2">
        <Panel title="Identity and coordinates" id="identity">
          <KeyValue rows={[
            ["Site id", <span key="i" className="num">{s.id}</span>],
            ["Type", s.site_type ?? <Missing />],
            ["Region", s.region ?? <Missing />],
            ["Latitude, longitude", s.lat != null ? <span key="c" className="num">{num(s.lat, 5)}, {num(s.lon, 5)}</span> : <Missing />],
            ["Elevation", s.elevation_m != null ? `${s.elevation_m} m` : <Missing />],
            ["Coordinate reference system", s.crs ?? <Missing />],
            ["Coordinates source", cite(s.coordinates_source_id)],
            ["Stratum (for null models)", s.stratum ?? "—"],
          ]} />
        </Panel>

        <Panel title="Orientation" id="orientation" meta={o ? `recorded ${dateTime(o.created_at)}` : undefined}>
          {!o ? <Missing>No orientation recorded</Missing> : (
            <>
              <KeyValue rows={[
                ["Label", o.label],
                ["Axis definition", o.axis_definition ?? <Missing />],
                ["Raw bearing", <span key="b" className="num">{o.raw_bearing} {o.bearing_unit}</span>],
                ["Axis mode", o.axis_mode ? humanize(o.axis_mode) : <Missing />],
                ["North reference", o.north_reference === "unspecified" ? <Missing key="n">Unspecified</Missing> : label(NORTH_LABEL, o.north_reference)],
                ...(o.north_reference === "magnetic" ? [["Magnetic declination", o.magnetic_declination_deg != null ? `${deg(o.magnetic_declination_deg, 2, true)} ± ${deg(o.magnetic_declination_uncertainty_deg, 2)} (${o.magnetic_declination_source})` : <Missing key="d" />]] as [string, React.ReactNode][] : []),
                ...(o.north_reference === "grid" ? [["Grid CRS", o.grid_crs ?? <Missing key="g">No CRS: convergence unknown</Missing>]] as [string, React.ReactNode][] : []),
                ["Method", o.method ? label(METHOD_LABEL, o.method) : <Missing />],
                ["Uncertainty", o.uncertainty_deg != null ? `${deg(o.uncertainty_deg, 2)} (${o.uncertainty_distribution === "normal" ? "1σ, normal" : "half-width, uniform"})` : o.uncertainty_unavailable_reason ? <span key="u" className="text-gold-bright">Unavailable: {o.uncertainty_unavailable_reason}</span> : <Missing />],
                ["Measured on", o.measured_at ?? "—"],
                ["Source", cite(o.source_id)],
              ]} />
              <div className="mt-4 border-l-2 border-brass/60 pl-3 text-sm">
                <p className="text-xs font-medium text-ivory-dim">Raw → true azimuth</p>
                {t?.status === "blocked" ? (
                  <ul className="mt-1 list-disc pl-5 text-uncertain">{t.blocking_reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                ) : t ? (
                  <ol className="mt-1 space-y-0.5 text-ivory-dim">
                    {t.steps.map((st, i) => <li key={i} className="num">{i + 1}. {humanize(st.op)}{typeof st.output === "number" ? ` → ${deg(st.output as number, 4)}` : ""}{st.convention ? ` (${String(st.convention)})` : ""}</li>)}
                    <li className="num text-ivory">True azimuth {deg(t.true_azimuth_deg, 4)}{t.combined_uncertainty_deg != null ? ` ± ${deg(t.combined_uncertainty_deg, 3)}` : ", uncertainty unavailable"}</li>
                  </ol>
                ) : <Missing>Not computable</Missing>}
              </div>
              {s.orientation_history.length > 1 && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-ivory-dim hover:text-ivory">Earlier orientation records ({s.orientation_history.length - 1})</summary>
                  <ul className="mt-2 space-y-1 text-xs text-mist">
                    {s.orientation_history.filter((x) => x.id !== o.id).map((x) => <li key={x.id} className="num">{dateTime(x.created_at)}: {x.raw_bearing} {x.bearing_unit}, {x.north_reference}, σ {x.uncertainty_deg ?? "—"}</li>)}
                  </ul>
                </details>
              )}
            </>
          )}
        </Panel>

        <Panel title="Chronology" id="chronology">
          {!c ? <Missing>No chronology recorded</Missing> : (
            <KeyValue rows={[
              ["Range", c.start_year != null ? <span key="r" className="num">{yearLabel(c.start_year)} – {yearLabel(c.end_year)}</span> : <Missing />],
              ["Astronomical years", <span key="a" className="num text-mist">{c.start_year} to {c.end_year} (0 = 1 BCE)</span>],
              ["Calendar basis", c.calendar_basis ? humanize(c.calendar_basis) : <Missing />],
              ["Date basis", c.date_basis ?? <Missing />],
              ["Sampling model", c.model === "normal" ? `Normal, centre ${yearLabel(c.central_year)}, σ ${c.sigma_years} years, truncated to range` : "Uniform within the range"],
              ["Uncertainty note", c.uncertainty_note ?? <Missing />],
              ["Source", cite(c.source_id)],
            ]} />
          )}
        </Panel>

        <Panel title="Horizon" id="horizon">
          {!h ? <Missing>No horizon record. Analyses must choose a flat horizon explicitly.</Missing> : h.kind === "none_declared" ? (
            <Notice tone="warning" title="No profile">The record declares that no horizon profile exists. Analyses use a flat 0° horizon and report it.</Notice>
          ) : (
            <>
              <KeyValue rows={[
                ["Type", humanize(h.kind)], ["Samples", String(h.n_samples)],
                ["Altitude uncertainty", h.altitude_uncertainty_deg != null ? deg(h.altitude_uncertainty_deg, 2) : <Missing />],
                ["Observer height", h.observer_height_m != null ? `${h.observer_height_m} m` : "—"],
                ["Resolution", h.resolution_note ?? "—"], ["Source", cite(h.source_id)],
              ]} />
              {h.azimuths_deg && h.azimuths_deg.length > 1 && (
                <div className="mt-4">
                  <HorizonPanorama horizonAz={h.azimuths_deg} horizonAlt={h.altitudes_deg} horizonKind={h.kind} dayPath={[]}
                    eventAz={s.orientation?.true_azimuth_deg ?? h.azimuths_deg[Math.floor(h.azimuths_deg.length / 2)]} showEvent={false}
                    measuredAz={s.orientation?.true_azimuth_deg} halfWidth={45} />
                </div>
              )}
            </>
          )}
        </Panel>

        <Panel title="Provenance completeness" id="provenance" meta={`formula ${s.provenance.formula_version}`}>
          <div className="mb-3 flex items-center gap-4">
            <ProvenanceMeter score={s.provenance.score} qualified={s.provenance.fully_qualified} />
            <StatusBadge status={s.provenance.fully_qualified ? "qualified" : "missing"} label={s.provenance.fully_qualified ? "All critical fields present" : `${s.provenance.critical_missing.length} critical field(s) missing`} />
          </div>
          <p className="mb-3 text-xs text-mist">{s.provenance.disclaimer} A high score cannot override a missing critical field.</p>
          <div className="table-frame"><table className="dtable">
            <thead><tr><th scope="col">Field</th><th scope="col">Weight</th><th scope="col">State</th></tr></thead>
            <tbody>
              {s.provenance.detail.map((f) => (
                <tr key={f.field}>
                  <td>{f.label}{f.critical && <span className="ml-1.5 text-2xs text-brass-bright">critical</span>}</td>
                  <td className="num">{f.weight}</td>
                  <td>{f.present ? <span className="inline-flex items-center gap-1.5 text-copper-bright"><Glyph kind="solid" />present</span> : <span className={`inline-flex items-center gap-1.5 ${f.critical ? "text-uncertain" : "text-mist"}`}><Glyph kind="hollow" />missing</span>} <span className="text-2xs text-mist">{f.note}</span></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </Panel>

        <Panel title="Eligibility and convention compatibility" id="eligibility">
          <div className="space-y-3 text-sm">
            <div>
              <p className="font-medium text-ivory">Single-site analysis: {s.eligibility.single_site_analysis.eligible ? <span className="text-copper-bright">eligible</span> : <span className="text-uncertain">blocked</span>}</p>
              {s.eligibility.single_site_analysis.reasons.length > 0 && <ul className="mt-1 list-disc pl-5 text-ivory-dim">{s.eligibility.single_site_analysis.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
            </div>
            <div>
              <p className="font-medium text-ivory">Cross-site pooling: {s.eligibility.cross_site_pooling.eligible ? <span className="text-copper-bright">eligible</span> : <span className="text-uncertain">excluded</span>}</p>
              {s.eligibility.cross_site_pooling.reasons.length > 0 && <ul className="mt-1 list-disc pl-5 text-ivory-dim">{s.eligibility.cross_site_pooling.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
            </div>
          </div>
          {pairs.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-xs font-medium text-ivory-dim">Compatibility with other records (formula {compat.data?.formula_version})</p>
              <div className="table-frame"><table className="dtable">
                <thead><tr><th scope="col">Other site</th><th scope="col">Pair score</th><th scope="col">Critical mismatch</th></tr></thead>
                <tbody>
                  {pairs.map((p) => {
                    const other = p.a === id ? { id: p.b, label: p.b_label } : { id: p.a, label: p.a_label };
                    return (
                      <tr key={other.id}>
                        <td><Link className="inline" href={`/sites/${other.id}`}>{other.label}</Link></td>
                        <td className="num">{num(p.score, 2)}</td>
                        <td className="text-xs">{p.critical_blockers.length ? <span className="text-uncertain">{p.critical_blockers.join("; ")}</span> : <span className="text-mist">none</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Sources" id="sources" className="mt-10" meta="Numbered references used throughout this dossier">
        {s.sources.length === 0 ? <Missing>No sources linked. Every important value needs one.</Missing> : (
          <ol className="space-y-3">
            {s.sources.map((src, i) => (
              <li key={src.id} id={`src-${src.id}`} className="grid grid-cols-[2rem_1fr] gap-2 text-sm">
                <span className="num text-brass-bright">[{i + 1}]</span>
                <div>
                  <p className="text-ivory">{src.citation}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-mist">
                    <span>{humanize(src.source_type)}</span>
                    {src.roles?.map((r) => <span key={r} className="border border-rule px-1">{r}</span>)}
                    {src.is_illustrative && <IllustrativeTag />}
                    {src.url && <a className="inline" href={src.url} target="_blank" rel="noreferrer">link</a>}
                    {src.doi && <span>doi:{src.doi}</span>}
                    {src.accessed_at && <span>accessed {src.accessed_at}</span>}
                    {src.licence && <span>{src.licence}</span>}
                    <CopyButton text={src.citation} label="Copy citation" />
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <FieldRecords siteId={s.id} name={s.name} signedIn={!!user} />

      <div className="mt-10 grid gap-x-12 gap-y-10 xl:grid-cols-2">
        <Panel title="Analyses of this site" id="runs">
          {runs.data?.analyses.length ? (
            <ul className="text-sm">
              {runs.data.analyses.map((r) => (
                <li key={r.id} className="rule-b flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/analysis/${r.id}`} className="inline">{humanize(r.hypothesis.target_key.replace("sun_", ""))}</Link>
                  <span className="num text-xs text-mist">{dateTime(r.created_at)}</span>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-mist">{user ? "No analyses you can see yet." : "Sign in to see private analyses."}</p>}
        </Panel>
        <Panel title="Review and audit history" id="audit">
          {can("reviewer") && <ReviewForm siteId={s.id} onDone={reload} illustrative={s.is_illustrative} />}
          {audit.data?.events.length ? (
            <ol className="max-h-80 overflow-auto text-sm">
              {audit.data.events.map((e) => (
                <li key={e.id} className="rule-b grid grid-cols-[9rem_1fr] gap-3 py-2">
                  <span className="num text-xs text-mist">{dateTime(e.at)}</span>
                  <span><span className="text-ivory">{humanize(e.action)}</span> <span className="text-mist">by {e.actor}</span>{e.note && <span className="block text-xs text-ivory-dim">{e.note}</span>}</span>
                </li>
              ))}
            </ol>
          ) : <p className="text-sm text-mist">No audit events recorded.</p>}
        </Panel>
      </div>

      {editable ? (
        <section id="record" aria-labelledby="edit-h" className="mt-12 scroll-mt-24">
          <h2 id="edit-h" className="heading text-2xl">Record measurements</h2>
          <p className="mt-1 text-sm text-ivory-dim">New records supersede the current ones; nothing is overwritten and every change is audited. Each field shows its unit; every value needs a source.</p>
          <div className="mt-4">
            <OrientationForm siteId={s.id} sources={sources.data?.sources ?? []} onDone={reload} />
            <ChronologyForm siteId={s.id} sources={sources.data?.sources ?? []} onDone={reload} />
            <HorizonForm siteId={s.id} sources={sources.data?.sources ?? []} onDone={reload} />
            <SourceForm siteId={s.id} sources={sources.data?.sources ?? []} onDone={() => { reload(); void sources.reload(); }} />
            <ReadingsForm siteId={s.id} />
            <PhotoForm siteId={s.id} onDone={reload} />
          </div>
        </section>
      ) : user && perm && !s.is_illustrative ? (
        <p className="mt-10 text-sm text-mist">You can read this record but not change it: only its owner, a Data Steward (for public records) or a Reviewer can.</p>
      ) : null}
      </div>
      </div>
    </main>
  );
}

function ReviewForm({ siteId, onDone, illustrative }: { siteId: string; onDone: () => void; illustrative: boolean }) {
  const [note, setNote] = useState("");
  const s = useSubmit((decision: string) => api(`/sites/${siteId}/review`, { method: "POST", json: { decision, note } }));
  return (
    <form className="mb-5 space-y-2 border-l-2 border-brass/60 pl-3" onSubmit={(e) => e.preventDefault()}>
      <Field label="Reviewer note" htmlFor="rv-note" hint="Approval certifies the data-quality process only, never historical intent.">
        <input id="rv-note" className="field" value={note} onChange={(e) => setNote(e.target.value)} minLength={5} />
      </Field>
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={s.pending || note.length < 5 || illustrative} onClick={async () => { if (await s.run("approve")) onDone(); }}>Approve record</button>
        <button className="btn btn-quiet" disabled={s.pending || note.length < 5} onClick={async () => { if (await s.run("reject")) onDone(); }}>Reject record</button>
      </div>
      {illustrative && <p className="text-2xs text-mist">Illustrative records cannot be approved.</p>}
      {s.error && <ErrorState error={s.error} />}
    </form>
  );
}


/** Visibility and archiving, with the same permission rules the API enforces. */
function Stewardship({ site, onDone }: { site: SiteDetail; onDone: () => void }) {
  const perm = site.permissions!;
  const router = useRouter();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const vis = useSubmit(async (visibility: "public" | "private") => api(`/sites/${site.id}`, { method: "PATCH", json: { visibility } }));
  const arch = useSubmit(async () => api(`/sites/${site.id}/archive`, { method: "POST" }));
  if (!perm.can_edit && !perm.can_review) return null;
  return (
    <section aria-label="Record visibility" className="niche mb-10 flex flex-col gap-3 p-4 text-sm md:flex-row md:items-center md:justify-between">
      <p className="text-ivory-dim">
        {site.visibility === "public" ? "This record is public in the registry." : "This record is a private draft: only you and reviewers can see it."}{" "}
        {site.visibility !== "public" && !perm.can_publish && <span className="text-mist">Publishing to the public registry needs the Data Steward role (<Link className="inline" href="/account#access">request it</Link>).</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        {perm.can_edit && site.visibility !== "public" && perm.can_publish && (
          <button className="btn btn-quiet btn-sm" disabled={vis.pending} onClick={async () => { if (await vis.run("public")) onDone(); }}>Publish to registry</button>
        )}
        {perm.can_edit && site.visibility === "public" && (perm.is_owner || perm.can_review) && (
          <button className="btn btn-quiet btn-sm" disabled={vis.pending} onClick={async () => { if (await vis.run("private")) onDone(); }}>Make private</button>
        )}
        {perm.can_archive && (confirmArchive ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-uncertain">Archive this record? It leaves the atlas but stays in the audit log.</span>
            <button className="btn btn-danger btn-sm" disabled={arch.pending} onClick={async () => { if (await arch.run()) router.push("/atlas"); }}>Archive</button>
            <button className="btn btn-quiet btn-sm" onClick={() => setConfirmArchive(false)}>Cancel</button>
          </span>
        ) : <button className="btn btn-quiet btn-sm" onClick={() => setConfirmArchive(true)}>Archive…</button>)}
      </div>
      {(vis.error || arch.error) && <div className="md:basis-full"><ErrorState error={(vis.error ?? arch.error)!} /></div>}
    </section>
  );
}

interface Img { id: string; caption: string | null; attribution: string; licence: string; url: string }
interface Obs { id: string; observer_label: string; observed_at: string | null; method: string | null; north_reference: string | null; readings_deg: number[]; notes: string | null; quality_flag: string | null; visibility: string }

/** Photographs (public ones for everyone) and repeat field readings (signed-in users; private by default). */
function FieldRecords({ siteId, name, signedIn }: { siteId: string; name: string; signedIn: boolean }) {
  const imgs = useResource<{ images: Img[] }>(`/sites/${encodeURIComponent(siteId)}/images`);
  const obs = useResource<{ observations: Obs[] }>(signedIn ? `/sites/${encodeURIComponent(siteId)}/observations` : null);
  return (
    <Panel title="Observations and images" id="field" className="mt-10" meta="Contributions are private to their author and reviewers until published">
      <div className="grid gap-8 xl:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-medium text-ivory-dim">Photographs</h3>
          {imgs.error ? <ErrorState error={imgs.error} onRetry={imgs.reload} /> : !imgs.data ? <Loading lines={2} /> :
            imgs.data.images.length === 0 ? <p className="text-sm text-mist">No photographs you can see.</p> : (
              <ul className="grid grid-cols-2 gap-3">
                {imgs.data.images.map((im) => (
                  <li key={im.id}>
                    <figure className="m-0">
                      <img src={im.url} loading="lazy" alt={im.caption ?? `Photograph of ${name} (no caption recorded)`} className="aspect-[4/3] w-full border border-rule object-cover" />
                      <figcaption className="mt-1 text-2xs text-mist">{im.caption ?? "No caption"}. {im.attribution}, {im.licence}.</figcaption>
                    </figure>
                  </li>
                ))}
              </ul>
            )}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-medium text-ivory-dim">Repeat readings</h3>
          {!signedIn ? <p className="text-sm text-mist">Sign in to see field readings you or your team recorded.</p> :
            obs.error ? <ErrorState error={obs.error} onRetry={obs.reload} /> : !obs.data ? <Loading lines={2} /> :
              obs.data.observations.length === 0 ? <p className="text-sm text-mist">No repeat readings you can see.</p> : (
                <ul className="text-sm">
                  {obs.data.observations.map((o) => (
                    <li key={o.id} className="rule-b py-2">
                      <span className="text-ivory">{o.observer_label}</span> <span className="text-mist">{o.observed_at ?? "date not recorded"}, {o.method ? label(METHOD_LABEL, o.method) : "method not recorded"}</span>
                      <span className="num block text-xs text-ivory-dim">{o.readings_deg.map((r) => `${r}°`).join(", ")} ({o.north_reference ? label(NORTH_LABEL, o.north_reference) : "north not stated"})</span>
                    </li>
                  ))}
                </ul>
              )}
        </div>
      </div>
    </Panel>
  );
}
