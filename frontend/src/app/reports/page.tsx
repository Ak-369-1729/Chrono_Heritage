"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DownloadLinks, EmptyState, ErrorState, Field, IllustrativeTag, Loading, Notice, PageHeader, Panel, SignInPrompt } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime, humanize } from "@/lib/format";
import { useResource } from "@/lib/hooks";
import type { AnalysisRun, FeasibilityReport, Gates, ReportRow } from "@/lib/types";
import { useSubmit } from "@/lib/useSubmit";

const KINDS = [
  { key: "analysis", label: "Single-site analysis", needs: "analysis" },
  { key: "feasibility", label: "Dataset feasibility (Phase 0)", needs: "feasibility" },
  { key: "benchmark", label: "Benchmark results (Phase 0.5)", needs: null },
  { key: "comparison", label: "Workflow comparison", needs: null },
  { key: "cross_site", label: "Cross-site statistics (Tier 2)", needs: null },
] as const;

export default function ReportsPage() {
  const { can } = useAuth();
  const [kindFilter, setKindFilter] = useState("");
  const reports = useResource<{ reports: ReportRow[] }>(`/reports${kindFilter ? `?kind=${kindFilter}` : ""}`);
  const runs = useResource<{ analyses: AnalysisRun[] }>(can("researcher") ? "/analyses?status=succeeded" : null);
  const feas = useResource<{ reports: FeasibilityReport[] }>("/dataset-feasibility/reports");
  const gates = useResource<Gates>("/gates");
  const [kind, setKind] = useState<string>("analysis");
  const [subject, setSubject] = useState("");
  const gen = useSubmit(() => api<ReportRow>("/reports", { method: "POST", json: { kind, subject_id: subject || null } }));
  const crossOpen = gates.data?.cross_site.status === "passed";
  const meta = KINDS.find((k) => k.key === kind)!;
  const subjects = useMemo(() => (
    meta.needs === "analysis" ? (runs.data?.analyses ?? []).map((r) => ({ id: r.id, label: `${r.site_name} — ${humanize(r.hypothesis.target_key.replace("sun_", ""))} (${dateTime(r.created_at)})` }))
      : meta.needs === "feasibility" ? (feas.data?.reports ?? []).map((r) => ({ id: r.id, label: `${r.title} (${dateTime(r.created_at)})` })) : []
  ), [meta, runs.data, feas.data]);

  return (
    <main className="chamber">
      <PageHeader title="Research reports" lede="Every report carries its inputs, sources, methods, software versions, parameters, uncertainty, exclusions and limitations, so that someone else can reproduce it. Downloads include PDF, CSV and JSON with SHA-256 checksums." />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Panel title="Generate a report">
          {!can("researcher") ? <SignInPrompt action="generate reports" /> : (
            <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); if (await gen.run()) void reports.reload(); }}>
              <Field label="Report type" htmlFor="rp-kind">
                <select id="rp-kind" className="field" value={kind} onChange={(e) => { setKind(e.target.value); setSubject(""); }}>
                  {KINDS.map((k) => <option key={k.key} value={k.key} disabled={k.key === "cross_site" && !crossOpen}>{k.label}{k.key === "cross_site" && !crossOpen ? " — disabled until the Tier 2 gate passes" : ""}</option>)}
                </select>
              </Field>
              {meta.needs && (
                <Field label={meta.needs === "analysis" ? "Completed analysis" : "Feasibility report"} htmlFor="rp-sub">
                  <select id="rp-sub" className="field" required value={subject} onChange={(e) => setSubject(e.target.value)}>
                    <option value="" disabled>Choose</option>
                    {subjects.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </Field>
              )}
              {meta.needs && subjects.length === 0 && <p className="text-xs text-mist">Nothing to report on yet. {meta.needs === "analysis" ? <Link className="inline" href="/analysis/new">Run an analysis</Link> : <Link className="inline" href="/feasibility">Generate a feasibility report</Link>} first.</p>}
              {kind === "cross_site" && !crossOpen && <Notice tone="blocked">Cross-site statistical reports stay disabled on the server until the Tier 2 gate passes.</Notice>}
              {gen.error && <ErrorState error={gen.error} />}
              <button className="btn btn-primary" disabled={gen.pending || (meta.needs !== null && !subject) || (kind === "cross_site" && !crossOpen)}>
                {gen.pending ? "Generating…" : "Generate report"}
              </button>
              {gen.done && <div className="space-y-2 border-l-2 border-verdigris pl-3"><p className="text-sm text-verdigris">Generated “{gen.done.title}”.</p><DownloadLinks files={gen.done.files} /></div>}
            </form>
          )}
        </Panel>
        <Panel title="Generated reports" meta={<label className="flex items-center gap-2">Type <select className="field w-44 py-1 text-xs" value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}><option value="">All</option>{KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select></label>}>
          {reports.loading && <Loading lines={4} />}
          {reports.error && <ErrorState error={reports.error} />}
          {reports.data && (reports.data.reports.length === 0 ? <EmptyState title="No reports yet">Generate one from an analysis, a feasibility report or the latest benchmark run.</EmptyState> : (
            <ul>
              {reports.data.reports.map((r) => (
                <li key={r.id} className="rule-b grid gap-2 py-3 md:grid-cols-[1fr_auto] md:items-center">
                  <div>
                    <p className="text-ivory">{r.title} {r.is_illustrative && <IllustrativeTag className="ml-1" />}</p>
                    <p className="text-xs text-mist">{KINDS.find((k) => k.key === r.kind)?.label ?? r.kind}, {dateTime(r.created_at)}</p>
                  </div>
                  <DownloadLinks files={r.files} />
                </li>
              ))}
            </ul>
          ))}
        </Panel>
      </div>
    </main>
  );
}
