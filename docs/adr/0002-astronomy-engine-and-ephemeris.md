# ADR 0002 — Candidate astronomy engine: Skyfield + JPL DE406

**Status:** accepted · **Date:** 2026-10-18

## Context
Historical alignment work needs solar positions back to the third or fourth millennium BCE. Skyfield reads SPK
(`.bsp`) files; the long-span JPL ephemerides (DE406/DE422/DE441) were not downloadable from the build environment
(JPL/NAIF hosts blocked), but PyPI distributes DE406 and DE422 as raw Chebyshev coefficients (`de406`, MIT packaging).

## Decision
* Evaluate DE406 Chebyshev series in `app/science/astronomy/de406.py` and expose them as Skyfield `VectorFunction`
  segments, so every reduction (light time, aberration, deflection, IAU 2006/2000A precession–nutation, ΔT, topocentric
  parallax) is Skyfield's own. Verified against Skyfield's SPK reader on DE421: ≤ ~1 km, 5×10⁻⁷° in azimuth.
* Rise/set: root-find the airless altitude against `h_horizon − R(h_horizon) ∓ s` (Bennett refraction, limb definition),
  iterating with the horizon profile; solstice/equinox instants from apparent ecliptic longitude.
* Calculations are limited to whole years within the DE406 span (−2998…+2998); longer chronologies are refused,
  never truncated.

## Alternatives considered
DE422 (3× larger, higher accuracy) — preferable for production lunar work; adopting it is a drop-in change of data
directory (`CHRONO_DE406_DIR` pattern) plus a benchmark rerun. Astropy as the candidate — rejected so that Astropy can
serve as an independent reference path (ADR 0003).
