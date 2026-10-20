# ADR 0006 — Statistics, null models and the Tier 2 gate

**Status:** accepted · **Date:** 2026-10-18

* Tier 1 (single site): Monte Carlo propagation only; descriptive within-window shares; **no p-values**.
* Tier 2 (cross-site): null comparison with empirical-reference (von Mises-smoothed resampling by stratum),
  sector-uniform, or uniform-circular nulls. Uniform is never default and requires a written justification
  (≥ 80 characters) and is flagged. p = (k+1)/(N+1); effect size and observed-statistic interval always reported.
  Families of tests require Holm, BH or max-statistic correction.
* The `/analyses/cross-site` endpoint and cross-site reports check the gate **on the server** from current records:
  ≥ 15 reviewed, qualified, non-illustrative sites; compatibility ≥ 0.85; no critical blocker; benchmark gate passed;
  null-model and domain-review sign-offs. Sign-offs can satisfy only review conditions.
