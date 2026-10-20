import math

import numpy as np
import pytest

from app.science import angles
from app.science.conventions import to_true_azimuth


@pytest.mark.parametrize("obs,pred,expected", [
    (359.5, 0.5, -1.0), (0.5, 359.5, 1.0), (10.0, 350.0, 20.0), (180.0, 0.0, -180.0),
    (0.0, 180.0, -180.0), (720.25, -0.25, 0.5), (90.0, 90.0, 0.0), (-10.0, 10.0, -20.0),
])
def test_directed_residual_wraparound(obs, pred, expected):
    assert angles.signed_residual(obs, pred) == pytest.approx(expected, abs=1e-9)


@pytest.mark.parametrize("obs,pred,expected", [
    (5.0, 183.0, 2.0), (268.0, 90.0, -2.0), (90.0, 270.0, 0.0), (135.0, 45.0, -90.0), (1.0, 359.0, 2.0),
    (181.0, 359.0, 2.0),
])
def test_axial_residual_modulo_180(obs, pred, expected):
    assert angles.residual(obs, pred, "bidirectional") == pytest.approx(expected, abs=1e-9)


def test_directed_vs_bidirectional_differ():
    assert angles.residual(270.0, 90.0, "directed") == pytest.approx(-180.0)
    assert angles.residual(270.0, 90.0, "bidirectional") == pytest.approx(0.0)


def test_matched_axis_end_reports_compared_bearing():
    assert angles.matched_axis_end(10.0, 192.0, "bidirectional") == pytest.approx(190.0)
    assert angles.matched_axis_end(10.0, 12.0, "bidirectional") == pytest.approx(10.0)
    assert angles.matched_axis_end(370.0, 192.0, "directed") == pytest.approx(10.0)


def test_residual_is_vectorised_and_bounded():
    rng = np.random.default_rng(1)
    a, b = rng.uniform(-1000, 1000, 5000), rng.uniform(-1000, 1000, 5000)
    d = angles.signed_residual(a, b)
    assert np.all(d >= -180.0) and np.all(d < 180.0)
    ax = angles.residual(a, b, "bidirectional")
    assert np.all(ax >= -90.0) and np.all(ax < 90.0)


def test_normalize_and_units():
    assert angles.normalize_bearing(-1e-14) < 360.0
    assert angles.normalize_bearing(-90) == 270.0
    assert angles.to_degrees(100.0, "grad") == pytest.approx(90.0)
    assert angles.to_degrees(1600.0, "mil_nato") == pytest.approx(90.0)
    assert angles.dms_to_degrees(-12, 30, 0) == pytest.approx(-12.5)
    with pytest.raises(ValueError):
        angles.to_degrees(1.0, "furlongs")


def test_circular_statistics():
    assert angles.circular_mean_deg([350, 10]) == pytest.approx(0.0, abs=1e-9)
    assert angles.mean_resultant_length([0, 180], axial=True) == pytest.approx(1.0)
    assert angles.mean_resultant_length([0, 180]) == pytest.approx(0.0, abs=1e-12)


# ---------------------------------------------------------------- conventions

def test_true_north_needs_no_conversion():
    r = to_true_azimuth(raw_bearing=361.0, unit="deg", north_reference="true", measurement_uncertainty_deg=0.5,
                        lat=50, lon=0)
    assert r.status.value == "none_required" and r.true_azimuth_deg == pytest.approx(1.0)
    assert r.combined_uncertainty_deg == 0.5


def test_magnetic_requires_documented_declination():
    blocked = to_true_azimuth(raw_bearing=90, unit="deg", north_reference="magnetic", measurement_uncertainty_deg=1,
                              lat=50, lon=0, magnetic_declination_deg=-2.0)
    assert blocked.status.value == "blocked" and blocked.true_azimuth_deg is None  # no source → blocked
    ok = to_true_azimuth(raw_bearing=90, unit="deg", north_reference="magnetic", measurement_uncertainty_deg=1.0,
                         lat=50, lon=0, magnetic_declination_deg=-2.0, magnetic_declination_uncertainty_deg=0.5,
                         magnetic_declination_source="model X")
    assert ok.true_azimuth_deg == pytest.approx(88.0)
    assert ok.combined_uncertainty_deg == pytest.approx(math.sqrt(1.0 + 0.25))


def test_grid_north_uses_projection_convergence():
    # UTM 30N, east of the central meridian (−3°) in the north: grid north lies clockwise of true north.
    r = to_true_azimuth(raw_bearing=0.0, unit="deg", north_reference="grid", measurement_uncertainty_deg=0.2,
                        lat=51.0, lon=-1.0, grid_crs="EPSG:32630")
    assert r.status.value == "converted"
    assert 1.4 < r.true_azimuth_deg < 1.7
    nocrs = to_true_azimuth(raw_bearing=0.0, unit="deg", north_reference="grid", measurement_uncertainty_deg=0.2,
                            lat=51.0, lon=-1.0)
    assert nocrs.status.value == "blocked"


def test_unspecified_north_blocks():
    r = to_true_azimuth(raw_bearing=45, unit="deg", north_reference="unspecified", measurement_uncertainty_deg=1,
                        lat=0, lon=0)
    assert r.status.value == "blocked" and r.blocking_reasons


def test_missing_uncertainty_is_not_zero():
    r = to_true_azimuth(raw_bearing=45, unit="grad", north_reference="true", measurement_uncertainty_deg=None,
                        lat=0, lon=0)
    assert r.combined_uncertainty_deg is None
    assert r.true_azimuth_deg == pytest.approx(40.5)
    assert r.steps[0]["op"] == "unit_conversion"
