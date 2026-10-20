"""Pairwise and dataset convention compatibility (PRD §11.1, FR-24, FR-25).

Each pair of site records is compared field by field.  Every field resolves to
one of ``matched`` / ``convertible`` / ``uncertain`` / ``incompatible`` with a
reason.  The dataset score is a pre-registered weighted mean of pair scores, but
any unresolved *critical* mismatch blocks pooling regardless of the mean.
"""

from __future__ import annotations

from dataclasses import dataclass
from itertools import combinations

COMPATIBILITY_FORMULA_VERSION = "compat-1.0.0"
COMPATIBILITY_FORMULA_REGISTERED = "2026-10-18"
POOLING_THRESHOLD = 0.85

STATUS_SCORE = {"matched": 1.0, "convertible": 0.85, "uncertain": 0.5, "incompatible": 0.0}

# field -> (weight, critical)
FIELD_WEIGHTS: dict[str, tuple[float, bool]] = {
    "north_reference": (0.25, True),
    "axis_semantics": (0.20, True),
    "measurement_method": (0.15, False),
    "uncertainty_availability": (0.15, False),
    "chronology_representation": (0.10, False),
    "coordinate_system": (0.10, False),
    "bearing_units": (0.05, False),
}

METHOD_PRECISION_CLASS = {
    "total_station": "high",
    "theodolite_sun_sight": "high",
    "gnss_baseline": "high",
    "surveyed_plan": "medium",
    "prismatic_compass": "medium",
    "compass": "medium",
    "satellite_imagery": "low",
    "published_plan_estimate": "low",
    "sketch": "low",
}
_CLASS_ORDER = {"high": 0, "medium": 1, "low": 2}
CONVERTIBLE_UNITS = {"deg", "grad", "mil_nato"}


@dataclass
class FieldComparison:
    field: str
    status: str
    reason: str
    critical: bool

    def as_dict(self):
        return {"field": self.field, "status": self.status, "reason": self.reason, "critical": self.critical}


def _north(o: dict) -> tuple[str, str]:
    """Classify a record's north reference as (state, note)."""
    ref = o.get("north_reference")
    if ref in ("true", "astronomical"):
        return "true", ref
    if ref == "magnetic":
        if o.get("magnetic_declination_deg") is not None and o.get("magnetic_declination_source"):
            return "convertible", "magnetic with documented declination"
        return "blocked", "magnetic without documented declination"
    if ref == "grid":
        if o.get("grid_crs"):
            return "convertible", f"grid ({o.get('grid_crs')})"
        return "blocked", "grid without CRS"
    return "blocked", "unspecified"


