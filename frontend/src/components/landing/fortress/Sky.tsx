"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { dawnGlow, poleDir, skyRotation } from "../choreography";

/**
 * Night sky: a gradient dome with a faint pre-dawn glow toward the fortress axis, and a decorative star field of
 * varied brightness that turns about the celestial pole (tilted for the scene latitude). The star positions are
 * random; they are NOT a real constellation map.
 */

const domeVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const domeFrag = /* glsl */ `
uniform vec3 uGlowDir;
uniform float uGlow;
varying vec3 vDir;
void main() {
  float h = clamp(vDir.y, -0.2, 1.0);
  vec3 zenith = vec3(0.020, 0.028, 0.050);
  vec3 mid = vec3(0.050, 0.070, 0.125);
  vec3 horizon = vec3(0.130, 0.120, 0.160);
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, h));
  col = mix(col, zenith, smoothstep(0.22, 0.9, h));
  float g = max(dot(normalize(vec3(vDir.x, 0.0, vDir.z)), uGlowDir), 0.0);
  float band = exp(-max(h, 0.0) * 9.0);
  col += vec3(0.42, 0.25, 0.14) * pow(g, 6.0) * band * uGlow;
  gl_FragColor = vec4(col, 1.0);
}`;

const starVert = /* glsl */ `
attribute float aSize;
attribute float aBright;
uniform float uPixelRatio;
varying float vBright;
void main() {
  vBright = aBright;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPixelRatio;
  gl_Position = projectionMatrix * mv;
}`;
const starFrag = /* glsl */ `
uniform float uFade;
varying float vBright;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.05, d);
  a = max(a * a, smoothstep(0.18, 0.0, d));
  gl_FragColor = vec4(vec3(0.93, 0.91, 0.85) * (0.55 + vBright * 0.6), a * vBright * uFade);
}`;

export function NightSky({ progress, count }: { progress: MutableRefObject<number>; count: number }) {
  const stars = useRef<THREE.Points>(null);
  const dome = useRef<THREE.ShaderMaterial>(null);
  const pole = useMemo(() => new THREE.Vector3(...poleDir()).normalize(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);

  const starGeo = useMemo(() => {
    let seed = 31;
    const r = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const bright = new Float32Array(count);
    const R = 2000;
    for (let i = 0; i < count; i++) {
      // uniform on the sphere
      const u = r() * 2 - 1;
      const t = r() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      pos.set([R * s * Math.cos(t), R * u, R * s * Math.sin(t)], i * 3);
      const b = r();
      bright[i] = 0.32 + Math.pow(b, 2.4) * 0.68; // many faint stars, few bright ones
      size[i] = 2.2 + Math.pow(b, 3) * 6.5;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aBright", new THREE.BufferAttribute(bright, 1));
    return g;
  }, [count]);

  const starMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: starVert, fragmentShader: starFrag, transparent: true, depthWrite: false,
    uniforms: { uPixelRatio: { value: 1 }, uFade: { value: 1 } }, fog: false,
  }), []);
  const domeUniforms = useMemo(() => ({ uGlowDir: { value: new THREE.Vector3(0, 0, -1) }, uGlow: { value: 0.4 } }), []);

  useFrame(({ gl }) => {
    const p = progress.current;
    starMat.uniforms.uPixelRatio.value = gl.getPixelRatio();
    // fade the stars a little where the pre-dawn glow brightens the sky, and as the journey ends
    starMat.uniforms.uFade.value = 1 - 0.25 * dawnGlow(p);
    q.setFromAxisAngle(pole, skyRotation(p));
    stars.current?.quaternion.copy(q);
    if (dome.current) dome.current.uniforms.uGlow.value = dawnGlow(p);
  });

  return (
    <>
      <mesh renderOrder={-2}>
        <sphereGeometry args={[2600, 32, 16]} />
        <shaderMaterial ref={dome} vertexShader={domeVert} fragmentShader={domeFrag} uniforms={domeUniforms} side={THREE.BackSide} depthWrite={false} fog={false} />
      </mesh>
      <points ref={stars} geometry={starGeo} material={starMat} renderOrder={-1} frustumCulled={false} />
    </>
  );
}
