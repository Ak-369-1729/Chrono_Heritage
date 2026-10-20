import { describe, expect, it } from "vitest";
import {
  bearingDir, CAMERA_KEYS, cameraAt, captionOpacity, FORT, ILLUSTRATIVE, layerState, poleDir, ramp, SCENE_ORDER,
  SCENES, sceneAnchor, sceneAt, skyRotation, window4,
} from "../landing/choreography";
import { decideMode } from "../landing/Journey";

const sweep = (a: number, b: number, step = 0.0005) => {
  const out: number[] = [];
  for (let p = a; p <= b; p += step) out.push(p);
  return out;
};

describe("scroll choreography", () => {
  it("six scenes tile the whole scroll range in order", () => {
    const s = SCENE_ORDER.map((k) => SCENES[k]);
    expect(s).toHaveLength(6);
    expect(s[0][0]).toBe(0);
    expect(s[s.length - 1][1]).toBe(1);
    for (let i = 1; i < s.length; i++) expect(s[i][0]).toBe(s[i - 1][1]);
    expect(sceneAt(0)).toBe("threshold");
    expect(sceneAt(0.4)).toBe("courtyard");
    expect(sceneAt(1)).toBe("workspace");
    for (const k of SCENE_ORDER) expect(sceneAt(sceneAnchor(k))).toBe(k);
  });

  it("camera path is continuous at every keyframe", () => {
    for (const k of CAMERA_KEYS) {
      const a = cameraAt(k.p - 1e-6);
      const b = cameraAt(k.p + 1e-6);
      a.pos.forEach((v, i) => expect(Math.abs(v - b.pos[i])).toBeLessThan(1e-2));
    }
    expect(cameraAt(-1).pos).toEqual(CAMERA_KEYS[0].pos);
    expect(cameraAt(2).pos).toEqual(CAMERA_KEYS[CAMERA_KEYS.length - 1].pos);
  });

  it("the camera enters the courtyard only through the gate opening", () => {
    const wallFront = FORT.frontZ + 1.5; // pishtaq projects 1.2 in front of the wall
    const wallBack = FORT.frontZ - FORT.wallThickness - 0.5;
    for (const p of sweep(0, 1)) {
      const { pos } = cameraAt(p);
      const [x, y, z] = pos;
      if (z <= wallFront && z >= wallBack && y < FORT.wallHeight + 3) {
        expect(Math.abs(x), `p=${p.toFixed(4)} x`).toBeLessThan(FORT.gateHalfWidth - 1.5);
        expect(y, `p=${p.toFixed(4)} y`).toBeLessThan(FORT.gateSpring);
      }
    }
  });

  it("inside the walls the camera stays within the courtyard and clear of the instrument", () => {
    for (const p of sweep(SCENES.courtyard[0], 1)) {
      const { pos } = cameraAt(p);
      const [x, y, z] = pos;
      if (z < -FORT.wallThickness && y < FORT.wallHeight + 4) {
        expect(Math.abs(x)).toBeLessThan(FORT.halfWidth - FORT.wallThickness - 2);
        expect(z).toBeGreaterThan(-FORT.depth + FORT.wallThickness + 2);
      }
      const dx = x - FORT.instrument.x;
      const dz = z - FORT.instrument.z;
      if (Math.hypot(dx, dz) < 18) expect(y).toBeGreaterThan(16);
      expect(y).toBeGreaterThan(1.5);
    }
  });

  it("ramp, window and caption visibility are bounded", () => {
    expect(ramp(-1, 0, 1)).toBe(0);
    expect(ramp(2, 0, 1)).toBe(1);
    expect(window4(0.5, 0, 0.1, 0.9, 1)).toBe(1);
    expect(window4(0.95, 0, 0.1, 0.9, 1)).toBeCloseTo(0.5);
    for (const k of SCENE_ORDER) {
      for (const p of sweep(0, 1, 0.01)) {
        const o = captionOpacity(k, p);
        expect(o).toBeGreaterThanOrEqual(0);
        expect(o).toBeLessThanOrEqual(1);
      }
      expect(captionOpacity(k, sceneAnchor(k))).toBeGreaterThan(0.95);
    }
    // the hero is fully visible on arrival, so the primary actions never wait for an animation
    expect(captionOpacity("threshold", 0)).toBe(1);
  });

  it("the gateway layer fills the screen before the courtyard takes over", () => {
    const end = layerState(SCENES.gateway[1]);
    expect(end.fortScale).toBeGreaterThan(9);
    expect(layerState(0).outsideOpacity).toBe(1);
    expect(layerState(SCENES.courtyard[0] + 0.05).insideOpacity).toBe(1);
    expect(layerState(0.99).insideOpacity).toBe(0);
    expect(skyRotation(0.5)).toBeGreaterThan(skyRotation(0.3));
  });

  it("geometry helpers: the axis points along −z and the pole sits at the scene latitude", () => {
    const [x, z] = bearingDir(ILLUSTRATIVE.axisBearing);
    expect(x).toBeCloseTo(0);
    expect(z).toBeCloseTo(-1);
    const pole = poleDir();
    expect((Math.asin(pole[1]) * 180) / Math.PI).toBeCloseTo(27, 5);
  });
});

describe("rendering mode", () => {
  const env = { webgl: true, width: 1440, lowPower: false, reduced: false, query: null };
  it("uses 3D on a capable desktop and layered 2D on phones", () => {
    expect(decideMode({}, env)).toMatchObject({ mode: "3d", quality: "high" });
    expect(decideMode({}, { ...env, lowPower: true })).toMatchObject({ mode: "3d", quality: "lite" });
    expect(decideMode({}, { ...env, width: 390 })).toMatchObject({ mode: "layers" });
  });
  it("falls back without WebGL and stops all scroll animation for reduced motion", () => {
    expect(decideMode({}, { ...env, webgl: false }).mode).toBe("layers");
    expect(decideMode({}, { ...env, reduced: true }).mode).toBe("static");
    expect(decideMode({ landing: "3d" }, { ...env, reduced: true }).mode).toBe("static");
  });
  it("honours explicit preferences and the ?view= override", () => {
    expect(decideMode({ landing: "static" }, env).mode).toBe("static");
    expect(decideMode({ landing: "layers" }, env).mode).toBe("layers");
    expect(decideMode({ landing: "3d" }, { ...env, width: 390 }).mode).toBe("3d");
    expect(decideMode({ landing: "3d" }, { ...env, webgl: false }).mode).toBe("layers");
    expect(decideMode({}, { ...env, query: "static" }).mode).toBe("static");
  });
});
