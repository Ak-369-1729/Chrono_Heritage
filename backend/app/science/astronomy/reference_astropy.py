"""Independent reference path A: Astropy / ERFA with the built-in analytic ephemeris.

* Solar position: ``erfa.epv00`` Earth heliocentric/barycentric vectors (an
  analytic VSOP-type series), *not* a JPL numerical integration.
* Solstice instant: root of the Sun's apparent geocentric ecliptic longitude
  (``GeocentricTrueEcliptic``) at 90°/270°, solved here with bisection.
* Declination: apparent place in the true-equator/true-equinox (TETE) frame.
* Azimuth: closed-form spherical relation shared with path B.

Independence limitations (disclosed in every benchmark record):
Astropy and Skyfield both implement IAU 2006 precession / IAU 2000A nutation,
so this path is independent of the candidate's **ephemeris** but not of its
**precession–nutation model**.  ERFA documents ``epv00`` as designed for
1900–2100; accuracy far outside that interval is not guaranteed, which is
exactly why path B (Laskar obliquity) is also required for historical cases.
"""

from __future__ import annotations

import math
import warnings

from ..horizon import HorizonProfile
from ..refraction import (
    MEAN_SOLAR_SEMIDIAMETER_DEG,
    SOLAR_HORIZONTAL_PARALLAX_DEG,
    AtmosphereParams,
    EventLimb,
    target_centre_altitude_deg,
)
from .reference_analytic import azimuth_from_declination
from .targets import get_target

REFERENCE_NAME = "astropy-erfa-builtin (independent path A)"
REFERENCE_VERSION = "refA-1.0.0"


def versions() -> dict:
    import astropy
    import erfa

    return {"astropy": astropy.__version__, "pyerfa": erfa.__version__, "ephemeris": "builtin (erfa.epv00)"}


def _sun_state(jd_tt: float):
    from astropy import units as u
    from astropy.coordinates import TETE, GeocentricTrueEcliptic, get_body, solar_system_ephemeris
    from astropy.time import Time

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # ERFA 'dubious year' warnings are expected and logged by the harness
        t = Time(jd_tt, format="jd", scale="tt")
        with solar_system_ephemeris.set("builtin"):
            sun = get_body("sun", t)
        ecl = sun.transform_to(GeocentricTrueEcliptic(equinox=t))
        tete = sun.transform_to(TETE(obstime=t))
        return float(ecl.lon.to_value(u.deg)), float(tete.dec.to_value(u.deg)), float(sun.distance.to_value(u.au))


def solstice_instant_tt(year: float, longitude_deg: float) -> float:
    from .engine import _J2000_MARCH_EQUINOX_JD, _SEASON_OFFSET, _TROPICAL_YEAR

    year = int(round(float(year)))
    guess = _J2000_MARCH_EQUINOX_JD + _TROPICAL_YEAR * (year - 2000.0) + _SEASON_OFFSET[longitude_deg]

    def f(jd):
        lon, _, _ = _sun_state(jd)
        return (lon - longitude_deg + 180.0) % 360.0 - 180.0

    lo, hi = guess - 20.0, guess + 20.0
    flo = f(lo)
    if flo >= 0 or f(hi) < 0:
        raise ValueError("Could not bracket solstice with Astropy reference.")
    for _ in range(60):  # bisection to ~1e-11 d
        mid = 0.5 * (lo + hi)
        if f(mid) < 0:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def solstice_event_azimuth(*, target_key: str, lat: float, year: float, horizon: HorizonProfile | None = None,
                           limb: EventLimb | str = EventLimb.UPPER_LIMB, atm: AtmosphereParams | None = None) -> dict:
    target = get_target(target_key)
    if target.kind != "solstice":
        raise ValueError("Reference path A supports solstice targets only.")
    horizon = horizon or HorizonProfile.flat()
    atm = atm or AtmosphereParams()
    limb = EventLimb(limb)
    jd = solstice_instant_tt(year, target.ecliptic_longitude_deg)
    _, dec, dist = _sun_state(jd)
    sd = MEAN_SOLAR_SEMIDIAMETER_DEG / dist
    az = 90.0 if target.phenomenon == "rise" else 270.0
    for _ in range(20):
        h_topo = target_centre_altitude_deg(horizon.altitude_at(az), limb, atm, sd)
        h_geo = h_topo + (SOLAR_HORIZONTAL_PARALLAX_DEG / dist) * math.cos(math.radians(h_topo))
        new = azimuth_from_declination(dec, lat, h_geo, target.phenomenon)
        if abs(new - az) < 1e-10:
            az = new
            break
        az = new
    return {"azimuth_deg": az, "declination_deg": dec, "instant_tt_jd": jd, "distance_au": dist,
            "reference": REFERENCE_NAME, "version": REFERENCE_VERSION}


def instant_altaz_airless(jd_tt: float, lat: float, lon: float, elev_m: float) -> tuple[float, float]:
    """Airless topocentric alt/az at an instant (used as a supplementary modern cross-check)."""
    from astropy import units as u
    from astropy.coordinates import AltAz, EarthLocation, get_body, solar_system_ephemeris
    from astropy.time import Time

    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        t = Time(jd_tt, format="jd", scale="tt")
        loc = EarthLocation.from_geodetic(lon * u.deg, lat * u.deg, elev_m * u.m)
        with solar_system_ephemeris.set("builtin"):
            sun = get_body("sun", t, location=loc)
        aa = sun.transform_to(AltAz(obstime=t, location=loc, pressure=0 * u.hPa))
        return float(aa.alt.deg), float(aa.az.deg)
