"use client";

import type { FeatureCollection, Point } from "geojson";
import type { Map as MLMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { SiteSummary } from "@/lib/types";

/**
 * Offline map: Natural Earth land (world-atlas, public domain) drawn by MapLibre with no tile server,
 * so the Atlas works without third-party map services. The site list beside it is the accessible
 * primary interface; the map is a spatial overview.
 */

function graticule(): FeatureCollection {
  const features: FeatureCollection["features"] = [];
  for (let lon = -180; lon <= 180; lon += 30)
    features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: Array.from({ length: 37 }, (_, i) => [lon, -90 + i * 5]) } });
  for (let lat = -60; lat <= 60; lat += 30)
    features.push({ type: "Feature", properties: { eq: lat === 0 }, geometry: { type: "LineString", coordinates: Array.from({ length: 73 }, (_, i) => [-180 + i * 5, lat]) } });
  return { type: "FeatureCollection", features };
}

function sitesGeo(sites: SiteSummary[]): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: sites.filter((s) => s.lat !== null && s.lon !== null).map((s) => ({
      type: "Feature",
      properties: {
        id: s.id, name: s.name,
        state: s.eligibility.single_site_analysis.eligible ? (s.status === "reviewed" ? "reviewed" : "eligible") : "blocked",
        illustrative: s.is_illustrative,
      },
      geometry: { type: "Point", coordinates: [s.lon!, s.lat!] },
    })),
  };
}

export function SiteMap({ sites, selected, onSelect }: { sites: SiteSummary[]; selected?: string | null; onSelect?: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const sitesRef = useRef(sites);
  sitesRef.current = sites;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const [maplibregl, topo, land] = await Promise.all([
          import("maplibre-gl"),
          import("topojson-client"),
          import("world-atlas/land-110m.json"),
        ]);
        if (disposed || !box.current) return;
        maplibregl.setWorkerUrl("/vendor/maplibre-gl-worker.mjs");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- world-atlas ships untyped TopoJSON
        const landGeo = topo.feature(land as any, (land as any).objects.land) as unknown as FeatureCollection;
        const m = new maplibregl.Map({
          container: box.current,
          attributionControl: { compact: true, customAttribution: "Land: Natural Earth (public domain) via world-atlas" },
          style: {
            version: 8,
            sources: {
              land: { type: "geojson", data: landGeo },
              grat: { type: "geojson", data: graticule() },
              sites: { type: "geojson", data: sitesGeo(sitesRef.current) },
            },
            layers: [
              { id: "bg", type: "background", paint: { "background-color": "#0a0d12" } },
              { id: "grat", type: "line", source: "grat", paint: { "line-color": "#1c2436", "line-width": ["case", ["==", ["get", "eq"], true], 1, 0.5] } },
              { id: "land", type: "fill", source: "land", paint: { "fill-color": "#172138" } },
              { id: "coast", type: "line", source: "land", paint: { "line-color": "#6d5840", "line-width": 0.6 } },
              { id: "halo", type: "circle", source: "sites", paint: { "circle-radius": 11, "circle-color": "#d6b16d", "circle-opacity": ["case", ["==", ["get", "id"], ""], 0.25, 0] } },
              {
                id: "sites", type: "circle", source: "sites",
                paint: {
                  "circle-radius": ["case", ["get", "illustrative"], 5.5, 7],
                  "circle-color": ["match", ["get", "state"], "reviewed", "#7b938c", "eligible", "#d6b16d", "#0a0d12"],
                  // illustrative records carry an evidence-blue ring (the same cue as their badge); blocked ones terracotta
                  "circle-stroke-color": ["case", ["get", "illustrative"], "#6da7d9", ["match", ["get", "state"], "blocked", "#c97962", "#eee7d9"]],
                  "circle-stroke-width": ["match", ["get", "state"], "blocked", 2.2, 1.6],
                },
              },
            ],
          },
          center: [20, 25],
          zoom: 0.9,
          renderWorldCopies: false,
        });
        m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        // touch: pinch to zoom and drag to pan; rotation is disabled so north stays up
        m.touchZoomRotate.disableRotation();
        m.dragRotate.disable();
        m.on("click", "sites", (e: { features?: { properties?: Record<string, unknown> }[] }) => {
          const f = e.features?.[0];
          if (!f) return;
          const id = String(f.properties?.id);
          onSelectRef.current?.(id);
        });
        m.on("mouseenter", "sites", () => (m.getCanvas().style.cursor = "pointer"));
        m.on("mouseleave", "sites", () => (m.getCanvas().style.cursor = ""));
        m.once("load", () => {
          const pts = sitesRef.current.filter((x) => x.lat != null && x.lon != null);
          if (pts.length) {
            const lons = pts.map((x) => x.lon!);
            const lats = pts.map((x) => x.lat!);
            m.fitBounds([[Math.min(...lons) - 8, Math.min(...lats) - 8], [Math.max(...lons) + 8, Math.max(...lats) + 8]], { padding: 30, maxZoom: 4, duration: 0 });
          }
        });
        m.on("error", (e: { error?: { message?: string } }) => setFailed(String(e.error?.message ?? "Map error")));
        map.current = m;
      } catch (e) {
        if (!disposed) setFailed(e instanceof Error ? e.message : "The map could not be loaded.");
      }
    })();
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => {
      const src = m.getSource("sites") as { setData?: (d: FeatureCollection) => void } | undefined;
      src?.setData?.(sitesGeo(sites));
      if (m.getLayer("halo")) m.setPaintProperty("halo", "circle-opacity", ["case", ["==", ["get", "id"], selected ?? ""], 0.35, 0]);
    };
    if (m.isStyleLoaded()) apply();
    else m.once("load", apply);
  }, [sites, selected]);

  useEffect(() => {
    const m = map.current;
    const s = sites.find((x) => x.id === selected);
    if (m && s?.lat != null && s.lon != null) m.flyTo({ center: [s.lon, s.lat], zoom: Math.max(m.getZoom(), 3), essential: false });
  }, [selected, sites]);

  return (
    <div className="niche relative h-full min-h-[320px] w-full">
      <div ref={box} style={{ position: "absolute", inset: 0 }} role="region" aria-label="Map of sites. Use the list for keyboard navigation." />
      {failed && <p className="absolute inset-x-0 bottom-0 bg-obsidian/90 p-2 text-xs text-terracotta">Map unavailable: {failed}. The site list remains fully usable.</p>}
      <ul className="pointer-events-none absolute bottom-2 left-2 space-y-1 bg-obsidian/85 px-2.5 py-2 text-2xs text-ivory-dim">
        <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full border border-ivory bg-copper" />reviewed and analysable</li>
        <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full border border-ivory bg-brass" />analysable, not yet reviewed</li>
        <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full border-2 border-uncertain" />blocked: required data missing</li>
        <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full border-2 border-evidence" />blue ring: illustrative (fictional) record</li>
      </ul>
    </div>
  );
}
