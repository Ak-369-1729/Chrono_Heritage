"""Candidate astronomy engine: Skyfield + JPL DE406 (PRD FR-09, §12.3).

This is the production calculation path.  It is *never* its own reference:
``app.benchmarks`` compares it with JPL Horizons (modern cases) and with two
independent historical paths (Astropy/ERFA and an analytic Laskar-1986 path).

Conventions
-----------
* Azimuth: degrees clockwise from **true (geodetic) north**, topocentric.
* Altitude: airless (geometric + light-time + aberration + deflection) unless
  labelled "apparent", in which case the selected refraction model was added.
* Time: TT for event instants; UT1 via Skyfield's built-in ΔT model.
* Coordinates: WGS84 geodetic latitude/longitude, elevation in metres.
"""

from __future__ import annotations

import functools
from dataclasses import dataclass, field

import numpy as np
import skyfield
from scipy.optimize import brentq
from skyfield.api import load as _sf_load
from skyfield.api import wgs84
from skyfield.framelib import ecliptic_frame

from ..chronology import CalendarBasis, format_jd, julian_day
from ..horizon import HorizonProfile
from ..refraction import (
    MEAN_SOLAR_SEMIDIAMETER_DEG,
    AtmosphereParams,
    EventLimb,
    refraction_deg,
    target_centre_altitude_deg,
)
from .de406 import EPHEMERIS_CITATION, EPHEMERIS_NAME, EphemerisRangeError, load_de406
from .targets import Target, get_target

ENGINE_NAME = "chronoheritage-candidate (Skyfield + JPL DE406)"
ALGORITHM_VERSION = "astro-1.0.0"

# Approximate offsets (days) from the March equinox to each cardinal solar longitude, J2000 epoch.
_J2000_MARCH_EQUINOX_JD = 2451623.816
_TROPICAL_YEAR = 365.24219
_SEASON_OFFSET = {0.0: 0.0, 90.0: 92.76, 180.0: 186.41, 270.0: 276.25}


class EngineError(ValueError):
    """Calculation cannot be performed with the supplied inputs (never silently degraded)."""


class NoEventError(EngineError):
    """The Sun does not cross the event altitude in the search window (polar day/night)."""


@dataclass
class EventResult:
    target: str
    azimuth_deg: float
    event_tt_jd: float
    event_ut1_jd: float
    reference_instant_tt_jd: float | None
    declination_deg: float
    target_centre_altitude_deg: float
    horizon_altitude_deg: float
    refraction_at_horizon_deg: float
    semidiameter_deg: float
    distance_au: float
    delta_t_seconds: float
    calendar_strings: dict
    warnings: list[str] = field(default_factory=list)

    def as_dict(self):
        return {k: getattr(self, k) for k in self.__dataclass_fields__}


@functools.lru_cache(maxsize=1)
def _timescale():
    return _sf_load.timescale(builtin=True)


@functools.lru_cache(maxsize=1)
def _bodies():
    eph = load_de406()
    return eph, eph[399], eph[10]


def versions() -> dict:
    import scipy

    return {
        "engine": ENGINE_NAME,
        "algorithm_version": ALGORITHM_VERSION,
        "skyfield": skyfield.__version__,
        "scipy": scipy.__version__,
        "ephemeris": EPHEMERIS_NAME,
        "ephemeris_citation": EPHEMERIS_CITATION,
        "delta_t_model": "Skyfield built-in ΔT (IERS/USNO tables; long-term Morrison–Stephenson-style extrapolation)",
        "precession_nutation": "Skyfield: IAU 2006 precession, IAU 2000A nutation",
        "time_scale": "TT for instants; UT1 for Earth rotation",
        "frame": "ICRF → true equator/equinox of date → topocentric horizon (WGS84)",
    }


