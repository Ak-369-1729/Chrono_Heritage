/**
 * Scroll choreography for the V3 landing journey (pure functions, unit-tested).
 *
 * Six scenes move from a desert night, through a fortress gateway and courtyard, to an instrument chamber, an
 * evidence vault and finally the research workspace. All architecture and every angle drawn in the 3D/2D scenes is
 * ILLUSTRATIVE: an original procedural fortress-observatory of no real place. Values shown in the data panels come
 * from the live API and are labelled with their source.
 */

export type Vec3 = [number, number, number];

/** Scene boundaries in scroll progress (0..1), in narrative order. */
export const SCENES = {
  threshold: [0.0, 0.14],
  gateway: [0.14, 0.32],
  courtyard: [0.32, 0.5],
  instrument: [0.5, 0.66],
  vault: [0.66, 0.82],
  workspace: [0.82, 1.0],
} as const;
export type SceneKey = keyof typeof SCENES;
export const SCENE_ORDER = Object.keys(SCENES) as SceneKey[];

/** Which scene a progress value falls in. */
export function sceneAt(p: number): SceneKey {
  for (const k of SCENE_ORDER) if (p < SCENES[k][1]) return k;
  return "workspace";
}

/** The progress value at which a scene's caption is fully legible (used by the scene index links). */
export function sceneAnchor(k: SceneKey): number {
  const [a, b] = SCENES[k];
  if (k === "threshold") return 0;
  if (k === "workspace") return b - 0.015; // after the axis has become the chart
  return a + (b - a) * 0.42;
}

/**
 * Illustrative angles (degrees clockwise from true north). The fortress axis points along −z in the 3D scene.
 * Invented for explanation; nothing here is a measurement or a computed prediction.
 */
export const ILLUSTRATIVE = {
  axisBearing: 61.5,
  measurementSigma: 0.8,
  predictedBearing: 62.4,
  chronologySpan: [62.3, 62.6] as [number, number],
  horizonSpan: [62.1, 62.9] as [number, number],
};

/** Observer used for the live epoch calculation in scene C (an illustrative location, not a site record). */
export const OBSERVER = { lat: 27.0, lon: 75.0, label: "an illustrative observer at 27.0° N, 75.0° E" };

/** Observer latitude used to tilt the decorative exterior sky in the 3D and 2D scenes. */
export const SCENE_LATITUDE = 27;

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
/** 0→1 as p moves from a to b (smoothstep). */
export const ramp = (p: number, a: number, b: number) => smooth((p - a) / (b - a));
/** Fade in over [a, b], hold, fade out over [c, d]. */
export const window4 = (p: number, a: number, b: number, c: number, d: number) =>
  Math.min(ramp(p, a, b), 1 - ramp(p, c, d));

/** Visibility of a scene's caption: in shortly after the scene starts, out just before it ends. */
export function captionOpacity(k: SceneKey, p: number): number {
  const [a, b] = SCENES[k];
  if (k === "threshold") return 1 - ramp(p, b - 0.06, b - 0.015);
  if (k === "workspace") return ramp(p, a + 0.1, a + 0.15);
  return window4(p, a + 0.015, a + 0.045, b - 0.035, b - 0.005);
}

/** World directions: the fortress axis (−z) has bearing ILLUSTRATIVE.axisBearing. */
export function bearingDir(bearingDeg: number): [number, number] {
  const r = ((bearingDeg - ILLUSTRATIVE.axisBearing) * Math.PI) / 180;
  return [Math.sin(r), -Math.cos(r)];
}

/** Unit vector toward the celestial pole for the scene latitude (north, elevated by the latitude). */
export function poleDir(): Vec3 {
  const [nx, nz] = bearingDir(0);
  const e = (SCENE_LATITUDE * Math.PI) / 180;
  return [nx * Math.cos(e), Math.sin(e), nz * Math.cos(e)];
}

/* ------------------------------------------------------------------------------------------ fortress geometry */

/** Dimensions shared by the 3D model and the camera path tests (metres in scene units). */
export const FORT = {
  frontZ: 0, // outer face of the front wall
  wallThickness: 5,
  wallHeight: 17,
  halfWidth: 64,
  depth: 128, // front face to back wall face
  gateHalfWidth: 6.2,
  gateHeight: 19, // apex of the arch opening
  gateSpring: 12, // springing line of the arch
  instrument: { x: -26, z: -64 },
};

interface Key {
  p: number;
  pos: Vec3;
  look: Vec3;
}

