"""API, persistence, authorization and tier-gate tests against PostgreSQL/PostGIS."""

from __future__ import annotations

import io
import json
from datetime import UTC, datetime

import pytest

from app.db import session_scope
from app.models import AnalysisRun, BenchmarkCase, BenchmarkResult, BenchmarkRun, BenchmarkSuite

API = "/api/v2"
HYP = "The passage axis was oriented toward December solstice sunrise over the measured horizon."


def test_health(client):
    r = client.get(f"{API}/health").json()
    assert r["ok"] and r["database"] == "ok" and r["postgis"]


def test_targets_list_flags_unsupported(client):
    t = {x["key"]: x for x in client.get(f"{API}/meta/targets").json()["targets"]}
    assert t["sun_june_solstice_rise"]["supported"] is True
    assert t["moon_major_standstill"]["supported"] is False and t["moon_major_standstill"]["note"]


def test_site_listing_and_filters(client):
    rows = client.get(f"{API}/sites").json()["sites"]
    assert {r["id"] for r in rows} >= {"ill-aster-hill", "ill-marl-ridge"}
    assert all(r["is_illustrative"] for r in rows if r["id"].startswith("ill-"))
    elig = client.get(f"{API}/sites", params={"eligible": "true"}).json()["sites"]
    assert "ill-marl-ridge" not in {r["id"] for r in elig}
    near = client.get(f"{API}/sites", params={"near": "52.4,-3.3,50"}).json()["sites"]
    assert [r["id"] for r in near] == ["ill-aster-hill"]
    box = client.get(f"{API}/sites", params={"bbox": "70,0,90,20"}).json()["sites"]
    assert [r["id"] for r in box] == ["ill-vellam-shrine"]
    assert client.get(f"{API}/sites", params={"near": "a,b"}).status_code == 422


def test_site_detail_traces_sources(client):
    d = client.get(f"{API}/sites/ill-aster-hill").json()
    assert d["provenance"]["fully_qualified"]
    assert d["orientation_transformation"]["true_azimuth_deg"] == pytest.approx(131.6)
    assert all(s["is_illustrative"] for s in d["sources"])
    assert {"orientation", "chronology", "horizon"} <= {r for s in d["sources"] for r in s["roles"]}
    assert client.get(f"{API}/sites/does-not-exist").status_code == 404


def test_anonymous_cannot_write(client):
    r = client.post(f"{API}/sites", json={"id": "abc-site", "name": "X"})
    assert r.status_code == 401


