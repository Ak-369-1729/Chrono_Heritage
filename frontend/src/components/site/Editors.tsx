"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { ErrorState, Field, Notice } from "@/components/ui";
import { api } from "@/lib/api";
import type { Source } from "@/lib/types";
import { useUnsavedGuard } from "@/lib/unsaved";
import { useSubmit } from "@/lib/useSubmit";
import { METHOD_LABEL, NORTH_LABEL } from "./bits";

type Done = () => void;

/**
 * A collapsible editor. Typing marks it as having unsaved changes (the page then asks before navigating away);
 * a successful save resets the form, which clears the flag.
 */
function Shell({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  const key = useId();
  const [dirty, setDirty] = useState(false);
  useUnsavedGuard(key, dirty);
  return (
    <details className="group rule-t py-3" onInput={() => setDirty(true)} onReset={() => setDirty(false)}>
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 gap-y-1 text-ivory hover:text-brass-bright">
        <span className="heading text-base">{title}{dirty && <span className="ml-2 align-middle text-2xs font-normal text-brass-bright">unsaved changes</span>}</span>
        <span className="text-xs text-mist group-open:hidden">{hint}</span>
        <span className="hidden text-xs text-mist group-open:inline">Close (your entries are kept)</span>
      </summary>
      <div className="pt-4">{children}</div>
    </details>
  );
}

const num = (v: FormDataEntryValue | null) => (v === null || v === "" ? null : Number(v));
const str = (v: FormDataEntryValue | null) => (v === null || String(v).trim() === "" ? null : String(v).trim());

function SourceSelect({ sources, name = "source_id", required = false }: { sources: Source[]; name?: string; required?: boolean }) {
  return (
    <select name={name} className="field" required={required} defaultValue="">
      <option value="">{required ? "Choose a source" : "No source"}</option>
      {sources.map((s) => (
        <option key={s.id} value={s.id}>{s.citation.slice(0, 90)}{s.citation.length > 90 ? "…" : ""}</option>
      ))}
    </select>
  );
}

function Submit({ pending, label, pendingLabel }: { pending: boolean; label: string; pendingLabel: string }) {
  return <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? pendingLabel : label}</button>;
}

