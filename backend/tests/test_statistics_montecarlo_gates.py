import numpy as np
import pytest

from app.science import gates
from app.science import statistics as st
from app.science.angles import AxisMode
from app.science.chronology import Chronology
from app.science.montecarlo import OrientationInput, PredictionGrid, propagate

GRID = PredictionGrid(np.array([-2600.0, -2400.0]), np.array([48.15, 48.18]))


def _run(seed, sigma=0.5, **kw):
    return propagate(orientation=OrientationInput(48.0, sigma, AxisMode.DIRECTED), chronology=Chronology(-2600, -2400),
                     grid=GRID, horizon_sigma_deg=None, n_samples=5000, seed=seed, **kw)


def test_seeded_propagation_is_reproducible():
    assert _run(7) == _run(7)
    assert _run(7)["residual_signed"] != _run(8)["residual_signed"]


def test_uncertainty_propagation_widens_with_sigma():
    narrow, wide = _run(1, sigma=0.2), _run(1, sigma=2.0)
    w = lambda r: r["residual_signed"]["q975"] - r["residual_signed"]["q025"]  # noqa: E731
    assert w(wide) > 5 * w(narrow)
    assert narrow["residual_signed"]["median"] == pytest.approx(-0.165, abs=0.03)


def test_missing_orientation_uncertainty_is_declared_not_zeroed():
    r = _run(1, sigma=None)
    assert any("orientation uncertainty not documented" in u for u in r["components_unavailable"])


def test_within_window_is_a_share_not_a_p_value():
    r = _run(2)
    assert 0.0 <= r["within_window"]["1"] <= 1.0
    assert "NOT a p-value" in r["within_window_note"]


def test_horizon_uncertainty_component_is_linearised():
    grid = PredictionGrid(GRID.years, GRID.azimuths, horizon_sensitivity_deg_per_deg=1.1)
    r = propagate(orientation=OrientationInput(48.0, 0.1, AxisMode.DIRECTED), chronology=Chronology(-2600, -2400),
                  grid=grid, horizon_sigma_deg=0.3, n_samples=20000, seed=4)
    assert r["predicted_azimuth"]["sd"] == pytest.approx(1.1 * 0.3, rel=0.1)


# ----------------------------------------------------------------- null models

def _sites(n, aligned=True, seed=0):
    rng = np.random.default_rng(seed)
    out = []
    for i in range(n):
        pred = 50.0 + rng.normal(0, 3)
        orient = pred + rng.normal(0, 0.5) if aligned else rng.uniform(30, 150)
        out.append(st.SiteInput(f"s{i}", "east-facing", orient, 0.5, AxisMode.DIRECTED, pred))
    return out


SECTOR = st.NullSpec(st.NullModel.SECTOR_UNIFORM, "Documented tradition: entrances face the eastern sector "
                     "30°–150° (per architectural survey); null keeps that constraint and varies only within it.",
                     sectors={"east-facing": (30.0, 150.0)})


def test_null_comparison_detects_planted_alignment():
    r = st.null_comparison(sites=_sites(16), spec=SECTOR, statistic=st.Statistic.COUNT_WITHIN, window_deg=2.0,
                           n_null=4000, n_uncertainty=500, seed=1)
    assert r["p_value_mc"] < 0.01 and r["effect_size_raw"] > 5
    assert r["p_value_mc"] >= 1 / (4000 + 1)


def test_null_comparison_under_null_is_not_significant_on_average():
    ps = [st.null_comparison(sites=_sites(16, aligned=False, seed=k), spec=SECTOR,
                             statistic=st.Statistic.COUNT_WITHIN, window_deg=2.0, n_null=1000, n_uncertainty=100,
                             seed=k)["p_value_mc"] for k in range(30)]
    assert np.mean(np.array(ps) < 0.05) <= 0.2


def test_uniform_null_needs_justification_and_is_flagged():
    with pytest.raises(ValueError):
        st.null_comparison(sites=_sites(4), spec=st.NullSpec(st.NullModel.UNIFORM_CIRCULAR, "because"),
                           statistic=st.Statistic.COUNT_WITHIN, window_deg=1, n_null=100, n_uncertainty=10, seed=0)
    r = st.null_comparison(sites=_sites(4), spec=st.NullSpec(st.NullModel.UNIFORM_CIRCULAR, "x" * 90),
                           statistic=st.Statistic.COUNT_WITHIN, window_deg=1, n_null=100, n_uncertainty=10, seed=0)
    assert r["null_flagged"] is True


