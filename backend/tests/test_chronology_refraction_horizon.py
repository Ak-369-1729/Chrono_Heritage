import numpy as np
import pytest

from app.science.chronology import Chronology, ChronologyModel, calendar_date, julian_day, year_label
from app.science.horizon import HorizonKind, HorizonProfile
from app.science.refraction import (
    AtmosphereParams,
    EventLimb,
    RefractionModel,
    bennett_refraction_deg,
    target_centre_altitude_deg,
)


@pytest.mark.parametrize("y,m,d,cal,jd", [
    (2000, 1, 1.5, "gregorian_proleptic", 2451545.0),      # J2000
    (1957, 10, 4.81, "gregorian_proleptic", 2436116.31),   # Meeus ex. 7.a
    (333, 1, 27.5, "julian", 1842713.0),                   # Meeus ex. 7.b
    (-1000, 7, 12.5, "julian", 1356001.0),                 # Meeus table 7.a
    (-4712, 1, 1.5, "julian", 0.0),
])
def test_julian_day_reference_values(y, m, d, cal, jd):
    assert julian_day(y, m, d, cal) == pytest.approx(jd, abs=1e-6)
    yy, mm, dd = calendar_date(jd, cal)
    assert (yy, mm) == (y, m) and dd == pytest.approx(d, abs=1e-6)


def test_julian_gregorian_offset_in_2026():
    assert julian_day(2026, 10, 18, "julian") - julian_day(2026, 10, 18, "gregorian_proleptic") == pytest.approx(13)


def test_year_labels_use_astronomical_numbering():
    assert year_label(2026) == "2026 CE"
    assert year_label(0) == "1 BCE"
    assert year_label(-2499) == "2500 BCE"


def test_chronology_rejects_inverted_range_and_unsourced_normal():
    with pytest.raises(ValueError):
        Chronology(-1000, -1500)
    with pytest.raises(ValueError):
        Chronology(-1000, -900, ChronologyModel.NORMAL)


def test_chronology_sampling_respects_documented_bounds():
    rng = np.random.default_rng(3)
    u = Chronology(-2600, -2400).sample(rng, 50_000)
    assert u.min() >= -2600 and u.max() <= -2399
    n = Chronology(-2600, -2400, ChronologyModel.NORMAL, -2410, 100).sample(rng, 50_000)
    assert n.min() >= -2600 and n.max() <= -2399  # truncated at the documented bounds
    assert np.median(n) < np.median(u) + 150


def test_chronology_single_year_boundary():
    g = Chronology(1200, 1200).grid()
    assert g[0] == 1200 and g[-1] == 1200


def test_bennett_refraction_values():
    assert bennett_refraction_deg(0.0) * 60 == pytest.approx(34.48, abs=0.05)
    assert bennett_refraction_deg(90.0) * 60 == pytest.approx(0.0, abs=0.01)
    warm = bennett_refraction_deg(0.0, 1010, 30)
    assert warm < bennett_refraction_deg(0.0)
    with pytest.raises(ValueError):
        bennett_refraction_deg(-3.0)


def test_event_altitude_definitions_are_ordered():
    atm = AtmosphereParams()
    up = target_centre_altitude_deg(0.0, EventLimb.UPPER_LIMB, atm)
    ce = target_centre_altitude_deg(0.0, EventLimb.CENTRE, atm)
    lo = target_centre_altitude_deg(0.0, EventLimb.LOWER_LIMB, atm)
    assert up < ce < lo
    assert target_centre_altitude_deg(1.0, EventLimb.CENTRE, AtmosphereParams(RefractionModel.NONE)) == 1.0


def test_horizon_interpolation_wraps_and_flat_is_explicit():
    h = HorizonProfile(HorizonKind.MEASURED, [350, 10, 90], [2.0, 4.0, 0.0])
    assert h.altitude_at(0.0) == pytest.approx(3.0)
    assert h.altitude_at(360.0) == pytest.approx(3.0)
    flat = HorizonProfile.flat()
    assert flat.is_flat_assumption and flat.altitude_at(123.0) == 0.0
    with pytest.raises(ValueError):
        HorizonProfile(HorizonKind.DEM, [10], [1.0])


def test_horizon_gap_detection():
    h = HorizonProfile(HorizonKind.MEASURED, [80, 90, 100, 110], [1, 1, 1, 1])
    assert h.covers(95.0)
    assert not h.covers(200.0)
