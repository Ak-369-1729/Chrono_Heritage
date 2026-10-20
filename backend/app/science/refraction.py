"""Atmospheric refraction and rise/set event-altitude definitions (PRD §12 table).

Refraction near the horizon is the largest atmospheric term in rise/set azimuth
work and is genuinely uncertain (it can vary by ±0.2° or more with temperature
inversions).  The model, its parameters and its sensitivity are therefore always
reported; never silently applied.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from enum import Enum

STANDARD_PRESSURE_HPA = 1010.0
STANDARD_TEMPERATURE_C = 10.0
MEAN_SOLAR_SEMIDIAMETER_DEG = 959.63 / 3600.0  # at 1 au
SOLAR_HORIZONTAL_PARALLAX_DEG = 8.794 / 3600.0   # at 1 au


class EventLimb(str, Enum):
    UPPER_LIMB = "upper_limb"   # first / last gleam
    CENTRE = "centre"
    LOWER_LIMB = "lower_limb"   # disc fully above horizon (tangent)


class RefractionModel(str, Enum):
    BENNETT = "bennett_1982"
    NONE = "none"


@dataclass(frozen=True)
class AtmosphereParams:
    model: RefractionModel = RefractionModel.BENNETT
    pressure_hpa: float = STANDARD_PRESSURE_HPA
    temperature_c: float = STANDARD_TEMPERATURE_C

    def as_dict(self):
        return {"model": self.model.value, "pressure_hpa": self.pressure_hpa,
                "temperature_c": self.temperature_c}


def bennett_refraction_deg(apparent_alt_deg: float, pressure_hpa: float = STANDARD_PRESSURE_HPA,
                           temperature_c: float = STANDARD_TEMPERATURE_C) -> float:
    """Bennett (1982) refraction for an object seen at ``apparent_alt_deg``.

    R[arcmin] = cot(h + 7.31/(h + 4.4)), scaled by (P/1010)·(283/(273+T)).
    Accuracy ≈0.07′ for h ≥ 0°; usable to about −1°.  Below −2° it is not
    defined and a ``ValueError`` is raised rather than extrapolating.
    """
    h = apparent_alt_deg
    if h < -2.0:
        raise ValueError("Bennett refraction is not defined below −2° apparent altitude.")
    r_arcmin = 1.0 / math.tan(math.radians(h + 7.31 / (h + 4.4)))
    scale = (pressure_hpa / 1010.0) * (283.0 / (273.0 + temperature_c))
    return r_arcmin * scale / 60.0


def refraction_deg(apparent_alt_deg: float, atm: AtmosphereParams) -> float:
    if atm.model is RefractionModel.NONE:
        return 0.0
    return bennett_refraction_deg(apparent_alt_deg, atm.pressure_hpa, atm.temperature_c)


def target_centre_altitude_deg(horizon_apparent_alt_deg: float, limb: EventLimb,
                               atm: AtmosphereParams, semidiameter_deg: float = MEAN_SOLAR_SEMIDIAMETER_DEG) -> float:
    """Airless (true) topocentric altitude of the Sun's centre at the event.

    The horizon altitude is what an observer *sees* (apparent).  An object whose
    limb appears on that horizon has a true altitude lower by the refraction.
    """
    true_horizon = horizon_apparent_alt_deg - refraction_deg(horizon_apparent_alt_deg, atm)
    if limb is EventLimb.UPPER_LIMB:
        return true_horizon - semidiameter_deg
    if limb is EventLimb.LOWER_LIMB:
        return true_horizon + semidiameter_deg
    return true_horizon
