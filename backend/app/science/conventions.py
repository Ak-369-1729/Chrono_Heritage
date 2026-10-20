"""Orientation conventions and conversion to true (geodetic) azimuth.

Raw measurements are immutable; this module produces a *transformed* value plus
an explicit transformation record (PRD FR-27).  Nothing is assumed: an
unspecified north reference, or a magnetic bearing without a documented
declination, cannot be converted and yields a blocking reason instead of a
number.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from enum import Enum

from .angles import normalize_bearing, to_degrees


class NorthReference(str, Enum):
    TRUE = "true"                  # geodetic / geographic north
    ASTRONOMICAL = "astronomical"  # determined by astronomical observation (≈ true for this purpose)
    MAGNETIC = "magnetic"
    GRID = "grid"
    UNSPECIFIED = "unspecified"


class ConversionStatus(str, Enum):
    NONE_REQUIRED = "none_required"
    CONVERTED = "converted"
    BLOCKED = "blocked"


@dataclass
class TransformationResult:
    status: ConversionStatus
    true_azimuth_deg: float | None
    combined_uncertainty_deg: float | None
    steps: list[dict] = field(default_factory=list)
    blocking_reasons: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "status": self.status.value,
            "true_azimuth_deg": self.true_azimuth_deg,
            "combined_uncertainty_deg": self.combined_uncertainty_deg,
            "steps": self.steps,
            "blocking_reasons": self.blocking_reasons,
        }


def grid_convergence_deg(crs: str, lon: float, lat: float) -> float:
    """Meridian convergence (PROJ sign convention): true azimuth = grid azimuth + γ."""
    from pyproj import CRS, Proj

    c = CRS.from_user_input(crs)
    if not c.is_projected:
        raise ValueError(f"CRS {crs} is not projected; grid north is undefined.")
    return float(Proj(c).get_factors(lon, lat).meridian_convergence)


def to_true_azimuth(
    *,
    raw_bearing: float,
    unit: str,
    north_reference: str,
    measurement_uncertainty_deg: float | None,
    lat: float,
    lon: float,
    magnetic_declination_deg: float | None = None,
    magnetic_declination_uncertainty_deg: float | None = None,
    magnetic_declination_source: str | None = None,
    grid_crs: str | None = None,
) -> TransformationResult:
    steps: list[dict] = []
    reasons: list[str] = []
    try:
        bearing = float(to_degrees(raw_bearing, unit))
    except ValueError as exc:
        return TransformationResult(ConversionStatus.BLOCKED, None, None, steps, [str(exc)])
    if unit != "deg":
        steps.append({"op": "unit_conversion", "from": unit, "to": "deg", "input": raw_bearing, "output": bearing})

    ref = NorthReference(north_reference)
    sigma2 = measurement_uncertainty_deg**2 if measurement_uncertainty_deg is not None else None

    if ref in (NorthReference.TRUE, NorthReference.ASTRONOMICAL):
        out = normalize_bearing(bearing)
        steps.append({"op": "normalize", "output": out})
        return TransformationResult(
            ConversionStatus.NONE_REQUIRED, out,
            math.sqrt(sigma2) if sigma2 is not None else None, steps,
        )

    if ref is NorthReference.UNSPECIFIED:
        reasons.append("North reference is unspecified; the bearing cannot be related to true north.")
        return TransformationResult(ConversionStatus.BLOCKED, None, None, steps, reasons)

    if ref is NorthReference.MAGNETIC:
        if magnetic_declination_deg is None:
            reasons.append(
                "Magnetic bearing without a documented magnetic declination for the survey date and place."
            )
        if not magnetic_declination_source:
            reasons.append("Magnetic declination has no recorded source.")
        if reasons:
            return TransformationResult(ConversionStatus.BLOCKED, None, None, steps, reasons)
        out = normalize_bearing(bearing + magnetic_declination_deg)
        steps.append({
            "op": "magnetic_to_true", "declination_deg": magnetic_declination_deg,
            "declination_source": magnetic_declination_source,
            "convention": "true = magnetic + declination (east positive)", "output": out,
        })
        if sigma2 is not None and magnetic_declination_uncertainty_deg is not None:
            sigma = math.sqrt(sigma2 + magnetic_declination_uncertainty_deg**2)
        else:
            sigma = None
            steps.append({"op": "uncertainty_incomplete",
                          "note": "Declination or measurement uncertainty missing; combined uncertainty unavailable."})
        return TransformationResult(ConversionStatus.CONVERTED, out, sigma, steps)

    if ref is NorthReference.GRID:
        if not grid_crs:
            reasons.append("Grid bearing without a recorded projected CRS; convergence cannot be computed.")
            return TransformationResult(ConversionStatus.BLOCKED, None, None, steps, reasons)
        try:
            gamma = grid_convergence_deg(grid_crs, lon, lat)
        except Exception as exc:  # pyproj raises several types
            return TransformationResult(ConversionStatus.BLOCKED, None, None, steps,
                                        [f"Grid convergence could not be computed: {exc}"])
        out = normalize_bearing(bearing + gamma)
        steps.append({"op": "grid_to_true", "crs": grid_crs, "convergence_deg": gamma,
                      "convention": "true = grid + meridian convergence (PROJ)", "output": out})
        return TransformationResult(
            ConversionStatus.CONVERTED, out, math.sqrt(sigma2) if sigma2 is not None else None, steps,
        )

    raise AssertionError("unreachable")