/** Camera keyframes. Between keys the camera eases (smoothstep) so motion never jerks. */
export const CAMERA_KEYS: Key[] = [
  { p: 0.0, pos: [42, 5.5, 340], look: [0, 22, 0] },
  { p: 0.12, pos: [24, 6.5, 235], look: [0, 19, 0] },
  { p: 0.2, pos: [7, 7.5, 128], look: [0, 15, 0] },
  { p: 0.3, pos: [0, 7.5, 30], look: [0, 11, -80] },
  { p: 0.36, pos: [0, 7.5, -10], look: [0, 13, -90] },
  { p: 0.47, pos: [12, 9, -28], look: [-70, 40, -76] },
  { p: 0.53, pos: [24, 15, -16], look: [-16, 3, -70] },
  { p: 0.64, pos: [16, 18, -24], look: [-20, 2, -72] },
  { p: 0.67, pos: [8, 12, -48], look: [0, 9, -110] },
  { p: 0.70, pos: [3, 8.5, -92], look: [0, 8, -146] },
  { p: 0.72, pos: [0, 8.5, -128], look: [0, 8.5, -190] },
  { p: 0.75, pos: [0, 8.5, -158], look: [0, 9, -218] },
  { p: 0.80, pos: [0, 10, -200], look: [0, 14, -270] },
  { p: 0.84, pos: [0, 13, -224], look: [0, 18, -310] },
  { p: 0.90, pos: [0, 17, -238], look: [0, 23, -360] },
  { p: 1.0, pos: [0, 20, -240], look: [0, 25, -410] },
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export function cameraAt(p: number): { pos: Vec3; look: Vec3 } {
  const q = clamp01(p);
  for (let i = 0; i < CAMERA_KEYS.length - 1; i++) {
    const a = CAMERA_KEYS[i];
    const b = CAMERA_KEYS[i + 1];
    if (q <= b.p) {
      const t = smooth((q - a.p) / (b.p - a.p || 1));
      return { pos: lerp3(a.pos, b.pos, t), look: lerp3(a.look, b.look, t) };
    }
  }
  const last = CAMERA_KEYS[CAMERA_KEYS.length - 1];
  return { pos: last.pos, look: last.look };
}

/** Rotation of the decorative exterior sky about the pole (radians). */
export function skyRotation(p: number): number {
  const c = SCENES.courtyard;
  return 0.25 * p + 1.4 * ramp(p, c[0], c[1]) + 0.3 * ramp(p, c[1], 1);
}

/** Night-sky brightness toward the "pre-dawn" glow on the axis horizon (0..1). */
export function dawnGlow(p: number): number {
  return 0.35 + 0.35 * ramp(p, SCENES.gateway[0], SCENES.courtyard[1]) - 0.2 * ramp(p, SCENES.vault[0], 1);
}

/* ------------------------------------------------------------------------------------- 2D layered renderer */

/**
 * Transforms for the layered (no-WebGL / phone) renderer. Scale grows as the visitor approaches the gate; once the
 * arch has filled the screen (scene C) the courtyard layer takes over.
 */
export function layerState(p: number) {
  const g = SCENES.gateway;
  const approach = ramp(p, SCENES.threshold[1] - 0.06, g[1]);
  return {
    // outside: dunes and the fortress silhouette
    fortScale: 1 + approach * approach * 9.5,
    fortLift: approach * 16, // % of viewport: the gate rises toward the centre as it grows
    farScale: 1 + approach * 0.35,
    outsideOpacity: 1 - ramp(p, g[1] - 0.02, g[1] + 0.03),
    refLine: ramp(p, g[0] + 0.04, g[0] + 0.1),
    // Keep the courtyard visible beneath the finale; the terrace parapet arrives as a foreground layer.
    insideOpacity: 1,
    skyTurnDeg: (skyRotation(p) * 180) / Math.PI,
    instrument: window4(p, SCENES.instrument[0] - 0.02, SCENES.instrument[0] + 0.03, SCENES.instrument[1] - 0.01, SCENES.instrument[1] + 0.03),
    plan: Math.min(ramp(p, SCENES.vault[0] - 0.01, SCENES.vault[0] + 0.05), 1 - ramp(p, SCENES.workspace[0], SCENES.workspace[0] + 0.08)),
    terrace: ramp(p, SCENES.workspace[0] + 0.015, SCENES.workspace[0] + 0.12),
    dawn: dawnGlow(p),
  };
}
