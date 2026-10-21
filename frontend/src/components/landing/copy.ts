import { ILLUSTRATIVE } from "./choreography";

export const HERO = {
  title: "CHRONOHERITAGE",
  lede: "Reading the sky through the memory of stone.",
  sub: "A research instrument for asking whether historical architecture relates to the observable sky, with every measurement, source and uncertainty kept in view.",
};

export const ILLUSTRATIVE_CAPTION =
  "Illustrative scene: an original fortress-observatory inspired by Rajasthani architecture in general, of no real place. The star field is decorative, not a real constellation.";

const res = (ILLUSTRATIVE.axisBearing - ILLUSTRATIVE.predictedBearing).toFixed(1).replace("-", "−");

/** One caption per scene, in order. The scenes form a sequence, so they are numbered. */
export const SCENE_COPY = [
  {
    key: "threshold",
    title: "The desert threshold",
    body: "Out on the dunes, an observatory rises from the ridge. Before anyone asks what its builders meant, the first question is simpler: what was measured, and how well?",
  },
  {
    key: "gateway",
    title: "The Jharokha Gallery",
    body: "The passage opens into a gallery of repeated arches and lattice windows. A doorway gives a direction; surveyors record its axis, the north reference and how far the measurement could be off before comparing it with the sky.",
    href: "/atlas",
    action: "Explore the Heritage Atlas",
  },
  {
    key: "courtyard",
    title: "The Chamber of Horizons",
    body: "The jharokha gallery opens into a chamber framed around the distant horizon, then leads into the open-air Rajasthani courtyard. Earth's axial tilt changes over millennia, shifting where the solstice Sun rises. This live calculation uses an explicitly illustrative observer; every real prediction belongs to sourced inputs, never a date chosen to fit.",
    href: "/sky",
    action: "Open the Sky Explorer",
  },
  {
    key: "instrument",
    title: "The instrument chamber",
    body: `Here the measured axis meets the calculated prediction, in blue. The angle between them is the residual (${res}° in this illustration). Measurement error, dating ranges and the horizon each widen the band of plausible directions, shown in terracotta.`,
    href: "/analysis/new",
    action: "Start an analysis",
  },
  {
    key: "vault",
    title: "The Evidence Vault / Archive",
    body: "A residual is only as good as the record behind it. The vault keeps the ledger: which sources exist, which benchmarks passed, which are blocked and why, and which questions remain open. It is read live from this platform.",
    href: "/reports",
    action: "Review reports and evidence",
  },
  {
    key: "workspace",
    title: "The Rooftop Observatory Terrace",
    body: "The rear arch opens onto the terrace. The brass axis becomes a reference line on a chart; the sky becomes a calculation with a version, a seed and a source for every input, ready for someone else to check.",
  },
] as const;

export const LEGEND = [
  { color: "var(--color-brass)", label: "Measured axis (illustrative)" },
  { color: "var(--color-evidence)", label: "Predicted direction (illustrative)" },
  { color: "var(--color-uncertain)", label: `Measurement uncertainty, ±${ILLUSTRATIVE.measurementSigma}° (illustrative)` },
];
