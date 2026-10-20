"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { earthTexture } from "./textures";

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
  const { geo, earth } = useMemo(() => {
    const g = new THREE.PlaneGeometry(4200, 4200, segments, segments);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const near = new THREE.Color("#c09a70");
    const far = new THREE.Color("#918797");
    const color = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = duneHeight(x, z);
      pos.setY(i, y);
      const distance = THREE.MathUtils.smoothstep(Math.hypot(x, z + 64), 100, 520);
      color.copy(near).lerp(far, distance * 0.48);
      const variation = 0.94 + 0.035 * Math.sin(x * 0.025 + z * 0.018) * Math.cos(z * 0.021 - x * 0.013);
      color.multiplyScalar(variation);
      colors.set([color.r, color.g, color.b], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    const texture = earthTexture(segments > 100 ? 256 : 128);
    return { geo: g, earth: texture };
  }, [segments]);

  const stones = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => {
        const t = i / 17;
        const z = 4 + t * 300;
        const x = Math.sin(i * 0.72) * (1.8 + t * 3.2);
        return {
          position: [x, duneHeight(x, z) + 0.2, z] as [number, number, number],
          rotation: (Math.sin(i * 1.31) * 0.08) as number,
          size: [2.8 + t * 15, 0.4, 1.8 + t * 3] as [number, number, number],
        };
      }),
    [],
  );
  const rocks = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => {
        const side = i % 2 === 0 ? -1 : 1;
        const x = side * (38 + ((i * 29) % 66));
        const z = 18 + ((i * 37) % 165);
        const size = 0.7 + ((i * 17) % 16) / 10;
        return {
          key: i,
          position: [x, duneHeight(x, z) + size * 0.34, z] as [number, number, number],
          scale: [size * 1.45, size * 0.72, size] as [number, number, number],
          rotation: [i * 0.31, i * 0.83, i * 0.17] as [number, number, number],
        };
      }),
    [],
  );

  return (
    <>
      <mesh geometry={geo} receiveShadow>
        <meshStandardMaterial map={earth} color="#ffffff" vertexColors roughness={1} metalness={0} />
      </mesh>
      <group>
        {stones.map((stone, i) => (
          <mesh key={i} position={stone.position} rotation={[0, stone.rotation, 0]} receiveShadow>
            <boxGeometry args={stone.size} />
            <meshStandardMaterial color={i % 4 === 0 ? "#c7a77d" : "#ad9272"} roughness={0.96} />
          </mesh>
        ))}
      </group>
      <group>
        {rocks.map((rock) => (
          <mesh key={rock.key} position={rock.position} scale={rock.scale} rotation={rock.rotation} castShadow receiveShadow>
            <icosahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color={rock.key % 3 === 0 ? "#81746d" : "#99826a"} roughness={1} />
          </mesh>
        ))}
      </group>
    </>
  );
}
