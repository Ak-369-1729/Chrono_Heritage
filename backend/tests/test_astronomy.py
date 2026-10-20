import json

import httpx
import numpy as np
import pytest

from app.benchmarks import harness
from app.science.astronomy import horizons, reference_analytic, reference_astropy
from app.science.astronomy.engine import CandidateEngine, EngineError, NoEventError
from app.science.horizon import HorizonProfile


@pytest.fixture(scope="module")
def engine():
    return CandidateEngine()


def test_de406_adapter_matches_skyfield_spk_reader(engine):
    """Our Chebyshev evaluator vs Skyfield's own SPK reader on DE421 (overlap epoch)."""
    skyfield_data = pytest.importorskip("skyfield_data")
    from skyfield.api import Loader

    loader = Loader(skyfield_data.get_skyfield_data_path())
    de421 = loader("de421.bsp")
    t = engine.ts.tt_jd(np.array([2451545.0, 2460000.5]))
    d_earth = np.linalg.norm(de421["earth"].at(t).position.km - engine.earth.at(t).position.km, axis=0)
    d_sun = np.linalg.norm(de421["sun"].at(t).position.km - engine.sun.at(t).position.km, axis=0)
    assert d_earth.max() < 20.0 and d_sun.max() < 20.0  # DE406 vs DE421 agree at the km level


def test_solstitial_declination_equals_obliquity(engine):
    r = engine.event(target_key="sun_june_solstice_rise", lat=40.0, lon=0.0, year=2000)
    # Mean obliquity J2000 = 23.4393°. The engine reports topocentric apparent declination at sunrise:
    # nutation in obliquity (≈ −4″ in mid-2000) and horizontal parallax (≈ −7″ at 40°N) lower it by ≈0.003°.
    assert r.declination_deg == pytest.approx(23.4393 - 0.003, abs=0.0015)
    old = engine.event(target_key="sun_june_solstice_rise", lat=40.0, lon=0.0, year=-2499)
    assert old.declination_deg > 23.9  # larger obliquity in the 3rd millennium BCE


def test_equator_equinox_sunrise_is_near_east(engine):
    r = engine.event(target_key="sun_march_equinox_rise", lat=0.0, lon=0.0, year=2024, limb="centre")
    assert abs(r.azimuth_deg - 90.0) < 0.5


def test_polar_latitude_has_no_event(engine):
    with pytest.raises(NoEventError):
        engine.event(target_key="sun_june_solstice_rise", lat=75.0, lon=0.0, year=2000)


def test_missing_inputs_and_unsupported_targets_are_refused(engine):
    with pytest.raises(EngineError):
        engine.event(target_key="sun_june_solstice_rise", lat=40.0, lon=0.0)
    with pytest.raises(EngineError):
        engine.event(target_key="moon_major_standstill", lat=40.0, lon=0.0, year=2000)
    with pytest.raises(EngineError):
        engine.event(target_key="sun_rise_on_date", lat=40.0, lon=0.0)
    with pytest.raises(EngineError):
        engine.event(target_key="sun_june_solstice_rise", lat=40.0, lon=0.0, year=-3500)


def test_raised_horizon_shifts_june_sunrise_south(engine):
    flat = engine.event(target_key="sun_june_solstice_rise", lat=40.0, lon=0.0, year=2000)
    raised = engine.event(target_key="sun_june_solstice_rise", lat=40.0, lon=0.0, year=2000,
                          horizon=HorizonProfile.constant(2.0))
    assert raised.azimuth_deg > flat.azimuth_deg + 1.5


def test_calendar_date_target_respects_calendar_basis(engine):
    j = engine.event(target_key="sun_rise_on_date", lat=30.0, lon=0.0, date=(1400, 3, 11), calendar="julian")
    g = engine.event(target_key="sun_rise_on_date", lat=30.0, lon=0.0, date=(1400, 3, 11),
                     calendar="gregorian_proleptic")
    assert abs(j.azimuth_deg - g.azimuth_deg) > 1.0  # 9-day calendar offset near an equinox


@pytest.mark.slow
@pytest.mark.parametrize("target,lat,year", [("sun_june_solstice_rise", 51.18, -2499),
                                             ("sun_december_solstice_set", -20.0, 900)])
