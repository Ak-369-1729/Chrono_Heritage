"use client";

import { useState, type FormEvent } from "react";
import { GateCard } from "@/components/GateCard";
import { DownloadLinks, ErrorState, Field, Loading, Notice, PageHeader, Panel, SignInPrompt } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { humanize, num, pct } from "@/lib/format";
import { useResource } from "@/lib/hooks";
import type { Comparison, Gate, ReportRow } from "@/lib/types";
import { useSubmit } from "@/lib/useSubmit";

interface Data {
  measurements: Comparison[]; tools: string[]; cases: string[]; matrix: Record<string, Record<string, Comparison | null>>;
  provenance_fields: { field: string; label: string }[]; gate: Gate;
}

export default function ComparePage() {
  const { can } = useAuth();
  const d = useResource<Data>("/workflow-comparisons");
  const [files, setFiles] = useState<ReportRow | null>(null);
  const exp = useSubmit(() => api<ReportRow>("/reports", { method: "POST", json: { kind: "comparison" } }));

  return (
    <main className="chamber">
      <PageHeader
        title="Workflow comparison"
        lede="The same two or three cases, worked end to end in ArchaeoSky, Gestirne, Stellarium, QGIS with a sky plugin, and ChronoHeritage. Only measured values appear here; no advantage is claimed until one is measured."
        actions={<button className="btn btn-quiet" disabled={!can("researcher") || exp.pending} onClick={async () => setFiles(await exp.run())}>Export comparison report</button>}
      />
      {files && <div className="mb-6"><DownloadLinks files={files.files} /></div>}
      {d.loading && <Loading lines={6} />}
      {d.error && <ErrorState error={d.error} onRetry={d.reload} />}
      {d.data && (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="min-w-0 space-y-10">
            <Panel title="Measurements by case and tool">
              {d.data.cases.length === 0 ? (
                <Notice tone="info" title="Nothing measured yet">No workflow timings have been recorded, so no comparison or speed claim is shown. Record each tool on the same task definition below.</Notice>
              ) : (
                <div className="overflow-x-auto">
                  <table className="dtable">
                    <thead><tr><th scope="col">Case</th>{d.data.tools.map((t) => <th key={t} scope="col">{t}</th>)}</tr></thead>
                    <tbody>
                      {d.data.cases.map((c) => (
                        <tr key={c}>
                          <th scope="row" className="font-normal text-ivory">{c}</th>
                          {d.data!.tools.map((t) => {
                            const m = d.data!.matrix[c][t];
                            return (
                              <td key={t} className="text-xs">
                                {m ? (
                                  <dl className="num space-y-0.5">
                                    <div><dt className="inline text-mist">time </dt><dd className="inline">{num(m.elapsed_seconds / 60, 1)} min</dd></div>
                                    <div><dt className="inline text-mist">manual steps </dt><dd className="inline">{m.manual_steps}</dd></div>
                                    <div><dt className="inline text-mist">provenance </dt><dd className="inline">{pct(m.provenance_score, 0)}</dd></div>
                                    <div><dt className="inline text-mist">uncertainty </dt><dd className="inline">{m.uncertainty_propagation}</dd></div>
                                    <div><dt className="inline text-mist">rerun steps </dt><dd className="inline">{m.reproducibility_steps}</dd></div>
                                  </dl>
                                ) : <span className="text-mist">not measured</span>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
            {d.data.measurements.length > 0 && (
              <Panel title="Evidence and notes">
                <ul className="space-y-2 text-sm">
                  {d.data.measurements.map((m) => (
                    <li key={m.id} className="rule-b pb-2">
                      <span className="text-ivory">{m.case_label}, {m.tool} {m.tool_version}</span> <span className="text-xs text-mist">by {m.operator_label} on {m.measured_at}, {humanize(m.status)}</span>
                      <p className="text-xs text-ivory-dim">Task: {m.task_definition}</p>
                      <p className="text-xs text-ivory-dim">Evidence: {m.evidence_ref}{m.notes ? `. ${m.notes}` : ""}</p>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
            {can("researcher") ? <RecordForm fields={d.data.provenance_fields} tools={d.data.tools} onDone={d.reload} /> : <SignInPrompt action="record workflow measurements" />}
          </div>
          <aside><GateCard gate={d.data.gate} /></aside>
        </div>
      )}
    </main>
  );
}

function RecordForm({ fields, tools, onDone }: { fields: { field: string; label: string }[]; tools: string[]; onDone: () => void }) {
  const s = useSubmit((body: unknown) => api("/workflow-comparisons", { method: "POST", json: body }));
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const ok = await s.run({
      case_label: f.get("case"), tool: f.get("tool"), tool_version: f.get("version"), operator_label: f.get("operator"),
      task_definition: f.get("task"), elapsed_seconds: Number(f.get("minutes")) * 60, manual_steps: Number(f.get("steps")),
      provenance_fields_preserved: f.getAll("pf"), uncertainty_propagation: f.get("unc"), reproducibility_steps: Number(f.get("repro")),
      notes: f.get("notes") || null, evidence_ref: f.get("evidence"), measured_at: f.get("date"),
    });
    if (ok) {
      form.reset();
      onDone();
    }
  }
  return (
    <Panel title="Record a measured session">
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <Field label="Case" htmlFor="w-case" hint="Use the same label across tools"><input id="w-case" name="case" className="field" required /></Field>
        <Field label="Tool" htmlFor="w-tool"><select id="w-tool" name="tool" className="field">{tools.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Tool version" htmlFor="w-ver"><input id="w-ver" name="version" className="field" required /></Field>
        <Field label="Operator (pseudonymous)" htmlFor="w-op"><input id="w-op" name="operator" className="field" required /></Field>
        <div className="md:col-span-2"><Field label="Task definition" htmlFor="w-task" hint="Identical wording for every tool"><input id="w-task" name="task" className="field" required minLength={10} /></Field></div>
        <Field label="Elapsed time (minutes)" htmlFor="w-min"><input id="w-min" name="minutes" type="number" step="0.1" min="0.1" className="field num" required /></Field>
        <Field label="Manual steps" htmlFor="w-steps"><input id="w-steps" name="steps" type="number" min="0" className="field num" required /></Field>
        <Field label="Uncertainty propagation" htmlFor="w-unc"><select id="w-unc" name="unc" className="field"><option value="none">None</option><option value="manual">Manual</option><option value="partial">Partial</option><option value="automated">Automated</option></select></Field>
        <Field label="Steps for another person to rerun" htmlFor="w-repro"><input id="w-repro" name="repro" type="number" min="0" className="field num" required /></Field>
        <fieldset className="md:col-span-2">
          <legend className="mb-2 text-xs font-medium text-ivory-dim">Provenance fields preserved in the tool&apos;s output (same rubric as the provenance score)</legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {fields.map((pf) => <label key={pf.field} className="flex items-center gap-2 text-sm"><input type="checkbox" name="pf" value={pf.field} className="accent-[var(--color-gold)]" />{pf.label}</label>)}
          </div>
        </fieldset>
        <Field label="Evidence reference" htmlFor="w-ev" hint="Screen recording, log or notebook"><input id="w-ev" name="evidence" className="field" required /></Field>
        <Field label="Measured on" htmlFor="w-date"><input id="w-date" name="date" type="date" className="field" required /></Field>
        <div className="md:col-span-2"><Field label="Notes" htmlFor="w-notes"><input id="w-notes" name="notes" className="field" /></Field></div>
        <div className="space-y-3 md:col-span-2">
          {s.error && <ErrorState error={s.error} />}
          <button className="btn btn-primary" disabled={s.pending}>{s.pending ? "Recording…" : "Record measurement"}</button>
        </div>
      </form>
    </Panel>
  );
}
