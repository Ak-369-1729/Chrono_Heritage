"use client";

import { useState, type FormEvent } from "react";
import { GateCard } from "@/components/GateCard";
import { ErrorState, Field, Loading, Notice, PageHeader, Panel, SignInPrompt, StatusBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime, humanize } from "@/lib/format";
import { useResource } from "@/lib/hooks";
import type { Gates } from "@/lib/types";
import { useSubmit } from "@/lib/useSubmit";

interface Pilot {
  id: string; researcher_role: string; run_date: string; citation_commitment: string; would_return: string; verified: boolean;
  elapsed_minutes: number; created_at: string; hypothesis?: string; friction?: string[]; citation_venue?: string | null;
}

const ORDER: (keyof Gates)[] = ["phase0", "phase0_5", "differentiation", "behavioral", "cross_site", "ml"];

const STATE_INFO: { status: string; label: string; meaning: string }[] = [
  { status: "passed", label: "Satisfied", meaning: "Every condition is met by recorded, reviewed evidence." },
  { status: "pending", label: "Pending", meaning: "Some evidence exists; conditions or reviews are still outstanding." },
  { status: "not_evaluated", label: "Not evaluated", meaning: "No evidence has been recorded yet, so the gate cannot be judged." },
  { status: "failed", label: "Not met (closed)", meaning: "Conditions are not met; the server keeps the dependent features closed." },
  { status: "omitted", label: "Omitted", meaning: "Deliberately left out of this version, with the reason recorded." },
];

