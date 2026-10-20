"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { AngularTape, AzimuthDial } from "@/components/charts/Azimuth";
import { HorizonPanorama } from "@/components/charts/Panorama";
import { Calculating, EmptyState, ErrorState, Field, KeyValue, Notice, PageHeader, Panel, StatusBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { deg, humanize, num } from "@/lib/format";
import { useResource } from "@/lib/hooks";
import type { SiteSummary, SkyResult, Target } from "@/lib/types";
import { useSubmit } from "@/lib/useSubmit";

function Explorer() {
  const preset = useSearchParams().get("site") ?? "";
  const sites = useResource<{ sites: SiteSummary[] }>("/sites");
  const targets = useResource<{ targets: Target[] }>("/meta/targets");
  const [source, setSource] = useState<"site" | "custom">("site");
  const [siteId, setSiteId] = useState(preset);
  const [target, setTarget] = useState("sun_june_solstice_rise");
  const [useRange, setUseRange] = useState(true);
  const [customAxis, setCustomAxis] = useState(false);
  const [horizon, setHorizon] = useState("flat");
  const [refraction, setRefraction] = useState("bennett_1982");
  const s = useSubmit((body: unknown) => api<SkyResult>("/sky/compute", { method: "POST", json: body }));
  const t = targets.data?.targets.find((x) => x.key === target);
  const site = sites.data?.sites.find((x) => x.id === siteId);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const n = (k: string) => (f.get(k) === null || f.get(k) === "" ? null : Number(f.get(k)));
    const era = (k: string, y: number | null) => (y === null ? null : f.get(k) === "BCE" ? 1 - y : y);
    const body: Record<string, unknown> = {
      target_key: target, horizon_mode: horizon, horizon_constant_deg: horizon === "constant" ? n("hconst") : null,
      limb: f.get("limb"), refraction, pressure_hpa: n("pressure") ?? 1010, temperature_c: n("temperature") ?? 10,
      compare_reference: f.get("compare") === "on",
    };
    if (source === "site") body.site_id = siteId;
    else Object.assign(body, { lat: n("lat"), lon: n("lon"), elevation_m: n("elev") ?? 0 });
    if (t?.kind === "date") {
      Object.assign(body, { calendar_year: era("dera", n("dyear")), calendar_month: n("dmonth"), calendar_day: n("dday"), calendar: f.get("calendar") });
    } else if (!(source === "site" && useRange)) {
      body.year = era("y0era", n("y0"));
      if (n("y1") !== null) body.year_end = era("y1era", n("y1"));
    }
    if (customAxis || source === "custom") {
      if (n("axis") !== null) Object.assign(body, { orientation_deg: n("axis"), north_reference: f.get("north"), axis_mode: f.get("mode"),
        magnetic_declination_deg: n("decl"), orientation_sigma_deg: n("sigma") });
    }
    await s.run(body);
  }

  const yearPair = (prefix: string, label: string, required = false) => (
    <Field label={label} htmlFor={prefix}>
      <div className="grid grid-cols-[1fr_5.5rem] gap-2">
        <input id={prefix} name={prefix} type="number" min="1" max="2999" className="field num" required={required} />
        <select aria-label={`${label} era`} name={`${prefix}era`} className="field" defaultValue="BCE"><option>BCE</option><option>CE</option></select>
      </div>
    </Field>
  );

  const r = s.done;
  return (
    <div className="grid gap-10 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
      <div className="space-y-6">
      <form onSubmit={submit} className="niche space-y-6 p-4 sm:p-5" aria-label="Sky calculation inputs">
        <fieldset className="space-y-3">
          <legend className="mb-1 text-sm font-medium text-ivory">Place</legend>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" checked={source === "site"} onChange={() => setSource("site")} className="accent-[var(--color-gold)]" />Registry site</label>
            <label className="flex items-center gap-2"><input type="radio" checked={source === "custom"} onChange={() => setSource("custom")} className="accent-[var(--color-gold)]" />Custom coordinates</label>
          </div>
          {source === "site" ? (
            <Field label="Site" htmlFor="sk-site">
              <select id="sk-site" className="field" required value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                <option value="" disabled>Choose a site</option>
                {sites.data?.sites.filter((x) => x.lat !== null).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </Field>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <Field label="Latitude" htmlFor="sk-lat"><input id="sk-lat" name="lat" type="number" step="any" min="-90" max="90" required className="field num" /></Field>
              <Field label="Longitude" htmlFor="sk-lon"><input id="sk-lon" name="lon" type="number" step="any" min="-180" max="180" required className="field num" /></Field>
              <Field label="Elev. (m)" htmlFor="sk-elev"><input id="sk-elev" name="elev" type="number" step="any" className="field num" /></Field>
            </div>
          )}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-1 text-sm font-medium text-ivory">Event and date</legend>
          <Field label="Target" htmlFor="sk-t" hint={t?.note}>
            <select id="sk-t" className="field" value={target} onChange={(e) => setTarget(e.target.value)}>
              {targets.data?.targets.map((x) => <option key={x.key} value={x.key} disabled={!x.supported}>{x.label}{x.supported ? "" : " — not supported"}</option>)}
            </select>
          </Field>
          {t?.kind === "date" ? (
            <div className="grid grid-cols-2 gap-2">
              {yearPair("dyear", "Year", true)}
              <Field label="Calendar" htmlFor="sk-cal"><select id="sk-cal" name="calendar" className="field"><option value="julian">Julian</option><option value="gregorian_proleptic">Proleptic Gregorian</option></select></Field>
              <Field label="Month" htmlFor="sk-m"><input id="sk-m" name="dmonth" type="number" min="1" max="12" required className="field num" /></Field>
              <Field label="Day" htmlFor="sk-d"><input id="sk-d" name="dday" type="number" min="1" max="31" required className="field num" /></Field>
            </div>
          ) : (
            <>
              {source === "site" && (
                <label className="flex items-center gap-2 text-sm text-ivory-dim">
                  <input type="checkbox" checked={useRange} onChange={(e) => setUseRange(e.target.checked)} className="accent-[var(--color-gold)]" />
                  Use the site&apos;s sourced chronology
                </label>
              )}
              {!(source === "site" && useRange) && (
                <div className="grid grid-cols-2 gap-2">{yearPair("y0", "From year", true)}{yearPair("y1", "To year (optional)")}</div>
              )}
            </>
          )}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-1 text-sm font-medium text-ivory">Architectural axis</legend>
          {source === "site" && (
            <label className="flex items-center gap-2 text-sm text-ivory-dim">
              <input type="checkbox" checked={customAxis} onChange={(e) => setCustomAxis(e.target.checked)} className="accent-[var(--color-gold)]" />
              Override the site&apos;s orientation with a test value
            </label>
          )}
          {(customAxis || source === "custom") && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Bearing (°)" htmlFor="sk-ax"><input id="sk-ax" name="axis" type="number" step="any" className="field num" /></Field>
              <Field label="σ (°)" htmlFor="sk-sg"><input id="sk-sg" name="sigma" type="number" step="any" min="0.001" className="field num" /></Field>
              <Field label="North reference" htmlFor="sk-n"><select id="sk-n" name="north" className="field"><option value="true">True</option><option value="magnetic">Magnetic</option><option value="unspecified">Unspecified</option></select></Field>
              <Field label="Axis mode" htmlFor="sk-md"><select id="sk-md" name="mode" className="field"><option value="directed">Directed</option><option value="bidirectional">Bidirectional</option></select></Field>
              <Field label="Magnetic declination (°)" htmlFor="sk-dc" hint="Only for magnetic bearings"><input id="sk-dc" name="decl" type="number" step="any" className="field num" /></Field>
            </div>
          )}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-1 text-sm font-medium text-ivory">Horizon, refraction and engine</legend>
          <Field label="Horizon" htmlFor="sk-h">
            <select id="sk-h" className="field" value={horizon} onChange={(e) => setHorizon(e.target.value)}>
              <option value="flat">Flat 0° (assumption)</option>
              <option value="site_profile" disabled={source !== "site" || !site?.horizon_kind}>Site horizon record</option>
              <option value="constant">Constant altitude (assumption)</option>
            </select>
          </Field>
          {horizon === "constant" && <Field label="Horizon altitude (°)" htmlFor="sk-hc"><input id="sk-hc" name="hconst" type="number" step="any" min="-2" max="30" required className="field num" /></Field>}
          <Field label="Event definition" htmlFor="sk-l"><select id="sk-l" name="limb" className="field"><option value="upper_limb">Upper limb (first gleam)</option><option value="centre">Centre</option><option value="lower_limb">Lower limb (full disc)</option></select></Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Refraction" htmlFor="sk-r"><select id="sk-r" className="field" value={refraction} onChange={(e) => setRefraction(e.target.value)}><option value="bennett_1982">Bennett</option><option value="none">None</option></select></Field>
            <Field label="hPa" htmlFor="sk-p"><input id="sk-p" name="pressure" type="number" defaultValue={1010} className="field num" disabled={refraction === "none"} /></Field>
            <Field label="°C" htmlFor="sk-tc"><input id="sk-tc" name="temperature" type="number" defaultValue={10} className="field num" disabled={refraction === "none"} /></Field>
          </div>
          <p className="text-xs text-mist">Engine: Skyfield with JPL DE406 (−3000 to +3000). The only supported engine is the benchmarked candidate.</p>
          <label className="flex items-center gap-2 text-sm text-ivory-dim">
            <input type="checkbox" name="compare" className="accent-[var(--color-gold)]" />
            Compare with both independent reference paths (solstices only, slower)
          </label>
        </fieldset>
        <button className="btn btn-primary w-full justify-center py-2.5" disabled={s.pending}>{s.pending ? "Reconstructing the sky…" : "Compute"}</button>
      </form>
      <ConventionsNote />
      </div>

      <section aria-live="polite" aria-label="Results" className="min-w-0">
        {s.pending && <Calculating label="Finding the solar event in the reconstructed sky…" />}
        {s.error && <ErrorState error={s.error} />}
        {!r && !s.pending && !s.error && (
          <EmptyState title="Choose a place, an event and a date">
            Results here are exploratory: not saved, not reviewed, and labelled with the source of every input. To keep a
            result, run it as a registered analysis.
          </EmptyState>
        )}
        {r && !s.pending && <SkyResultView r={r} siteId={source === "site" ? siteId : null} />}
      </section>
    </div>
  );
}

