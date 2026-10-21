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
    stone: new THREE.MeshStandardMaterial({ map: tex.stone, color: "#d9a993", roughness: 0.92, metalness: 0 }),
    stoneDark: new THREE.MeshStandardMaterial({ map: tex.stone, color: "#a87869", roughness: 0.95 }),
    dome: new THREE.MeshStandardMaterial({ color: "#e2bea3", roughness: 0.8 }),
    brass: new THREE.MeshStandardMaterial({ color: "#d6b16d", roughness: 0.38, metalness: 0.75 }),
    niche: new THREE.MeshStandardMaterial({ color: "#49383a", roughness: 1 }),
    windowGlow: new THREE.MeshBasicMaterial({ color: "#e1a277", transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
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
      rearWalk: stoneBox(22, 0.8, 108),
      lookout: stoneBox(76, 1.4, 52),
      baluster: stoneBox(0.8, 2.2, 0.8),
      roomPortal: wallWithArch(54, 22, 2, { w: 16, h: 16, lobes: 9 }),
      roomSide: stoneBox(2, 22, 124),
      vaultSide: stoneBox(2, 20, 72),
      vaultPortal: wallWithArch(46, 20, 2, { w: 18, h: 15, lobes: 9 }),
      vaultArch: archPlane(5.2, 9.5, 9),
      vaultWindow: archPlane(4.4, 6.8, 7),
      facade: stoneBox(116, 37, 3),
      facadeWindow: archPlane(5.8, 7.2, 9),
      vaultRib: new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(-26, 17, 0),
          new THREE.Vector3(-23, 21, 0),
          new THREE.Vector3(-17, 25, 0),
          new THREE.Vector3(0, 28, 0),
          new THREE.Vector3(17, 25, 0),
          new THREE.Vector3(23, 21, 0),
          new THREE.Vector3(26, 17, 0),
        ]),
        40,
        0.72,
        8,
        false,
      ),
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
  const pilasters = useMemo(() => {
    const out: { x: number; z: number }[] = [];
    for (let z = -22; z >= BACK + 10; z -= 12) {
      out.push({ x: -HW + WT + 0.35, z }, { x: HW - WT - 0.35, z });
    }
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
      {/* Four storeys of jharokha windows turn the gate into a palace facade, not a bare fort wall. */}
      <group position={[0, 0, 2.3]}>
        <mesh geometry={geo.facade} material={mats.stone} position={[0, 35.5, -1.5]} castShadow receiveShadow />
        {[0, 1, 2, 3].map((row) => (
          <group key={row} position={[0, 19 + row * 8.4, 0]}>
            {Array.from({ length: 9 }, (_, i) => {
              const x = -50 + i * 12.5;
              return (
                <group key={i} position={[x, 0, 0]}>
                  <mesh geometry={geo.facadeWindow} material={mats.niche} position={[0, 0, 0.25]} />
                  <mesh material={mats.jali} position={[0, 3.3, 0.34]}><planeGeometry args={[4.7, 4.5]} /></mesh>
                  <mesh material={mats.stoneDark} position={[0, -0.55, 1.3]}><boxGeometry args={[7.2, 0.55, 3.2]} /></mesh>
                  <mesh material={mats.stone} position={[-3.1, -1.25, 1.6]}><boxGeometry args={[0.45, 1.5, 0.45]} /></mesh>
                  <mesh material={mats.stone} position={[3.1, -1.25, 1.6]}><boxGeometry args={[0.45, 1.5, 0.45]} /></mesh>
                </group>
              );
            })}
            <mesh material={mats.stoneDark} position={[0, -1.1, 0.15]}><boxGeometry args={[117, 0.7, 4.8]} /></mesh>
          </group>
        ))}
        <mesh material={mats.stoneDark} position={[0, 53.4, 0]}><boxGeometry args={[120, 1.4, 6]} /></mesh>
        {Array.from({ length: 23 }, (_, i) => (
          <mesh key={i} material={mats.stoneDark} position={[-57.5 + i * 5.2, 54.8, 0]}>
            <boxGeometry args={[2.3, 2.2, 4.5]} />
          </mesh>
        ))}
      </group>
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
      <mesh material={mats.stoneDark} position={[0, 0.13, -D / 2]} receiveShadow>
        <boxGeometry args={[16, 0.2, D - WT * 2]} />
      </mesh>
      {pilasters.map(({ x, z }) => (
        <group key={`${x}:${z}`} position={[x, 0, z]}>
          <mesh material={mats.stoneDark} position={[0, WH / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.9, WH - 2.6, 0.9]} />
          </mesh>
          <mesh material={mats.stone} position={[0, 0.8, 0]}><boxGeometry args={[1.7, 1.6, 1.7]} /></mesh>
          <mesh material={mats.stone} position={[0, WH - 1, 0]}><boxGeometry args={[1.7, 1.5, 1.7]} /></mesh>
        </group>
      ))}
      {niches.map((n, i) => (
        <group key={i} position={[n.x, 0.6, n.z]} rotation={[0, n.ry, 0]}>
          <mesh geometry={geo.nicheFrame} material={mats.stoneDark} position={[0, 0, 0.01]} />
          <mesh geometry={geo.nicheArch} material={i % 4 === 1 ? mats.windowGlow : mats.niche} position={[0, 0.5, 0.03]} />
          {i % 4 === 1 && <mesh geometry={geo.nicheArch} material={mats.jali} position={[0, 0.5, 0.06]} />}
        </group>
      ))}

      {/* Interconnected gallery, horizon room, open courtyard and instrument chamber. */}
      {[ -34, -62, -90 ].map((z) => (
        <group key={`room-portal-${z}`}>
          <mesh geometry={geo.roomPortal} material={mats.stone} position={[0, 0, z]} castShadow receiveShadow />
          <mesh material={mats.stoneDark} position={[0, 22.4, z - 0.1]}><boxGeometry args={[56, 0.65, 3]} /></mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} material={mats.stoneDark} position={[side * 25, 11, z - 0.15]}>
              <boxGeometry args={[2, 22, 3]} />
            </mesh>
          ))}
        </group>
      ))}
      {[-1, 1].map((side) => (
        <mesh key={`inner-wall-${side}`} geometry={geo.roomSide} material={mats.stone} position={[side * 27, 11, -64]} castShadow receiveShadow />
      ))}
      {[-9, -20, -31, -40, -51, -94, -106, -117].map((z) => (
        <mesh key={`vault-rib-${z}`} geometry={geo.vaultRib} material={mats.stoneDark} position={[0, 0, z]} castShadow />
      ))}
      {/* Jharokha gallery balconies look into the connecting passage. */}
      {[-1, 1].map((side) => [-13, -25].map((z) => (
        <group key={`gallery-jharokha-${side}-${z}`} position={[side * 24.7, 12, z]}>
          <mesh material={mats.stoneDark} position={[side * 1.2, 0, 0]}><boxGeometry args={[4, 0.65, 7]} /></mesh>
          <mesh material={mats.jali} position={[side * 1.4, 2.2, 0]} rotation={[0, side * Math.PI / 2, 0]}><planeGeometry args={[6, 3.8]} /></mesh>
          <mesh material={mats.stone} position={[side * 1.3, 4.2, 0]}><boxGeometry args={[3.7, 0.45, 7.4]} /></mesh>
        </group>
      )))}
      {/* A horizon aperture and a floor compass make this a distinct sky-observation room. */}
      <group position={[0, 0, -49]}>
        {[-1, 1].map((side) => (
          <group key={`horizon-window-${side}`} position={[side * 25.7, 5, 0]} rotation={[0, side * Math.PI / 2, 0]}>
            <mesh geometry={geo.vaultArch} material={mats.stoneDark} />
            <mesh geometry={geo.vaultWindow} material={mats.windowGlow} position={[0, 1, 0.04]} />
          </group>
        ))}
        {[5, 8, 11].map((radius) => (
          <mesh key={radius} material={mats.brass} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.11, 0]}>
            <torusGeometry args={[radius, 0.08, 5, 72]} />
          </mesh>
        ))}
        <mesh material={mats.brass} position={[0, 0.2, 0]}><cylinderGeometry args={[0.55, 0.55, 0.18, 16]} /></mesh>
      </group>
      {/* The analysis courtyard remains open to the sky, with a low central sundial plinth. */}
      <group position={[0, 0, -76]}>
        <mesh material={mats.stoneDark} position={[0, 0.35, 0]}><cylinderGeometry args={[5.5, 6.3, 0.7, 12]} /></mesh>
        <mesh material={mats.brass} position={[0, 1.5, 0]}><coneGeometry args={[0.55, 2.4, 6]} /></mesh>
      </group>

      {/* The rear arch continues into a paved walk and an open lookout terrace. */}
      <mesh geometry={geo.rearWalk} material={mats.stone} position={[0, 0.15, -178]} receiveShadow />
      <mesh geometry={geo.lookout} material={mats.stone} position={[0, 0.45, -250]} receiveShadow />
      {[-220, -223, -226].map((z, i) => (
        <mesh key={z} material={mats.stoneDark} position={[0, 0.58 + i * 0.18, z]}>
          <boxGeometry args={[24, 0.36, 3.2]} />
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <group key={side}>
          {Array.from({ length: 7 }, (_, i) => -232 - i * 6).map((z) => (
            <mesh key={z} geometry={geo.baluster} material={mats.stoneDark} position={[side * 36, 2.1, z]} castShadow receiveShadow />
          ))}
          <mesh material={mats.stone} position={[side * 36, 3.2, -250]}><boxGeometry args={[1.5, 0.45, 43]} /></mesh>
        </group>
      ))}
      {Array.from({ length: 11 }, (_, i) => -10 - i * 6).map((x) => (
        <mesh key={x} geometry={geo.baluster} material={mats.stoneDark} position={[x, 2.1, -274]} castShadow receiveShadow />
      ))}
      <mesh material={mats.stone} position={[0, 3.2, -274]}><boxGeometry args={[66, 0.45, 1.5]} /></mesh>
      {[-1, 1].map((side) => (
        <group key={`terrace-lamp-${side}`} position={[side * 30, 2.4, -232]}>
          <mesh material={mats.brass}><boxGeometry args={[0.35, 0.5, 0.35]} /></mesh>
          <mesh material={mats.lamp} position={[0, 0.55, 0]}><cylinderGeometry args={[0.2, 0.2, 0.5, 6]} /></mesh>
          <pointLight color="#ffbd78" intensity={18} distance={24} decay={2} />
        </group>
      ))}
      {/* A real enclosed evidence room sits beyond the courtyard's rear arch. */}
      <mesh material={mats.floor} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, -168]} receiveShadow>
        <planeGeometry args={[44, 72]} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={`vault-side-${side}`} geometry={geo.vaultSide} material={mats.stone} position={[side * 23, 10, -168]} castShadow receiveShadow />
      ))}
      <mesh geometry={geo.vaultPortal} material={mats.stone} position={[0, 0, -202]} castShadow receiveShadow />
      <mesh geometry={geo.vaultPortal} material={mats.stone} position={[0, 0, -132]} rotation={[0, Math.PI, 0]} castShadow receiveShadow />
      {[-1, 1].map((side) => (
        <group key={`archive-shelves-${side}`} position={[side * 18.5, 0, -168]}>
          {[-26, -12, 2, 16, 28].map((z) => (
            <group key={z} position={[0, 0, z]}>
              <mesh material={mats.stoneDark} position={[0, 8, 0]}><boxGeometry args={[5, 16, 1.3]} /></mesh>
              {[3, 7, 11, 15].map((y) => (
                <mesh key={y} material={mats.stone} position={[0, y, 0.9]}><boxGeometry args={[5.8, 0.35, 2.1]} /></mesh>
              ))}
              {[4.2, 8.1, 12.1].map((y, i) => (
                <mesh key={y} material={i % 2 ? mats.brass : mats.dome} position={[-0.8 + i * 0.8, y, 1.5]} rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.42, 0.42, 1.2, 8]} />
                </mesh>
              ))}
            </group>
          ))}
        </group>
      ))}
      {[-1, 1].map((side) => (
        <group key={`archive-end-shelf-${side}`} position={[side * 15, 0, -195]}>
          <mesh material={mats.stoneDark} position={[0, 7, 0]}><boxGeometry args={[10, 14, 1.5]} /></mesh>
          {[2, 5, 8, 11].map((y) => (
            <mesh key={y} material={mats.stone} position={[0, y, 1]}><boxGeometry args={[11, 0.4, 2.4]} /></mesh>
          ))}
          {[-3.5, 0, 3.5].map((x, i) => (
            <mesh key={x} material={i % 2 ? mats.brass : mats.dome} position={[x, 3.5, 1.7]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.5, 0.5, 1.4, 8]} />
            </mesh>
          ))}
        </group>
      ))}
      <group position={[0, 0, -177]}>
        <mesh material={mats.stoneDark} position={[0, 1.5, 0]}><boxGeometry args={[13, 1.1, 6]} /></mesh>
        {[-5, 5].map((x) => (
          <mesh key={x} material={mats.stone} position={[x, 0.65, 0]}><boxGeometry args={[0.8, 1.3, 0.8]} /></mesh>
        ))}
        {[-3, 0, 3].map((x, i) => (
          <mesh key={x} material={i % 2 ? mats.brass : mats.dome} position={[x, 2.2, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.52, 0.52, 1.8, 8]} />
          </mesh>
        ))}
      </group>
      {[-19, -11, -3, 5, 13, 21].map((x) => (
        <group key={`archive-lantern-${x}`} position={[x, 15, -168]}>
          <mesh material={mats.brass}><cylinderGeometry args={[0.12, 0.12, 1.1, 6]} /></mesh>
          <pointLight color="#ffca85" intensity={12} distance={14} decay={2} />
        </group>
      ))}
      <group position={[0, 0, -400]}>
        <mesh material={mats.stoneDark} position={[-68, 8, 0]}><boxGeometry args={[26, 16, 20]} /></mesh>
        <mesh material={mats.dome} position={[-68, 18, 0]}><sphereGeometry args={[10, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
        <mesh material={mats.stoneDark} position={[-24, 5, -12]}><boxGeometry args={[18, 10, 16]} /></mesh>
        <mesh material={mats.stoneDark} position={[28, 7, -6]}><boxGeometry args={[24, 14, 18]} /></mesh>
        <mesh material={mats.dome} position={[28, 16, -6]}><sphereGeometry args={[8, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
        <mesh material={mats.stoneDark} position={[72, 6, -18]}><boxGeometry args={[30, 12, 20]} /></mesh>
      </group>

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
