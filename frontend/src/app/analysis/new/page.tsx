"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { ErrorState, Field, Loading, Notice, PageHeader, SignInPrompt } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { yearLabel } from "@/lib/format";
import { useResource } from "@/lib/hooks";
import type { SiteSummary, Target } from "@/lib/types";
import { useSubmit } from "@/lib/useSubmit";
import { useUnsavedGuard } from "@/lib/unsaved";
import { Workflow } from "@/components/analysis/Workflow";

function NewAnalysisForm() {
  const { can, ready } = useAuth();
  const router = useRouter();
  const preset = useSearchParams().get("site");
  const sites = useResource<{ sites: SiteSummary[] }>("/sites?eligible=true");
  const targets = useResource<{ targets: Target[] }>("/meta/targets");
  const [siteId, setSiteId] = useState(preset ?? "");
  const [target, setTarget] = useState("");
  const [statement, setStatement] = useState("");
  const [horizon, setHorizon] = useState("site_profile");
  const [refraction, setRefraction] = useState("bennett_1982");
  const s = useSubmit((body: unknown) => api<{ id: string }>("/analyses/single-site", { method: "POST", json: body }));
  const [dirty, setDirty] = useState(false);
  useUnsavedGuard("new-analysis", dirty);

  const site = useMemo(() => sites.data?.sites.find((x) => x.id === siteId), [sites.data, siteId]);
  useEffect(() => {
    if (site) setHorizon(site.horizon_kind ? "site_profile" : "flat");
  }, [site]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const n = (k: string) => (f.get(k) === "" || f.get(k) === null ? null : Number(f.get(k)));
    const body = {
      site_id: siteId,
      hypothesis: { target_key: target, statement, rationale: String(f.get("rationale") || "") || null, mode: f.get("mode") },
      parameters: {
        horizon_mode: horizon, limb: f.get("limb"),
        atmosphere: { model: refraction, pressure_hpa: n("pressure") ?? 1010, temperature_c: n("temperature") ?? 10 },
        n_samples: n("n_samples"), windows_deg: String(f.get("windows")).split(/[,\s]+/).filter(Boolean).map(Number),
        seed: n("seed"),
      },
      visibility: f.get("visibility"),
    };
    const r = await s.run(body);
    if (r) {
      setDirty(false);
      router.push(`/analysis/${r.id}`);
    }
  }

  if (ready && !can("researcher")) return <SignInPrompt action="run analyses" />;
  if (sites.loading || targets.loading) return <Loading lines={6} />;
  if (sites.error) return <ErrorState error={sites.error} />;
  const supported = (targets.data?.targets ?? []).filter((t) => t.kind === "solstice" || t.kind === "equinox");
  const others = (targets.data?.targets ?? []).filter((t) => !(t.kind === "solstice" || t.kind === "equinox"));
  const chosen = targets.data?.targets.find((t) => t.key === target);

  return (
    <form onSubmit={submit} onInput={() => setDirty(true)} className="grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="space-y-8">
        <fieldset className="space-y-4">
          <legend className="heading mb-2 text-xl">1. Site</legend>
          <Field label="Site (only sites with every input needed for analysis are listed)" htmlFor="a-site">
            <select id="a-site" className="field" required value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="" disabled>Choose a site</option>
              {sites.data?.sites.map((x) => <option key={x.id} value={x.id}>{x.name}{x.status !== "reviewed" ? ` — ${x.status}` : ""}</option>)}
            </select>
          </Field>
          {site && (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
              <div><dt className="text-xs text-mist">Axis (true)</dt><dd className="num">{site.orientation?.true_azimuth_deg?.toFixed(2)}°</dd></div>
              <div><dt className="text-xs text-mist">Axis mode</dt><dd>{site.orientation?.axis_mode}</dd></div>
              <div><dt className="text-xs text-mist">Uncertainty</dt><dd className="num">{site.orientation?.uncertainty_deg != null ? `${site.orientation.uncertainty_deg}°` : "unavailable"}</dd></div>
              <div><dt className="text-xs text-mist">Chronology</dt><dd className="num">{yearLabel(site.chronology?.start_year)} – {yearLabel(site.chronology?.end_year)}</dd></div>
            </dl>
          )}
          {site?.is_illustrative && <Notice tone="info" title="Illustrative site">The result will be labelled illustrative and cannot be approved as evidence.</Notice>}
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="heading mb-2 text-xl">2. Hypothesis, stated before computing</legend>
          <Field label="Astronomical target" htmlFor="a-target" hint={chosen?.note}>
            <select id="a-target" className="field" required value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="" disabled>Choose a target</option>
              <optgroup label="Supported">
                {supported.map((t) => <option key={t.key} value={t.key}>{t.label}{t.benchmark_classes.includes("historical") ? "" : " (no historical benchmark)"}</option>)}
              </optgroup>
              <optgroup label="Not available here">
                {others.map((t) => <option key={t.key} value={t.key} disabled>{t.label} — {t.supported ? "use the Sky Explorer" : "not supported"}</option>)}
              </optgroup>
            </select>
          </Field>
          <Field label="Hypothesis statement" htmlFor="a-stmt" hint="What you expect and why, written before seeing any result (at least 20 characters).">
            <textarea id="a-stmt" className="field" rows={3} required minLength={20} value={statement} onChange={(e) => setStatement(e.target.value)}
              placeholder="The passage axis was laid out toward December-solstice sunrise over the local horizon." />
          </Field>
          <Field label="Rationale or published source of the hypothesis" htmlFor="a-rat"><input id="a-rat" name="rationale" className="field" /></Field>
          <Field label="Mode" htmlFor="a-mode" hint="Exploratory runs are labelled so they are never presented as confirmatory.">
            <select id="a-mode" name="mode" className="field"><option value="confirmatory">Confirmatory: one pre-specified target</option><option value="exploratory">Exploratory: one of several targets being examined</option></select>
          </Field>
        </fieldset>
      </div>

      <div className="space-y-8">
        <fieldset className="space-y-4">
          <legend className="heading mb-2 text-xl">3. Assumptions</legend>
          <Field label="Horizon" htmlFor="a-hz" hint={site?.horizon_kind ? `Site record: ${site.horizon_kind.replace("_", " ")}` : "This site has no horizon record."}>
            <select id="a-hz" className="field" value={horizon} onChange={(e) => setHorizon(e.target.value)}>
              <option value="site_profile" disabled={!site?.horizon_kind}>Use the site&apos;s horizon record</option>
              <option value="flat">Flat 0° horizon (reported as an assumption)</option>
            </select>
          </Field>
          <Field label="Event definition" htmlFor="a-limb">
            <select id="a-limb" name="limb" className="field"><option value="upper_limb">First or last gleam (upper limb)</option><option value="centre">Solar centre on the horizon</option><option value="lower_limb">Full disc above the horizon</option></select>
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Refraction" htmlFor="a-ref"><select id="a-ref" className="field" value={refraction} onChange={(e) => setRefraction(e.target.value)}><option value="bennett_1982">Bennett</option><option value="none">None</option></select></Field>
            <Field label="Pressure (hPa)" htmlFor="a-p"><input id="a-p" name="pressure" type="number" defaultValue={1010} min={500} max={1100} className="field num" disabled={refraction === "none"} /></Field>
            <Field label="Temperature (°C)" htmlFor="a-t"><input id="a-t" name="temperature" type="number" defaultValue={10} min={-50} max={55} className="field num" disabled={refraction === "none"} /></Field>
          </div>
        </fieldset>
        <fieldset className="space-y-4">
          <legend className="heading mb-2 text-xl">4. Computation</legend>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Monte Carlo samples" htmlFor="a-n"><input id="a-n" name="n_samples" type="number" defaultValue={10000} min={1000} max={100000} step={1000} className="field num" /></Field>
            <Field label="Random seed" htmlFor="a-seed" hint="Leave blank to generate and record one"><input id="a-seed" name="seed" type="number" min={0} className="field num" /></Field>
          </div>
          <Field label="Residual windows (°)" htmlFor="a-w" hint="Reported as the share of samples within each window: descriptive, not a p-value"><input id="a-w" name="windows" defaultValue="0.5, 1, 2" className="field num" /></Field>
          <Field label="Visibility" htmlFor="a-vis"><select id="a-vis" name="visibility" className="field"><option value="private">Private</option><option value="public">Public</option></select></Field>
        </fieldset>
        <div className="space-y-3">
          {s.error && <ErrorState error={s.error} />}
          <button className="btn btn-primary px-5 py-2.5" disabled={s.pending || !siteId || !target || statement.length < 20}>
            {s.pending ? "Registering hypothesis…" : "Register hypothesis and run"}
          </button>
          <p className="text-xs text-mist">The inputs are snapshotted and hashed when you run. Later edits to the site never change this analysis; rerun to use them.</p>
        </div>
      </div>
    </form>
  );
}

export default function NewAnalysisPage() {
  return (
    <main className="chamber">
      <PageHeader crumbs={[{ href: "/analysis", label: "Analyses" }]} title="New single-site analysis" lede="State the hypothesis first. The platform then reconstructs the sky for the site's documented chronology and propagates every recorded uncertainty." />
      <Workflow current="hypothesis" />
      <Suspense fallback={<Loading />}><NewAnalysisForm /></Suspense>
    </main>
  );
}
