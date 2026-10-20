# ADR 0004 — Chronology representation and sampling

**Status:** accepted · **Date:** 2026-10-18

* Astronomical year numbering (0 = 1 BCE); calendar basis recorded separately (Julian / proleptic Gregorian).
* Chronology = sourced interval + model. `uniform` when only bounds are known; `normal` (truncated to the interval)
  only with a sourced central value and σ. No midpoint substitution anywhere.
* Prediction grid of whole years (≤ 25 points) with measured interpolation error; Monte Carlo samples are interpolated.
* A date inferred from the alignment under test is never stored or reused as evidence.
