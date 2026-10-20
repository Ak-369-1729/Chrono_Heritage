# ADR 0001 — Orientation conventions and raw/transformed values

**Status:** accepted · **Date:** 2026-10-18

## Context
Orientation data arrive with different north references (true, astronomical, magnetic, grid, unspecified), units and
axis semantics. Silent assumptions (e.g. "probably true north", "zero error") are the commonest source of spurious
alignments (PRD §12 table, FR-04, FR-27).

## Decision
* Store the **raw** bearing, unit, north reference, axis mode, method and uncertainty (or a documented reason it is
  unavailable) immutably. New measurements supersede old ones; nothing is overwritten.
* Convert to true azimuth only through explicit, recorded steps: magnetic needs a sourced declination
  (`true = magnetic + declination`, east positive); grid needs a projected CRS, from which PROJ's meridian
  convergence is computed (`true = grid + γ`). Unspecified north **blocks** analysis.
* Axis mode (`directed` / `bidirectional`) is stored, never inferred. Bidirectional residuals are modulo 180° and
  analyses disclose that both ends were evaluated.
* Uncertainties combine in quadrature (measurement ⊕ declination). A missing value stays missing.

## Consequences
Some records cannot be analysed until a steward completes them; the UI shows exactly why. Analyses display raw,
transformed and used values side by side.