def test_independent_references_agree_with_candidate(engine, target, lat, year):
    c = engine.event(target_key=target, lat=lat, lon=0.0, year=year).azimuth_deg
    a = reference_astropy.solstice_event_azimuth(target_key=target, lat=lat, year=year)["azimuth_deg"]
    b = reference_analytic.solstice_event_azimuth(target_key=target, lat=lat, year=year)["azimuth_deg"]
    assert abs(a - c) < 0.25 and abs(b - c) < 0.25


def test_laskar_obliquity_validity_window():
    assert reference_analytic.mean_obliquity_laskar_deg(2451545.0) == pytest.approx(23.4392911, abs=1e-6)
    with pytest.raises(ValueError):
        reference_analytic.mean_obliquity_laskar_deg(2451545.0 + 3652500.0 * 1.5)


# ---------------------------------------------------------- JPL Horizons adapter

SAMPLE = """*****
$$SOE
 2460481.666666667, , , 45.123456789, -3.210987654,
 2460481.833333333,*, , 120.000000001, 40.500000000,
$$EOE
*****"""


def test_horizons_parser_and_params():
    rows = horizons.parse_result_text(SAMPLE)
    assert rows[0] == {"tt_jd": pytest.approx(2460481.666666667), "az_deg": pytest.approx(45.123456789),
                       "el_deg": pytest.approx(-3.210987654)}
    assert rows[1]["el_deg"] == pytest.approx(40.5)
    p = horizons.build_params(lat=51.0, lon=-1.5, elev_m=100.0, tt_jds=[2460481.5])
    assert p["APPARENT"] == "'AIRLESS'" and p["TIME_TYPE"] == "'TT'" and p["QUANTITIES"] == "'4'"
    assert p["SITE_COORD"] == "'-1.500000,51.000000,0.1000'"
    with pytest.raises(horizons.ReferenceUnavailable):
        horizons.parse_result_text("no ephemeris here")


def _mock_client(rows_shift: float, case: dict):
    eng = CandidateEngine()
    inp = case["inputs"]
    alt, az, _ = eng.sun_altaz(eng.ts.tt_jd(np.array(inp["tt_jds"])), inp["lat"], inp["lon"], inp["elev_m"])
    body = "$$SOE\n" + "\n".join(f" {j:.9f}, , , {z + rows_shift:.9f}, {a:.9f}," for j, a, z in
                                 zip(inp["tt_jds"], alt, az)) + "\n$$EOE"

    def handler(request):
        return httpx.Response(200, json={"signature": {"version": "1.2", "source": "mock"}, "result": body})

    return httpx.Client(transport=httpx.MockTransport(handler))


def test_harness_modern_comparator_pass_fail_and_blocked(monkeypatch):
    """Exercises the comparison logic with a mocked transport; not a validation of the engine."""
    case = next(c for c in harness.load_suite()["cases"] if c["case_key"] == "MOD-001")
    real_fetch = horizons.fetch_sun_azel

    for shift, expected in ((0.05, "pass"), (0.2, "fail")):
        client = _mock_client(shift, case)
        monkeypatch.setattr(horizons, "fetch_sun_azel", lambda _c=client, **kw: real_fetch(client=_c, **kw))
        out = harness.run_modern(case, 0.10, horizons_enabled=True)
        assert out.status == expected, out.explanation
    blocked = harness.run_modern(case, 0.10, horizons_enabled=False)
    assert blocked.status == "blocked"
    assert "supplementary" in json.dumps(blocked.reference_outputs)


def test_unreachable_horizons_is_reported_not_substituted():
    def handler(request):
        raise httpx.ConnectError("offline")

    with pytest.raises(horizons.ReferenceUnavailable):
        horizons.fetch_sun_azel(lat=0, lon=0, elev_m=0, tt_jds=[2460000.5],
                                client=httpx.Client(transport=httpx.MockTransport(handler)))


def test_suite_tolerances_are_frozen_and_hashed():
    s = harness.load_suite()
    assert len(s["tolerance_hash"]) == 64
    assert s["tolerances"]["historical"]["tolerance_deg"] == 0.25
    assert s["tolerances"]["modern"]["tolerance_deg"] == 0.10
    assert set(s["required_classes"]) == {"modern", "historical", "horizon", "wraparound", "published",
                                          "reproducibility", "missing_data"}