def test_empirical_null_requires_reference_population():
    spec = st.NullSpec(st.NullModel.EMPIRICAL_REFERENCE, "x" * 90, reference_orientations={"east-facing": [1, 2]})
    with pytest.raises(ValueError):
        st.null_comparison(sites=_sites(4), spec=spec, statistic=st.Statistic.MEAN_ABS_RESIDUAL, window_deg=1,
                           n_null=100, n_uncertainty=10, seed=0)


def test_null_comparison_is_seeded():
    a = st.null_comparison(sites=_sites(6), spec=SECTOR, statistic=st.Statistic.MEAN_ABS_RESIDUAL, window_deg=1,
                           n_null=500, n_uncertainty=50, seed=9)
    b = st.null_comparison(sites=_sites(6), spec=SECTOR, statistic=st.Statistic.MEAN_ABS_RESIDUAL, window_deg=1,
                           n_null=500, n_uncertainty=50, seed=9)
    a.pop("_null_stats"), b.pop("_null_stats")
    assert a == b


def test_multiple_comparison_corrections():
    p = [0.01, 0.04, 0.03, 0.005]
    assert st.holm(p) == pytest.approx([0.03, 0.06, 0.06, 0.02])
    assert st.benjamini_hochberg(p) == pytest.approx([0.02, 0.04, 0.04, 0.02])
    with pytest.raises(ValueError):
        st.correct([0.1, 0.2], "none")
    null = np.random.default_rng(0).normal(size=(2000, 3))
    adj = st.max_statistic_adjusted([3.5, 0.1, 1.0], null)
    assert adj[0] < adj[2] < adj[1]


# ----------------------------------------------------------------------- gates

def test_phase0_gate_never_passes_on_illustrative_data():
    assert gates.phase0_gate({"real_report": False, "inventory_count": 5}).status == "pending"
    assert gates.phase0_gate({"real_report": False, "inventory_count": None}).status == "not_evaluated"


def test_phase0_gate_kill_and_pass():
    fail = gates.phase0_gate({"real_report": True, "inventory_count": 5, "qualified_count": 2,
                              "compatibility_assessed": True, "report_reviewed": True})
    assert fail.status == "failed" and fail.kill_criterion == "K-01"
    ok = gates.phase0_gate({"real_report": True, "inventory_count": 5, "qualified_count": 3,
                            "compatibility_assessed": True, "report_reviewed": True})
    assert ok.status == "passed"


def test_benchmark_gate_blocked_is_not_pass():
    ev = {"run_exists": True, "required_classes": ["modern", "historical"], "tolerances_frozen": True,
          "tolerances_reviewed": True, "published_case_passed": True,
          "classes": {"modern": {"pass": 0, "fail": 0, "blocked": 3}, "historical": {"pass": 6, "fail": 0, "blocked": 0}}}
    assert gates.benchmark_gate(ev).status == "pending"
    ev["classes"]["modern"] = {"pass": 2, "fail": 1, "blocked": 0}
    assert gates.benchmark_gate(ev).status == "failed"
    ev["classes"]["modern"] = {"pass": 3, "fail": 0, "blocked": 0}
    assert gates.benchmark_gate(ev).status == "passed"


@pytest.mark.parametrize("n,score,blockers,expected", [
    (14, 0.95, [], "failed"), (15, 0.85, [], "passed"), (20, 0.849, [], "failed"), (18, 0.99, ["x"], "failed"),
])
def test_cross_site_gate_thresholds(n, score, blockers, expected):
    ev = {"eligible_sites": n, "compatibility_score": score, "critical_blockers": blockers,
          "benchmark_status": "passed", "null_model_approved": True, "domain_review_approved": True}
    assert gates.cross_site_gate(ev).status == expected


def test_cross_site_gate_requires_reviews():
    ev = {"eligible_sites": 16, "compatibility_score": 0.9, "critical_blockers": [], "benchmark_status": "passed",
          "null_model_approved": False, "domain_review_approved": True}
    assert gates.cross_site_gate(ev).status == "failed"


def test_behavioral_gate_ignores_stated_interest():
    assert gates.behavioral_gate({"pilots": [{"real_hypothesis": True, "citation_commitment": "stated_interest",
                                              "verified": True}]}).status != "passed"
    assert gates.behavioral_gate({"pilots": [{"real_hypothesis": True, "citation_commitment": "explicit_agreement",
                                              "verified": True}]}).status == "passed"


def test_ml_is_omitted():
    assert gates.ml_gate().status == "omitted"
