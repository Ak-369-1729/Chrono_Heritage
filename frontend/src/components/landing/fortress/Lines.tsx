"use client";

import { Line } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import type { Line2 } from "three-stdlib";
import { bearingDir, ILLUSTRATIVE, poleDir, ramp, SCENES, window4 } from "../choreography";

/** Observer for the sight lines: the threshold of the gateway. */
const O = new THREE.Vector3(0, 0.45, -2);
const FAR = 1600;

function along(bearing: number, dist: number, y = 0.45) {
  const [dx, dz] = bearingDir(bearing);
  return new THREE.Vector3(O.x + dx * dist, y, O.z + dz * dist);
}

/** Ground sector between two bearings (a fan of directions), on the courtyard floor. */
function sector(b1: number, b2: number, radius: number) {
  const pts = [new THREE.Vector2(0, 0)];
  for (let i = 0; i <= 16; i++) {
    const [dx, dz] = bearingDir(b1 + ((b2 - b1) * i) / 16);
    pts.push(new THREE.Vector2(dx * radius, dz * radius));
  }
  const s = new THREE.Shape(pts);
  const g = new THREE.ShapeGeometry(s);
  g.rotateX(Math.PI / 2); // shape (x, y) → ground (x, z)
  g.translate(O.x, 0.12, O.z);
  return g;
}


/**
 * The brass measured axis (from the gateway scene on), the blue prediction and uncertainty fans (instrument
 * scene), and HTML labels positioned by projecting 3D anchors each frame. All angles are ILLUSTRATIVE.
 */
export function SightLines({ progress, labels }: { progress: MutableRefObject<number>; labels: MutableRefObject<(HTMLElement | null)[]> }) {
  const { camera, size } = useThree();
  const axis = useRef<Line2>(null);
  const pred = useRef<Line2>(null);
  const fanMats = useRef<THREE.MeshBasicMaterial[]>([]);
  const proj = useMemo(() => new THREE.Vector3(), []);
  const geo = useMemo(() => ({
    axisStart: new THREE.Vector3(0, 0.45, 40),
    axisEnd: along(ILLUSTRATIVE.axisBearing, FAR),
    predEnd: along(ILLUSTRATIVE.predictedBearing, FAR),
    measured: sector(ILLUSTRATIVE.axisBearing - ILLUSTRATIVE.measurementSigma, ILLUSTRATIVE.axisBearing + ILLUSTRATIVE.measurementSigma, 118),
    chron: sector(ILLUSTRATIVE.chronologySpan[0], ILLUSTRATIVE.chronologySpan[1], 118),
    horizon: sector(ILLUSTRATIVE.horizonSpan[0], ILLUSTRATIVE.horizonSpan[1], 118),
    anchors: [along(ILLUSTRATIVE.axisBearing, 46, 1.5), along(ILLUSTRATIVE.predictedBearing, 92, 1.5),
      new THREE.Vector3(...poleDir()).multiplyScalar(1500)],
  }), []);

  useFrame(() => {
    const p = progress.current;
    const S = SCENES;
    const axisO = ramp(p, S.gateway[0] + 0.05, S.gateway[0] + 0.11) * (1 - ramp(p, S.workspace[0], S.workspace[0] + 0.04));
    const predO = window4(p, S.instrument[0] - 0.01, S.instrument[0] + 0.03, S.vault[1] - 0.02, S.vault[1] + 0.01);
    const poleO = window4(p, S.courtyard[0] + 0.07, S.courtyard[0] + 0.1, S.courtyard[1] - 0.03, S.courtyard[1]);
    if (axis.current) (axis.current.material as THREE.Material & { opacity: number }).opacity = axisO;
    if (pred.current) (pred.current.material as THREE.Material & { opacity: number }).opacity = predO;
    const fanO = [0.38, 0.32, 0.14];
    fanMats.current.forEach((m, i) => m && (m.opacity = predO * fanO[i]));
    const vis = [axisO * (1 - ramp(p, S.courtyard[0], S.courtyard[0] + 0.03)) + predO, predO, poleO];
    geo.anchors.forEach((a, i) => {
      const el = labels.current[i];
      if (!el) return;
      proj.copy(a).project(camera);
      const on = proj.z < 1 && Math.abs(proj.x) < 0.95 && Math.abs(proj.y) < 0.92 && vis[i] > 0.02;
      el.style.visibility = on ? "visible" : "hidden";
      el.style.opacity = on ? Math.min(1, vis[i]).toFixed(3) : "0";
      if (on) el.style.transform = `translate(${((proj.x + 1) / 2) * size.width + 10}px, ${((1 - proj.y) / 2) * size.height - 8}px)`;
    });
  });

  return (
    <group>
      <Line ref={axis} points={[geo.axisStart, geo.axisEnd]} color="#e7c98f" lineWidth={2.4} transparent opacity={0} depthWrite={false} toneMapped={false} />
      <Line ref={pred} points={[O, geo.predEnd]} color="#6da7d9" lineWidth={2.2} transparent opacity={0} depthWrite={false} toneMapped={false} />
      {[geo.measured, geo.chron, geo.horizon].map((g, i) => (
        <mesh key={i} geometry={g} renderOrder={2}>
          <meshBasicMaterial ref={(m) => { if (m) fanMats.current[i] = m; }} color={i === 0 ? "#c97962" : "#6da7d9"} transparent opacity={0}
            depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}
