"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { SceneKey } from "./choreography";
import { HERITAGE_DISCOVERIES } from "./discoveries";

const DESTINATIONS = [
  { label: "Observatory", description: "new analysis", href: "/analysis/new", x: 72, y: 30, depth: 0.6 },
  { label: "Atlas", description: "historical site atlas", href: "/atlas", x: 86, y: 39, depth: 0.9 },
  { label: "Sky", description: "sky explorer", href: "/sky", x: 66, y: 49, depth: 0.5 },
  { label: "Archive", description: "documentation and sources", href: "/documentation", x: 84, y: 58, depth: 0.7 },
  { label: "Chronicle", description: "workflow comparison", href: "/compare", x: 68, y: 68, depth: 0.4 },
  { label: "Workshop", description: "dataset feasibility", href: "/feasibility", x: 89, y: 76, depth: 0.8 },
] as const;

const MOTES = Array.from({ length: 12 }, (_, i) => ({
  x: 8 + ((i * 37 + 13) % 84),
  y: 9 + ((i * 53 + 21) % 78),
  phase: i * 1.73,
  depth: 0.2 + ((i * 17) % 7) / 10,
  size: 2 + ((i * 11) % 4),
}));

/** Dusk fireflies with threshold route links and room-specific, sourced discoveries. */
export function FireflyNavigation({ room }: { room?: SceneKey }) {
  const root = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const triggerButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const lights = useRef<(HTMLElement | null)[]>([]);
  const pointer = useRef({ x: 0, y: 0 });
  const raf = useRef<number | null>(null);
  const [openDiscovery, setOpenDiscovery] = useState<string | null>(null);
  const cardId = useId();
  const destinations = DESTINATIONS;
  const discoveries = room
    ? HERITAGE_DISCOVERIES.filter((discovery) => discovery.room === room)
    : HERITAGE_DISCOVERIES;

  useEffect(() => {
    if (!room || !openDiscovery) return;
    const discovery = HERITAGE_DISCOVERIES.find((item) => item.id === openDiscovery);
    if (discovery && discovery.room !== room) setOpenDiscovery(null);
  }, [room, openDiscovery]);

  useEffect(() => {
    if (!openDiscovery) return;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpenDiscovery(null);
      triggerButtons.current[openDiscovery]?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openDiscovery]);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const shouldReduce = () => reduced.matches || document.documentElement.dataset.motion === "reduced";
    let visible = true;
    let time = 0;
    let last = 0;

    const paint = (now: number) => {
      raf.current = null;
      if (!visible || document.hidden || shouldReduce()) return;
      if (now - last >= 32) {
        time = now / 1000;
        last = now;
        lights.current.forEach((node, i) => {
          if (!node) return;
          const mote = i < MOTES.length ? MOTES[i] : destinations[i - MOTES.length];
          if (!mote) return;
          const depth = mote.depth;
          const phase = "phase" in mote ? mote.phase : i * 1.73;
          const swayX = Math.sin(time * (0.18 + depth * 0.13) + phase) * (i < MOTES.length ? 8 : 3);
          const swayY = Math.cos(time * (0.15 + depth * 0.11) + phase) * (i < MOTES.length ? 6 : 2);
          const parallax = i < MOTES.length ? 4 : 2;
          const offsetX = swayX + pointer.current.x * depth * parallax;
          const offsetY = swayY + pointer.current.y * depth * parallax;
          node.style.translate = i < MOTES.length
            ? `${offsetX}px ${offsetY}px`
            : `calc(-50% + ${offsetX}px) calc(-50% + ${offsetY}px)`;
        });
      }
      raf.current = requestAnimationFrame(paint);
    };
    const start = () => {
      if (raf.current === null && visible && !document.hidden && !shouldReduce()) raf.current = requestAnimationFrame(paint);
    };
    const stop = () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
    };
    const onVisibility = () => document.hidden ? stop() : start();
    const onMotion = () => shouldReduce() ? stop() : start();
    const preferenceObserver = new MutationObserver(onMotion);
    preferenceObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    const onPointer = (event: PointerEvent) => {
      pointer.current.x = event.clientX / Math.max(window.innerWidth, 1) * 2 - 1;
      pointer.current.y = event.clientY / Math.max(window.innerHeight, 1) * 2 - 1;
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      visible ? start() : stop();
    });
    observer.observe(el);
    el.addEventListener("pointermove", onPointer, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    reduced.addEventListener("change", onMotion);
    start();
    return () => {
      stop();
      observer.disconnect();
      preferenceObserver.disconnect();
      el.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVisibility);
      reduced.removeEventListener("change", onMotion);
    };
  }, [destinations]);

  return (
    <div ref={root} className="firefly-field" aria-label="Dusk firefly destinations">
      <div aria-hidden className="firefly-motes">
        {MOTES.map((mote, i) => (
          <span key={i} ref={(node) => { lights.current[i] = node; }} className="firefly-mote"
            style={{ left: `${mote.x}%`, top: `${mote.y}%`, width: mote.size, height: mote.size, opacity: 0.35 + (i % 4) * 0.12 }} />
        ))}
      </div>
      {(!room || room === "threshold") && (
        <nav aria-label="Explore by firefly" className="firefly-destinations">
          {destinations.map((destination, i) => (
            <Link key={destination.label} href={destination.href}
              className={`firefly-destination firefly-destination-${i + 1}`}
              style={{ left: `${destination.x}%`, top: `${destination.y}%` }}
              ref={(node) => { lights.current[MOTES.length + i] = node; }}
              aria-label={`${destination.label}: open ${destination.description}`}>
              <span aria-hidden className="firefly-core" />
              <span className="firefly-label">{destination.label}</span>
            </Link>
          ))}
        </nav>
      )}
      <div className="firefly-discoveries" role="group" aria-label="Heritage discoveries">
        {discoveries.map((discovery, i) => (
          <button
            key={discovery.id}
            ref={(node) => { triggerButtons.current[discovery.id] = node; }}
            type="button"
            className={`firefly-discovery firefly-discovery-${i + 1}`}
            style={{ left: `${46 + (i % 2) * 8}%`, top: `${25 + i * 9}%` }}
            aria-label={`Discover: ${discovery.title}`}
            aria-haspopup="dialog"
            aria-expanded={openDiscovery === discovery.id}
            aria-controls={openDiscovery === discovery.id ? cardId : undefined}
            onClick={(event) => {
              event.stopPropagation();
              setOpenDiscovery((current) => current === discovery.id ? null : discovery.id);
            }}
          >
            <span aria-hidden className="firefly-discovery-core" />
            <span className="firefly-discovery-hint">Discover</span>
          </button>
        ))}
      </div>
      {openDiscovery && (() => {
        const discovery = HERITAGE_DISCOVERIES.find((item) => item.id === openDiscovery);
        if (!discovery) return null;
        const external = discovery.sourceUrl.startsWith("https://");
        return (
          <aside
            id={cardId}
            className="firefly-card"
            role="dialog"
            aria-label={`${discovery.category}: ${discovery.title}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="firefly-card-heading">
              <span aria-hidden className="firefly-card-spark" />
              <p className="firefly-card-category">{discovery.category}</p>
              <button
                ref={closeButton}
                type="button"
                className="firefly-card-close"
                aria-label="Close discovery"
                onClick={() => {
                  setOpenDiscovery(null);
                  triggerButtons.current[openDiscovery]?.focus();
                }}
              >
                ×
              </button>
            </div>
            <h2 className="firefly-card-title">{discovery.title}</h2>
            <p className="firefly-card-fact">{discovery.fact}</p>
            <a className="firefly-card-source" href={discovery.sourceUrl} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}>
              Source: {discovery.source}{external && <span className="sr-only"> (opens in a new tab)</span>}
            </a>
            <p className="firefly-card-note">Architectural inspiration only; the scene depicts no real monument.</p>
          </aside>
        );
      })()}
      {(!room || room === "threshold") && <p className="firefly-caption">Follow a light to explore</p>}
    </div>
  );
}