class CandidateEngine:
    def __init__(self):
        self.ts = _timescale()
        self.eph, self.earth, self.sun = _bodies()

    # ---------------------------------------------------------------- basics
    def _observer(self, lat, lon, elev_m):
        if not (-90.0 <= lat <= 90.0) or not (-180.0 <= lon <= 360.0):
            raise EngineError("Latitude/longitude out of range.")
        return self.earth + wgs84.latlon(lat, lon, elevation_m=elev_m or 0.0)

    def sun_altaz(self, t, lat, lon, elev_m=0.0):
        """Airless topocentric altitude/azimuth (degrees) and distance (au)."""
        try:
            app = self._observer(lat, lon, elev_m).at(t).observe(self.sun).apparent(deflectors=(10,))
        except EphemerisRangeError as exc:
            raise EngineError(str(exc)) from exc
        alt, az, dist = app.altaz()
        return alt.degrees, az.degrees, dist.au

    def sun_declination(self, t, lat, lon, elev_m=0.0):
        app = self._observer(lat, lon, elev_m).at(t).observe(self.sun).apparent(deflectors=(10,))
        _, dec, _ = app.radec(epoch="date")
        return dec.degrees

    def apparent_ecliptic_longitude(self, t):
        app = self.earth.at(t).observe(self.sun).apparent(deflectors=(10,))
        _, lon, _ = app.frame_latlon(ecliptic_frame)
        return lon.degrees

    # --------------------------------------------------------- solar instants
    def solar_longitude_instant(self, year: float, longitude_deg: float) -> float:
        """TT Julian date when the Sun's apparent ecliptic longitude (of date) equals ``longitude_deg``.

        ``year`` is the astronomical year in which the event falls (tropical sense).  Solar events occur
        once per year, so a fractional year is rounded to the nearest whole year.
        """
        year = int(round(float(year)))
        guess = _J2000_MARCH_EQUINOX_JD + _TROPICAL_YEAR * (year - 2000.0) + _SEASON_OFFSET[longitude_deg]
        jds = guess + np.arange(-20.0, 20.5, 1.0)
        try:
            lons = self.apparent_ecliptic_longitude(self.ts.tt_jd(jds))
        except EphemerisRangeError as exc:
            raise EngineError(str(exc)) from exc
        diff = (lons - longitude_deg + 180.0) % 360.0 - 180.0
        idx = np.where((diff[:-1] < 0) & (diff[1:] >= 0))[0]
        if idx.size == 0:
            raise EngineError(f"Could not bracket solar longitude {longitude_deg}° near year {year}.")
        i = int(idx[0])

        def f(jd):
            lon = self.apparent_ecliptic_longitude(self.ts.tt_jd(jd))
            return (lon - longitude_deg + 180.0) % 360.0 - 180.0

        return float(brentq(f, jds[i], jds[i + 1], xtol=1e-7))

    # ----------------------------------------------------------- rise / set
    def _find_crossing(self, jd_start_tt, jd_end_tt, lat, lon, elev, phenomenon, horizon, limb, atm,
                       prefer_near_tt=None):
        step = 6.0 / 1440.0  # 6 minutes
        jds = np.arange(jd_start_tt, jd_end_tt + step, step)
        alt, az, dist = self.sun_altaz(self.ts.tt_jd(jds), lat, lon, elev)
        sd = MEAN_SOLAR_SEMIDIAMETER_DEG / np.asarray(dist)
        targets = np.array([
            target_centre_altitude_deg(horizon.altitude_at(a), limb, atm, s) for a, s in zip(az, sd)
        ])
        g = alt - targets
        if phenomenon == "rise":
            idx = np.where((g[:-1] < 0) & (g[1:] >= 0))[0]
        else:
            idx = np.where((g[:-1] >= 0) & (g[1:] < 0))[0]
        if idx.size == 0:
            raise NoEventError(
                f"No sun{phenomenon} found in the search window at latitude {lat:.3f}° "
                "(the Sun may be circumpolar or never reach the event altitude)."
            )
        if prefer_near_tt is not None:
            i = int(idx[np.argmin(np.abs(jds[idx] - prefer_near_tt))])
        else:
            i = int(idx[0])

        def fn(jd):
            a, z, d = self.sun_altaz(self.ts.tt_jd(jd), lat, lon, elev)
            return a - target_centre_altitude_deg(horizon.altitude_at(z), limb, atm, MEAN_SOLAR_SEMIDIAMETER_DEG / d)

        jd_event = float(brentq(fn, jds[i], jds[i + 1], xtol=1e-9))
        return jd_event

    def event(
        self,
        *,
        target_key: str,
        lat: float,
        lon: float,
        elevation_m: float = 0.0,
        year: float | None = None,
        date: tuple[int, int, int] | None = None,
        calendar: CalendarBasis | str = CalendarBasis.JULIAN,
        horizon: HorizonProfile | None = None,
        limb: EventLimb | str = EventLimb.UPPER_LIMB,
        atm: AtmosphereParams | None = None,
    ) -> EventResult:
        target: Target = get_target(target_key)
        if not target.supported:
            raise EngineError(f"Target '{target.label}' is not supported: {target.note}")
        if target.body != "sun":
            raise EngineError("Only solar targets are implemented in this engine version.")
        horizon = horizon or HorizonProfile.flat()
        limb = EventLimb(limb)
        atm = atm or AtmosphereParams()
        warnings: list[str] = []
        if horizon.is_flat_assumption:
            warnings.append("No horizon profile supplied: a flat 0° apparent horizon was assumed.")

        ref_instant = None
        if target.kind in ("solstice", "equinox"):
            if year is None:
                raise EngineError("A year (astronomical numbering) is required for solstice/equinox targets.")
            ref_instant = self.solar_longitude_instant(year, target.ecliptic_longitude_deg)
            jd_event = self._find_crossing(ref_instant - 1.0, ref_instant + 1.0, lat, lon, elevation_m,
                                           target.phenomenon, horizon, limb, atm, prefer_near_tt=ref_instant)
        elif target.kind == "date":
            if date is None:
                raise EngineError("An explicit calendar date is required for this target.")
            y, m, d = date
            jd0_ut = julian_day(y, m, d, calendar) - lon / 360.0  # local mean midnight in UT
            t0 = self.ts.ut1_jd(jd0_ut)
            jd0_tt = float(t0.tt)
            jd_event = self._find_crossing(jd0_tt, jd0_tt + 1.0, lat, lon, elevation_m, target.phenomenon,
                                           horizon, limb, atm)
        else:
            raise EngineError(f"Target kind '{target.kind}' not implemented.")

        t = self.ts.tt_jd(jd_event)
        alt, az, dist = self.sun_altaz(t, lat, lon, elevation_m)
        dec = self.sun_declination(t, lat, lon, elevation_m)
        h_hor = horizon.altitude_at(az)
        if not horizon.is_flat_assumption and not horizon.covers(az):
            warnings.append(f"Event azimuth {az:.2f}° falls in a gap of the horizon profile; interpolated value used.")
        if h_hor < -1.0:
            warnings.append("Horizon below −1°: Bennett refraction is outside its validated range.")
        sd = MEAN_SOLAR_SEMIDIAMETER_DEG / dist
        return EventResult(
            target=target.key,
            azimuth_deg=float(az),
            event_tt_jd=jd_event,
            event_ut1_jd=float(t.ut1),
            reference_instant_tt_jd=ref_instant,
            declination_deg=float(dec),
            target_centre_altitude_deg=float(target_centre_altitude_deg(h_hor, limb, atm, sd)),
            horizon_altitude_deg=float(h_hor),
            refraction_at_horizon_deg=float(refraction_deg(h_hor, atm)),
            semidiameter_deg=float(sd),
            distance_au=float(dist),
            delta_t_seconds=float(t.delta_t),
            calendar_strings={
                "julian_ut1": format_jd(float(t.ut1), CalendarBasis.JULIAN),
                "gregorian_ut1": format_jd(float(t.ut1), CalendarBasis.GREGORIAN_PROLEPTIC),
            },
            warnings=warnings,
        )

    def day_path(self, *, lat, lon, elevation_m, center_tt_jd, atm: AtmosphereParams | None = None,
                 hours: float = 24.0, step_min: float = 10.0) -> list[dict]:
        """Sun alt/az samples around an instant, for visualisation (airless and refracted)."""
        atm = atm or AtmosphereParams()
        jds = center_tt_jd + np.arange(-hours / 48.0, hours / 48.0 + 1e-9, step_min / 1440.0)
        alt, az, _ = self.sun_altaz(self.ts.tt_jd(jds), lat, lon, elevation_m)
        out = []
        for j, a, z in zip(jds, alt, az):
            app = a
            if a > -1.9:
                # invert approximately: apparent ≈ true + R(apparent); one fixed-point iteration suffices here
                r = refraction_deg(max(a, -1.0), atm)
                app = a + refraction_deg(max(a + r, -1.0), atm)
            out.append({"tt_jd": float(j), "alt_deg": float(a), "apparent_alt_deg": float(app), "az_deg": float(z)})
        return out


def predicted_azimuth_grid(engine: CandidateEngine, *, target_key, lat, lon, elevation_m, years,
                           horizon, limb, atm) -> tuple[np.ndarray, np.ndarray, float]:
    """Predicted azimuth on a grid of years, plus an interpolation self-check.

    Returns (years, azimuths, max_interp_error_deg) where the error is measured
    at grid mid-points against direct computation.
    """
    years = np.unique(np.round(np.asarray(years, dtype=float)))
    az = np.array([engine.event(target_key=target_key, lat=lat, lon=lon, elevation_m=elevation_m, year=y,
                                horizon=horizon, limb=limb, atm=atm).azimuth_deg for y in years])
    err = 0.0
    if years.size >= 3:
        checks = (years[:-1] + years[1:]) / 2.0
        pick = checks[:: max(1, checks.size // 3)][:3]
        for y in pick:
            direct = engine.event(target_key=target_key, lat=lat, lon=lon, elevation_m=elevation_m, year=y,
                                  horizon=horizon, limb=limb, atm=atm).azimuth_deg
            interp = float(np.interp(y, years, np.unwrap(az, period=360.0)))
            err = max(err, abs(((direct - interp + 180.0) % 360.0) - 180.0))
    return years, az, err
