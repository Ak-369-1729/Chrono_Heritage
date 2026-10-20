# ADR 0010 — Web delivery, 3D assets and the map

**Status:** accepted · **Date:** 2026-10-18

* The landing scene is an **original procedural sanctuary** (terraced platform, porch, stepped tower, corner shrines,
  gateway) with a canvas-generated masonry texture, drei's Preetham sky and procedural ridges. No external models or
  textures, so nothing to license and nothing to download at runtime. It depicts no real building.
* 3D is lazy-loaded (`next/dynamic`, ~246 KB gz) and only when WebGL exists; `prefers-reduced-motion`, missing WebGL,
  context loss or a user choice switch to still SVG illustrations with the same narrative. Low-power devices get a
  lite mode (no shadows, no dust, DPR 1). Rendering pauses off-screen.
* GSAP ScrollTrigger scrubs a single progress value; overlays are updated imperatively (no React re-render per frame).
* The map uses MapLibre with Natural Earth land from `world-atlas` and no tile server; MapLibre's module worker is
  copied to `public/vendor` at install/build. The site list is the accessible primary interface.
* The browser talks only to the Next.js origin; `/api/*` is a runtime proxy so the backend URL is never baked in.
