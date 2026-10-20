"""JPL DE406 long-period ephemeris adapter for Skyfield.

DE406 (Standish 1998) covers JD 625360.5 – 2816848.5 (−3000 Feb 23 to +3000 May 06)
and is the long-span ephemeris historically used by JPL HORIZONS for remote epochs.

The PyPI ``de406`` package (MIT licence, packaged by Brandon Rhodes) ships the
original JPL Chebyshev coefficients as NumPy arrays (one array per body,
shape ``(n_sets, 3, n_coefficients)``, kilometres, ICRF/J2000 axes, TDB time
argument).  Skyfield only reads SPK ``.bsp`` files, so this module evaluates the
Chebyshev series itself and exposes the result as Skyfield ``VectorFunction``
segments.  All apparent-place reductions (light time, aberration, deflection,
precession–nutation, Earth rotation, topocentric correction) are then performed
by Skyfield unchanged.

Interpolation fidelity is limited by the packaging of DE406 itself (≤25 m for the
Sun and planets, ≤1 m for the Moon) — negligible for azimuth work.
"""

from __future__ import annotations

import functools
import importlib.util
import os
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from skyfield.constants import AU_KM
from skyfield.vectorlib import VectorFunction

EPHEMERIS_NAME = "DE406"
EPHEMERIS_CITATION = (
    "Standish, E. M. (1998). JPL Planetary and Lunar Ephemerides, DE405/LE405. "
    "JPL IOM 312.F-98-048. DE406 is the long-span companion ephemeris."
)
EPHEMERIS_LICENCE = "JPL ephemeris data; PyPI packaging 'de406' 1997.1 under MIT licence."


class EphemerisRangeError(ValueError):
    """Raised when a requested epoch lies outside the ephemeris span."""


def _locate_data_dir() -> Path:
    override = os.environ.get("CHRONO_DE406_DIR")
    if override:
        return Path(override)
    spec = importlib.util.find_spec("de406")
    if spec is None or spec.origin is None:
        raise RuntimeError(
            "DE406 ephemeris not found. Install the 'de406' package or set CHRONO_DE406_DIR."
        )
    return Path(spec.origin).parent


@dataclass(frozen=True)
class _Body:
    coefficients: np.ndarray  # (n_sets, 3, n_coef)

    @property
    def n_sets(self) -> int:
        return self.coefficients.shape[0]


class DE406:
    """Lazy, memory-mapped reader for the DE406 coefficient arrays."""

    def __init__(self, data_dir: Path | None = None):
        self.data_dir = data_dir or _locate_data_dir()
        constants = np.load(self.data_dir / "constants.npy", allow_pickle=False)
        self.constants = {row["name"].decode(): float(row["value"]) for row in constants}
        self.jalpha = self.constants["jalpha"]
        self.jomega = self.constants["jomega"]
        self.emrat = self.constants["EMRAT"]
        self._bodies: dict[str, _Body] = {}

    def _body(self, name: str) -> _Body:
        if name not in self._bodies:
            arr = np.load(self.data_dir / f"jpl-{name}.npy", mmap_mode="r", allow_pickle=False)
            self._bodies[name] = _Body(arr)
        return self._bodies[name]

    def check_range(self, tdb_jd: np.ndarray) -> None:
        tdb_jd = np.asarray(tdb_jd, dtype=float)
        if np.any(tdb_jd < self.jalpha) or np.any(tdb_jd > self.jomega):
            raise EphemerisRangeError(
                f"Epoch outside DE406 span (JD {self.jalpha} – {self.jomega}, "
                "i.e. −3000 to +3000)."
            )

    def compute(self, name: str, whole: np.ndarray, fraction: np.ndarray):
        """Return position (km) and velocity (km/day), each shaped (3, n)."""
        whole = np.atleast_1d(np.asarray(whole, dtype=float))
        fraction = np.atleast_1d(np.asarray(fraction, dtype=float))
        self.check_range(whole + fraction)
        body = self._body(name)
        n_sets, _, n_coef = body.coefficients.shape
        days_per_set = (self.jomega - self.jalpha) / n_sets
        index, offset = divmod((whole - self.jalpha) + fraction, days_per_set)
        index = index.astype(int)
        at_end = index == n_sets
        index[at_end] -= 1
        offset[at_end] += days_per_set
        coeffs = np.asarray(body.coefficients[index])  # (n, 3, n_coef)

        tc = 2.0 * offset / days_per_set - 1.0
        T = np.empty((n_coef, tc.size))
        dT = np.empty((n_coef, tc.size))
        T[0], T[1] = 1.0, tc
        dT[0], dT[1] = 0.0, 1.0
        two_t = 2.0 * tc
        for i in range(2, n_coef):
            T[i] = two_t * T[i - 1] - T[i - 2]
            dT[i] = two_t * dT[i - 1] + 2.0 * T[i - 1] - dT[i - 2]
        pos = np.einsum("nkc,cn->kn", coeffs, T)
        vel = np.einsum("nkc,cn->kn", coeffs, dT) * (2.0 / days_per_set)
        return pos, vel


class _DE406Segment(VectorFunction):
    """Skyfield vector function backed by DE406 coefficients."""

    def __init__(self, reader: DE406, center: int, target: int, ephemeris: DE406Ephemeris):
        self.reader = reader
        self.center = center
        self.target = target
        self.ephemeris = ephemeris

    @property
    def vector_name(self):  # type: ignore[override]
        return "DE406 segment"

    def _ssb_vector(self, code: int, whole, fraction):
        r = self.reader
        if code == 10:
            return r.compute("sun", whole, fraction)
        if code == 3:
            return r.compute("earthmoon", whole, fraction)
        if code in (399, 301):
            emb_p, emb_v = r.compute("earthmoon", whole, fraction)
            moon_p, moon_v = r.compute("moon", whole, fraction)  # geocentric Moon
            k = 1.0 / (1.0 + r.emrat)
            earth_p, earth_v = emb_p - moon_p * k, emb_v - moon_v * k
            if code == 399:
                return earth_p, earth_v
            return earth_p + moon_p, earth_v + moon_v
        raise KeyError(code)

    def _at(self, t):
        whole, fraction = t.whole, t.tdb_fraction
        scalar = np.ndim(whole) == 0 and np.ndim(fraction) == 0
        p, v = self._ssb_vector(self.target, whole, fraction)
        if self.center != 0:
            cp, cv = self._ssb_vector(self.center, whole, fraction)
            p, v = p - cp, v - cv
        p, v = p / AU_KM, v / AU_KM
        if scalar:
            p, v = p[:, 0], v[:, 0]
        return p, v, None, None


class DE406Ephemeris:
    """Minimal mapping-style ephemeris object accepted by Skyfield's ``apparent()``."""

    codes = {10: "sun", 3: "earth-moon barycenter", 399: "earth", 301: "moon"}

    def __init__(self, reader: DE406 | None = None):
        self.reader = reader or DE406()

    def __contains__(self, code) -> bool:
        return code in self.codes

    def __getitem__(self, code):
        if isinstance(code, str):
            lookup = {v: k for k, v in self.codes.items()}
            code = lookup[code.lower()]
        if code not in self.codes:
            raise KeyError(code)
        return _DE406Segment(self.reader, 0, code, self)

    @property
    def span_jd(self) -> tuple[float, float]:
        return self.reader.jalpha, self.reader.jomega


@functools.lru_cache(maxsize=1)
def load_de406() -> DE406Ephemeris:
    return DE406Ephemeris()
