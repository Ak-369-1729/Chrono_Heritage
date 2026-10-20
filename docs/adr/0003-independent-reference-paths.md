# ADR 0003 — Independent benchmark references

**Status:** accepted · **Date:** 2026-10-18

## Decision
* **Modern cases:** JPL Horizons API, airless apparent topocentric az/el at TT instants (`QUANTITIES=4`,
  `APPARENT=AIRLESS`). Request parameters, retrieval time, API version and a response SHA-256 are logged; only numeric
  extracts are stored. An unreachable service makes the case **blocked**. A previously logged retrieval with identical
  parameters may be reused and is labelled as such. Astropy values are shown as a supplementary cross-check only.
* **Historical cases:** two paths must both agree with the candidate:
  * Path A — Astropy/ERFA with the built-in analytic ephemeris (`epv00`), solstice by bisection on apparent ecliptic
    longitude, declination in TETE. *Shares IAU 2006/2000A precession–nutation with Skyfield.*
  * Path B — Laskar (1986) mean obliquity + 4-term nutation in obliquity, declination = true obliquity at the solstice.
    *Independent ephemeris and precession.*
  Both paths share the closed-form azimuth relation, Bennett refraction and limb definition (disclosed in every record).
* **Published case:** blocked until a data steward loads a source pack. Values are never entered from memory.

## Consequences
The Phase 0.5 gate cannot pass in an offline environment, by design.
