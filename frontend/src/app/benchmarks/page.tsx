"use client";

import { useState } from "react";
import { GateCard } from "@/components/GateCard";
import { Calculating, CopyButton, DownloadLinks, EmptyState, ErrorState, Field, KeyValue, Loading, Notice, PageHeader, Panel, StatusBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime, humanize, shortHash } from "@/lib/format";
import { useResource } from "@/lib/hooks";
import type { BenchmarkCaseResult, BenchmarkRun, ReportRow } from "@/lib/types";
import { useSubmit } from "@/lib/useSubmit";

interface Suite {
  id: string; description: string; tolerances: Record<string, { tolerance_deg: number | null; rationale: string }>; tolerance_hash: string;
  frozen_at: string; frozen_by: string; tolerances_reviewed_at: string | null;
}

const CLASS_LABEL: Record<string, string> = {
  modern: "Modern positions vs JPL Horizons", historical: "Historical events vs two independent paths", horizon: "Horizon correction",
  wraparound: "Bearing wraparound and axial residuals", published: "Published case recalculation", reproducibility: "Seeded reproducibility",
  missing_data: "Missing-data refusal",
};

export default function BenchmarksPage() {
  const { can } = useAuth();
  const suite = useResource<Suite>("/benchmarks/suite");
  const latest = useResource<BenchmarkRun>("/benchmarks/runs/latest");
  const runs = useResource<{ runs: BenchmarkRun[] }>("/benchmarks/runs", { pollMs: 2000, until: (d) => !d.runs.some((r) => r.status === "running") });
  const start = useSubmit(() => api<{ id: string }>("/benchmarks/runs", { method: "POST" }));
  const exp = useSubmit(() => api<ReportRow>("/reports", { method: "POST", json: { kind: "benchmark" } }));
  const [files, setFiles] = useState<ReportRow | null>(null);
  const [note, setNote] = useState("");
  const tolReview = useSubmit((decision: string) => api("/benchmarks/suite/review-tolerances", { method: "POST", json: { decision, note } }));
  const running = runs.data?.runs.some((r) => r.status === "running");

  async function runSuite() {
    await start.run();
    await runs.reload();
    await latest.reload();
  }

  return (
    <main className="chamber">
      <PageHeader
        title="Benchmark results"
        lede="The calculation engine is never its own reference. Each fixed case is compared with an independent source under a tolerance frozen before any comparison. An unavailable reference makes a case blocked, never passed."
        actions={
          <>
            <button className="btn btn-primary" disabled={!can("researcher") || start.pending || running} onClick={runSuite}>
              {running ? "Suite running…" : "Run the benchmark suite"}
            </button>
            <button className="btn btn-quiet" disabled={!can("researcher") || exp.pending || !latest.data} onClick={async () => setFiles(await exp.run())}>Export report</button>
          </>
        }
      />
      {start.error && <div className="mb-4"><ErrorState error={start.error} /></div>}
      {files && <div className="mb-6"><DownloadLinks files={files.files} /></div>}
      {running && <div className="mb-6"><Calculating label="Running fixed cases against JPL Horizons and the independent historical paths…" /></div>}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="min-w-0 space-y-10">
          {latest.loading && <Loading lines={6} />}
          {latest.error?.status === 404 && (
            <EmptyState title="The suite has not been run yet">Run it to record pass, fail and blocked outcomes with full reference metadata.</EmptyState>
          )}
          {latest.error && latest.error.status !== 404 && <ErrorState error={latest.error} />}
          {latest.data && <RunView run={latest.data} />}
        </div>
        <aside className="space-y-8">
          {latest.data?.gate && <GateCard gate={latest.data.gate} />}
          {suite.data && (
            <Panel title="Frozen suite">
              <KeyValue rows={[
                ["Suite", suite.data.id],
                ["Tolerance hash", <span key="h" className="flex flex-wrap items-center gap-2"><span className="num">{shortHash(suite.data.tolerance_hash, 16)}</span><CopyButton text={suite.data.tolerance_hash} /></span>],
                ["Frozen", dateTime(suite.data.frozen_at)],
                ["Tolerance review", suite.data.tolerances_reviewed_at ? `approved ${dateTime(suite.data.tolerances_reviewed_at)}` : <span key="t" className="text-gold-bright">awaiting domain review</span>],
              ]} />
              <p className="mt-3 text-xs text-mist">{suite.data.frozen_by}</p>
              <div className="table-frame"><table className="dtable mt-4">
                <thead><tr><th scope="col">Class</th><th scope="col">Tolerance</th></tr></thead>
                <tbody>{Object.entries(suite.data.tolerances).map(([k, v]) => <tr key={k}><td title={v.rationale}>{humanize(k)}</td><td className="num">{v.tolerance_deg === null ? "method match" : `${v.tolerance_deg}°`}</td></tr>)}</tbody>
              </table></div>
              {can("reviewer") && (
                <form className="mt-4 space-y-2" onSubmit={(e) => e.preventDefault()}>
                  <Field label="Domain review of tolerances" htmlFor="tol-note"><input id="tol-note" className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Basis for approval" /></Field>
                  <div className="flex gap-2">
                    <button className="btn btn-quiet" disabled={note.length < 5 || tolReview.pending} onClick={async () => { if (await tolReview.run("approve")) void suite.reload(); }}>Approve tolerances</button>
                    <button className="btn btn-quiet" disabled={note.length < 5 || tolReview.pending} onClick={async () => { if (await tolReview.run("reject")) void suite.reload(); }}>Withdraw</button>
                  </div>
                  {tolReview.error && <ErrorState error={tolReview.error} />}
                </form>
              )}
            </Panel>
          )}
          <Panel title="Run history">
            <ul className="text-sm">
              {runs.data?.runs.map((r) => (
                <li key={r.id} className="rule-b flex items-center justify-between gap-2 py-2">
                  <span className="num text-xs">{dateTime(r.created_at)}</span>
                  <StatusBadge status={r.status === "completed" ? "succeeded" : r.status} />
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      </div>
    </main>
  );
}

function RunView({ run }: { run: BenchmarkRun }) {
  const byClass = Object.entries(run.summary.classes);
  return (
    <>
      <Panel title="Outcome by class" meta={`run ${run.id.slice(0, 8)}, finished ${dateTime(run.finished_at)}`}>
        <div className="table-frame"><table className="dtable">
          <thead><tr><th scope="col">Class</th><th scope="col">Pass</th><th scope="col">Fail</th><th scope="col">Blocked</th></tr></thead>
          <tbody>
            {byClass.map(([k, v]) => (
              <tr key={k}>
                <td>{CLASS_LABEL[k] ?? humanize(k)}</td>
                <td className="num text-verdigris">{v.pass}</td>
                <td className={`num ${v.fail ? "text-terracotta" : "text-mist"}`}>{v.fail}</td>
                <td className={`num ${v.blocked ? "text-gold-bright" : "text-mist"}`}>{v.blocked}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        {byClass.some(([, v]) => v.blocked) && (
          <div className="mt-4"><Notice tone="warning" title="Blocked cases">Some required references were unavailable. Blocked cases keep the Phase 0.5 gate open; they are listed below with the reason.</Notice></div>
        )}
      </Panel>
      <Panel title="Fixed cases">
        <ul>{run.results?.map((c) => <CaseRow key={c.case_key} c={c} />)}</ul>
      </Panel>
      <Panel title="Reproducibility record">
        <KeyValue rows={[
          ["Python", run.environment.python ?? "—"], ["Platform", run.environment.platform ?? "—"],
          ["Packages", Object.entries(run.environment.packages ?? {}).map(([k, v]) => `${k} ${v ?? "absent"}`).join(", ")],
          ["Lockfile SHA-256", <span key="l" className="num">{shortHash(run.environment.requirements_lock_sha256 ?? null, 20)}</span>],
          ["Git commit", run.environment.git_sha ?? "not recorded"],
          ["Tolerance hash", <span key="t" className="num">{shortHash(run.summary.tolerance_hash, 20)}</span>],
        ]} />
      </Panel>
    </>
  );
}

function CaseRow({ c }: { c: BenchmarkCaseResult }) {
  const ratio = c.max_abs_difference_deg != null && c.tolerance_deg ? Math.min(1, c.max_abs_difference_deg / c.tolerance_deg) : null;
  return (
    <li className="rule-b py-3">
      <details className="group">
        <summary className="grid cursor-pointer list-none grid-cols-[5.5rem_1fr_auto] items-center gap-3 sm:grid-cols-[5.5rem_1fr_9rem_auto]">
          <span className="num text-sm text-ivory">{c.case_key}</span>
          <span className="min-w-0 text-sm">{c.title}<span className="block text-2xs text-mist">{CLASS_LABEL[c.test_class] ?? c.test_class}</span></span>
          <span className="hidden sm:block" aria-hidden>
            {ratio !== null && (
              <span className="relative block h-1.5 bg-night-2" title="Difference as a share of the frozen tolerance">
                <span className={`absolute inset-y-0 left-0 ${ratio < 1 ? "bg-verdigris" : "bg-terracotta"}`} style={{ width: `${Math.max(2, ratio * 100)}%` }} />
              </span>
            )}
          </span>
          <StatusBadge status={c.status} />
        </summary>
        <div className="mt-3 space-y-3 border-l-2 border-rule pl-4 text-sm">
          <p className="text-ivory">{c.explanation}</p>
          <KeyValue rows={[
            ["Largest difference", c.max_abs_difference_deg != null ? `${c.max_abs_difference_deg.toExponential(3)}°` : "—"],
            ["Frozen tolerance", c.tolerance_deg != null ? `${c.tolerance_deg}°` : "method match"],
            ["Reference", humanize(c.reference_kind)],
            ["Independence", c.independence_note],
            ["Licence and attribution", c.licence_note],
            ["Input hash", <span key="h" className="num">{shortHash(c.input_hash, 20)}</span>],
          ]} />
          {c.candidate_output && <Json label="Candidate output" value={c.candidate_output} />}
          {c.reference_outputs && Object.keys(c.reference_outputs).length > 0 && <Json label="Reference outputs" value={c.reference_outputs} />}
          {Object.keys(c.reference_metadata ?? {}).length > 0 && <Json label="Reference retrieval metadata" value={c.reference_metadata} />}
          <Json label="Inputs" value={c.inputs} />
          {c.log.length > 0 && <div><p className="text-xs text-ivory-dim">Log</p><ul className="text-xs text-mist">{c.log.map((l, i) => <li key={i}>{l}</li>)}</ul></div>}
        </div>
      </details>
    </li>
  );
}

function Json({ label, value }: { label: string; value: unknown }) {
  const text = JSON.stringify(value, null, 2);
  return (
    <details>
      <summary className="cursor-pointer text-xs text-ivory-dim hover:text-ivory">{label}</summary>
      <div className="relative mt-1">
        <pre className="max-h-72 overflow-auto bg-obsidian p-3 text-2xs leading-relaxed text-ivory-dim">{text}</pre>
        <div className="absolute right-2 top-2"><CopyButton text={text} /></div>
      </div>
    </details>
  );
}
