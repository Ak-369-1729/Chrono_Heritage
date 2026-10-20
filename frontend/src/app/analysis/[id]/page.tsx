"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { Workflow } from "@/components/analysis/Workflow";
import { PredictionByYear, ResidualHistogram, SensitivityBars } from "@/components/charts/AnalysisCharts";
import { AngularTape, AzimuthDial } from "@/components/charts/Azimuth";
import { HorizonPanorama } from "@/components/charts/Panorama";
import {
  Calculating, CopyButton, DownloadLinks, ErrorState, Field, IllustrativeTag, KeyValue, Loading, Notice, PageHeader, Panel, StatusBadge,
} from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime, deg, humanize, num, pct, shortHash, yearLabel } from "@/lib/format";
import { useResource } from "@/lib/hooks";
import type { AnalysisRun, ReportRow } from "@/lib/types";
import { useSubmit } from "@/lib/useSubmit";

export default function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can, user } = useAuth();
  const run = useResource<AnalysisRun>(`/analyses/${id}`, { pollMs: 1200, until: (r) => r.status === "succeeded" || r.status === "failed" });
  const [report, setReport] = useState<ReportRow | null>(null);
  const gen = useSubmit(() => api<ReportRow>("/reports", { method: "POST", json: { kind: "analysis", subject_id: id } }));
  const rerun = useSubmit(() => api<{ id: string; inputs_changed: boolean }>(`/analyses/${id}/rerun`, { method: "POST", json: {} }));
  const siteRuns = useResource<{ analyses: AnalysisRun[] }>(run.data ? `/analyses?site_id=${encodeURIComponent(run.data.site_id ?? "")}` : null);
  // A job that stays queued is reported, not hidden behind an endless spinner.
  const [waited, setWaited] = useState(0);
  const isPending = run.data?.status === "queued" || run.data?.status === "running";
  useEffect(() => {
    if (!isPending) return;
    const t0 = Date.now();
    const t = setInterval(() => setWaited(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(t);
  }, [isPending]);

  if (run.loading && !run.data) return <Shell><Loading label="Loading analysis" lines={8} /></Shell>;
  if (run.error && !run.data) return <Shell><ErrorState error={run.error} onRetry={run.reload} /></Shell>;
  const r = run.data!;
  const res = r.result;
  const snap = r.input_snapshot ?? {};
  const pending = r.status === "queued" || r.status === "running";
  const critical = r.warnings.filter((w) => w.severity === "critical");
  const rest = r.warnings.filter((w) => w.severity !== "critical");

  return (
    <Shell>
      <PageHeader
        crumbs={[{ href: "/analysis", label: "Analyses" }]}
        title={`${r.site_name ?? "Analysis"}: ${res?.target.label ?? humanize(r.hypothesis.target_key)}`}
        lede={<p className="prose-serif text-[1.02rem]">“{r.hypothesis.statement}”</p>}
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={r.status} />
            {r.is_illustrative && <IllustrativeTag />}
            {res && <StatusBadge status={res.status_labels.validation === "benchmark_gate_passed" ? "validated" : "pending"} label={res.status_labels.validation === "benchmark_gate_passed" ? "Benchmark gate passed" : "Unvalidated: benchmark gate pending"} />}
            <StatusBadge status={r.review_status} label={`Human review: ${humanize(r.review_status)}`} />
            <StatusBadge status={r.hypothesis.mode === "exploratory" ? "exploratory" : "pending"} label={humanize(r.hypothesis.mode)} />
            <span className="text-xs text-mist">{r.visibility}</span>
          </div>
        }
        actions={r.status === "succeeded" && user ? (
          <>
            <button className="btn btn-primary" disabled={gen.pending} onClick={async () => { const rep = await gen.run(); if (rep) setReport(rep); }}>
              {gen.pending ? "Generating report…" : "Generate report"}
            </button>
            <button className="btn btn-quiet" disabled={rerun.pending} onClick={async () => { const x = await rerun.run(); if (x) window.location.assign(`/analysis/${x.id}`); }}>
              {rerun.pending ? "Starting rerun…" : "Rerun with same seed"}
            </button>
          </>
        ) : undefined}
      />
      <Workflow current={pending ? "run" : r.status === "failed" ? "run" : r.review_status === "unreviewed" ? "results" : "review"} failed={r.status === "failed"} />
      {(gen.error || rerun.error) && <div className="mb-6"><ErrorState error={(gen.error ?? rerun.error)!} /></div>}
      {report && (
        <div className="mb-6 flex flex-wrap items-center gap-3 border-l-2 border-copper pl-3" role="status">
          <span className="text-sm text-copper-bright">Report generated. Choose a format to download.</span>
          <DownloadLinks files={report.files} />
        </div>
      )}

      {pending && (
        <div className="my-10 space-y-3">
          <Calculating label={r.status === "queued" ? `Queued: waiting for a worker (${waited} s)…` : `Reconstructing the sky and propagating uncertainty (${waited} s)…`} />
          {waited >= 60 && (
            <Notice tone="warning" title="Taking longer than expected">
              This job has not finished after a minute. If it stays queued, the background worker may not be running
              (with Docker: <code>docker compose logs worker</code>). The page keeps checking; nothing is lost.
            </Notice>
          )}
        </div>
      )}
      {r.status === "failed" && (
        <Notice tone="critical" title="Analysis failed">{r.error?.message} No partial result is shown. Correct the inputs and run a new analysis.</Notice>
      )}

      {res && (
        <>
          <div className="space-y-2">
            {critical.map((w) => <Notice key={w.code} tone="critical" title={humanize(w.code)}>{w.message}</Notice>)}
          </div>
          <p className="prose-serif my-6 max-w-3xl border-l-2 border-brass/70 pl-4 text-[1.04rem] text-ivory/90">{res.caveat}</p>

          <section aria-labelledby="result-h" className="grid gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <div className="min-w-0">
              <h2 id="result-h" className="heading mb-3 text-xl">Prediction against the measured axis</h2>
              <AngularTape measured={res.observed.true_azimuth_deg} measuredSigma={res.observed.combined_uncertainty_deg}
                predicted={res.monte_carlo.predicted_azimuth.median}
                predictedRange={[res.monte_carlo.predicted_azimuth.q025, res.monte_carlo.predicted_azimuth.q975]}
                axisMode={res.observed.axis_mode as "directed" | "bidirectional"} />
              <div className="table-frame"><table className="dtable mt-6">
                <caption className="sr-only">Propagated results</caption>
                <thead><tr><th scope="col">Quantity</th><th scope="col">Median</th><th scope="col">68% interval</th><th scope="col">95% interval</th></tr></thead>
                <tbody>
                  {([["Predicted azimuth", res.monte_carlo.predicted_azimuth, false], ["Signed residual (axis − prediction)", res.monte_carlo.residual_signed, true], ["Absolute residual", res.monte_carlo.residual_abs, false]] as const).map(([k, v, signed]) => (
                    <tr key={k}>
                      <td>{k}</td>
                      <td className="num">{deg(v.median, 3, signed)}</td>
                      <td className="num">{deg(v.q16, 3, signed)} to {deg(v.q84, 3, signed)}</td>
                      <td className="num">{deg(v.q025, 3, signed)} to {deg(v.q975, 3, signed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              <p className="mt-3 text-sm text-ivory-dim">
                Share of propagated samples with |residual| within{" "}
                {Object.entries(res.monte_carlo.within_window).map(([k, v], i) => <span key={k} className="num">{i ? ", " : ""}±{k}°: {pct(v)}</span>)}.
                <span className="block text-xs text-mist">{res.monte_carlo.within_window_note}</span>
              </p>
              <p className="mt-2 text-xs text-mist">{res.statistics.reason}</p>
            </div>
            <div className="flex flex-col items-center gap-3">
              <AzimuthDial measured={res.observed.true_azimuth_deg} measuredSigma={res.observed.combined_uncertainty_deg}
                predicted={res.monte_carlo.predicted_azimuth.median}
                predictedRange={[res.monte_carlo.predicted_azimuth.q025, res.monte_carlo.predicted_azimuth.q975]}
                axisMode={res.observed.axis_mode as "directed" | "bidirectional"} size={280} />
              <p className="text-center text-2xs text-mist">True-scale compass. Gold: measured axis{res.observed.axis_mode === "bidirectional" ? " (dashed: opposite end)" : ""}. Blue: prediction. Terracotta: ±2σ measurement.</p>
            </div>
          </section>

          <div className="mt-12 grid gap-x-12 gap-y-10 lg:grid-cols-2">
            <Panel title="Uncertainty propagation" id="mc" meta={`${res.monte_carlo.n_samples.toLocaleString()} samples, seed ${res.monte_carlo.seed}`}>
              <ResidualHistogram counts={res.monte_carlo.histogram.counts} edges={res.monte_carlo.histogram.edges}
                q025={res.monte_carlo.residual_signed.q025} q975={res.monte_carlo.residual_signed.q975}
                q16={res.monte_carlo.residual_signed.q16} q84={res.monte_carlo.residual_signed.q84} median={res.monte_carlo.residual_signed.median} />
              <p className="mt-3 text-sm text-ivory-dim">Propagated: {res.monte_carlo.components_propagated.join(", ")}.</p>
              {res.monte_carlo.components_unavailable.length > 0 && <p className="mt-1 text-sm text-terracotta">Not propagated: {res.monte_carlo.components_unavailable.join("; ")}.</p>}
            </Panel>
            <Panel title="Prediction across the chronology" id="chron" meta={res.chronology.label}>
              <PredictionByYear years={res.prediction_grid.years} azimuths={res.prediction_grid.azimuths_deg}
                measured={res.observed.true_azimuth_deg} sigma={res.observed.combined_uncertainty_deg} />
              <div className="table-frame"><table className="dtable mt-3">
                <thead><tr><th scope="col">Bound</th><th scope="col">Predicted</th><th scope="col">Residual</th><th scope="col">Bearing compared</th></tr></thead>
                <tbody>{res.range_bounds.map((b) => <tr key={b.label}><td>{b.label}</td><td className="num">{deg(b.predicted_azimuth_deg, 3)}</td><td className="num">{deg(b.residual_signed_deg, 3, true)}</td><td className="num">{deg(b.compared_bearing_deg, 2)}</td></tr>)}</tbody>
              </table></div>
              <p className="mt-2 text-2xs text-mist">Grid of {res.prediction_grid.years.length} whole years; max interpolation error {deg(res.prediction_grid.max_interpolation_error_deg, 4)}.</p>
            </Panel>
            <Panel title="Horizon and the Sun's path" id="horizon" meta={res.horizon.source_label ?? undefined}>
              <HorizonPanorama horizonAz={snap.horizon?.azimuths_deg} horizonAlt={snap.horizon?.altitudes_deg}
                horizonKind={r.parameters.horizon_mode === "flat" ? "none_declared" : res.horizon.kind} dayPath={res.day_path}
                eventAz={res.range_bounds[0].predicted_azimuth_deg} eventAlt={res.range_bounds[0].event.horizon_altitude_deg}
                measuredAz={res.range_bounds[0].compared_bearing_deg} measuredSigma={res.observed.combined_uncertainty_deg} halfWidth={25} />
              <p className="mt-2 text-xs text-mist">Day of the event at {res.range_bounds[0].label.toLowerCase()}: {String(res.range_bounds[0].event.calendar_strings.julian_ut1)}.</p>
            </Panel>
            <Panel title="Sensitivity analysis" id="sens" meta="one assumption at a time, at the start of the range">
              <SensitivityBars rows={res.sensitivity} />
              {res.assumed_sigma_sweep && (
                <div className="mt-5">
                  <p className="mb-2 text-sm text-gold-bright">Assumed orientation uncertainty (not documented in any source)</p>
                  <div className="table-frame"><table className="dtable"><thead><tr><th scope="col">Assumed σ</th><th scope="col">Median |residual|</th><th scope="col">95% signed interval</th></tr></thead>
                    <tbody>{res.assumed_sigma_sweep.map((x) => <tr key={x.assumed_sigma_deg}><td className="num">{deg(x.assumed_sigma_deg, 1)}</td><td className="num">{deg(x.residual_abs_median, 3)}</td><td className="num">{deg(x.residual_signed_q025, 2, true)} to {deg(x.residual_signed_q975, 2, true)}</td></tr>)}</tbody>
                  </table></div>
                </div>
              )}
            </Panel>
          </div>

          {rest.length > 0 && (
            <Panel title="Warnings and exclusions" id="warnings" className="mt-10">
              <div className="space-y-2">{rest.map((w) => <Notice key={w.code + w.message} tone={w.severity === "info" ? "info" : "warning"} title={humanize(w.code)}>{w.message}</Notice>)}</div>
            </Panel>
          )}

          <Panel title="Inputs: raw, transformed, used" id="inputs" className="mt-10">
            <div className="overflow-x-auto">
              <table className="dtable">
                <thead><tr><th scope="col">Input</th><th scope="col">Raw record</th><th scope="col">Transformation</th><th scope="col">Value used</th></tr></thead>
                <tbody>
                  <tr>
                    <td>Orientation</td>
                    <td className="num">{res.observed.raw_bearing} {res.observed.raw_unit} from {res.observed.raw_north_reference} north{snap.orientation_raw?.uncertainty_deg != null ? `, σ ${snap.orientation_raw.uncertainty_deg}°` : ""}</td>
                    <td className="text-xs text-ivory-dim">{res.observed.transformation_steps.map((s) => humanize(s.op)).join(" → ") || "none"}</td>
                    <td className="num">{deg(res.observed.true_azimuth_deg, 4)} true, {res.observed.axis_mode}{res.observed.combined_uncertainty_deg != null ? `, σ ${deg(res.observed.combined_uncertainty_deg, 3)}` : ", σ unavailable"}</td>
                  </tr>
                  <tr>
                    <td>Chronology</td>
                    <td className="num">{yearLabel(snap.chronology?.start_year)} – {yearLabel(snap.chronology?.end_year)} ({snap.chronology?.date_basis ?? "basis not recorded"})</td>
                    <td className="text-xs text-ivory-dim">sampled {res.chronology.model}; never collapsed to a midpoint</td>
                    <td className="num">{res.chronology.label}</td>
                  </tr>
                  <tr>
                    <td>Horizon</td>
                    <td>{snap.horizon ? `${humanize(snap.horizon.kind)}, ${snap.horizon.n_samples} samples` : "none recorded"}</td>
                    <td className="text-xs text-ivory-dim">{r.parameters.horizon_mode === "flat" ? "flat assumption chosen" : "periodic linear interpolation"}</td>
                    <td>{humanize(res.horizon.kind)}{res.horizon.altitude_uncertainty_deg ? `, ±${res.horizon.altitude_uncertainty_deg}°` : ""}</td>
                  </tr>
                  <tr>
                    <td>Atmosphere and event</td>
                    <td>—</td>
                    <td className="text-xs text-ivory-dim">parameters chosen in the hypothesis</td>
                    <td>{res.atmosphere.model === "none" ? "no refraction" : `${res.atmosphere.model}, ${res.atmosphere.pressure_hpa} hPa, ${res.atmosphere.temperature_c} °C`}; {humanize(res.limb)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="mt-10 grid gap-x-12 gap-y-10 lg:grid-cols-2">
            <Panel title="Provenance" id="prov" meta={`completeness ${num((snap.provenance?.score ?? 0) * 100, 0)}% (${snap.provenance?.formula_version})`}>
              <ol className="space-y-2 text-sm">
                {(snap.sources ?? []).map((s: { id: string; role: string; citation: string; is_illustrative: boolean }) => (
                  <li key={s.id + s.role} className="grid grid-cols-[6rem_1fr] gap-2">
                    <span className="text-xs text-mist">{s.role}</span>
                    <span className="text-ivory-dim">{s.citation}</span>
                  </li>
                ))}
              </ol>
              {r.site_id && <Link href={`/sites/${r.site_id}`} className="btn-link mt-3 inline-block text-sm">Current site record</Link>}
            </Panel>
            <Panel title="Versions and parameters" id="versions">
              <KeyValue rows={[
                ["Run id", <span key="r" className="flex flex-wrap items-center gap-2"><span className="num">{r.id}</span><CopyButton text={r.id} /></span>],
                ["Input snapshot hash", <span key="h" className="flex flex-wrap items-center gap-2"><span className="num">{shortHash(r.input_hash, 20)}</span><CopyButton text={r.input_hash} label="Copy hash" /></span>],
                ["Hypothesis registered", dateTime(r.hypothesis.registered_at)],
                ["Completed", dateTime(r.completed_at)],
                ["Parent run", r.parent_run_id ? <Link key="p" className="inline" href={`/analysis/${r.parent_run_id}`}>{r.parent_run_id.slice(0, 8)}</Link> : "—"],
                ["Seed", `${r.seed} (${String(r.parameters.seed_source ?? "")})`],
                ...Object.entries(r.versions).map(([k, v]) => [humanize(k), String(v)] as [string, string]),
              ]} />
              <div className="mt-3"><CopyButton text={JSON.stringify({ id: r.id, input_hash: r.input_hash, seed: r.seed, versions: r.versions, summary: r.summary }, null, 2)} label="Copy result summary (JSON)" /></div>
            </Panel>
          </div>

          <Panel title="Human review" id="review" className="mt-10">
            <p className="text-sm text-ivory-dim">Status: <StatusBadge status={r.review_status} />{r.review_note && <span className="ml-2">“{r.review_note}” ({dateTime(r.reviewed_at)})</span>}</p>
            <p className="mt-1 text-xs text-mist">Review certifies the data-quality process only; it never certifies historical intent.</p>
            {can("reviewer") && <ReviewRun id={r.id} illustrative={r.is_illustrative} onDone={run.reload} />}
          </Panel>
          <Panel title="Rerun lineage" id="lineage" className="mt-10" meta="A rerun never changes this run; it creates a new one that points here">
            {(() => {
              const kids = (siteRuns.data?.analyses ?? []).filter((x) => x.parent_run_id === r.id);
              return (
                <ol className="space-y-2 text-sm">
                  {r.parent_run_id && <li>Rerun of <Link className="inline" href={`/analysis/${r.parent_run_id}`}>run {r.parent_run_id.slice(0, 8)}</Link></li>}
                  <li className="text-ivory">This run <span className="num text-mist">{r.id.slice(0, 8)}</span>, input hash <span className="num text-mist">{shortHash(r.input_hash)}</span></li>
                  {kids.map((k) => (
                    <li key={k.id} className="pl-4">Rerun <Link className="inline" href={`/analysis/${k.id}`}>{k.id.slice(0, 8)}</Link> <span className="text-mist">{dateTime(k.created_at)}, {k.input_hash === r.input_hash ? "same inputs" : "inputs changed"}</span> <StatusBadge status={k.status} /></li>
                  ))}
                  {!r.parent_run_id && kids.length === 0 && <li className="text-mist">No reruns yet.</li>}
                </ol>
              );
            })()}
          </Panel>
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="chamber">{children}</main>;
}

function ReviewRun({ id, illustrative, onDone }: { id: string; illustrative: boolean; onDone: () => void }) {
  const [note, setNote] = useState("");
  const s = useSubmit((decision: string) => api(`/analyses/${id}/review`, { method: "POST", json: { decision, note } }));
  return (
    <form className="mt-4 max-w-xl space-y-2" onSubmit={(e) => e.preventDefault()}>
      <Field label="Reviewer note" htmlFor="ar-note"><input id="ar-note" className="field" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={s.pending || note.length < 5 || illustrative} onClick={async () => { if (await s.run("approve")) onDone(); }}>Approve run</button>
        <button className="btn btn-quiet" disabled={s.pending || note.length < 5} onClick={async () => { if (await s.run("reject")) onDone(); }}>Reject run</button>
      </div>
      {illustrative && <p className="text-2xs text-mist">Illustrative runs cannot be approved.</p>}
      {s.error && <ErrorState error={s.error} />}
    </form>
  );
}