def test_create_site_full_workflow_with_validation_and_audit(client, researcher, reviewer):
    bad = client.post(f"{API}/sites", headers=researcher, json={"id": "Bad Id", "name": "x", "lat": 1})
    assert bad.status_code == 422
    assert any("id" in e for e in bad.json()["detail"]["errors"])
    src = client.post(f"{API}/sources", headers=researcher, json={
        "citation": "Test Author (2020). A real-looking test citation used only in automated tests.",
        "source_type": "peer_reviewed", "url": "https://example.org/paper"}).json()
    site_body = {"id": "test-site-a", "name": "Test Site A", "lat": 40.0, "lon": 10.0, "crs": "EPSG:4326",
                 "coordinates_source_id": src["id"], "visibility": "public"}
    # V3: publishing to the public registry is a Data Steward capability; researchers keep private drafts.
    pub = client.post(f"{API}/sites", headers=researcher, json=site_body)
    assert pub.status_code == 403 and pub.json()["detail"]["code"] == "steward_required"
    r = client.post(f"{API}/sites", headers=researcher, json=site_body | {"visibility": "private"})
    assert r.status_code == 201, r.text
    assert r.json()["permissions"]["can_edit"] and not r.json()["permissions"]["can_publish"]
    assert client.post(f"{API}/sites", headers=researcher, json={"id": "test-site-a", "name": "dup"}).status_code == 409
    # orientation without uncertainty or reason is refused (no silent zero error)
    no_unc = client.post(f"{API}/sites/test-site-a/orientations", headers=researcher, json={
        "label": "Axis", "raw_bearing": 120, "axis_mode": "directed", "north_reference": "true"})
    assert no_unc.status_code == 422
    ok = client.post(f"{API}/sites/test-site-a/orientations", headers=researcher, json={
        "label": "Axis", "raw_bearing": 120.5, "axis_mode": "directed", "north_reference": "true",
        "method": "total_station", "uncertainty_deg": 0.3, "source_id": src["id"]})
    assert ok.status_code == 201
    ch = client.post(f"{API}/sites/test-site-a/chronologies", headers=researcher, json={
        "start_year": -1200, "end_year": -1100, "calendar_basis": "julian", "date_basis": "radiocarbon",
        "uncertainty_note": "95% range", "source_id": src["id"]})
    assert ch.status_code == 201
    bad_h = client.post(f"{API}/sites/test-site-a/horizons", headers=researcher, json={
        "kind": "measured", "azimuths_deg": [100, 110], "altitudes_deg": [1, 2]})
    assert bad_h.status_code == 422  # measured profile requires a source
    d = client.post(f"{API}/sites/test-site-a/horizons", headers=researcher, json={
        "kind": "measured", "azimuths_deg": [100, 110, 120, 130], "altitudes_deg": [1.0, 1.2, 1.1, 0.9],
        "source_id": src["id"], "altitude_uncertainty_deg": 0.1}).json()
    assert d["provenance"]["fully_qualified"]
    # researchers cannot review; reviewers can
    assert client.post(f"{API}/sites/test-site-a/review", headers=researcher,
                       json={"decision": "approve", "note": "looks good"}).status_code == 403
    rv = client.post(f"{API}/sites/test-site-a/review", headers=reviewer,
                     json={"decision": "approve", "note": "Checked against the cited paper."})
    assert rv.status_code == 200 and rv.json()["status"] == "reviewed"
    # a material change resets review status
    client.post(f"{API}/sites/test-site-a/orientations", headers=researcher, json={
        "label": "Axis v2", "raw_bearing": 120.7, "axis_mode": "directed", "north_reference": "true",
        "method": "total_station", "uncertainty_deg": 0.3, "source_id": src["id"]})
    assert client.get(f"{API}/sites/test-site-a").status_code == 404  # private draft: hidden from anonymous
    d = client.get(f"{API}/sites/test-site-a", headers=researcher).json()
    assert d["status"] == "submitted"
    assert len(d["orientation_history"]) == 2 and d["orientation_record"]["raw_bearing"] == 120.7
    events = client.get(f"{API}/sites/test-site-a/audit", headers=researcher).json()["events"]
    actions = {e["action"] for e in events}
    assert {"create", "add_orientation", "add_chronology", "add_horizon", "review_approve", "status_reset"} <= actions


def test_illustrative_records_cannot_be_approved_or_edited(client, reviewer, researcher):
    r = client.post(f"{API}/sites/ill-aster-hill/review", headers=reviewer, json={"decision": "approve", "note": "ok ok"})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "illustrative_record"
    e = client.patch(f"{API}/sites/ill-aster-hill", headers=reviewer, json={"name": "renamed"})
    assert e.status_code == 409


def test_private_site_is_hidden_from_others(client, researcher, researcher2):
    client.post(f"{API}/sites", headers=researcher, json={"id": "private-site", "name": "Private"})
    assert client.get(f"{API}/sites/private-site", headers=researcher).status_code == 200
    assert client.get(f"{API}/sites/private-site", headers=researcher2).status_code == 404
    assert client.get(f"{API}/sites/private-site").status_code == 404


def _analysis(client, headers, **over):
    body = {"site_id": "ill-aster-hill",
            "hypothesis": {"target_key": "sun_december_solstice_rise", "statement": HYP, "mode": "confirmatory"},
            "parameters": {"horizon_mode": "site_profile", "n_samples": 2000, "seed": 123}}
    body.update(over)
    return client.post(f"{API}/analyses/single-site", headers=headers, json=body)


