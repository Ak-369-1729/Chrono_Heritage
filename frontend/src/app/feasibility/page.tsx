"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CompatibilityMatrix } from "@/components/feasibility/Matrix";
import { GateCard } from "@/components/GateCard";
import { ProvenanceMeter } from "@/components/site/bits";
import { DownloadLinks, EmptyState, ErrorState, Field, IllustrativeTag, KeyValue, Loading, Notice, PageHeader, Panel, StatusBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime, humanize, num, yearLabel } from "@/lib/format";
import { useResource } from "@/lib/hooks";
import type { FeasibilityReport, Gates, ReportRow, SiteSummary } from "@/lib/types";
import { useSubmit } from "@/lib/useSubmit";

const PLAIN = [
  { title: "Is each value sourced?", plain: "Every coordinate, bearing, date and horizon needs a citable source. A value without one counts as missing.",
    technical: "Provenance completeness uses the versioned formula prov-1.0.0: weighted fields, some critical. A missing critical field blocks qualification whatever the score." },
  { title: "Were they measured the same way?", plain: "Bearings measured against different norths, or with very different tools, cannot be compared until they are converted.",
    technical: "Pairwise convention compatibility (compat-1.0.0) compares north reference, axis mode, method precision class, chronology basis and horizon treatment; a dataset needs a score of at least 0.85." },
  { title: "What blocks pooling?", plain: "Some mismatches cannot be fixed by conversion, for example an unspecified north. These are listed as blockers.",
    technical: "Critical blockers are recorded per pair; any unresolved blocker forbids cross-site pooling regardless of the overall score." },
  { title: "Is there enough evidence?", plain: "Phase 0 needs five real candidate sites before any cross-site claim is considered. Illustrative records never count.",
    technical: "Kill criteria K-01 and K-02 are evaluated on the inventory and recorded with the report; a reviewer must approve the report for the Phase 0 gate to pass." },
];

