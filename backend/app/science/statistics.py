"""Cross-site Monte Carlo null comparison and multiple-testing control (PRD §13).

This module is pure and independently testable.  It is reachable from the API
only through the server-side tier gate (``app.services.gates``); the functions
themselves never decide whether a cross-site analysis is *permitted*.

Safeguards implemented here
---------------------------
* A uniform circular null is never a default.  ``uniform_circular`` requires a
  written justification and is flagged in the output.
* Null datasets preserve per-site axis semantics and strata.
* p-values use the finite-simulation estimator (k + 1) / (N + 1).
* Effect size (observed − null mean, standardised) and an interval for the
  observed statistic under measurement uncertainty are always reported.
* Families of tests are corrected (Holm, Benjamini–Hochberg, or a single-step
  max-statistic procedure using shared null simulations).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

import numpy as np

from .angles import AxisMode, residual

STATS_ALGORITHM_VERSION = "stats-1.0.0"
MIN_JUSTIFICATION_CHARS = 80


class NullModel(str, Enum):
    EMPIRICAL_REFERENCE = "empirical_reference"   # resample a declared reference population (vM-smoothed)
    SECTOR_UNIFORM = "sector_uniform"             # uniform within a documented architectural sector, per stratum
    UNIFORM_CIRCULAR = "uniform_circular"         # requires explicit justification; never default


class Statistic(str, Enum):
    COUNT_WITHIN = "count_within_window"
    MEAN_ABS_RESIDUAL = "mean_abs_residual"


@dataclass
class SiteInput:
    site_id: str
    stratum: str
    orientation_deg: float
    sigma_deg: float
    axis_mode: AxisMode
    predicted_deg: float          # pre-specified target direction for this site
    predicted_sigma_deg: float = 0.0


@dataclass
class NullSpec:
    model: NullModel
    justification: str
    reference_orientations: dict[str, list[float]] = field(default_factory=dict)  # stratum -> sample
    smoothing_kappa: float = 50.0
    sectors: dict[str, tuple[float, float]] = field(default_factory=dict)          # stratum -> (start, end)

    def validate(self, strata: set[str]) -> list[str]:
        problems = []
        if len(self.justification.strip()) < MIN_JUSTIFICATION_CHARS:
            problems.append(f"Null-model justification must be at least {MIN_JUSTIFICATION_CHARS} characters.")
        if self.model is NullModel.EMPIRICAL_REFERENCE:
            for s in strata:
                if len(self.reference_orientations.get(s, [])) < 10:
                    problems.append(f"Stratum '{s}' needs ≥10 reference orientations for an empirical null.")
        if self.model is NullModel.SECTOR_UNIFORM:
            for s in strata:
                if s not in self.sectors:
                    problems.append(f"Stratum '{s}' has no documented sector.")
        return problems


def _statistic(res: np.ndarray, stat: Statistic, window: float) -> np.ndarray:
    a = np.abs(res)
    if stat is Statistic.COUNT_WITHIN:
        return np.sum(a <= window, axis=-1).astype(float)
    return np.mean(a, axis=-1)


def _draw_null_orientations(rng, spec: NullSpec, sites: list[SiteInput], n: int) -> np.ndarray:
    out = np.empty((n, len(sites)))
    for j, s in enumerate(sites):
        if spec.model is NullModel.UNIFORM_CIRCULAR:
            out[:, j] = rng.uniform(0.0, 360.0, n)
        elif spec.model is NullModel.SECTOR_UNIFORM:
            a, b = spec.sectors[s.stratum]
            width = (b - a) % 360.0
            out[:, j] = np.mod(a + rng.uniform(0.0, width, n), 360.0)
        else:
            ref = np.asarray(spec.reference_orientations[s.stratum], dtype=float)
            base = ref[rng.integers(0, ref.size, n)]
            out[:, j] = np.mod(base + np.rad2deg(rng.vonmises(0.0, spec.smoothing_kappa, n)), 360.0)
    return out


def null_comparison(*, sites: list[SiteInput], spec: NullSpec, statistic: Statistic, window_deg: float,
                    n_null: int, n_uncertainty: int, seed: int) -> dict:
    problems = spec.validate({s.stratum for s in sites})
    if problems:
        raise ValueError("; ".join(problems))
    if len(sites) < 2:
        raise ValueError("Cross-site comparison needs at least two sites.")
    rng = np.random.Generator(np.random.PCG64(seed))
    pred = np.array([s.predicted_deg for s in sites])
    modes = [s.axis_mode for s in sites]

    def residuals(orients: np.ndarray, preds: np.ndarray) -> np.ndarray:
        cols = [residual(orients[..., j], preds[..., j], modes[j]) for j in range(len(sites))]
        return np.stack([np.asarray(c) for c in cols], axis=-1)

    # observed statistic under measurement uncertainty
    obs_or = np.array([s.orientation_deg for s in sites]) + rng.normal(0, 1, (n_uncertainty, len(sites))) * \
        np.array([s.sigma_deg for s in sites])
    obs_pred = pred + rng.normal(0, 1, (n_uncertainty, len(sites))) * np.array([s.predicted_sigma_deg for s in sites])
    obs_stats = _statistic(residuals(obs_or, obs_pred), statistic, window_deg)
    observed_point = float(_statistic(residuals(np.array([[s.orientation_deg for s in sites]]), pred[None, :]),
                                      statistic, window_deg)[0])

    null_or = _draw_null_orientations(rng, spec, sites, n_null)
    null_or = null_or + rng.normal(0, 1, null_or.shape) * np.array([s.sigma_deg for s in sites])
    null_stats = _statistic(residuals(null_or, np.broadcast_to(pred, null_or.shape)), statistic, window_deg)

    if statistic is Statistic.COUNT_WITHIN:
        k = int(np.sum(null_stats >= observed_point))   # more matches is "more extreme"
    else:
        k = int(np.sum(null_stats <= observed_point))   # smaller mean residual is "more extreme"
    p = (k + 1) / (n_null + 1)
    null_mean, null_sd = float(np.mean(null_stats)), float(np.std(null_stats, ddof=1))
    effect = observed_point - null_mean
    return {
        "algorithm_version": STATS_ALGORITHM_VERSION,
        "statistic": statistic.value,
        "window_deg": window_deg,
        "n_sites": len(sites),
        "observed": observed_point,
        "observed_interval_95": [float(np.quantile(obs_stats, 0.025)), float(np.quantile(obs_stats, 0.975))],
        "null_model": spec.model.value,
        "null_justification": spec.justification,
        "null_flagged": spec.model is NullModel.UNIFORM_CIRCULAR,
        "null_mean": null_mean,
        "null_sd": null_sd,
        "effect_size_raw": effect,
        "effect_size_standardised": effect / null_sd if null_sd > 0 else None,
        "p_value_mc": p,
        "p_value_estimator": "(k + 1) / (N + 1)",
        "n_null": n_null,
        "n_uncertainty": n_uncertainty,
        "seed": seed,
        "null_distribution_quantiles": {q: float(np.quantile(null_stats, q)) for q in (0.025, 0.5, 0.975)},
        "_null_stats": null_stats,  # stripped before persistence; used for max-statistic correction
    }


# ------------------------------------------------------------- corrections

def holm(pvalues: list[float]) -> list[float]:
    p = np.asarray(pvalues, dtype=float)
    m = p.size
    order = np.argsort(p)
    adj = np.empty(m)
    running = 0.0
    for rank, i in enumerate(order):
        running = max(running, (m - rank) * p[i])
        adj[i] = min(1.0, running)
    return adj.tolist()


def benjamini_hochberg(pvalues: list[float]) -> list[float]:
    p = np.asarray(pvalues, dtype=float)
    m = p.size
    order = np.argsort(p)[::-1]
    adj = np.empty(m)
    running = 1.0
    for idx, i in enumerate(order):
        rank = m - idx
        running = min(running, p[i] * m / rank)
        adj[i] = running
    return adj.tolist()


def max_statistic_adjusted(observed: list[float], null_matrix: np.ndarray, larger_is_extreme: bool = True) -> list[float]:
    """Single-step max-statistic (Westfall–Young) adjustment.

    ``null_matrix`` has shape (n_sim, n_tests) and must come from *shared*
    simulations so that the dependence between tests is preserved.  Statistics
    should be on comparable scales (e.g. standardised) before calling.
    """
    nm = np.asarray(null_matrix, dtype=float)
    obs = np.asarray(observed, dtype=float)
    if not larger_is_extreme:
        nm, obs = -nm, -obs
    maxima = nm.max(axis=1)
    n = maxima.size
    return [float((np.sum(maxima >= o) + 1) / (n + 1)) for o in obs]


def correct(pvalues: list[float], method: str) -> list[float]:
    if method == "holm":
        return holm(pvalues)
    if method in ("bh", "fdr_bh", "benjamini_hochberg"):
        return benjamini_hochberg(pvalues)
    if method == "none":
        if len(pvalues) > 1:
            raise ValueError("A family of more than one test requires a correction method.")
        return list(pvalues)
    raise ValueError(f"Unknown correction method '{method}'.")