def test_single_site_analysis_lifecycle(client, researcher, researcher2):
    r = _analysis(client, researcher)
    assert r.status_code == 202, r.text
    run = client.get(f"{API}/analyses/{r.json()['id']}", headers=researcher).json()
    assert run["status"] == "succeeded", run["error"]
    res = run["result"]
    assert res["statistics"]["p_value"] is None
    assert "not evidence of intent" in res["caveat"]
    assert res["observed"]["true_azimuth_deg"] == pytest.approx(131.6)
    assert {w["code"] for w in run["warnings"]} >= {"illustrative", "benchmark_gate", "unreviewed_inputs"}
    assert run["input_snapshot"]["orientation_raw"]["raw_bearing"] == 131.6
    assert run["versions"]["ephemeris"] == "DE406"
    assert len(run["input_hash"]) == 64
    # private by default
    assert client.get(f"{API}/analyses/{run['id']}", headers=researcher2).status_code == 404
    assert client.get(f"{API}/analyses/{run['id']}").status_code == 404
    # rerun: new id, parent link, identical deterministic output
    rr = client.post(f"{API}/analyses/{run['id']}/rerun", headers=researcher, json={}).json()
    assert rr["id"] != run["id"] and rr["parent_run_id"] == run["id"] and rr["inputs_changed"] is False
    run2 = client.get(f"{API}/analyses/{rr['id']}", headers=researcher).json()
    assert run2["result"]["monte_carlo"]["residual_signed"] == res["monte_carlo"]["residual_signed"]
    # the original snapshot is immutable in the database
    s = session_scope()
    stored = s.get(AnalysisRun, run["id"])
    assert stored.input_snapshot == run["input_snapshot"]
    s.close()


def test_analysis_validation_refuses_missing_data(client, researcher):
    r = _analysis(client, researcher, site_id="ill-marl-ridge")
    assert r.status_code == 422
    errs = " ".join(r.json()["detail"]["errors"])
    assert "unspecified" in errs and "Chronology range missing" in errs
    no_record = client.post(f"{API}/sites", headers=researcher, json={
        "id": "no-horizon-site", "name": "No horizon", "lat": 10.0, "lon": 10.0, "crs": "EPSG:4326"})
    assert no_record.status_code == 201
    r = _analysis(client, researcher, site_id="no-horizon-site")
    assert r.status_code == 422 and "horizon" in " ".join(r.json()["detail"]["errors"]).lower()
    ok = _analysis(client, researcher, site_id="ill-vellam-shrine",
                   hypothesis={"target_key": "sun_march_equinox_rise", "statement": HYP},
                   parameters={"horizon_mode": "flat", "n_samples": 1000, "seed": 1})
    assert ok.status_code == 202
    run = client.get(f"{API}/analyses/{ok.json()['id']}", headers=researcher).json()
    assert {"flat_horizon", "target_not_historically_benchmarked"} <= {w["code"] for w in run["warnings"]}
    bad_target = _analysis(client, researcher, hypothesis={"target_key": "moon_major_standstill", "statement": HYP})
    assert bad_target.status_code == 422


def test_bidirectional_analysis_discloses_both_ends(client, researcher):
    r = _analysis(client, researcher, site_id="ill-corran-row",
                  hypothesis={"target_key": "sun_december_solstice_set", "statement": HYP})
    run = client.get(f"{API}/analyses/{r.json()['id']}", headers=researcher).json()
    assert run["status"] == "succeeded"
    assert "bidirectional" in {w["code"] for w in run["warnings"]}


def test_sky_explorer(client):
    r = client.post(f"{API}/sky/compute", json={"site_id": "ill-aster-hill", "target_key": "sun_december_solstice_rise",
                                                "horizon_mode": "site_profile", "compare_reference": True})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["label"].startswith("EXPLORATORY")
    assert "site chronology record" in d["inputs_provenance"]["date"]
    assert d["comparison"]["rows"] and d["reference_check"]["max_abs_difference_deg"] < 0.25
    blocked = client.post(f"{API}/sky/compute", json={"lat": 30, "lon": 30, "target_key": "sun_june_solstice_rise",
                                                      "year": 1000, "orientation_deg": 60,
                                                      "north_reference": "unspecified", "axis_mode": "directed"}).json()
    assert blocked["comparison"] is None and "no_residual" in {w["code"] for w in blocked["warnings"]}
    assert client.post(f"{API}/sky/compute", json={"lat": 30, "lon": 30,
                                                   "target_key": "sun_june_solstice_rise"}).status_code == 422
    assert client.post(f"{API}/sky/compute", json={"lat": 30, "lon": 30, "year": 100,
                                                   "target_key": "star_heliacal_rising"}).status_code == 422
    polar = client.post(f"{API}/sky/compute", json={"lat": 80, "lon": 0, "year": 100,
                                                    "target_key": "sun_june_solstice_rise"})
    assert polar.status_code == 422 and polar.json()["detail"]["code"] == "engine_error"


