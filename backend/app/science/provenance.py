"""Field-level provenance completeness (PRD §11.2, FR-23).

A completeness score is NOT a truth score.  It measures whether the evidence
needed to audit a record is present.  Weights and critical fields are
pre-registered here and versioned; changing them requires a new formula version.
A high weighted score can never override a missing critical field.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

PROVENANCE_FORMULA_VERSION = "prov-1.0.0"
PROVENANCE_FORMULA_REGISTERED = "2026-10-18"

# (key, label, weight, critical)
PROVENANCE_FIELDS: list[tuple[str, str, float, bool]] = [
    ("coordinates", "Coordinates with source", 1.0, True),
    ("crs", "Coordinate reference system", 0.5, False),
    ("scholarly_source", "At least one primary or scholarly source", 1.0, True),
    ("orientation_bearing", "Orientation bearing", 1.0, True),
    ("orientation_axis_mode", "Axis definition (directed / bidirectional)", 1.0, True),
    ("orientation_north_reference", "North reference (specified)", 1.0, True),
    ("orientation_method", "Measurement method", 1.0, False),
    ("orientation_uncertainty", "Orientation uncertainty or documented reason unavailable", 1.0, True),
    ("orientation_source", "Orientation source citation", 1.0, True),
    ("chronology_range", "Chronology range (start and end)", 1.0, True),
    ("chronology_basis", "Chronology basis (e.g. radiocarbon, epigraphic)", 0.5, False),
    ("chronology_calendar", "Calendar / year-numbering basis", 0.5, False),
    ("chronology_source", "Chronology source citation", 1.0, True),
    ("chronology_uncertainty_note", "Chronology uncertainty note", 0.5, False),
    ("horizon", "Horizon: measured, DEM-derived, or explicitly none", 0.5, False),
]

SCHOLARLY_SOURCE_TYPES = {"primary", "peer_reviewed", "monograph", "excavation_report", "survey_report"}


@dataclass
class ProvenanceResult:
    score: float
    formula_version: str
    present: list[str]
    missing: list[dict]
    critical_missing: list[str]
    fully_qualified: bool
    detail: list[dict] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "score": round(self.score, 4),
            "formula_version": self.formula_version,
            "present": self.present,
            "missing": self.missing,
            "critical_missing": self.critical_missing,
            "fully_qualified": self.fully_qualified,
            "detail": self.detail,
            "disclaimer": "Completeness of documentation only; not a measure of factual correctness.",
        }


def _present(v: Any) -> bool:
    return v is not None and v != "" and v != []


def evaluate_fields(record: dict) -> dict[str, tuple[bool, str]]:
    """Map a flattened site record to (present, note) per provenance field.

    ``record`` keys: lat, lon, coordinates_source_id, crs, sources (list of dicts
    with ``source_type``), orientation (dict or None), chronology (dict or None),
    horizon_kind (measured | dem | none_declared | None).
    """
    o = record.get("orientation") or {}
    c = record.get("chronology") or {}
    srcs = record.get("sources") or []
    out: dict[str, tuple[bool, str]] = {}

    out["coordinates"] = (
        _present(record.get("lat")) and _present(record.get("lon")) and _present(record.get("coordinates_source_id")),
        "lat/lon plus a linked source",
    )
    out["crs"] = (_present(record.get("crs")), record.get("crs") or "not recorded")
    out["scholarly_source"] = (
        any(s.get("source_type") in SCHOLARLY_SOURCE_TYPES for s in srcs),
        f"{sum(1 for s in srcs if s.get('source_type') in SCHOLARLY_SOURCE_TYPES)} qualifying source(s)",
    )
    out["orientation_bearing"] = (_present(o.get("raw_bearing")), "raw bearing")
    out["orientation_axis_mode"] = (_present(o.get("axis_mode")), o.get("axis_mode") or "missing")
    nref = o.get("north_reference")
    out["orientation_north_reference"] = (
        _present(nref) and nref != "unspecified",
        nref or "missing",
    )
    out["orientation_method"] = (_present(o.get("method")), o.get("method") or "missing")
    has_sigma = _present(o.get("uncertainty_deg"))
    has_reason = _present(o.get("uncertainty_unavailable_reason"))
    out["orientation_uncertainty"] = (
        has_sigma or has_reason,
        "numeric uncertainty" if has_sigma else ("documented reason unavailable" if has_reason else "missing"),
    )
    out["orientation_source"] = (_present(o.get("source_id")), "linked source")
    out["chronology_range"] = (
        _present(c.get("start_year")) and _present(c.get("end_year")),
        "start and end year" if c else "missing",
    )
    out["chronology_basis"] = (_present(c.get("date_basis")), c.get("date_basis") or "missing")
    out["chronology_calendar"] = (_present(c.get("calendar_basis")), c.get("calendar_basis") or "missing")
    out["chronology_source"] = (_present(c.get("source_id")), "linked source")
    out["chronology_uncertainty_note"] = (_present(c.get("uncertainty_note")), "note")
    hk = record.get("horizon_kind")
    out["horizon"] = (hk in ("measured", "dem", "none_declared"), hk or "not declared")
    return out


def score_record(record: dict) -> ProvenanceResult:
    fields = evaluate_fields(record)
    total = sum(w for _, _, w, _ in PROVENANCE_FIELDS)
    got = 0.0
    present, missing, critical_missing, detail = [], [], [], []
    for key, label, weight, critical in PROVENANCE_FIELDS:
        ok, note = fields[key]
        detail.append({"field": key, "label": label, "weight": weight, "critical": critical,
                       "present": bool(ok), "note": note})
        if ok:
            got += weight
            present.append(key)
        else:
            missing.append({"field": key, "label": label, "critical": critical})
            if critical:
                critical_missing.append(key)
    return ProvenanceResult(
        score=got / total,
        formula_version=PROVENANCE_FORMULA_VERSION,
        present=present,
        missing=missing,
        critical_missing=critical_missing,
        fully_qualified=not critical_missing,
        detail=detail,
    )


def formula_description() -> dict:
    return {
        "version": PROVENANCE_FORMULA_VERSION,
        "registered": PROVENANCE_FORMULA_REGISTERED,
        "formula": "score = Σ(weight_i · present_i) / Σ(weight_i)",
        "qualification_rule": "fully qualified ⇔ every critical field present (score alone never qualifies)",
        "fields": [
            {"field": k, "label": label, "weight": w, "critical": c} for k, label, w, c in PROVENANCE_FIELDS
        ],
    }
