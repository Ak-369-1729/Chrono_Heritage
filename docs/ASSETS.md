# Assets, data and licences

| Item | Origin | Licence / status |
|---|---|---|
| Landing 3D fortress-observatory (walls, bastions, chhatris, cusped-arch gateway, jharokha, courtyard, gnomon instrument) | Original procedural geometry (`frontend/src/components/landing/fortress/Fortress.tsx`) | Project code. Inspired by Rajasthani forts and observatories in general; reproduces no real monument. |
| Sandstone, jali, engraved-floor and glow textures | Generated at runtime on a canvas (`fortress/textures.ts`) | Project code |
| Night sky dome and star field | Custom shaders (`fortress/Sky.tsx`); star positions are seeded random numbers | Project code. Decorative; not a constellation map. |
| Desert dunes | Analytic height field (`fortress/Desert.tsx`) | Project code |
| Layered 2D night scene (phones, no-WebGL, still images) | Hand-written SVG (`landing/NightLayers.tsx`) | Project code |
| Arch, scale-rule, chhatri mark and rosette motifs, favicon | Procedural SVG (`components/motifs.tsx`, `public/icon.svg`) | Project code |
| Sign-in doorway illustration | Procedural SVG (`components/auth/Threshold.tsx`) | Project code |
| World land outlines | Natural Earth 1:110m via `world-atlas` 2.0.2 | Natural Earth: public domain; package ISC |
| Map renderer | MapLibre GL JS 6.14 | BSD-3-Clause |
| Display font | Fraunces (via @fontsource-variable) | SIL Open Font License 1.1 |
| Interface font | IBM Plex Sans (via @fontsource) | SIL Open Font License 1.1 |
| PDF fonts | DejaVu Sans/Serif/Mono, bundled with `LICENSE-DejaVu.txt` | Bitstream Vera / public-domain derived licence |
| JPL DE406 ephemeris | `de406` 1997.1 on PyPI (coefficients from JPL; Standish 1998) | JPL data; packaging MIT |
| JPL Horizons outputs | Retrieved live by the benchmark suite only | Cite "NASA/JPL Horizons"; only numeric extracts and response hashes are stored |
| DE421 (tests only) | `skyfield-data` 7.0.0 | Used to cross-check the DE406 adapter |

## Demonstration dataset

`backend/app/seed.py` creates five **fictional** sites (Aster Hill, Corran, Vellam, Tessaly, Marl Ridge) with invented
coordinates, bearings, chronologies, horizon profiles and "sources". Every record and source is flagged
`is_illustrative`, every source citation begins "ILLUSTRATIVE SOURCE — fictional placeholder", the UI labels them, and
the API refuses to approve them as evidence. No real archaeological record has been entered.
