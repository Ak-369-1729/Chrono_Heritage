"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { cuspedArchPoints } from "@/components/motifs";
import { bearingDir, FORT, SCENE_LATITUDE } from "../choreography";
import { floorTexture, glowTexture, jaliAlpha, sandstoneTexture, stoneBox, worldUV } from "./textures";

/**
 * An ORIGINAL fortress-observatory built from simple procedural geometry: crenellated sandstone walls, corner
 * bastions with chhatris, a cusped-arch gateway under a jharokha balcony with jali screens, an arcaded courtyard
 * with an engraved floor, and a gnomon instrument aligned to the celestial pole. It is inspired by Rajasthani
 * forts and observatories in general and reproduces no real monument.
 */

const { halfWidth: HW, wallHeight: WH, wallThickness: WT, depth: D, gateHalfWidth: GW, gateHeight: GH } = FORT;
const BACK = -D; // outer face of the back wall

function archShape(w: number, h: number, ox: number, oy: number, opts?: Parameters<typeof cuspedArchPoints>[2]) {
  const pts = cuspedArchPoints(w, h, opts);
  const p = new THREE.Path();
  pts.forEach(([x, y], i) => (i ? p.lineTo(ox + x, oy + y) : p.moveTo(ox + x, oy + y)));
  p.closePath();
  return p;
}

/** A wall slab with a cusped arch opening, extruded toward −z from its outer face. */
function wallWithArch(width: number, height: number, depth: number, arch: { w: number; h: number; lobes: number }) {
  const s = new THREE.Shape();
  s.moveTo(-width / 2, 0);
  s.lineTo(width / 2, 0);
  s.lineTo(width / 2, height);
  s.lineTo(-width / 2, height);
  s.closePath();
  const hole = archShape(arch.w, arch.h, -arch.w / 2, 0, { lobes: arch.lobes, riseRatio: 0.62, perLobe: 5 });
  // Shape holes must wind opposite to the outline: reverse the points.
  const holePts = hole.getPoints().reverse();
  s.holes.push(new THREE.Path(holePts));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -depth);
  return worldUV(g, 3);
}

function archPlane(w: number, h: number, lobes = 7) {
  const s = new THREE.Shape();
  cuspedArchPoints(w, h, { lobes, riseRatio: 0.62, perLobe: 4 }).forEach(([x, y], i) => (i ? s.lineTo(x - w / 2, y) : s.moveTo(x - w / 2, y)));
  return new THREE.ShapeGeometry(s, 4);
}

