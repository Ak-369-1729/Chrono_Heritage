# ADR 0008 — Machine learning omitted from v2.0

**Status:** accepted · **Date:** 2026-10-18

No expert-reviewed label set exists, so per PRD §13.4 and kill criterion K-06 ML is omitted: no tables, endpoints or
UI. The ML gate is reported as "omitted". Revisiting requires reviewed labels, site/region-leakage-safe splits,
held-out evaluation against a transparent baseline, calibration review and a model card.