/** At-a-glance state of every gate, what each state means, and the next unmet conditions. Read from the server. */
function GateSummary({ gates }: { gates: Gates }) {
  const all = ORDER.map((k) => gates[k]);
  const next = all.flatMap((g) => g.conditions.filter((c) => c.met !== true).map((c) => ({ gate: g.title, c }))).slice(0, 6);
  return (
    <section aria-labelledby="gs-h" className="mb-12 space-y-6">
      <h2 id="gs-h" className="sr-only">Summary</h2>
      <ul className="grid gap-px overflow-hidden border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-5">
        {STATE_INFO.map((st) => {
          const n = all.filter((g) => g.status === st.status).length;
          return (
            <li key={st.status} className={`bg-obsidian p-4 ${n === 0 ? "opacity-60" : ""}`}>
              <div className="flex items-center justify-between gap-2"><StatusBadge status={st.status} label={st.label} /><span className="num heading text-2xl">{n}</span></div>
              <p className="mt-2 text-xs text-ivory-dim">{st.meaning}</p>
            </li>
          );
        })}
      </ul>
      {next.length > 0 && (
        <div className="niche p-4">
          <h3 className="heading text-lg">What is still missing</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {next.map(({ gate, c }) => (
              <li key={gate + c.key}><span className="text-ivory">{c.label}</span> <span className="text-mist">({gate})</span>{c.detail && <span className="block text-xs text-ivory-dim">{c.detail}</span>}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-mist">This page displays the server&apos;s evaluation. Nothing here can change a gate; only new evidence and reviews can.</p>
        </div>
      )}
    </section>
  );
}

export default function GatesPage() {
  const { can } = useAuth();
  const gates = useResource<Gates>("/gates");
  const pilots = useResource<{ pilots: Pilot[] }>("/behavioral-pilots");
  return (
    <main className="chamber">
      <PageHeader
        title="Evidence gates"
        lede="Each phase advances only when recorded evidence meets a pre-registered condition. Reviews can satisfy review conditions; they can never override a data condition."
      />
      {gates.loading && <Loading lines={6} />}
      {gates.error && <ErrorState error={gates.error} onRetry={gates.reload} />}
      {gates.data && <GateSummary gates={gates.data} />}
      {gates.data && (
        <div className="grid gap-x-12 gap-y-8 md:grid-cols-2">
          {ORDER.map((k) => <GateCard key={k} gate={gates.data![k]} />)}
        </div>
      )}
      {can("reviewer") && gates.data && <Signoff onDone={gates.reload} />}

      <Panel title="Behavioral pilots" id="pilots" className="mt-14" meta="the demand gate counts only observed behaviour">
        <p className="mb-4 max-w-3xl text-sm text-ivory-dim">
          A pilot counts toward the gate only when a researcher ran a real hypothesis through the prototype, explicitly agreed to
          cite the tool or its output in a paper, thesis or grant, and a different reviewer verified the record. Interest and praise do not count.
        </p>
        {pilots.data?.pilots.length ? (
          <div className="table-frame"><table className="dtable min-w-[640px]">
            <thead><tr><th scope="col">Researcher role</th><th scope="col">Run</th><th scope="col">Time</th><th scope="col">Citation</th><th scope="col">Would return</th><th scope="col">Verified</th></tr></thead>
            <tbody>
              {pilots.data.pilots.map((p) => (
                <tr key={p.id}>
                  <td>{p.researcher_role}{p.hypothesis && <span className="block text-2xs text-mist">{p.hypothesis}</span>}</td>
                  <td className="num text-xs">{p.run_date}</td>
                  <td className="num">{p.elapsed_minutes} min</td>
                  <td>{humanize(p.citation_commitment)}{p.citation_venue && <span className="block text-2xs text-mist">{p.citation_venue}</span>}</td>
                  <td>{p.would_return}</td>
                  <td><StatusBadge status={p.verified ? "reviewed" : "unreviewed"} label={p.verified ? "Verified" : "Not verified"} /></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        ) : <Notice tone="info" title="No pilots recorded">No researcher has yet run a real hypothesis through the prototype. Demand remains unvalidated.</Notice>}
        <div className="mt-6">{can("researcher") ? <PilotForm onDone={() => { void pilots.reload(); void gates.reload(); }} /> : <SignInPrompt action="record a pilot session" />}</div>
      </Panel>
    </main>
  );
}

function Signoff({ onDone }: { onDone: () => void }) {
  const [gate, setGate] = useState("cross_site:null_model");
  const [rationale, setRationale] = useState("");
  const s = useSubmit((decision: string) => {
    const [g, c] = gate.split(":");
    return api(`/gates/${g}/signoffs`, { method: "POST", json: { condition_key: c, decision, rationale } });
  });
  return (
    <Panel title="Record a review sign-off" className="mt-12">
      <form className="grid max-w-2xl gap-3" onSubmit={(e) => e.preventDefault()}>
        <Field label="Condition" htmlFor="so-g">
          <select id="so-g" className="field" value={gate} onChange={(e) => setGate(e.target.value)}>
            <option value="cross_site:null_model">Tier 2: null model approved by a domain reviewer</option>
            <option value="cross_site:domain_review">Tier 2: statistical protocol domain review</option>
            <option value="differentiation:review">Differentiation: comparison reviewed</option>
          </select>
        </Field>
        <Field label="Rationale and evidence" htmlFor="so-r" hint="At least 20 characters"><textarea id="so-r" className="field" rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} /></Field>
        <div className="flex gap-2">
          <button className="btn btn-primary" disabled={s.pending || rationale.length < 20} onClick={async () => { if (await s.run("approve")) { setRationale(""); onDone(); } }}>Approve</button>
          <button className="btn btn-quiet" disabled={s.pending || rationale.length < 20} onClick={async () => { if (await s.run("reject")) { setRationale(""); onDone(); } }}>Reject or revoke</button>
        </div>
        {s.error && <ErrorState error={s.error} />}
      </form>
    </Panel>
  );
}

function PilotForm({ onDone }: { onDone: () => void }) {
  const s = useSubmit((body: unknown) => api("/behavioral-pilots", { method: "POST", json: body }));
  const lines = (v: FormDataEntryValue | null) => String(v ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const ok = await s.run({
      researcher_role: f.get("role"), consent_recorded: f.get("consent") === "on", hypothesis: f.get("hypothesis"),
      hypothesis_source: f.get("hsource") || null, run_date: f.get("date"), analysis_run_id: f.get("run") || null,
      steps: lines(f.get("steps")), external_tools: lines(f.get("tools")), elapsed_minutes: Number(f.get("minutes")),
      friction: lines(f.get("friction")), output_sections_used: lines(f.get("sections")), limitations_noted: f.get("limits") || null,
      would_return: f.get("return"), return_reason: f.get("reason") || null, citation_commitment: f.get("citation"),
      citation_venue: f.get("venue") || null, evidence_note: f.get("evidence") || null,
    });
    if (ok) { form.reset(); onDone(); }
  }
  return (
    <details className="rule-t pt-3">
      <summary className="heading cursor-pointer text-base hover:text-gold-bright">Record a pilot session</summary>
      <form onSubmit={submit} className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Researcher role (no names)" htmlFor="pl-role"><input id="pl-role" name="role" className="field" required /></Field>
        <Field label="Date of run" htmlFor="pl-date"><input id="pl-date" name="date" type="date" className="field" required /></Field>
        <div className="md:col-span-2"><Field label="Real hypothesis tested" htmlFor="pl-h"><input id="pl-h" name="hypothesis" className="field" required minLength={10} /></Field></div>
        <Field label="Hypothesis source" htmlFor="pl-hs"><input id="pl-hs" name="hsource" className="field" /></Field>
        <Field label="Analysis run id" htmlFor="pl-run"><input id="pl-run" name="run" className="field num" /></Field>
        <Field label="Steps taken (one per line)" htmlFor="pl-steps"><textarea id="pl-steps" name="steps" rows={3} className="field" /></Field>
        <Field label="Other tools used (one per line)" htmlFor="pl-tools"><textarea id="pl-tools" name="tools" rows={3} className="field" /></Field>
        <Field label="Friction points (one per line)" htmlFor="pl-fr"><textarea id="pl-fr" name="friction" rows={3} className="field" /></Field>
        <Field label="Output sections used (one per line)" htmlFor="pl-sec"><textarea id="pl-sec" name="sections" rows={3} className="field" /></Field>
        <Field label="Elapsed time (minutes)" htmlFor="pl-min"><input id="pl-min" name="minutes" type="number" min="1" step="1" className="field num" required /></Field>
        <Field label="Would return?" htmlFor="pl-ret"><select id="pl-ret" name="return" className="field"><option value="unsure">Unsure</option><option value="yes">Yes</option><option value="no">No</option></select></Field>
        <Field label="Citation commitment" htmlFor="pl-cit" hint="Only an explicit agreement counts toward the gate">
          <select id="pl-cit" name="citation" className="field"><option value="none">None</option><option value="stated_interest">Stated interest only</option><option value="explicit_agreement">Explicit agreement to cite</option></select>
        </Field>
        <Field label="Venue (paper, thesis or grant)" htmlFor="pl-v"><input id="pl-v" name="venue" className="field" /></Field>
        <Field label="Limitations the researcher noted" htmlFor="pl-l"><input id="pl-l" name="limits" className="field" /></Field>
        <Field label="Evidence note" htmlFor="pl-e"><input id="pl-e" name="evidence" className="field" /></Field>
        <Field label="Reason for returning or not" htmlFor="pl-r"><input id="pl-r" name="reason" className="field" /></Field>
        <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" name="consent" required className="accent-[var(--color-gold)]" />The researcher consented to this record</label>
        <div className="space-y-3 md:col-span-2">
          {s.error && <ErrorState error={s.error} />}
          <button className="btn btn-primary" disabled={s.pending}>{s.pending ? "Recording…" : "Record pilot"}</button>
          <p className="text-2xs text-mist">Recorded {dateTime(new Date().toISOString())}. A different reviewer must verify it before it counts.</p>
        </div>
      </form>
    </details>
  );
}