def compare_pair(a: dict, b: dict) -> list[FieldComparison]:
    oa, ob = a.get("orientation") or {}, b.get("orientation") or {}
    ca, cb = a.get("chronology") or {}, b.get("chronology") or {}
    out: list[FieldComparison] = []

    def add(field, status, reason):
        out.append(FieldComparison(field, status, reason, FIELD_WEIGHTS[field][1]))

    # north reference
    na, nb = _north(oa), _north(ob)
    if "blocked" in (na[0], nb[0]):
        add("north_reference", "incompatible", f"Cannot relate to true north: A={na[1]}, B={nb[1]}")
    elif na[0] == nb[0] == "true":
        add("north_reference", "matched", "Both referenced to true/astronomical north")
    else:
        add("north_reference", "convertible", f"Documented conversion to true north: A={na[1]}, B={nb[1]}")

    # axis semantics
    ma, mb = oa.get("axis_mode"), ob.get("axis_mode")
    if not ma or not mb:
        add("axis_semantics", "incompatible", "Axis mode not recorded for at least one site")
    elif ma == mb:
        add("axis_semantics", "matched", f"Both {ma}")
    else:
        add("axis_semantics", "convertible",
            "Directed vs bidirectional: comparison only modulo 180° (direction information discarded)")

    # method
    pa = METHOD_PRECISION_CLASS.get(oa.get("method") or "", None)
    pb = METHOD_PRECISION_CLASS.get(ob.get("method") or "", None)
    if pa is None or pb is None:
        add("measurement_method", "uncertain", "Method missing or not in the registered method list")
    else:
        gap = abs(_CLASS_ORDER[pa] - _CLASS_ORDER[pb])
        status = {0: "matched", 1: "convertible", 2: "uncertain"}[gap]
        add("measurement_method", status, f"Precision classes {pa} vs {pb}")

    # uncertainty
    def unc_state(o):
        if o.get("uncertainty_deg") is not None:
            return "numeric"
        if o.get("uncertainty_unavailable_reason"):
            return "reason"
        return "missing"
    ua, ub = unc_state(oa), unc_state(ob)
    if "missing" in (ua, ub):
        add("uncertainty_availability", "incompatible", "Uncertainty missing without documented reason")
    elif ua == ub == "numeric":
        add("uncertainty_availability", "matched", "Both report numeric uncertainty")
    else:
        add("uncertainty_availability", "uncertain",
            "At least one site documents why uncertainty is unavailable; propagation is not comparable")

    # chronology
    def chron_state(c):
        if c.get("start_year") is None or c.get("end_year") is None:
            return "missing"
        return "range" if c.get("calendar_basis") else "range_no_calendar"
    sa, sb = chron_state(ca), chron_state(cb)
    if "missing" in (sa, sb):
        add("chronology_representation", "incompatible", "Chronology range missing")
    elif sa == sb == "range":
        add("chronology_representation", "matched", "Both closed ranges with calendar basis")
    else:
        add("chronology_representation", "uncertain", "Calendar basis missing for at least one range")

    # CRS
    xa, xb = a.get("crs"), b.get("crs")
    if not xa or not xb:
        add("coordinate_system", "uncertain", "CRS not recorded for at least one site")
    elif xa == xb:
        add("coordinate_system", "matched", f"Both {xa}")
    else:
        add("coordinate_system", "convertible", f"{xa} vs {xb}: explicit CRS transformation required")

    # units
    ua_, ub_ = oa.get("bearing_unit"), ob.get("bearing_unit")
    if ua_ not in CONVERTIBLE_UNITS or ub_ not in CONVERTIBLE_UNITS:
        add("bearing_units", "incompatible", "Unknown bearing unit")
    elif ua_ == ub_:
        add("bearing_units", "matched", f"Both {ua_}")
    else:
        add("bearing_units", "convertible", f"{ua_} vs {ub_}")
    return out


def pair_score(fields: list[FieldComparison]) -> float:
    total = sum(FIELD_WEIGHTS[f.field][0] for f in fields)
    return sum(FIELD_WEIGHTS[f.field][0] * STATUS_SCORE[f.status] for f in fields) / total


def critical_blockers(fields: list[FieldComparison]) -> list[str]:
    return [f"{f.field}: {f.reason}" for f in fields if f.critical and f.status == "incompatible"]


def dataset_compatibility(records: list[dict]) -> dict:
    """Compute the pairwise matrix and the dataset-level decision.

    ``records`` must carry an ``id`` and ``label``.
    """
    pairs = []
    for a, b in combinations(records, 2):
        fields = compare_pair(a, b)
        pairs.append({
            "a": a["id"], "b": b["id"], "a_label": a.get("label"), "b_label": b.get("label"),
            "score": round(pair_score(fields), 4),
            "fields": [f.as_dict() for f in fields],
            "critical_blockers": critical_blockers(fields),
        })
    if pairs:
        score = sum(p["score"] for p in pairs) / len(pairs)
    else:
        score = None
    blockers = sorted({b for p in pairs for b in p["critical_blockers"]})
    pooling_allowed = score is not None and score >= POOLING_THRESHOLD and not blockers
    return {
        "formula_version": COMPATIBILITY_FORMULA_VERSION,
        "threshold": POOLING_THRESHOLD,
        "dataset_score": None if score is None else round(score, 4),
        "pairs": pairs,
        "critical_blockers": blockers,
        "pooling_allowed": pooling_allowed,
        "n_records": len(records),
    }


def formula_description() -> dict:
    return {
        "version": COMPATIBILITY_FORMULA_VERSION,
        "registered": COMPATIBILITY_FORMULA_REGISTERED,
        "status_scores": STATUS_SCORE,
        "field_weights": {k: {"weight": w, "critical": c} for k, (w, c) in FIELD_WEIGHTS.items()},
        "pair_score": "Σ(weight_f · status_score_f) / Σ weight_f",
        "dataset_score": "unweighted mean of pair scores",
        "pooling_rule": f"dataset_score ≥ {POOLING_THRESHOLD} AND no unresolved critical mismatch",
        "method_precision_classes": METHOD_PRECISION_CLASS,
    }
