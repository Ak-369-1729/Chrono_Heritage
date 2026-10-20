# ADR 0005 — Provenance completeness and convention compatibility (pre-registered)

**Status:** accepted (formula versions `prov-1.0.0`, `compat-1.0.0`) · **Date:** 2026-10-18

* **Provenance:** weighted presence of 15 fields; 9 are critical. Score = Σ w·present / Σ w. *Fully qualified ⇔ every
  critical field present*; the score alone never qualifies. Shown with the disclaimer that completeness ≠ truth.
* **Compatibility:** per pair, 7 fields resolve to matched (1.0) / convertible (0.85) / uncertain (0.5) /
  incompatible (0); weighted mean per pair; dataset score = mean of pairs; threshold 0.85 inclusive. North reference
  and axis semantics are critical: an incompatible critical field blocks pooling regardless of the mean.
* Formulas are versioned in code and embedded in every feasibility report; changing weights requires a new version.
