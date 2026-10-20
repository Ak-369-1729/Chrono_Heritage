"""Circular angle arithmetic (PRD §12.1).

All azimuths are in decimal degrees, measured clockwise from the stated north
reference.  Axis semantics are *stored*, never inferred from site type:

* ``directed``       — the structure faces one way (e.g. entrance → sanctum view).
* ``bidirectional``  — an undirected architectural line; both ends are candidate
                        directions, so comparison is modulo 180°.
"""

from __future__ import annotations

from enum import Enum

import numpy as np


class AxisMode(str, Enum):
    DIRECTED = "directed"
    BIDIRECTIONAL = "bidirectional"


def normalize_bearing(deg):
    """Map any bearing into [0, 360)."""
    out = np.mod(np.asarray(deg, dtype=float), 360.0)
    # np.mod can return 360.0 for tiny negative inputs because of rounding.
    out = np.where(out >= 360.0, out - 360.0, out)
    return out.item() if np.ndim(out) == 0 else out


def signed_residual(observed, predicted):
    """Directed circular residual Δ = ((a − b + 180) mod 360) − 180, in [−180, 180)."""
    a = np.asarray(observed, dtype=float)
    b = np.asarray(predicted, dtype=float)
    d = np.mod(a - b + 180.0, 360.0) - 180.0
    return d.item() if np.ndim(d) == 0 else d


def axial_signed_residual(observed, predicted):
    """Residual for an undirected axis: compare modulo 180°, result in [−90, 90)."""
    a = np.asarray(observed, dtype=float)
    b = np.asarray(predicted, dtype=float)
    d = np.mod(a - b + 90.0, 180.0) - 90.0
    return d.item() if np.ndim(d) == 0 else d


def residual(observed, predicted, axis_mode: AxisMode | str):
    """Signed residual respecting axis semantics.

    For a bidirectional axis the residual is taken to the nearer end of the
    line.  Callers must disclose that evaluating both ends doubles the
    opportunity for a coincidental match (see ``analysis`` warnings).
    """
    mode = AxisMode(axis_mode)
    if mode is AxisMode.DIRECTED:
        return signed_residual(observed, predicted)
    return axial_signed_residual(observed, predicted)


def matched_axis_end(observed, predicted, axis_mode: AxisMode | str):
    """Which end of the axis the residual refers to (the bearing actually compared)."""
    mode = AxisMode(axis_mode)
    obs = np.asarray(observed, dtype=float)
    if mode is AxisMode.DIRECTED:
        return normalize_bearing(obs)
    forward = np.abs(signed_residual(obs, predicted))
    backward = np.abs(signed_residual(obs + 180.0, predicted))
    out = np.where(backward < forward, obs + 180.0, obs)
    return normalize_bearing(out)


def circular_mean_deg(values, weights=None) -> float:
    rad = np.deg2rad(np.asarray(values, dtype=float))
    w = np.ones_like(rad) if weights is None else np.asarray(weights, dtype=float)
    s, c = np.sum(w * np.sin(rad)), np.sum(w * np.cos(rad))
    return float(normalize_bearing(np.rad2deg(np.arctan2(s, c))))


def mean_resultant_length(values_deg, axial: bool = False) -> float:
    """R̄ in [0, 1].  For axial data the angles are doubled first (Mardia & Jupp 2000)."""
    rad = np.deg2rad(np.asarray(values_deg, dtype=float))
    if axial:
        rad = 2.0 * rad
    if rad.size == 0:
        return float("nan")
    return float(np.hypot(np.mean(np.cos(rad)), np.mean(np.sin(rad))))


def circular_quantiles(residuals_deg, qs=(0.025, 0.16, 0.5, 0.84, 0.975)):
    """Quantiles of *signed* residuals.

    Signed residuals already live on a cut line at ±180° placed opposite the
    prediction, so ordinary quantiles are valid provided the distribution does
    not straddle the cut; callers check ``straddles_cut``.
    """
    r = np.asarray(residuals_deg, dtype=float)
    return {f"q{q:g}": float(np.quantile(r, q)) for q in qs}


def straddles_cut(residuals_deg, limit: float = 150.0) -> bool:
    r = np.asarray(residuals_deg, dtype=float)
    return bool(np.any(np.abs(r) > limit))


# ---- unit conversions -----------------------------------------------------

def gradians_to_degrees(g):
    return np.asarray(g, dtype=float) * 0.9


def mils_to_degrees(m, mils_per_circle: float = 6400.0):
    return np.asarray(m, dtype=float) * 360.0 / mils_per_circle


def dms_to_degrees(d: float, m: float = 0.0, s: float = 0.0) -> float:
    sign = -1.0 if (d < 0 or (d == 0 and (m < 0 or s < 0))) else 1.0
    return sign * (abs(d) + abs(m) / 60.0 + abs(s) / 3600.0)


BEARING_UNITS = {
    "deg": lambda v: np.asarray(v, dtype=float),
    "grad": gradians_to_degrees,
    "mil_nato": lambda v: mils_to_degrees(v, 6400.0),
}


def to_degrees(value, unit: str):
    try:
        conv = BEARING_UNITS[unit]
    except KeyError as exc:
        raise ValueError(f"Unsupported bearing unit '{unit}'. Supported: {sorted(BEARING_UNITS)}") from exc
    out = conv(value)
    return out.item() if np.ndim(out) == 0 else out
