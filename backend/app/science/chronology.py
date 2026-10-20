"""Calendars, year numbering and chronology sampling (PRD §12.2, FR-03, FR-08).

Years are stored in *astronomical* numbering (year 0 = 1 BCE, −2499 = 2500 BCE).
A chronology is a sourced interval plus an uncertainty model; it is never
collapsed to a midpoint silently.  The only sampling models are those a source
can justify: ``uniform`` (only the bounds are known) or ``normal`` (a reported
central value and standard error, e.g. a calibrated radiocarbon summary).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from enum import Enum

import numpy as np


class CalendarBasis(str, Enum):
    JULIAN = "julian"
    GREGORIAN_PROLEPTIC = "gregorian_proleptic"


class ChronologyModel(str, Enum):
    UNIFORM = "uniform"
    NORMAL = "normal"


def year_label(astronomical_year: int) -> str:
    """Human label: 2026 → '2026 CE', 0 → '1 BCE', −2499 → '2500 BCE'."""
    y = int(astronomical_year)
    return f"{y} CE" if y > 0 else f"{1 - y} BCE"


def bce_to_astronomical(bce_year: int) -> int:
    if bce_year <= 0:
        raise ValueError("BCE years are positive integers (there is no year 0 BCE).")
    return 1 - bce_year


def julian_day(year: int, month: int, day: float, calendar: CalendarBasis | str) -> float:
    """Julian Day at 0h of the given date (Meeus, Astronomical Algorithms, ch. 7)."""
    cal = CalendarBasis(calendar)
    if not 1 <= month <= 12:
        raise ValueError("month must be 1–12")
    y, m = (year - 1, month + 12) if month <= 2 else (year, month)
    if cal is CalendarBasis.GREGORIAN_PROLEPTIC:
        a = math.floor(y / 100)
        b = 2 - a + math.floor(a / 4)
    else:
        b = 0
    return math.floor(365.25 * (y + 4716)) + math.floor(30.6001 * (m + 1)) + day + b - 1524.5


def calendar_date(jd: float, calendar: CalendarBasis | str) -> tuple[int, int, float]:
    """Inverse of :func:`julian_day` (Meeus ch. 7), returning (year, month, day.fraction)."""
    cal = CalendarBasis(calendar)
    jd = jd + 0.5
    z = math.floor(jd)
    f = jd - z
    if cal is CalendarBasis.GREGORIAN_PROLEPTIC:
        alpha = math.floor((z - 1867216.25) / 36524.25)
        a = z + 1 + alpha - math.floor(alpha / 4)
    else:
        a = z
    b = a + 1524
    c = math.floor((b - 122.1) / 365.25)
    d = math.floor(365.25 * c)
    e = math.floor((b - d) / 30.6001)
    day = b - d - math.floor(30.6001 * e) + f
    month = e - 1 if e < 14 else e - 13
    year = c - 4716 if month > 2 else c - 4715
    return int(year), int(month), day


def format_jd(jd: float, calendar: CalendarBasis | str) -> str:
    y, m, d = calendar_date(jd, calendar)
    day = int(math.floor(d))
    frac = d - day
    hh = int(frac * 24)
    mm = int(round((frac * 24 - hh) * 60))
    if mm == 60:
        hh, mm = hh + 1, 0
    return f"{year_label(y)} {m:02d}-{day:02d} {hh:02d}:{mm:02d} ({CalendarBasis(calendar).value})"


@dataclass(frozen=True)
class Chronology:
    start_year: int
    end_year: int
    model: ChronologyModel = ChronologyModel.UNIFORM
    central_year: float | None = None
    sigma_years: float | None = None

    def __post_init__(self):
        if self.start_year > self.end_year:
            raise ValueError("Chronology start_year must not be after end_year.")
        if self.model is ChronologyModel.NORMAL and (self.central_year is None or not self.sigma_years):
            raise ValueError("A normal chronology model needs a sourced central year and sigma.")

    def sample(self, rng: np.random.Generator, n: int) -> np.ndarray:
        """Sample years (float) within the documented interval.

        Normal models are truncated to the documented range so that sampling never
        produces dates outside what the source supports.
        """
        if self.model is ChronologyModel.UNIFORM:
            return rng.uniform(self.start_year, self.end_year + 1.0, size=n)
        out = np.empty(0)
        while out.size < n:
            draw = rng.normal(self.central_year, self.sigma_years, size=max(n, 1024))
            draw = draw[(draw >= self.start_year) & (draw <= self.end_year + 1.0)]
            out = np.concatenate([out, draw])
        return out[:n]

    def grid(self, max_points: int = 25) -> np.ndarray:
        span = self.end_year - self.start_year
        n = int(min(max_points, max(2, span // 25 + 2)))
        return np.linspace(self.start_year, self.end_year, n)

    def as_dict(self):
        return {"start_year": self.start_year, "end_year": self.end_year, "model": self.model.value,
                "central_year": self.central_year, "sigma_years": self.sigma_years,
                "label": f"{year_label(self.start_year)} – {year_label(self.end_year)}"}
