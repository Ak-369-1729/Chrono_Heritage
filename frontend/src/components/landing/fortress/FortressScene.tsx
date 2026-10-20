"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Component, Suspense, useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from "react";
import * as THREE from "three";
import { cameraAt, ramp, SCENES } from "../choreography";
import { Desert } from "./Desert";
import { Fortress } from "./Fortress";
import { SightLines } from "./Lines";
import { NightSky } from "./Sky";

export type Quality = "high" | "lite";

class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Scroll-scrubbed camera with a small, damped pointer parallax in the opening scene only. */
function Rig({ progress, parallax }: { progress: MutableRefObject<number>; parallax: boolean }) {
  const { camera } = useThree();
  const pointer = useRef({ x: 0, y: 0 });
  const look = useMemo(() => new THREE.Vector3(), []);
  const offset = useRef(new THREE.Vector2());
  useEffect(() => {
    if (!parallax) return;
    const on = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", on, { passive: true });
    return () => window.removeEventListener("pointermove", on);
  }, [parallax]);
  useFrame((_, dt) => {
    const p = progress.current;
    const { pos, look: l } = cameraAt(p);
    const strength = parallax ? 1 - ramp(p, 0.04, SCENES.threshold[1]) : 0;
    const k = 1 - Math.exp(-dt * 3);
    offset.current.x += (pointer.current.x * 3 * strength - offset.current.x) * k;
    offset.current.y += (-pointer.current.y * 1.2 * strength - offset.current.y) * k;
    camera.position.set(pos[0] + offset.current.x, pos[1] + offset.current.y, pos[2]);
    look.set(l[0], l[1], l[2]);
    camera.lookAt(look);
  });
  return null;
}

/**
 * Watches the real frame rate. When two consecutive 3-second windows average below ``minFps`` the scene asks to be
 * replaced by the lighter layered renderer, so a slow device never ends up with a stuttering page.
 */
function FrameMonitor({ minFps, onSlow }: { minFps: number; onSlow: (fps: number) => void }) {
  const st = useRef({ t0: -1, frames: 0, slow: 0, done: false, warm: 0 });
  useFrame(({ clock }, delta) => {
    const s = st.current;
    if (s.done) return;
    const t = clock.getElapsedTime();
    if (delta > 0.75) {
      // rendering was paused (journey off screen or tab hidden): start a fresh window instead of counting the gap
      s.t0 = t;
      s.frames = 0;
      return;
    }
    if (s.warm === 0) s.warm = t + 2; // ignore shader compilation and first uploads
    if (t < s.warm) return;
    if (s.t0 < 0) s.t0 = t;
    s.frames++;
    if (t - s.t0 >= 3) {
      const fps = s.frames / (t - s.t0);
      s.slow = fps < minFps ? s.slow + 1 : 0;
      s.t0 = t;
      s.frames = 0;
      if (s.slow >= 2) {
        s.done = true;
        onSlow(fps);
      }
    }
  });
  return null;
}

/**
 * The 3D fortress-observatory. Rendering pauses when the journey is off screen (``active``), and a lost WebGL
 * context hands over to the layered 2D renderer through ``onFail``.
 */
export default function FortressScene({ progress, labels, quality, active, onFail, onReady, onSlow }: {
  progress: MutableRefObject<number>;
  labels: MutableRefObject<(HTMLElement | null)[]>;
  quality: Quality;
  active: boolean;
  onFail: () => void;
  onReady: () => void;
  /** Called when the device cannot keep up; omitted when the visitor explicitly asked for 3D. */
  onSlow?: (fps: number) => void;
}) {
  const high = quality === "high";
  return (
    <SceneBoundary onError={onFail}>
      <Canvas
        aria-hidden
        className="!absolute inset-0"
        shadows={high}
        frameloop={active ? "always" : "never"}
        dpr={high ? [1, 1.6] : [1, 1]}
        camera={{ fov: 38, near: 0.5, far: 6000, position: [42, 5.5, 340] }}
        gl={{ antialias: high, powerPreference: high ? "high-performance" : "low-power", alpha: false }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.15;
          gl.domElement.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            onFail();
          });
          onReady();
        }}
      >
        <color attach="background" args={["#3a3040"]} />
        <fogExp2 attach="fog" args={["#5b4148", 0.0011]} />
        <Suspense fallback={null}>
          <NightSky progress={progress} count={high ? 2400 : 800} />
          {/* Low western light warms the stone; the indigo hemisphere retains shadow detail. */}
          <hemisphereLight args={["#b57f83", "#382b31", 1.05]} />
          <directionalLight
            position={[160, 90, 120]}
            intensity={1.35}
            color="#ffd09a"
            castShadow={high}
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
            shadow-camera-left={-240}
            shadow-camera-right={240}
            shadow-camera-top={240}
            shadow-camera-bottom={-240}
            shadow-bias={-0.0002}
          />
          <ambientLight intensity={0.12} color="#9d8495" />
          <Desert segments={high ? 200 : 90} />
          <Fortress high={high} />
          <SightLines progress={progress} labels={labels} />
          <Rig progress={progress} parallax={high} />
          {onSlow && <FrameMonitor minFps={15} onSlow={onSlow} />}
        </Suspense>
      </Canvas>
    </SceneBoundary>
  );
}
