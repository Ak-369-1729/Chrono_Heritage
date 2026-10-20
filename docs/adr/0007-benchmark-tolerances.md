# ADR 0007 — Frozen benchmark tolerances

**Status:** proposed tolerances frozen; **domain review pending** · **Date:** 2026-10-18

Tolerances from PRD §12.4 (modern 0.10°, historical 0.25°, synthetic horizon 0.10°, wraparound 1e−9°, reproducibility
bitwise) were frozen in `suite_v1/suite.json` before any candidate output was inspected. The SHA-256 of tolerances +
case inputs is stored; editing the file makes the API refuse to run (409) until a new suite version is created. A
reviewer's approval of the tolerances is a separate, audited gate condition.