function Chhatri({ position, scale = 1, stone, brass, dome }: { position: [number, number, number]; scale?: number; stone: THREE.Material; brass: THREE.Material; dome: THREE.Material }) {
  return (
    <group position={position} scale={scale}>
      <mesh material={stone} position={[0, 0.3, 0]}><boxGeometry args={[6.4, 0.6, 6.4]} /></mesh>
      {[[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]].map(([x, z]) => (
        <mesh key={`${x}${z}`} material={stone} position={[x, 2.1, z]}><boxGeometry args={[0.55, 3.0, 0.55]} /></mesh>
      ))}
      {/* chhajja: the projecting eave */}
      <mesh material={stone} position={[0, 3.75, 0]}><boxGeometry args={[7.6, 0.35, 7.6]} /></mesh>
      <mesh material={dome} position={[0, 3.9, 0]} scale={[1, 0.95, 1]}>
        <sphereGeometry args={[2.85, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <mesh material={brass} position={[0, 7.0, 0]}><cylinderGeometry args={[0.07, 0.18, 1.0, 6]} /></mesh>
      <mesh material={brass} position={[0, 7.6, 0]}><sphereGeometry args={[0.22, 8, 6]} /></mesh>
    </group>
  );
}

export function Fortress({ high }: { high: boolean }) {
  const tex = useMemo(() => {
    const north = bearingDir(0);
    // floor texture's "up" is −z in world; rotate engravings so the meridian points to true north
    const northAngle = Math.atan2(north[0], -north[1]);
    return { stone: sandstoneTexture(high ? 512 : 256), jali: jaliAlpha(256), floor: floorTexture(high ? 1024 : 512, northAngle), glow: glowTexture() };
  }, [high]);

  const mats = useMemo(() => ({
    stone: new THREE.MeshStandardMaterial({ map: tex.stone, color: "#d2ad85", roughness: 0.92, metalness: 0 }),
    stoneDark: new THREE.MeshStandardMaterial({ map: tex.stone, color: "#9c7f63", roughness: 0.95 }),
    dome: new THREE.MeshStandardMaterial({ color: "#d8c3a2", roughness: 0.8 }),
    brass: new THREE.MeshStandardMaterial({ color: "#d6b16d", roughness: 0.38, metalness: 0.75 }),
    niche: new THREE.MeshStandardMaterial({ color: "#16121a", roughness: 1 }),
    floor: new THREE.MeshStandardMaterial({ map: tex.floor, roughness: 0.85 }),
    jali: new THREE.MeshStandardMaterial({ map: tex.stone, color: "#c8a37a", alphaMap: tex.jali, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 }),
    lamp: new THREE.MeshBasicMaterial({ color: "#ffd9a0", toneMapped: false }),
  }), [tex]);

  const geo = useMemo(() => {
    const pishtaq = wallWithArch(22, 26, WT + 1.2, { w: GW * 2, h: GH, lobes: 9 });
    pishtaq.translate(0, 0, 1.2);
    const back = wallWithArch(HW * 2, WH, WT, { w: 7, h: 12, lobes: 7 });
    back.translate(0, 0, BACK + WT);
    const sideLen = D;
    const frontSeg = HW - 11;
    return {
      pishtaq,
      back,
      frontL: stoneBox(frontSeg, WH, WT),
      side: stoneBox(WT, WH, sideLen),
      frontSegLen: frontSeg,
      nicheArch: archPlane(5.2, 9.5, 7),
      nicheFrame: archPlane(6.6, 10.8, 9),
      terrace: stoneBox(HW * 2 + 26, 2.2, D + 34),
      step: stoneBox(30, 0.6, 3),
    };
  }, []);

  // Crenellations (merlons) along every wall top: one instanced mesh.
  const merlons = useRef<THREE.InstancedMesh>(null);
  const merlonSpots = useMemo(() => {
    const spots: [number, number, number][] = [];
    for (let x = -HW + 2; x <= HW - 2; x += 3.2) {
      if (Math.abs(x) > 11.5) spots.push([x, WH + 1, -WT / 2]);
      spots.push([x, WH + 1, BACK + WT / 2]);
    }
    for (let z = -4; z >= BACK + 4; z -= 3.2) {
      spots.push([-HW + WT / 2, WH + 1, z]);
      spots.push([HW - WT / 2, WH + 1, z]);
    }
    return spots;
  }, []);
  useLayoutEffect(() => {
    const m = merlons.current;
    if (!m) return;
    const o = new THREE.Object3D();
    merlonSpots.forEach((p, i) => {
      o.position.set(...p);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [merlonSpots]);

  // Arcade niches along the inner faces of the side walls.
  const niches = useMemo(() => {
    const out: { x: number; z: number; ry: number }[] = [];
    for (let z = -16; z >= BACK + 14; z -= 12) {
      out.push({ x: -HW + WT + 0.05, z, ry: Math.PI / 2 });
      out.push({ x: HW - WT - 0.05, z, ry: -Math.PI / 2 });
    }
    for (let x = -48; x <= 48; x += 12) if (Math.abs(x) > 8) out.push({ x, z: BACK + WT + 0.05, ry: 0 });
    return out;
  }, []);

  // The gnomon: its hypotenuse rises toward true north at the latitude angle, i.e. points at the celestial pole.
  const gnomon = useMemo(() => {
    const L = 26;
    const H = L * Math.tan((SCENE_LATITUDE * Math.PI) / 180);
    const s = new THREE.Shape();
    s.moveTo(-L / 2, 0);
    s.lineTo(L / 2, 0);
    s.lineTo(L / 2, H);
    s.closePath();
    const g = worldUV(new THREE.ExtrudeGeometry(s, { depth: 1.6, bevelEnabled: false }), 3);
    g.translate(0, 1.2, -0.8);
    const [nx, nz] = bearingDir(0);
    return { g, L, H, rotY: Math.atan2(-nz, nx), slope: Math.atan2(H, L) };
  }, []);

  return (
    <group>
      {/* terrace and steps */}
      <mesh geometry={geo.terrace} material={mats.stoneDark} position={[0, -1.1, -D / 2 + 6]} receiveShadow />
      {[0, 1, 2].map((i) => <mesh key={i} geometry={geo.step} material={mats.stoneDark} position={[0, -0.3 - i * 0.6, 18 + 3 * i + 4]} />)}

      {/* front wall, either side of the gateway */}
      <mesh geometry={geo.frontL} material={mats.stone} position={[-(11 + geo.frontSegLen / 2), WH / 2, -WT / 2]} castShadow receiveShadow />
      <mesh geometry={geo.frontL} material={mats.stone} position={[11 + geo.frontSegLen / 2, WH / 2, -WT / 2]} castShadow receiveShadow />
      {/* gateway: a pishtaq with a cusped arch */}
      <mesh geometry={geo.pishtaq} material={mats.stone} castShadow receiveShadow />
      <mesh material={mats.stoneDark} position={[0, 26.35, -1.9]}><boxGeometry args={[23.5, 0.7, 7.6]} /></mesh>
      {/* jharokha balcony above the arch */}
      <group position={[0, 20.3, 1.9]}>
        <mesh material={mats.stoneDark} position={[0, 0, 0.6]}><boxGeometry args={[9, 0.6, 3.2]} /></mesh>
        <mesh material={mats.jali} position={[0, 1.6, 2.1]}><planeGeometry args={[8, 2.6]} /></mesh>
        <mesh material={mats.jali} position={[-4, 1.6, 0.8]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[2.6, 2.6]} /></mesh>
        <mesh material={mats.jali} position={[4, 1.6, 0.8]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[2.6, 2.6]} /></mesh>
        <mesh material={mats.stoneDark} position={[0, 3.05, 0.7]}><boxGeometry args={[9.6, 0.35, 3.6]} /></mesh>
        <mesh material={mats.dome} position={[0, 3.2, 0.7]} scale={[1.6, 0.8, 0.8]}><sphereGeometry args={[2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
      </group>
      {/* lanterns either side of the gate */}
      {[-8.6, 8.6].map((x) => (
        <group key={x} position={[x, 8.6, 2.0]}>
          {/* bracket, cap and base in brass; the glass glows */}
          <mesh material={mats.brass} position={[0, 0, -0.55]}><boxGeometry args={[0.18, 0.18, 1.1]} /></mesh>
          <mesh material={mats.brass} position={[0, 0.55, 0]}><coneGeometry args={[0.45, 0.4, 6]} /></mesh>
          <mesh material={mats.brass} position={[0, -0.5, 0]}><cylinderGeometry args={[0.3, 0.22, 0.14, 6]} /></mesh>
          <mesh material={mats.lamp}><cylinderGeometry args={[0.26, 0.26, 0.85, 6]} /></mesh>
          <sprite scale={[9, 9, 1]}>
            <spriteMaterial map={tex.glow} color="#ffcf8c" transparent opacity={0.75} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
          </sprite>
          <pointLight color="#ffbe78" intensity={high ? 90 : 60} distance={46} decay={2} />
        </group>
      ))}

      {/* side and back walls */}
      <mesh geometry={geo.side} material={mats.stone} position={[-HW + WT / 2, WH / 2, -D / 2]} castShadow receiveShadow />
      <mesh geometry={geo.side} material={mats.stone} position={[HW - WT / 2, WH / 2, -D / 2]} castShadow receiveShadow />
      <mesh geometry={geo.back} material={mats.stone} castShadow receiveShadow />

      {/* crenellations */}
      <instancedMesh ref={merlons} args={[undefined, undefined, merlonSpots.length]} material={mats.stoneDark}>
        <boxGeometry args={[1.5, 2, WT * 0.6]} />
      </instancedMesh>

      {/* corner bastions with chhatris */}
      {[[-HW, 0], [HW, 0], [-HW, BACK], [HW, BACK]].map(([x, z]) => (
        <group key={`${x}${z}`} position={[x, 0, z]}>
          <mesh material={mats.stone} position={[0, 11, 0]} castShadow receiveShadow><cylinderGeometry args={[7.2, 8, 22, high ? 28 : 16]} /></mesh>
          <mesh material={mats.stoneDark} position={[0, 22.3, 0]}><cylinderGeometry args={[8, 8, 0.6, high ? 28 : 16]} /></mesh>
          <Chhatri position={[0, 22.6, 0]} scale={1.05} stone={mats.stone} brass={mats.brass} dome={mats.dome} />
        </group>
      ))}

      {/* courtyard: engraved floor and arcade niches */}
      <mesh material={mats.floor} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, -D / 2]} receiveShadow>
        <planeGeometry args={[HW * 2 - WT * 2, D - WT * 2]} />
      </mesh>
      {niches.map((n, i) => (
        <group key={i} position={[n.x, 0.6, n.z]} rotation={[0, n.ry, 0]}>
          <mesh geometry={geo.nicheFrame} material={mats.stoneDark} position={[0, 0, 0.01]} />
          <mesh geometry={geo.nicheArch} material={mats.niche} position={[0, 0.5, 0.03]} />
        </group>
      ))}

      {/* the instrument (original design): stepped gnomon on a platform with an equatorial ring each side */}
      <group position={[FORT.instrument.x, 0, FORT.instrument.z]} rotation={[0, gnomon.rotY, 0]}>
        <mesh material={mats.stoneDark} position={[0, 0.6, 0]} receiveShadow><boxGeometry args={[gnomon.L + 4, 1.2, 16]} /></mesh>
        <mesh geometry={gnomon.g} material={mats.stone} castShadow receiveShadow />
        {/* steps on the hypotenuse */}
        {Array.from({ length: 12 }, (_, i) => (i + 0.5) / 12).map((t) => (
          <mesh key={t} material={mats.stoneDark} position={[-gnomon.L / 2 + t * gnomon.L, 1.2 + t * gnomon.H + 0.1, 0]} rotation={[0, 0, 0]}>
            <boxGeometry args={[gnomon.L / 12 * 0.95, 0.25, 1.9]} />
          </mesh>
        ))}
        {/* equatorial rings: perpendicular to the gnomon edge, hanging below it on both sides */}
        <group position={[-gnomon.L / 2 + 0.58 * gnomon.L, 1.2 + 0.58 * gnomon.H, 0]} rotation={[0, 0, gnomon.slope]}>
          <mesh material={mats.brass} rotation={[0, Math.PI / 2, Math.PI]}>
            <torusGeometry args={[6.2, 0.22, 6, 40, Math.PI]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
