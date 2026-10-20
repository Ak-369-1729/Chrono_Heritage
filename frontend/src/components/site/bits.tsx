import { Glyph } from "@/components/Glyph";
import { StatusBadge } from "@/components/ui";
import { humanize, num } from "@/lib/format";
import type { Eligibility } from "@/lib/types";

export function ProvenanceMeter({ score, qualified, compact = false }: { score: number; qualified: boolean; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2" title="Documentation completeness, not factual correctness">
      <span className={`relative inline-block h-1.5 ${compact ? "w-12" : "w-20"} bg-night-2`}>
        <span className={`absolute inset-y-0 left-0 ${qualified ? "bg-verdigris" : "bg-terracotta"}`} style={{ width: `${Math.round(score * 100)}%` }} />
      </span>
      <span className="num text-xs">{num(score * 100, 0)}%</span>
    </span>
  );
}

export function EligibilityBadges({ e }: { e: Eligibility }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      <StatusBadge status={e.single_site_analysis.eligible ? "eligible" : "blocked"} label={e.single_site_analysis.eligible ? "Analysable" : "Analysis blocked"}
        title={e.single_site_analysis.reasons.join(" ") || "All inputs needed for single-site analysis are present."} />
      <StatusBadge status={e.cross_site_pooling.eligible ? "eligible" : "excluded"} label={e.cross_site_pooling.eligible ? "Poolable" : "Not poolable"}
        title={e.cross_site_pooling.reasons.join(" ") || "Eligible for cross-site pooling."} />
    </span>
  );
}

export const METHOD_LABEL: Record<string, string> = {
  total_station: "Total station", theodolite_sun_sight: "Theodolite with Sun sight", gnss_baseline: "GNSS baseline",
  surveyed_plan: "Surveyed plan", prismatic_compass: "Prismatic compass", compass: "Compass",
  satellite_imagery: "Satellite imagery", published_plan_estimate: "Estimate from a published plan", sketch: "Sketch",
};

export const NORTH_LABEL: Record<string, string> = {
  true: "True (geodetic) north", astronomical: "Astronomically determined north", magnetic: "Magnetic north",
  grid: "Grid north", unspecified: "Unspecified",
};

export const label = (map: Record<string, string>, k: string | null | undefined) => (k ? map[k] ?? humanize(k) : "—");

export function Missing({ children = "Not recorded" }: { children?: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1.5 text-uncertain"><Glyph kind="hollow" />{children}</span>;
}
