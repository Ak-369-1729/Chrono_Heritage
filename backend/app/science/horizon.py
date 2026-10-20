"""Horizon profiles (PRD §12.3, FR-10).

A profile is a set of (azimuth, apparent altitude) samples from a measured
survey or a DEM computation.  The absence of a profile is explicit
(``HorizonKind.NONE_DECLARED`` → a flat 0° horizon is used *and reported*).
No profile is ever fabricated.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

import numpy as np


class HorizonKind(str, Enum):
    MEASURED = "measured"
    DEM = "dem"
    NONE_DECLARED = "none_declared"   # explicit flat-horizon assumption
    SYNTHETIC = "synthetic"           # benchmark / teaching only


@dataclass
class HorizonProfile:
    kind: HorizonKind
    azimuths_deg: np.ndarray = field(default_factory=lambda: np.array([]))
    altitudes_deg: np.ndarray = field(default_factory=lambda: np.array([]))
    altitude_uncertainty_deg: float | None = None
    source_label: str | None = None
    resolution_note: str | None = None

    def __post_init__(self):
        self.azimuths_deg = np.asarray(self.azimuths_deg, dtype=float)
        self.altitudes_deg = np.asarray(self.altitudes_deg, dtype=float)
        if self.kind in (HorizonKind.MEASURED, HorizonKind.DEM, HorizonKind.SYNTHETIC):
            if self.azimuths_deg.size < 2 or self.azimuths_deg.size != self.altitudes_deg.size:
                raise ValueError("A horizon profile needs ≥2 paired azimuth/altitude samples.")
            order = np.argsort(np.mod(self.azimuths_deg, 360.0))
            self.azimuths_deg = np.mod(self.azimuths_deg, 360.0)[order]
            self.altitudes_deg = self.altitudes_deg[order]

    @classmethod
    def flat(cls) -> HorizonProfile:
        return cls(HorizonKind.NONE_DECLARED, source_label="No horizon profile: flat 0° horizon assumed")

    @classmethod
    def constant(cls, altitude_deg: float, label: str = "synthetic constant") -> HorizonProfile:
        az = np.arange(0.0, 360.0, 10.0)
        return cls(HorizonKind.SYNTHETIC, az, np.full_like(az, altitude_deg), source_label=label)

    @property
    def is_flat_assumption(self) -> bool:
        return self.kind is HorizonKind.NONE_DECLARED

    def coverage(self) -> tuple[float, float] | None:
        if self.is_flat_assumption:
            return None
        return float(self.azimuths_deg.min()), float(self.azimuths_deg.max())

    def covers(self, az_deg: float, max_gap_deg: float = 30.0) -> bool:
        """True if ``az_deg`` lies within the sampled arc (allowing wrap) and no gap exceeds max_gap."""
        if self.is_flat_assumption:
            return True
        az = self.azimuths_deg
        gaps = np.diff(np.concatenate([az, [az[0] + 360.0]]))
        a = float(np.mod(az_deg, 360.0))
        idx = np.searchsorted(az, a) - 1
        idx = idx % az.size
        return bool(gaps[idx] <= max_gap_deg)

    def altitude_at(self, az_deg: float) -> float:
        if self.is_flat_assumption:
            return 0.0
        return float(np.interp(np.mod(az_deg, 360.0), self.azimuths_deg, self.altitudes_deg, period=360.0))

    def as_dict(self) -> dict:
        return {
            "kind": self.kind.value,
            "n_samples": int(self.azimuths_deg.size),
            "coverage_deg": self.coverage(),
            "altitude_uncertainty_deg": self.altitude_uncertainty_deg,
            "source_label": self.source_label,
            "resolution_note": self.resolution_note,
        }