export default function FeasibilityPage() {
  const { can } = useAuth();
  const sites = useResource<{ sites: SiteSummary[] }>("/sites");
  const reports = useResource<{ reports: FeasibilityReport[] }>("/dataset-feasibility/reports");
  const gates = useResource<Gates>("/gates");
  const [selected, setSelected] = useState<string[]>([]);
  const [reportId, setReportId] = useState<string | null>(null);
  const [title, setTitle] = useState("Phase 0 candidate inventory");

  useEffect(() => {
    if (sites.data && selected.length === 0) setSelected(sites.data.sites.slice(0, 5).map((s) => s.id));
  }, [sites.data]); // only seed the selection once, when sites first load
  useEffect(() => {
    if (!reportId && reports.data?.reports.length) setReportId(reports.data.reports[0].id);
  }, [reports.data, reportId]);

  const create = useSubmit(() => api<FeasibilityReport>("/dataset-feasibility/reports", { method: "POST", json: { title, site_ids: selected } }));
  const labels = useMemo(() => Object.fromEntries((sites.data?.sites ?? []).map((s) => [s.id, s.name])), [sites.data]);

  return (
    <main className="chamber">
      <PageHeader
        title="Dataset feasibility"
        lede="Phase 0 asks whether the evidence exists before any platform is built: five candidate sites, their sources and conventions, what is missing, and whether they can be compared at all."
      />
      <section aria-labelledby="plain-h" className="mb-10">
        <h2 id="plain-h" className="sr-only">What this checks, in plain language</h2>
        <ol className="grid gap-px overflow-hidden border border-rule bg-rule sm:grid-cols-2 xl:grid-cols-4">
          {PLAIN.map((p, i) => (
            <li key={p.title} className="bg-obsidian p-4">
              <p className="num text-xs text-brass-bright">{i + 1}</p>
              <h3 className="heading mt-1 text-lg text-ivory">{p.title}</h3>
              <p className="mt-1 text-sm text-ivory-dim">{p.plain}</p>
              <details className="mt-2 text-xs text-mist">
                <summary className="cursor-pointer text-ivory-dim hover:text-ivory">Technical detail</summary>
                <p className="mt-1">{p.technical}</p>
              </details>
            </li>
          ))}
        </ol>
      </section>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="min-w-0 space-y-10">
          <Panel title="Build a candidate inventory" meta="Phase 0 requires five candidates">
            {sites.loading && <Loading lines={4} />}
            {sites.error && <ErrorState error={sites.error} />}
            {sites.data && (
              <form onSubmit={async (e) => { e.preventDefault(); const r = await create.run(); if (r) { await reports.reload(); setReportId(r.id); } }}>
                <fieldset>
                  <legend className="sr-only">Candidate sites</legend>
                  <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                    {sites.data.sites.map((s) => (
                      <li key={s.id} className="rule-b flex items-center gap-3 py-2">
                        <input id={`fs-${s.id}`} type="checkbox" className="accent-[var(--color-gold)]" checked={selected.includes(s.id)}
                          onChange={(e) => setSelected((cur) => (e.target.checked ? [...cur, s.id] : cur.filter((x) => x !== s.id)))} />
                        <label htmlFor={`fs-${s.id}`} className="min-w-0 flex-1 truncate text-sm">{s.name}</label>
                        <ProvenanceMeter score={s.provenance_score} qualified={s.fully_qualified} compact />
                      </li>
                    ))}
                  </ul>
                </fieldset>
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <div className="min-w-[16rem] flex-1"><Field label="Report title" htmlFor="fs-title"><input id="fs-title" className="field" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} /></Field></div>
                  <button className="btn btn-primary" disabled={!can("researcher") || create.pending || selected.length === 0}>
                    {create.pending ? "Scoring provenance and compatibility…" : `Generate report for ${selected.length} site${selected.length === 1 ? "" : "s"}`}
                  </button>
                </div>
                {!can("researcher") && <p className="mt-2 text-xs text-mist"><Link className="inline" href="/login">Sign in</Link> as a researcher to generate reports.</p>}
                {selected.length > 0 && selected.length < 5 && <p className="mt-2 text-xs text-gold-bright">Fewer than five candidates: the report will record an incomplete inventory.</p>}
                {create.error && <div className="mt-3"><ErrorState error={create.error} /></div>}
              </form>
            )}
          </Panel>

          {reports.data && reports.data.reports.length === 0 && (
            <EmptyState title="No feasibility report yet">Select candidate sites above and generate the first Phase 0 report.</EmptyState>
          )}
          {reportId && <ReportView id={reportId} labels={labels} onChanged={() => { void reports.reload(); void gates.reload(); }} />}
        </div>

        <aside className="space-y-8">
          {gates.data && <GateCard gate={gates.data.phase0} />}
          {gates.data && <GateCard gate={gates.data.cross_site} compact />}
          <Panel title="Report history">
            {reports.data?.reports.length ? (
              <ul className="text-sm">
                {reports.data.reports.map((r) => (
                  <li key={r.id} className="rule-b py-2">
                    <button className={`text-left ${r.id === reportId ? "text-gold-bright" : "text-ivory hover:text-gold-bright"}`} onClick={() => setReportId(r.id)} aria-current={r.id === reportId}>
                      {r.title}
                    </button>
                    <span className="block text-xs text-mist">{dateTime(r.created_at)}, {r.qualified_count}/{r.inventory_count} qualified{r.is_illustrative ? ", illustrative" : ""}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-mist">None yet.</p>}
          </Panel>
        </aside>
      </div>
    </main>
  );
}

function ReportView({ id, labels, onChanged }: { id: string; labels: Record<string, string>; onChanged: () => void }) {
  const { can } = useAuth();
  const rep = useResource<FeasibilityReport>(`/dataset-feasibility/reports/${id}`);
  const [files, setFiles] = useState<ReportRow | null>(null);
  const exp = useSubmit(() => api<ReportRow>("/reports", { method: "POST", json: { kind: "feasibility", subject_id: id } }));
  const [note, setNote] = useState("");
  const review = useSubmit((decision: string) => api(`/dataset-feasibility/reports/${id}/review`, { method: "POST", json: { decision, note } }));
  useEffect(() => setFiles(null), [id]);

  if (rep.loading) return <Loading lines={6} />;
  if (rep.error || !rep.data) return <ErrorState error={rep.error!} />;
  const r = rep.data;
  const lbl = { ...labels, ...Object.fromEntries((r.inventory ?? []).map((x) => [x.site_id, x.name])) };

  return (
    <article aria-labelledby="rep-h" className="space-y-10">
      <header className="rule-t pt-5">
        <div className="flex flex-wrap items-center gap-2">
          {r.is_illustrative && <IllustrativeTag />}
          <StatusBadge status={r.status} label={r.status === "proposed" ? "Proposed, unreviewed" : humanize(r.status)} />
          <span className="num text-xs text-mist">{r.dataset_version}</span>
        </div>
        <h2 id="rep-h" className="heading mt-2 text-2xl">{r.title}</h2>
        <p className="mt-2 text-lg text-ivory">{r.recommendation.label}</p>
        <p className="mt-1 max-w-3xl text-sm text-ivory-dim">{r.recommendation.rationale}</p>
        {r.recommendation.mechanics_output_if_real && (
          <p className="mt-2 text-xs text-mist">Rule output if these records were real: <span className="text-ivory">{humanize(r.recommendation.mechanics_output_if_real)}</span>. Shown only to demonstrate the mechanics.</p>
        )}
        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[["Candidates", r.inventory_count], ["Fully qualified", r.qualified_count], ["Eligible for analysis", r.eligible_count], ["Compatibility", r.compatibility_score !== null ? num(r.compatibility_score, 3) : "—"]].map(([k, v]) => (
            <div key={String(k)} className="border-l border-rule pl-3"><dt className="text-xs text-mist">{k}</dt><dd className="num heading text-2xl">{v}</dd></div>
          ))}
        </dl>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button className="btn btn-quiet" disabled={!can("researcher") || exp.pending} onClick={async () => setFiles(await exp.run())}>
            {exp.pending ? "Preparing exports…" : "Export PDF, CSV and JSON"}
          </button>
          {files && <DownloadLinks files={files.files} />}
          {exp.error && <ErrorState error={exp.error} />}
        </div>
      </header>

      {r.critical_blockers.length > 0 && (
        <Notice tone="blocked" title="Critical blockers">{r.critical_blockers.length} unresolved critical convention mismatch(es). Pooling across these sites is not permitted: {r.critical_blockers.join("; ")}</Notice>
      )}

      <Panel title="Candidate inventory" meta={`provenance formula ${String((r.formula_versions?.provenance as { version?: string } | undefined)?.version ?? "")}`}>
        <div className="overflow-x-auto">
          <table className="dtable">
            <thead><tr><th scope="col">Site</th><th scope="col">Orientation convention</th><th scope="col">Uncertainty</th><th scope="col">Chronology</th><th scope="col">Sources</th><th scope="col">Provenance</th></tr></thead>
            <tbody>
              {r.inventory!.map((x) => (
                <tr key={x.site_id}>
                  <td><Link className="inline" href={`/sites/${x.site_id}`}>{x.name}</Link></td>
                  <td className="text-xs">
                    <span className="num">{x.orientation.raw_bearing ?? "—"} {x.orientation.bearing_unit}</span>; {x.orientation.axis_mode ?? <span className="text-terracotta">axis ?</span>};{" "}
                    {x.orientation.north_reference && x.orientation.north_reference !== "unspecified" ? `${x.orientation.north_reference} north` : <span className="text-terracotta">north unspecified</span>};{" "}
                    {x.orientation.method ? humanize(x.orientation.method) : <span className="text-terracotta">method ?</span>}
                  </td>
                  <td className="text-xs">{x.orientation.uncertainty_deg != null ? <span className="num">{x.orientation.uncertainty_deg}°</span> : x.orientation.uncertainty_unavailable_reason ? <span className="text-gold-bright">unavailable: {x.orientation.uncertainty_unavailable_reason}</span> : <span className="text-terracotta">missing, no reason</span>}</td>
                  <td className="text-xs">{x.chronology.start_year != null ? <span className="num">{yearLabel(x.chronology.start_year)} – {yearLabel(x.chronology.end_year)}</span> : <span className="text-terracotta">missing</span>}<span className="block text-mist">{x.chronology.date_basis}</span></td>
                  <td className="num text-xs">{x.sources.length}</td>
                  <td><ProvenanceMeter score={x.provenance.score} qualified={x.provenance.fully_qualified} compact /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Missing evidence" meta="critical fields block qualification">
        <ul className="grid gap-4 md:grid-cols-2">
          {r.inventory!.map((x) => (
            <li key={x.site_id} className="text-sm">
              <p className="text-ivory">{x.name}</p>
              {x.provenance.missing.length === 0 ? <p className="text-xs text-verdigris">Nothing missing</p> : (
                <ul className="mt-1 space-y-0.5 text-xs">
                  {x.provenance.missing.map((m) => <li key={m.field} className={m.critical ? "text-terracotta" : "text-mist"}>{m.critical ? "Critical: " : ""}{m.label}</li>)}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </Panel>

      {r.compatibility && r.compatibility.pairs.length > 0 && (
        <Panel title="Pairwise convention compatibility" meta={`dataset score ${num(r.compatibility_score, 3)}, threshold ${r.compatibility.threshold}`}>
          <CompatibilityMatrix data={r.compatibility} labels={lbl} />
        </Panel>
      )}

      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-2">
        <Panel title="Exclusions">
          {r.exclusions?.length ? (
            <ul className="space-y-2 text-sm">{r.exclusions.map((e) => <li key={e.site_id}><span className="text-ivory">{e.name}</span><ul className="list-disc pl-5 text-xs text-ivory-dim">{e.reasons.map((x) => <li key={x}>{x}</li>)}</ul></li>)}</ul>
          ) : <p className="text-sm text-mist">No exclusions.</p>}
        </Panel>
        <Panel title="Kill-criterion worksheet">
          <div className="table-frame"><table className="dtable">
            <thead><tr><th scope="col">Criterion</th><th scope="col">Record</th><th scope="col">Outcome</th></tr></thead>
            <tbody>
              {Object.entries(r.kill_worksheet ?? {}).map(([k, v]) => (
                <tr key={k}>
                  <td>{v.criterion}<span className="block text-2xs text-mist">{v.rule}</span></td>
                  <td className="num text-xs">{v.record ?? "—"}</td>
                  <td><StatusBadge status={v.outcome === "triggered" ? "failed" : v.outcome === "not_triggered" ? "passed" : v.outcome === "not_applicable" ? "not_evaluated" : String(v.outcome)} label={humanize(v.outcome)} /></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </Panel>
      </div>

      <Panel title="Review">
        <KeyValue rows={[["Status", humanize(r.status)], ["Reviewed", dateTime(r.reviewed_at)], ["Reviewer note", r.review_note ?? "—"]]} />
        {can("reviewer") && (
          <form className="mt-4 max-w-xl space-y-2" onSubmit={(e) => e.preventDefault()}>
            <Field label="Reviewer note" htmlFor="fr-note"><input id="fr-note" className="field" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <div className="flex gap-2">
              <button className="btn btn-primary" disabled={review.pending || note.length < 5 || r.is_illustrative} onClick={async () => { if (await review.run("approve")) { void rep.reload(); onChanged(); } }}>Approve report</button>
              <button className="btn btn-quiet" disabled={review.pending || note.length < 5} onClick={async () => { if (await review.run("reject")) { void rep.reload(); onChanged(); } }}>Reject report</button>
            </div>
            {r.is_illustrative && <p className="text-2xs text-mist">An illustrative report can never be approved as Phase 0 evidence.</p>}
            {review.error && <ErrorState error={review.error} />}
          </form>
        )}
      </Panel>
    </article>
  );
}
