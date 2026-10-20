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
    title: "The gateway",
    body: "A doorway defines a direction. Surveyors record its axis, shown in brass, together with the north it was measured against and how far it could be off. Without that, no comparison with the sky is possible.",
  },
  {
    key: "courtyard",
    title: "The courtyard of time",
    body: "The sky turns overnight and drifts across millennia. Earth's axial tilt was larger in antiquity, so a solstice Sun rose at a different point on the horizon. Every prediction belongs to a sourced date range, never to a date chosen to fit.",
  },
  {
    key: "instrument",
    title: "The instrument chamber",
    body: `Here the measured axis meets the calculated prediction, in blue. The angle between them is the residual (${res}° in this illustration). Measurement error, dating ranges and the horizon each widen the band of plausible directions, shown in terracotta.`,
  },
  {
    key: "vault",
    title: "The evidence vault",
    body: "A residual is only as good as the record behind it. The vault keeps the ledger: which sources exist, which benchmarks passed, which are blocked and why, and which questions remain open. It is read live from this platform.",
  },
  {
    key: "workspace",
    title: "The research workspace",
    body: "The brass axis becomes a reference line on a chart; the sky becomes a calculation with a version, a seed and a source for every input, ready for someone else to check.",
  },
] as const;

export const LEGEND = [
  { color: "var(--color-brass)", label: "Measured axis (illustrative)" },
  { color: "var(--color-evidence)", label: "Predicted direction (illustrative)" },
  { color: "var(--color-uncertain)", label: `Measurement uncertainty, ±${ILLUSTRATIVE.measurementSigma}° (illustrative)` },
];