def test_feasibility_report_illustrative(client, researcher, reviewer):
    ids = ["ill-aster-hill", "ill-corran-row", "ill-vellam-shrine", "ill-tessaly-gate", "ill-marl-ridge"]
    r = client.post(f"{API}/dataset-feasibility/reports", headers=researcher,
                    json={"title": "Illustrative inventory", "site_ids": ids})
    assert r.status_code == 201, r.text
    rep = r.json()
    assert rep["is_illustrative"] and rep["qualified_count"] == 3
    assert rep["recommendation"]["decision"] == "no_decision_illustrative"
    assert rep["pooling_allowed"] is False and rep["critical_blockers"]
    assert len(rep["compatibility"]["pairs"]) == 10
    assert rep["kill_worksheet"]["K-01"]["outcome"] == "not_applicable"
    rv = client.post(f"{API}/dataset-feasibility/reports/{rep['id']}/review", headers=reviewer,
                     json={"decision": "approve", "note": "attempt"})
    assert rv.status_code == 409
    gates = client.get(f"{API}/gates").json()
    assert gates["phase0"]["status"] != "passed"


def test_cross_site_endpoint_is_gated_server_side(client, researcher):
    body = {"target_key": "sun_june_solstice_rise", "statement": "Pre-registered cross-site hypothesis text.",
            "null_model": "sector_uniform", "null_justification": "j" * 100, "sectors": {"x": [0, 180]}}
    r = client.post(f"{API}/analyses/cross-site", headers=researcher, json=body)
    assert r.status_code == 409
    gate = r.json()["detail"]["gate"]
    assert gate["status"] == "failed"
    assert {c["key"] for c in gate["conditions"] if not c["met"]} >= {"sites", "benchmark", "null_model"}
    rep = client.post(f"{API}/reports", headers=researcher, json={"kind": "cross_site"})
    assert rep.status_code == 409 and rep.json()["detail"]["code"] == "tier_gate_closed"


def test_signoffs_cannot_override_data_conditions(client, reviewer):
    r = client.post(f"{API}/gates/cross_site/signoffs", headers=reviewer,
                    json={"condition_key": "sites", "decision": "approve", "rationale": "x" * 30})
    assert r.status_code == 422


def test_reports_contain_reproducibility_information(client, researcher):
    run_id = _analysis(client, researcher).json()["id"]
    r = client.post(f"{API}/reports", headers=researcher, json={"kind": "analysis", "subject_id": run_id})
    assert r.status_code == 201, r.text
    files = r.json()["files"]
    pdf = client.get(files["pdf"]["url"], headers=researcher)
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    csv = client.get(files["csv"]["url"], headers=researcher).text
    assert "not proof of intent" in csv and "input_hash" in csv and "ILLUSTRATIVE" in csv
    bundle = json.loads(client.get(files["json"]["url"], headers=researcher).text)
    a = bundle["analysis"]
    for key in ("input_hash", "versions", "seed", "input_snapshot", "warnings", "parameters", "hypothesis"):
        assert key in a
    assert a["input_snapshot"]["sources"] and a["result"]["sensitivity"]
    # private analysis report is not downloadable anonymously
    assert client.get(files["pdf"]["url"]).status_code == 404


def test_csrf_guard_on_cookie_sessions(client):
    client.cookies.clear()
    r = client.post(f"{API}/auth/login", json={"email": "researcher@test.local", "password": "researcher-password-123"})
    assert r.status_code == 200
    blocked = client.post(f"{API}/sources", json={"citation": "Cookie test citation", "source_type": "secondary"})
    assert blocked.status_code == 403 and blocked.json()["detail"]["code"] == "csrf"
    ok = client.post(f"{API}/sources", json={"citation": "Cookie test citation", "source_type": "secondary"},
                     headers={"x-chronoheritage-client": "web"})
    assert ok.status_code == 201
    client.post(f"{API}/auth/logout")
    client.cookies.clear()


