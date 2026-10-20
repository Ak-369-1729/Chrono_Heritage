# ADR 0013: The "Astronomical Fortress" visual language and three landing renderers

**Status:** accepted. **Date:** 2026-10-18.

## Context
The V3 brief asks for a continuous, immersive entrance inspired by Rajasthani forts and observatories, using an
original design that never implies a fictional structure is a real monument. Every page must share one design
system, and the application must stay usable with reduced motion, without WebGL and on low-power phones.

## Decision
* **Palette and meaning.** The tokens are obsidian, indigo, sandstone, brass, ivory, oxidized copper, evidence blue
  and terracotta. Colour always carries the same meaning:
  * brass: measured or historical reference
  * blue: predicted
  * terracotta: uncertainty or blocked
  * copper: verified
  The older token names are kept as aliases, so every component inherited the palette at once. Status is never
  shown by colour alone: there is always a glyph shape and text as well.
* **Motifs** are generated, not copied: a cusped (multifoil) pointed arch, an engraved instrument scale used as the
  chamber divider, an eight-point jali lattice used sparingly as texture, and a chhatri mark. Each route opens with
  the same chamber header.
* **Landing renderers.** All three share one choreography module (`landing/choreography.ts`, unit-tested):
  1. **3D:** R3F/three on screens at least 768 px wide with WebGL, in a lighter quality on devices with four or
     fewer cores or 4 GB or less of memory. It shows the desert, the fortress, the gateway, the courtyard, the
     instrument and the vault.
  2. **Layered 2D:** an SVG composition whose layers are moved by scroll. It is used on screens narrower than
     768 px, without WebGL, after WebGL context loss, or when the visitor chooses it. The gate opening is an SVG mask that reveals the
     courtyard behind it.
  3. **Still images:** used for reduced motion or by the visitor's choice. They are the 2D renderer drawn at fixed
     progress values.
* **Real data in the story.** Scene C shows a live engine calculation: June-solstice sunrise azimuth from 3000 BCE
  to 2000 CE for an illustrative observer. Scene E reads the live evidence gates, benchmark ledger and site counts.
  Failures are shown as unavailable, never filled with invented numbers. The brass reference line in scene F is
  explicitly illustrative.
* **Never trap the visitor.**
  * The journey is a normal scrolling page with a sticky viewport.
  * A "Skip the introduction" link and a scene index are always present.
  * The primary actions are visible on arrival.
  * In-page links replace the hash instead of pushing it, so Back and Forward keep working.

## Consequences
* The landing page ships three code paths. The 3D chunk is loaded only when the 3D renderer is chosen.
* Frame rate can only be measured with software WebGL in CI. Real-GPU measurements remain an open item (see
  PERFORMANCE.md).
