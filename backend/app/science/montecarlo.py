"""Single-site Monte Carlo uncertainty propagation (PRD §12.2, §13.1, FR-14).

Samples documented orientation uncertainty, documented chronology uncertainty
and (when the horizon profile states one) horizon-altitude uncertainty, and
propagates them to a distribution of circular residuals.

What this module deliberately does NOT do (Tier 1):
* produce p-values — there is no null model for a single pre-specified site;
* choose the best-fitting date — dates come only from the sourced chronology;
* invent an orientation uncertainty — if none is documented, propagation of
  that component is reported as *unavailable* and only a labelled sensitivity
  sweep over assumed values is offered.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .angles import AxisMode, residual, straddles_cut
from .chronology import Chronology

MC_ALGORITHM_VERSION = "mc-1.0.0"


@dataclass
class OrientationInput:
    azimuth_deg: float
    sigma_deg: float | None
    axis_mode: AxisMode
    distribution: str = "normal"  # "normal" | "uniform_halfwidth"


@dataclass
class PredictionGrid:
    years: np.ndarray
    azimuths: np.ndarray
    horizon_sensitivity_deg_per_deg: float | None = None  # dA/dh_horizon (linearised)

    def at(self, years: np.ndarray) -> np.ndarray:
        unwrapped = np.unwrap(self.azimuths, period=360.0)
        return np.mod(np.interp(years, self.years, unwrapped), 360.0)


def _summ(x: np.ndarray) -> dict:
    return {
        "median": float(np.median(x)),
        "mean": float(np.mean(x)),
        "sd": float(np.std(x, ddof=1)) if x.size > 1 else 0.0,
        "q025": float(np.quantile(x, 0.025)),
        "q16": float(np.quantile(x, 0.16)),
        "q84": float(np.quantile(x, 0.84)),
        "q975": float(np.quantile(x, 0.975)),
    }


def propagate(
    *,
    orientation: OrientationInput,
    chronology: Chronology,
    grid: PredictionGrid,
    horizon_sigma_deg: float | None,
    n_samples: int,
    seed: int,
    windows_deg: tuple[float, ...] = (0.5, 1.0, 2.0),
    histogram_bins: int = 60,
) -> dict:
    if n_samples < 100 or n_samples > 200_000:
        raise ValueError("n_samples must be between 100 and 200 000.")
    rng = np.random.Generator(np.random.PCG64(seed))
    components: list[str] = []
    unavailable: list[str] = []

    # chronology → predicted direction
    years = chronology.sample(rng, n_samples)
    predicted = grid.at(years)
    components.append(f"chronology ({chronology.model.value})")

    # horizon altitude uncertainty (linearised)
    if horizon_sigma_deg and grid.horizon_sensitivity_deg_per_deg is not None:
        dh = rng.normal(0.0, horizon_sigma_deg, n_samples)
        predicted = np.mod(predicted + grid.horizon_sensitivity_deg_per_deg * dh, 360.0)
        components.append("horizon altitude (linearised dA/dh)")
    elif horizon_sigma_deg is None:
        unavailable.append("horizon altitude uncertainty not documented")

    # orientation
    if orientation.sigma_deg is not None and orientation.sigma_deg > 0:
        if orientation.distribution == "uniform_halfwidth":
            obs = orientation.azimuth_deg + rng.uniform(-orientation.sigma_deg, orientation.sigma_deg, n_samples)
        else:
            obs = orientation.azimuth_deg + rng.normal(0.0, orientation.sigma_deg, n_samples)
        components.append(f"orientation ({orientation.distribution})")
    else:
        obs = np.full(n_samples, orientation.azimuth_deg)
        unavailable.append("orientation uncertainty not documented — not propagated")

    res = np.asarray(residual(obs, predicted, orientation.axis_mode))
    abs_res = np.abs(res)
    hist, edges = np.histogram(res, bins=histogram_bins)
    out = {
        "algorithm_version": MC_ALGORITHM_VERSION,
        "rng": "numpy PCG64",
        "numpy_version": np.__version__,
        "seed": seed,
        "n_samples": n_samples,
        "components_propagated": components,
        "components_unavailable": unavailable,
        "predicted_azimuth": _summ(predicted),
        "residual_signed": _summ(res),
        "residual_abs": _summ(abs_res),
        "within_window": {f"{w:g}": float(np.mean(abs_res <= w)) for w in windows_deg},
        "within_window_note": (
            "Share of propagated samples whose |residual| is within the window. Descriptive only — "
            "NOT a probability of intent and NOT a p-value."
        ),
        "histogram": {"counts": hist.tolist(), "edges": edges.tolist()},
        "straddles_cut": straddles_cut(res),
    }
    return out


def assumed_sigma_sweep(*, azimuth_deg: float, axis_mode: AxisMode, chronology: Chronology, grid: PredictionGrid,
                        sigmas=(0.5, 1.0, 2.0, 5.0), n_samples: int = 4000, seed: int = 0) -> list[dict]:
    """Sensitivity over *assumed* orientation uncertainties (always labelled as assumptions)."""
    rows = []
    for s in sigmas:
        r = propagate(orientation=OrientationInput(azimuth_deg, s, axis_mode), chronology=chronology, grid=grid,
                      horizon_sigma_deg=None, n_samples=n_samples, seed=seed)
        rows.append({"assumed_sigma_deg": s, "residual_abs_median": r["residual_abs"]["median"],
                     "residual_signed_q025": r["residual_signed"]["q025"],
                     "residual_signed_q975": r["residual_signed"]["q975"], "label": "ASSUMED — not documented"})
    return rows