/** Conventions, time systems and limits that apply to every calculation on this page. */
function ConventionsNote() {
  return (
    <details className="text-sm text-ivory-dim" open>
      <summary className="cursor-pointer text-ivory">Conventions and limits</summary>
      <ul className="mt-2 space-y-1.5 pl-1 text-xs">
        <li><span className="text-ivory">Azimuth</span>: degrees clockwise from true north at the observer (topocentric horizon frame).</li>
        <li><span className="text-ivory">Years</span>: entered as BCE/CE, sent as astronomical years (0 = 1 BCE). Calendar dates state Julian or proleptic Gregorian.</li>
        <li><span className="text-ivory">Time</span>: event instants in TT; Earth rotation through UT1 with ΔT, whose uncertainty grows for ancient dates.</li>
        <li><span className="text-ivory">Range</span>: −3000 to +3000 (DE406). Dates outside are refused, not truncated.</li>
        <li><span className="text-ivory">Targets</span>: lunar standstills, heliacal risings and cross-quarter days are listed but disabled until benchmarked.</li>
        <li><span className="text-ivory">Status</span>: exploratory. Nothing here is saved or reviewed; magnetic bearings need a sourced declination; an unspecified north gives no residual.</li>
      </ul>
    </details>
  );
}

function SkyResultView({ r, siteId }: { r: SkyResult; siteId: string | null }) {
  const first = r.events[0];
  const cmp = r.comparison;
  const span: [number, number] | null = r.events.length > 1 ? [Math.min(...r.events.map((e) => e.azimuth_deg)), Math.max(...r.events.map((e) => e.azimuth_deg))] : null;
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status="exploratory" label={r.label} />
        {r.site?.is_illustrative && <StatusBadge status="illustrative" />}
      </div>
      {r.warnings.filter((w) => w.severity === "critical").map((w) => <Notice key={w.code} tone="critical" title={humanize(w.code)}>{w.message}</Notice>)}

      {cmp ? (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <AngularTape measured={cmp.observed_true_azimuth_deg} measuredSigma={cmp.sigma_deg} predicted={first.azimuth_deg}
              predictedRange={span} axisMode={cmp.axis_mode as "directed" | "bidirectional"} />
            <p className="mt-3 text-sm text-ivory-dim">
              Residual {deg(cmp.residual_span_deg[0], 2, true)}{cmp.residual_span_deg[1] !== cmp.residual_span_deg[0] ? ` to ${deg(cmp.residual_span_deg[1], 2, true)} across the date range` : ""}.
              {cmp.approx_envelope_2sigma_deg && <> Approximate ±2σ envelope {deg(cmp.approx_envelope_2sigma_deg[0], 2, true)} to {deg(cmp.approx_envelope_2sigma_deg[1], 2, true)}.</>}
            </p>
            <p className="text-xs text-mist">{cmp.envelope_note}</p>
          </div>
          <AzimuthDial measured={cmp.observed_true_azimuth_deg} measuredSigma={cmp.sigma_deg} predicted={first.azimuth_deg} predictedRange={span}
            axisMode={cmp.axis_mode as "directed" | "bidirectional"} size={220} />
        </div>
      ) : (
        <p className="heading text-2xl">Predicted azimuth {deg(first.azimuth_deg, 3)}{span ? ` to ${deg(span[1], 3)}` : ""}</p>
      )}

      <Panel title="Horizon view" meta={r.horizon.source_label ?? undefined}>
        <HorizonPanorama horizonAz={r.horizon.azimuths_deg} horizonAlt={r.horizon.altitudes_deg} horizonKind={r.horizon.kind}
          dayPath={r.day_path} eventAz={first.azimuth_deg} eventAlt={first.horizon_altitude_deg}
          measuredAz={cmp ? cmp.rows[0].compared_bearing_deg : null} measuredSigma={cmp?.sigma_deg} />
      </Panel>

      <Panel title="Events" meta={`${r.events.length} evaluation${r.events.length > 1 ? "s" : ""}`}>
        <div className="overflow-x-auto">
          <table className="dtable">
            <thead><tr><th scope="col">Date (UT1)</th><th scope="col">Azimuth</th><th scope="col">Declination</th><th scope="col">Horizon alt.</th><th scope="col">Refraction</th><th scope="col">ΔT</th>{cmp && <th scope="col">Residual</th>}</tr></thead>
            <tbody>
              {r.events.map((e, i) => (
                <tr key={i}>
                  <td className="text-xs">{e.calendar_strings.julian_ut1}<span className="block text-mist">{e.calendar_strings.gregorian_ut1}</span></td>
                  <td className="num">{deg(e.azimuth_deg, 3)}</td>
                  <td className="num">{deg(e.declination_deg, 3)}</td>
                  <td className="num">{deg(e.horizon_altitude_deg, 2)}</td>
                  <td className="num">{deg(e.refraction_at_horizon_deg, 3)}</td>
                  <td className="num">{num(e.delta_t_seconds / 3600, 2)} h</td>
                  {cmp && <td className="num">{deg(cmp.rows[i]?.residual_signed_deg, 3, true)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-x-12 gap-y-8 lg:grid-cols-2">
        <Panel title="Where each input came from">
          <KeyValue rows={Object.entries(r.inputs_provenance).map(([k, v]) => [humanize(k), <span key={k} className={v.includes("user-entered") || v.includes("assumption") ? "text-gold-bright" : ""}>{v}</span>])} />
        </Panel>
        <Panel title="Independent reference check">
          {!r.reference_check ? <p className="text-sm text-mist">Not requested. Tick the reference option to recompute with Astropy/ERFA and the Laskar analytic path.</p>
            : r.reference_check.error ? <Notice tone="warning">{r.reference_check.error}</Notice> : (
              <KeyValue rows={[
                ["Candidate (Skyfield + DE406)", deg(r.reference_check.candidate_deg, 4)],
                ["Path A (Astropy/ERFA)", deg(r.reference_check.path_a_astropy_deg, 4)],
                ["Path B (Laskar 1986)", deg(r.reference_check.path_b_laskar_deg, 4)],
                ["Largest difference", deg(r.reference_check.max_abs_difference_deg, 4)],
              ]} />
            )}
        </Panel>
      </div>

      {r.warnings.filter((w) => w.severity !== "critical").length > 0 && (
        <div className="space-y-2">{r.warnings.filter((w) => w.severity !== "critical").map((w) => <Notice key={w.code + w.message} tone={w.severity === "info" ? "info" : "warning"} title={humanize(w.code)}>{w.message}</Notice>)}</div>
      )}

      <Panel title="Calculation versions">
        <KeyValue rows={Object.entries(r.versions).map(([k, v]) => [humanize(k), v])} />
      </Panel>
      {siteId && <Link href={`/analysis/new?site=${siteId}`} className="btn btn-primary">Run this as a registered analysis</Link>}
    </div>
  );
}

export default function SkyPage() {
  return (
    <main className="chamber">
      <PageHeader title="Historical Sky Explorer" lede="Reconstruct where a solar event met the horizon for a place and a documented date or range, and compare it with an architectural axis. Every input is labelled with where it came from." />
      <Suspense fallback={null}><Explorer /></Suspense>
    </main>
  );
}