def test_login_rejects_bad_password(client):
    r = client.post(f"{API}/auth/login", json={"email": "admin@test.local", "password": "wrong-password"})
    assert r.status_code == 401


def test_image_upload_validation(client, researcher):
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
    ok = client.post(f"{API}/sites/ill-aster-hill/images", headers=researcher,
                     files={"file": ("a.png", io.BytesIO(png), "image/png")},
                     data={"attribution": "Test photographer", "licence": "CC-BY-4.0"})
    assert ok.status_code == 201
    bad = client.post(f"{API}/sites/ill-aster-hill/images", headers=researcher,
                      files={"file": ("a.png", io.BytesIO(b"GIF89a....."), "image/png")},
                      data={"attribution": "Test", "licence": "CC-BY"})
    assert bad.status_code == 415


def test_workflow_comparison_requires_measurements(client, researcher):
    d = client.get(f"{API}/workflow-comparisons").json()
    assert d["gate"]["status"] in ("not_evaluated", "pending")
    r = client.post(f"{API}/workflow-comparisons", headers=researcher, json={
        "case_label": "Case A", "tool": "Stellarium", "tool_version": "25.1", "operator_label": "op1",
        "task_definition": "Compute solstice sunrise azimuth with horizon", "elapsed_seconds": 900, "manual_steps": 14,
        "provenance_fields_preserved": ["coordinates", "orientation_bearing"], "uncertainty_propagation": "none",
        "reproducibility_steps": 9, "evidence_ref": "recording-001.mp4", "measured_at": "2026-10-18"})
    assert r.status_code == 201 and 0 < r.json()["provenance_score"] < 1
    d = client.get(f"{API}/workflow-comparisons").json()
    assert d["matrix"]["Case A"]["ChronoHeritage"] is None
    assert d["gate"]["status"] != "passed"


def test_behavioral_pilot_requires_consent_and_independent_verification(client, researcher, reviewer):
    base = {"researcher_role": "PhD candidate", "hypothesis": "A real hypothesis statement.", "run_date": "2026-10-18",
            "elapsed_minutes": 30, "would_return": "yes", "citation_commitment": "explicit_agreement"}
    assert client.post(f"{API}/behavioral-pilots", headers=researcher,
                       json={**base, "consent_recorded": False}).status_code == 422
    assert client.post(f"{API}/behavioral-pilots", headers=researcher,
                       json={**base, "consent_recorded": True}).status_code == 422  # venue required
    p = client.post(f"{API}/behavioral-pilots", headers=researcher,
                    json={**base, "consent_recorded": True, "citation_venue": "Thesis chapter 3"}).json()
    assert client.get(f"{API}/gates").json()["behavioral"]["status"] != "passed"
    v = client.post(f"{API}/behavioral-pilots/{p['id']}/verify", headers=reviewer,
                    json={"decision": "approve", "note": "Confirmed with researcher by email."})
    assert v.status_code == 200
    assert client.get(f"{API}/gates").json()["behavioral"]["status"] == "passed"
    # clean up: reject so later state reflects absence of real evidence
    client.post(f"{API}/behavioral-pilots/{p['id']}/verify", headers=reviewer,
                json={"decision": "reject", "note": "Test fixture only."})


@pytest.mark.slow
def test_benchmark_run_via_api_reports_blocked_not_pass(client, researcher):
    r = client.post(f"{API}/benchmarks/runs", headers=researcher)
    assert r.status_code == 202
    latest = client.get(f"{API}/benchmarks/runs/latest").json()
    assert latest["id"] == r.json()["id"]
    cls = latest["summary"]["classes"]
    assert cls["modern"]["blocked"] == 3 and cls["modern"]["pass"] == 0  # Horizons disabled in tests
    assert cls["historical"]["pass"] == 6 and cls["published"]["blocked"] == 1
    assert latest["gate"]["status"] == "pending"
    rep = client.post(f"{API}/reports", headers=researcher, json={"kind": "benchmark"})
    assert rep.status_code == 201


