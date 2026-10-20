"use client";

import { useMemo } from "react";
import * as THREE from "three";

/** Rolling dunes that flatten into a plateau under the fortress. Height field is analytic (no assets). */
export function duneHeight(x: number, z: number): number {
  const d = Math.hypot(x, z + 64);
  const plateau = THREE.MathUtils.smoothstep(d, 110, 230); // 0 near the fortress, 1 far away
  const h =
    6.5 * Math.sin(x * 0.011 + z * 0.006) * Math.cos(z * 0.009 - x * 0.003) +
    3.2 * Math.sin(x * 0.027 - z * 0.019 + 1.3) +
    1.4 * Math.sin(x * 0.061 + z * 0.047);
  return -1.2 + plateau * (h + 3);
}

export function Desert({ segments }: { segments: number }) {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(4200, 4200, segments, segments);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setY(i, duneHeight(pos.getX(i), pos.getZ(i)));
    g.computeVertexNormals();
    return g;
  }, [segments]);
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial color="#5b4a3d" roughness={1} metalness={0} />
    </mesh>
  );
}