export function OrientationForm({ siteId, sources, onDone }: { siteId: string; sources: Source[]; onDone: Done }) {
  const [north, setNorth] = useState("true");
  const [hasSigma, setHasSigma] = useState(true);
  const s = useSubmit((body: unknown) => api(`/sites/${siteId}/orientations`, { method: "POST", json: body }));
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const body = {
      label: str(f.get("label")), axis_definition: str(f.get("axis_definition")), raw_bearing: num(f.get("raw_bearing")),
      bearing_unit: f.get("bearing_unit"), axis_mode: f.get("axis_mode"), north_reference: north,
      magnetic_declination_deg: north === "magnetic" ? num(f.get("decl")) : null,
      magnetic_declination_uncertainty_deg: north === "magnetic" ? num(f.get("decl_sigma")) : null,
      magnetic_declination_source: north === "magnetic" ? str(f.get("decl_source")) : null,
      grid_crs: north === "grid" ? str(f.get("grid_crs")) : null,
      method: str(f.get("method")), uncertainty_deg: hasSigma ? num(f.get("sigma")) : null,
      uncertainty_distribution: f.get("dist"), uncertainty_unavailable_reason: hasSigma ? null : str(f.get("reason")),
      measured_at: str(f.get("measured_at")), source_id: str(f.get("source_id")), is_primary: true,
    };
    if (await s.run(body)) {
      form.reset();
      onDone();
    }
  }
  return (
    <Shell title="Record an orientation" hint="Bearing, axis mode, north reference, method, uncertainty">
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <Field label="Label" htmlFor="o-label"><input id="o-label" name="label" className="field" required minLength={2} placeholder="Main axis, doorway outward" /></Field>
        <Field label="Axis definition" htmlFor="o-def" hint="How the line was defined on the structure"><input id="o-def" name="axis_definition" className="field" /></Field>
        <div className="grid grid-cols-[1fr_8rem] gap-2">
          <Field label="Raw bearing" htmlFor="o-b"><input id="o-b" name="raw_bearing" type="number" step="any" className="field num" required /></Field>
          <Field label="Unit" htmlFor="o-u"><select id="o-u" name="bearing_unit" className="field"><option value="deg">degrees</option><option value="grad">gradians</option><option value="mil_nato">mils (6400)</option></select></Field>
        </div>
        <Field label="Axis mode" htmlFor="o-m" hint="Stored, never inferred from site type">
          <select id="o-m" name="axis_mode" className="field" required defaultValue="">
            <option value="" disabled>Choose</option>
            <option value="directed">Directed (one facing direction)</option>
            <option value="bidirectional">Bidirectional (undirected line)</option>
          </select>
        </Field>
        <Field label="North reference" htmlFor="o-n">
          <select id="o-n" className="field" value={north} onChange={(e) => setNorth(e.target.value)}>
            {Object.entries(NORTH_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Method" htmlFor="o-me">
          <select id="o-me" name="method" className="field" defaultValue="">
            <option value="">Not recorded</option>
            {Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        {north === "magnetic" && (
          <div className="grid gap-2 md:col-span-2 md:grid-cols-3">
            <Field label="Magnetic declination (° east +)" htmlFor="o-d"><input id="o-d" name="decl" type="number" step="any" className="field num" required /></Field>
            <Field label="Declination uncertainty (°)" htmlFor="o-ds"><input id="o-ds" name="decl_sigma" type="number" step="any" min="0" className="field num" /></Field>
            <Field label="Declination source" htmlFor="o-dsrc" hint="Model and date, e.g. a geomagnetic model value for the survey day"><input id="o-dsrc" name="decl_source" className="field" required /></Field>
          </div>
        )}
        {north === "grid" && (
          <Field label="Projected CRS" htmlFor="o-crs" hint="e.g. EPSG:32630; used to compute grid convergence"><input id="o-crs" name="grid_crs" className="field" required /></Field>
        )}
        {north === "unspecified" && <div className="md:col-span-2"><Notice tone="warning">An unspecified north reference blocks analysis. It can still be recorded so the gap is visible.</Notice></div>}
        <fieldset className="grid gap-2 md:col-span-2">
          <legend className="mb-1 text-xs font-medium text-ivory-dim">Uncertainty</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" checked={hasSigma} onChange={() => setHasSigma(true)} className="accent-[var(--color-gold)]" />Numeric value</label>
            <label className="flex items-center gap-2"><input type="radio" checked={!hasSigma} onChange={() => setHasSigma(false)} className="accent-[var(--color-gold)]" />Unavailable, with a documented reason</label>
          </div>
          {hasSigma ? (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Uncertainty (°)" htmlFor="o-s"><input id="o-s" name="sigma" type="number" step="any" min="0.001" className="field num" required /></Field>
              <Field label="Distribution" htmlFor="o-dist"><select id="o-dist" name="dist" className="field"><option value="normal">Normal (value is 1σ)</option><option value="uniform_halfwidth">Uniform (value is half-width)</option></select></Field>
            </div>
          ) : (
            <Field label="Why is uncertainty unavailable?" htmlFor="o-r"><input id="o-r" name="reason" className="field" required placeholder="Not reported in the source" /></Field>
          )}
        </fieldset>
        <Field label="Measured on" htmlFor="o-at"><input id="o-at" name="measured_at" type="date" className="field" /></Field>
        <Field label="Source" htmlFor="o-src" hint="Required for the record to qualify"><SourceSelect sources={sources} /></Field>
        <div className="md:col-span-2 space-y-3">
          {s.error && <ErrorState error={s.error} />}
          <Submit pending={s.pending} label="Save orientation" pendingLabel="Saving…" />
          <p className="text-2xs text-mist">The previous primary orientation is kept in the history; if the site was reviewed, it returns to “submitted” for re-review.</p>
        </div>
      </form>
    </Shell>
  );
}

export function ChronologyForm({ siteId, sources, onDone }: { siteId: string; sources: Source[]; onDone: Done }) {
  const [model, setModel] = useState("uniform");
  const [era, setEra] = useState({ s: "BCE", e: "BCE" });
  const s = useSubmit((body: unknown) => api(`/sites/${siteId}/chronologies`, { method: "POST", json: body }));
  const toAstro = (y: number | null, e: string) => (y === null ? null : e === "BCE" ? 1 - y : y);
  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const form = ev.currentTarget;
    const f = new FormData(form);
    const body = {
      start_year: toAstro(num(f.get("start")), era.s), end_year: toAstro(num(f.get("end")), era.e),
      calendar_basis: str(f.get("calendar")), date_basis: str(f.get("basis")), model,
      central_year: model === "normal" ? toAstro(num(f.get("central")), String(f.get("central_era"))) : null,
      sigma_years: model === "normal" ? num(f.get("sigma")) : null,
      uncertainty_note: str(f.get("note")), source_id: str(f.get("source_id")),
    };
    if (await s.run(body)) {
      form.reset();
      onDone();
    }
  }
  const yearInput = (name: string, id: string, key: "s" | "e") => (
    <div className="grid grid-cols-[1fr_6rem] gap-2">
      <input id={id} name={name} type="number" min="1" className="field num" required />
      <select aria-label="Era" className="field" value={era[key]} onChange={(e) => setEra({ ...era, [key]: e.target.value })}><option>BCE</option><option>CE</option></select>
    </div>
  );
  return (
    <Shell title="Record a chronology" hint="Sourced date range, basis and uncertainty model">
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <Field label="Earliest year" htmlFor="c-s">{yearInput("start", "c-s", "s")}</Field>
        <Field label="Latest year" htmlFor="c-e">{yearInput("end", "c-e", "e")}</Field>
        <Field label="Calendar basis" htmlFor="c-cal"><select id="c-cal" name="calendar" className="field" defaultValue="julian"><option value="julian">Julian</option><option value="gregorian_proleptic">Proleptic Gregorian</option><option value="">Not recorded</option></select></Field>
        <Field label="Date basis" htmlFor="c-b" hint="Radiocarbon, epigraphic, stylistic…"><input id="c-b" name="basis" className="field" /></Field>
        <Field label="Sampling model" htmlFor="c-m" hint="Normal only when the source reports a central value and error">
          <select id="c-m" className="field" value={model} onChange={(e) => setModel(e.target.value)}><option value="uniform">Uniform within the range</option><option value="normal">Normal, truncated to the range</option></select>
        </Field>
        {model === "normal" && (
          <div className="grid grid-cols-[1fr_6rem_1fr] gap-2">
            <Field label="Central year" htmlFor="c-c"><input id="c-c" name="central" type="number" className="field num" required /></Field>
            <Field label="Era" htmlFor="c-ce"><select id="c-ce" name="central_era" className="field"><option>BCE</option><option>CE</option></select></Field>
            <Field label="σ (years)" htmlFor="c-sg"><input id="c-sg" name="sigma" type="number" min="1" className="field num" required /></Field>
          </div>
        )}
        <Field label="Uncertainty note" htmlFor="c-n"><input id="c-n" name="note" className="field" /></Field>
        <Field label="Source" htmlFor="c-src"><SourceSelect sources={sources} /></Field>
        <div className="md:col-span-2 space-y-3">
          {s.error && <ErrorState error={s.error} />}
          <Submit pending={s.pending} label="Save chronology" pendingLabel="Saving…" />
          <p className="text-2xs text-mist">No midpoint is substituted: analyses sample the whole documented range.</p>
        </div>
      </form>
    </Shell>
  );
}

export function HorizonForm({ siteId, sources, onDone }: { siteId: string; sources: Source[]; onDone: Done }) {
  const [kind, setKind] = useState("measured");
  const [parseErr, setParseErr] = useState<string | null>(null);
  const s = useSubmit((body: unknown) => api(`/sites/${siteId}/horizons`, { method: "POST", json: body }));
  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setParseErr(null);
    const form = ev.currentTarget;
    const f = new FormData(form);
    const az: number[] = [];
    const alt: number[] = [];
    if (kind !== "none_declared") {
      const lines = String(f.get("samples") ?? "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
      for (const [i, l] of lines.entries()) {
        const parts = l.split(/[,;\s]+/).map(Number);
        if (parts.length < 2 || parts.some((x) => Number.isNaN(x))) {
          setParseErr(`Line ${i + 1} is not “azimuth, altitude”: ${l}`);
          return;
        }
        az.push(parts[0]);
        alt.push(parts[1]);
      }
    }
    const body = {
      kind, azimuths_deg: az, altitudes_deg: alt,
      altitude_uncertainty_deg: kind === "none_declared" ? null : num(f.get("sigma")),
      resolution_note: str(f.get("note")), observer_height_m: num(f.get("height")),
      source_id: kind === "none_declared" ? null : str(f.get("source_id")),
    };
    if (await s.run(body)) {
      form.reset();
      onDone();
    }
  }
  return (
    <Shell title="Record a horizon" hint="Measured or DEM profile, or an explicit ‘no profile’ declaration">
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <Field label="Horizon type" htmlFor="h-k">
          <select id="h-k" className="field" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="measured">Measured in the field</option>
            <option value="dem">Derived from a DEM</option>
            <option value="none_declared">No profile: analyses must declare a flat horizon</option>
          </select>
        </Field>
        {kind !== "none_declared" && (
          <>
            <Field label="Altitude uncertainty (°)" htmlFor="h-s"><input id="h-s" name="sigma" type="number" step="any" min="0.001" className="field num" /></Field>
            <div className="md:col-span-2">
              <Field label="Samples: one “azimuth, altitude” pair per line (degrees, apparent altitude)" htmlFor="h-p">
                <textarea id="h-p" name="samples" rows={6} className="field num font-[inherit]" required placeholder={"110, 1.2\n115, 1.4\n120, 0.9"} />
              </Field>
            </div>
            <Field label="Observer height (m)" htmlFor="h-h"><input id="h-h" name="height" type="number" step="any" min="0" className="field num" /></Field>
            <Field label="Source" htmlFor="h-src" hint="Required for measured and DEM profiles"><SourceSelect sources={sources} required /></Field>
          </>
        )}
        <div className="md:col-span-2"><Field label="Resolution or method note" htmlFor="h-n"><input id="h-n" name="note" className="field" /></Field></div>
        <div className="md:col-span-2 space-y-3">
          {parseErr && <Notice tone="warning">{parseErr}</Notice>}
          {s.error && <ErrorState error={s.error} />}
          <Submit pending={s.pending} label="Save horizon" pendingLabel="Saving…" />
        </div>
      </form>
    </Shell>
  );
}

export function SourceForm({ siteId, sources, onDone }: { siteId: string; sources: Source[]; onDone: Done }) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const s = useSubmit(async (f: FormData) => {
    let sourceId = str(f.get("source_id"));
    if (mode === "new") {
      const created = await api<Source>("/sources", { method: "POST", json: {
        citation: str(f.get("citation")), source_type: f.get("source_type"), url: str(f.get("url")), doi: str(f.get("doi")),
        publisher: str(f.get("publisher")), accessed_at: str(f.get("accessed_at")), licence: str(f.get("licence")),
      } });
      sourceId = created.id;
    }
    return api(`/sites/${siteId}/sources`, { method: "POST", json: { source_id: sourceId, role: f.get("role") } });
  });
  return (
    <Shell title="Link a source" hint="Attach an existing citation or add a new one">
      <form onSubmit={async (e) => { e.preventDefault(); const form = e.currentTarget; if (await s.run(new FormData(form))) { form.reset(); onDone(); } }} className="grid gap-4 md:grid-cols-2">
        <div className="flex gap-4 text-sm md:col-span-2">
          <label className="flex items-center gap-2"><input type="radio" checked={mode === "existing"} onChange={() => setMode("existing")} className="accent-[var(--color-gold)]" />Existing source</label>
          <label className="flex items-center gap-2"><input type="radio" checked={mode === "new"} onChange={() => setMode("new")} className="accent-[var(--color-gold)]" />New source</label>
        </div>
        {mode === "existing" ? (
          <Field label="Source" htmlFor="s-id"><SourceSelect sources={sources} required /></Field>
        ) : (
          <>
            <div className="md:col-span-2"><Field label="Full citation" htmlFor="s-c"><textarea id="s-c" name="citation" rows={2} className="field" required minLength={5} /></Field></div>
            <Field label="Type" htmlFor="s-t">
              <select id="s-t" name="source_type" className="field">
                {["peer_reviewed", "monograph", "excavation_report", "survey_report", "primary", "field_notes", "database", "secondary"].map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </select>
            </Field>
            <Field label="URL" htmlFor="s-u"><input id="s-u" name="url" type="url" className="field" /></Field>
            <Field label="DOI" htmlFor="s-d"><input id="s-d" name="doi" className="field" /></Field>
            <Field label="Accessed on" htmlFor="s-a"><input id="s-a" name="accessed_at" type="date" className="field" /></Field>
            <Field label="Publisher" htmlFor="s-p"><input id="s-p" name="publisher" className="field" /></Field>
            <Field label="Licence" htmlFor="s-l"><input id="s-l" name="licence" className="field" /></Field>
          </>
        )}
        <Field label="Role for this site" htmlFor="s-r">
          <select id="s-r" name="role" className="field">
            {["general", "identity", "coordinates", "orientation", "chronology", "horizon"].map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <div className="md:col-span-2 space-y-3">
          {s.error && <ErrorState error={s.error} />}
          <Submit pending={s.pending} label="Link source" pendingLabel="Linking…" />
        </div>
      </form>
    </Shell>
  );
}

export function ReadingsForm({ siteId }: { siteId: string }) {
  const s = useSubmit((body: unknown) => api<{ n: number; circular_mean_deg: number; circular_sd_deg: number; note: string }>(`/sites/${siteId}/observations`, { method: "POST", json: body }));
  return (
    <Shell title="Log repeat readings" hint="Field survey: several readings of the same axis">
      <form onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        const readings = String(f.get("readings")).split(/[,;\s]+/).filter(Boolean).map(Number);
        if (await s.run({ observer_label: str(f.get("observer")), observed_at: str(f.get("date")), method: str(f.get("method")),
          north_reference: str(f.get("north")), readings_deg: readings, notes: str(f.get("notes")) })) form.reset();
      }} className="grid gap-4 md:grid-cols-2">
        <Field label="Observer (pseudonymous label)" htmlFor="r-o"><input id="r-o" name="observer" className="field" required /></Field>
        <Field label="Date" htmlFor="r-d"><input id="r-d" name="date" type="date" className="field" /></Field>
        <Field label="Method" htmlFor="r-m"><select id="r-m" name="method" className="field">{Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="North reference" htmlFor="r-n"><select id="r-n" name="north" className="field">{Object.entries(NORTH_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <div className="md:col-span-2"><Field label="Readings (degrees, separated by commas or spaces)" htmlFor="r-r"><input id="r-r" name="readings" className="field num" required placeholder="131.4, 131.9, 131.6" /></Field></div>
        <div className="md:col-span-2"><Field label="Notes" htmlFor="r-no"><input id="r-no" name="notes" className="field" /></Field></div>
        <div className="md:col-span-2 space-y-3">
          {s.error && <ErrorState error={s.error} />}
          {s.done && <Notice tone="ok" title="Logged">{s.done.n} readings, circular mean {s.done.circular_mean_deg.toFixed(2)}°, circular SD {s.done.circular_sd_deg.toFixed(2)}°. {s.done.note}</Notice>}
          <Submit pending={s.pending} label="Log readings" pendingLabel="Logging…" />
        </div>
      </form>
    </Shell>
  );
}

export function PhotoForm({ siteId, onDone }: { siteId: string; onDone: Done }) {
  const s = useSubmit(async (f: FormData) => {
    const res = await fetch(`/api/v2/sites/${siteId}/images`, { method: "POST", body: f, headers: { "x-chronoheritage-client": "web" } });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const { parseError } = await import("@/lib/api");
      throw parseError(res.status, data);
    }
    return data;
  });
  return (
    <Shell title="Attach a photograph" hint="PNG, JPEG or WebP up to 5 MB, with attribution and licence">
      <form onSubmit={async (e) => { e.preventDefault(); const form = e.currentTarget; if (await s.run(new FormData(form))) { form.reset(); onDone(); } }} className="grid gap-4 md:grid-cols-2">
        <Field label="Image file" htmlFor="p-f"><input id="p-f" name="file" type="file" accept="image/png,image/jpeg,image/webp" className="field" required /></Field>
        <Field label="Attribution" htmlFor="p-a"><input id="p-a" name="attribution" className="field" required minLength={3} /></Field>
        <Field label="Licence" htmlFor="p-l"><input id="p-l" name="licence" className="field" required placeholder="CC BY 4.0" /></Field>
        <Field label="Caption" htmlFor="p-c"><input id="p-c" name="caption" className="field" /></Field>
        <div className="md:col-span-2 space-y-3">
          {s.error && <ErrorState error={s.error} />}
          {s.done ? <Notice tone="ok" title="Uploaded">The photograph is private until reviewed.</Notice> : null}
          <Submit pending={s.pending} label="Upload photograph" pendingLabel="Uploading…" />
        </div>
      </form>
    </Shell>
  );
}
