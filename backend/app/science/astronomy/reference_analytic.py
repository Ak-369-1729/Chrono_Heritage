"""Independent reference path B: analytic solstitial declination + spherical astronomy.

Shares **no ephemeris and no precession model** with the candidate engine:

* Mean obliquity: Laskar (1986) 10th-order polynomial, valid ±10 000 years
  (Meeus, *Astronomical Algorithms*, 2nd ed., eq. 22.3).
* Nutation in obliquity: four-term low-precision series (Meeus ch. 22), ≈0.5″.
* At a solstice the Sun's apparent longitude is 90°/270° and its ecliptic
  latitude is <1″, so its apparent declination equals ±(true obliquity).
* Rise/set azimuth from the standard spherical-triangle relation
  cos A = (sin δ − sin φ sin h) / (cos φ cos h), with h the geocentric
  altitude of the Sun's centre at the event.

Disclosed shared assumptions with the candidate (independence limitations):
the refraction model (Bennett 1982), the event-limb definition and the
horizon-profile interpolation are common inputs, by design, so that the
comparison isolates the astronomy.  The solar distance is taken as 1.0167 au at
the June solstice and 0.9837 au at the December solstice (modern values; the
effect on semidiameter is <0.0003° over the DE406 span).
"""

from __future__ import annotations

import math

from ..horizon import HorizonProfile
from ..refraction import (
    MEAN_SOLAR_SEMIDIAMETER_DEG,
    SOLAR_HORIZONTAL_PARALLAX_DEG,
    AtmosphereParams,
    EventLimb,
    target_centre_altitude_deg,
)
from .targets import get_target

REFERENCE_NAME = "analytic-laskar1986 (independent path B)"
REFERENCE_VERSION = "refB-1.0.0"
REFERENCE_CITATION = (
    "Laskar, J. (1986). Secular terms of classical planetary theories using the results of general "
    "relativity. A&A 157, 59–70; as tabulated in Meeus, J. (1998), Astronomical Algorithms, 2nd ed., eq. 22.3."
)

_LASKAR = [-4680.93, -1.55, 1999.25, -51.38, -249.67, -39.05, 7.12, 27.87, 5.79, 2.45]


def jd_tt_for_year(year: float) -> float:
    """Approximate TT JD of mid-year (sufficient: obliquity changes ~0.47″/yr)."""
    return 2451545.0 + (float(year) - 2000.0) * 365.25


def mean_obliquity_laskar_deg(jd_tt: float) -> float:
    u = (jd_tt - 2451545.0) / 3652500.0
    if abs(u) > 1.0:
        raise ValueError("Laskar (1986) obliquity is valid only within ±10 000 years of J2000.")
    eps = 84381.448  # 23°26′21.448″
    p = u
    for c in _LASKAR:
        eps += c * p
        p *= u
    return eps / 3600.0


def nutation_in_obliquity_deg(jd_tt: float) -> float:
    t = (jd_tt - 2451545.0) / 36525.0
    omega = math.radians(125.04452 - 1934.136261 * t)
    l_sun = math.radians(280.4665 + 36000.7698 * t)
    l_moon = math.radians(218.3165 + 481267.8813 * t)
    arcsec = 9.20 * math.cos(omega) + 0.57 * math.cos(2 * l_sun) + 0.10 * math.cos(2 * l_moon) - 0.09 * math.cos(2 * omega)
    return arcsec / 3600.0


def solstitial_declination_deg(year: float, june: bool) -> float:
    jd = jd_tt_for_year(year)
    eps = mean_obliquity_laskar_deg(jd) + nutation_in_obliquity_deg(jd)
    return eps if june else -eps


def azimuth_from_declination(dec_deg: float, lat_deg: float, alt_geo_deg: float, phenomenon: str) -> float:
    d, p, h = map(math.radians, (dec_deg, lat_deg, alt_geo_deg))
    c = (math.sin(d) - math.sin(p) * math.sin(h)) / (math.cos(p) * math.cos(h))
    if abs(c) > 1.0:
        raise ValueError("No rise/set at this latitude and declination.")
    a = math.degrees(math.acos(c))
    return a if phenomenon == "rise" else 360.0 - a


def solstice_event_azimuth(*, target_key: str, lat: float, year: float, horizon: HorizonProfile | None = None,
                           limb: EventLimb | str = EventLimb.UPPER_LIMB, atm: AtmosphereParams | None = None,
                           max_iter: int = 20) -> dict:
    target = get_target(target_key)
    if target.kind != "solstice":
        raise ValueError("Reference path B supports solstice targets only.")
    horizon = horizon or HorizonProfile.flat()
    atm = atm or AtmosphereParams()
    limb = EventLimb(limb)
    june = target.ecliptic_longitude_deg == 90.0
    dist = 1.0167 if june else 0.9837
    sd = MEAN_SOLAR_SEMIDIAMETER_DEG / dist
    dec = solstitial_declination_deg(year, june)

    az = 90.0 if target.phenomenon == "rise" else 270.0
    for _ in range(max_iter):
        h_topo = target_centre_altitude_deg(horizon.altitude_at(az), limb, atm, sd)
        h_geo = h_topo + (SOLAR_HORIZONTAL_PARALLAX_DEG / dist) * math.cos(math.radians(h_topo))
        new = azimuth_from_declination(dec, lat, h_geo, target.phenomenon)
        if abs(new - az) < 1e-10:
            az = new
            break
        az = new
    return {"azimuth_deg": az, "declination_deg": dec, "reference": REFERENCE_NAME, "version": REFERENCE_VERSION}