def _make_tier2_evidence(client, researcher, reviewer):
    """Create 15 reviewed, real-convention sites and a fully passing benchmark record (test fixture evidence)."""
    src = client.post(f"{API}/sources", headers=researcher, json={
        "citation": "Fixture source for tier-gate test (automated tests only).", "source_type": "survey_report"}).json()
    for i in range(15):
        sid = f"tier2-site-{i:02d}"
        client.post(f"{API}/sites", headers=researcher, json={
            "id": sid, "name": f"Tier2 {i}", "lat": 30.0 + i * 0.5, "lon": 20.0, "crs": "EPSG:4326",
            "coordinates_source_id": src["id"], "visibility": "public", "stratum": "east"})
        client.post(f"{API}/sites/{sid}/orientations", headers=researcher, json={
            "label": "Axis", "raw_bearing": 61.0 + (i % 3) * 0.2, "axis_mode": "directed", "north_reference": "true",
            "method": "total_station", "uncertainty_deg": 0.5, "source_id": src["id"]})
        client.post(f"{API}/sites/{sid}/chronologies", headers=researcher, json={
            "start_year": 1000, "end_year": 1100, "calendar_basis": "julian", "date_basis": "epigraphic",
            "uncertainty_note": "fixture", "source_id": src["id"]})
        client.post(f"{API}/sites/{sid}/horizons", headers=researcher, json={"kind": "none_declared"})
        rv = client.post(f"{API}/sites/{sid}/review", headers=reviewer, json={"decision": "approve", "note": "fixture"})
        assert rv.status_code == 200, rv.text
    s = session_scope()
    suite = s.get(BenchmarkSuite, "suite-v1")
    suite.tolerances_reviewed_at = datetime.now(UTC)
    run = BenchmarkRun(suite_id=suite.id, status="completed", finished_at=datetime.now(UTC),
                       summary={"classes": {c: {"pass": 1, "fail": 0, "blocked": 0} for c in
                                            ["modern", "historical", "horizon", "wraparound", "published",
                                             "reproducibility", "missing_data"]},
                                "required_classes": ["modern", "historical", "horizon", "wraparound", "published",
                                                     "reproducibility", "missing_data"], "tolerance_hash": "fixture"})
    s.add(run)
    s.flush()
    pub = s.query(BenchmarkCase).filter_by(case_key="PUB-001").one()
    s.add(BenchmarkResult(run_id=run.id, case_id=pub.id, status="pass", explanation="fixture"))
    s.commit()
    s.close()


@pytest.mark.slow
def test_cross_site_gate_opens_only_with_complete_evidence(client, researcher, steward, reviewer):
    _make_tier2_evidence(client, steward, reviewer)  # public registry records are contributed by a data steward
    body = {"target_key": "sun_june_solstice_rise", "statement": "Pre-registered cross-site hypothesis text.",
            "null_model": "sector_uniform", "null_justification": "Entrances in this fixture tradition face 0–180°; "
                                                                  "the null keeps that sector constraint.",
            "sectors": {"east": [0, 180]}, "n_null": 2000, "seed": 5}
    still_closed = client.post(f"{API}/analyses/cross-site", headers=researcher, json=body)
    assert still_closed.status_code == 409  # reviews missing
    for cond in ("null_model", "domain_review"):
        assert client.post(f"{API}/gates/cross_site/signoffs", headers=reviewer, json={
            "condition_key": cond, "decision": "approve", "rationale": "Reviewed protocol (test fixture)."}).status_code == 201
    opened = client.post(f"{API}/analyses/cross-site", headers=researcher, json=body)
    assert opened.status_code == 201, opened.text
    res = opened.json()["result"]
    assert res["n_sites"] >= 15 and 0 < res["p_value_mc"] <= 1
    assert res["effect_size_standardised"] is not None and res["null_model"] == "sector_uniform"
    # revoke a review → gate closes again
    client.post(f"{API}/gates/cross_site/signoffs", headers=reviewer, json={
        "condition_key": "null_model", "decision": "reject", "rationale": "Revoked after test (fixture cleanup)."})
    assert client.post(f"{API}/analyses/cross-site", headers=researcher, json=body).status_code == 409
