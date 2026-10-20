"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ErrorState, Field, PageHeader, SignInPrompt } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useResource } from "@/lib/hooks";
import type { SiteDetail, Source } from "@/lib/types";
import { useUnsavedGuard } from "@/lib/unsaved";
import { useSubmit } from "@/lib/useSubmit";

const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

export default function NewSitePage() {
  const { can, ready } = useAuth();
  const router = useRouter();
  const sources = useResource<{ sources: Source[] }>(can("researcher") ? "/sources" : null);
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [touchedId, setTouchedId] = useState(false);
  const [dirty, setDirty] = useState(false);
  useUnsavedGuard("new-site", dirty);
  const canPublish = can("steward");
  const s = useSubmit((body: unknown) => api<SiteDetail>("/sites", { method: "POST", json: body }));

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const n = (k: string) => (f.get(k) === "" ? null : Number(f.get(k)));
    const t = (k: string) => (String(f.get(k) ?? "").trim() || null);
    const created = await s.run({
      id, name, site_type: t("site_type"), region: t("region"), country: t("country"), description: t("description"),
      lat: n("lat"), lon: n("lon"), elevation_m: n("elevation_m"), crs: t("crs"), coordinates_source_id: t("coordinates_source_id"),
      visibility: f.get("visibility"), sensitivity: f.get("sensitivity"), stratum: t("stratum"),
    });
    if (created) {
      setDirty(false);
      router.push(`/sites/${created.id}`);
    }
  }

  return (
    <main className="chamber chamber-narrow">
      <PageHeader crumbs={[{ href: "/atlas", label: "Heritage Atlas" }]} title="Add a site"
        lede="Create the site record first. Orientation, chronology, horizon and sources are added on the site page, each with its own source and uncertainty." />
      {ready && !can("researcher") ? <SignInPrompt action="add sites" /> : (
        <form onSubmit={submit} onInput={() => setDirty(true)} className="grid gap-5 md:grid-cols-2">
          <p className="text-sm text-ivory-dim md:col-span-2">Fields marked <span className="text-uncertain">*</span> are required. Leave unknown values empty: they are shown as missing, never guessed.{dirty && <span className="ml-2 text-brass-bright">Unsaved changes.</span>}</p>
          <Field label="Name" htmlFor="n-name" required><input id="n-name" className="field" required minLength={2} value={name}
            onChange={(e) => { setName(e.target.value); if (!touchedId) setId(slug(e.target.value)); }} /></Field>
          <Field label="Stable id" htmlFor="n-id" required hint="3–63 lowercase letters, digits and hyphens. It cannot be changed later."><input id="n-id" className="field num" required pattern="[a-z0-9][a-z0-9\-]{2,62}" value={id}
            onChange={(e) => { setTouchedId(true); setId(e.target.value); }} /></Field>
          <Field label="Type" htmlFor="n-type"><input id="n-type" name="site_type" className="field" placeholder="temple, passage mound, stone row…" /></Field>
          <Field label="Region" htmlFor="n-region"><input id="n-region" name="region" className="field" /></Field>
          <Field label="Country" htmlFor="n-country"><input id="n-country" name="country" className="field" /></Field>
          <Field label="Stratum" htmlFor="n-stratum" hint="Architectural tradition used to stratify null models"><input id="n-stratum" name="stratum" className="field" /></Field>
          <Field label="Latitude (decimal degrees, north positive)" htmlFor="n-lat" hint="−90 to 90"><input id="n-lat" name="lat" type="number" step="any" min="-90" max="90" className="field num" /></Field>
          <Field label="Longitude (decimal degrees, east positive)" htmlFor="n-lon" hint="−180 to 180"><input id="n-lon" name="lon" type="number" step="any" min="-180" max="180" className="field num" /></Field>
          <Field label="Elevation (metres above sea level)" htmlFor="n-elev" hint="Affects the dip of the horizon and refraction"><input id="n-elev" name="elevation_m" type="number" step="any" className="field num" /></Field>
          <Field label="Coordinate reference system" htmlFor="n-crs" hint="Required with coordinates"><input id="n-crs" name="crs" className="field" defaultValue="EPSG:4326" /></Field>
          <div className="md:col-span-2">
            <Field label="Coordinates source" htmlFor="n-src" hint="Add new sources from the site page after creating it">
              <select id="n-src" name="coordinates_source_id" className="field" defaultValue="">
                <option value="">No source yet</option>
                {(sources.data?.sources ?? []).map((x) => <option key={x.id} value={x.id}>{x.citation.slice(0, 100)}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Visibility" htmlFor="n-vis" hint={canPublish ? "Public records appear in the atlas for everyone." : "Researchers save private drafts. Publishing to the registry needs the Data Steward role."}>
            <select id="n-vis" name="visibility" className="field" aria-describedby="n-vis-hint">
              <option value="private">Private draft (only you and reviewers)</option>
              {canPublish && <option value="public">Public registry record</option>}
            </select>
          </Field>
          <Field label="Location sensitivity" htmlFor="n-sens"><select id="n-sens" name="sensitivity" className="field"><option value="normal">Normal</option><option value="restricted">Restricted (generalise coordinates publicly)</option></select></Field>
          <div className="md:col-span-2"><Field label="Description" htmlFor="n-desc"><textarea id="n-desc" name="description" rows={3} className="field" /></Field></div>
          <div className="space-y-3 md:col-span-2">
            {s.error && <ErrorState error={s.error} />}
            <div className="flex flex-wrap gap-3">
              <button className="btn btn-primary" disabled={s.pending}>{s.pending ? "Creating…" : "Create site"}</button>
              <Link href="/atlas" className="btn btn-quiet">Cancel</Link>
            </div>
          </div>
        </form>
      )}
    </main>
  );
}
