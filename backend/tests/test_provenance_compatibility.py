import pytest

from app.science import compatibility, provenance


def record(**over):
    base = {
        "id": "a", "label": "A", "lat": 1.0, "lon": 2.0, "crs": "EPSG:4326", "coordinates_source_id": "s1",
        "sources": [{"source_type": "peer_reviewed"}],
        "orientation": {"raw_bearing": 100.0, "bearing_unit": "deg", "axis_mode": "directed",
                        "north_reference": "true", "method": "total_station", "uncertainty_deg": 0.5,
                        "uncertainty_unavailable_reason": None, "source_id": "s2"},
        "chronology": {"start_year": -2000, "end_year": -1800, "date_basis": "radiocarbon",
                       "calendar_basis": "julian", "source_id": "s3", "uncertainty_note": "95% range"},
        "horizon_kind": "measured",
    }
    for k, v in over.items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            base[k] = {**base[k], **v}
        else:
            base[k] = v
    return base


def test_complete_record_scores_one_and_qualifies():
    r = provenance.score_record(record())
    assert r.score == pytest.approx(1.0)
    assert r.fully_qualified and not r.critical_missing


def test_documented_reason_counts_as_uncertainty_evidence():
    r = provenance.score_record(record(orientation={"uncertainty_deg": None,
                                                    "uncertainty_unavailable_reason": "not reported"}))
    assert "orientation_uncertainty" in r.present and r.fully_qualified


def test_high_score_cannot_override_missing_critical_field():
    r = provenance.score_record(record(orientation={"north_reference": "unspecified"}))
    assert r.score > 0.9
    assert not r.fully_qualified
    assert r.critical_missing == ["orientation_north_reference"]


def test_non_scholarly_sources_do_not_qualify():
    r = provenance.score_record(record(sources=[{"source_type": "secondary"}]))
    assert "scholarly_source" in r.critical_missing


def test_compatibility_matched_pair():
    fields = compatibility.compare_pair(record(id="a"), record(id="b"))
    assert all(f.status == "matched" for f in fields)
    assert compatibility.pair_score(fields) == pytest.approx(1.0)


def test_magnetic_with_declination_is_convertible_and_without_is_critical():
    good = record(id="b", orientation={"north_reference": "magnetic", "magnetic_declination_deg": -1.0,
                                       "magnetic_declination_source": "model"})
    f = {x.field: x for x in compatibility.compare_pair(record(), good)}
    assert f["north_reference"].status == "convertible"
    bad = record(id="c", orientation={"north_reference": "magnetic"})
    f2 = {x.field: x for x in compatibility.compare_pair(record(), bad)}
    assert f2["north_reference"].status == "incompatible" and f2["north_reference"].critical
    assert compatibility.critical_blockers(list(f2.values()))


def test_critical_blocker_blocks_pooling_even_with_high_mean():
    recs = [record(id=str(i), label=str(i)) for i in range(20)]
    recs.append(record(id="x", label="x", orientation={"north_reference": "unspecified"}))
    out = compatibility.dataset_compatibility(recs)
    assert out["dataset_score"] >= 0.85
    assert out["critical_blockers"]
    assert out["pooling_allowed"] is False


def test_pooling_threshold_is_inclusive():
    assert compatibility.POOLING_THRESHOLD == 0.85
    recs = [record(id="a"), record(id="b")]
    out = compatibility.dataset_compatibility(recs)
    assert out["pooling_allowed"] is True


def test_axis_mismatch_is_convertible_with_reason():
    f = {x.field: x for x in compatibility.compare_pair(record(), record(id="b", orientation={"axis_mode": "bidirectional"}))}
    assert f["axis_semantics"].status == "convertible"
    assert "180" in f["axis_semantics"].reason
