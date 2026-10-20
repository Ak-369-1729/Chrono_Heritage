from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from ...deps import db
from ...schemas import Method
from ...science import compatibility, provenance
from ...science.astronomy import engine as eng
from ...science.astronomy import reference_analytic, reference_astropy
from ...science.astronomy.de406 import load_de406
from ...science.astronomy.targets import TARGETS
from ...science.compatibility import METHOD_PRECISION_CLASS

router = APIRouter(tags=["meta"])


@router.get("/health")
def health(session: Session = Depends(db)):
    status = {"api": "ok"}
    try:
        session.execute(text("SELECT 1"))
        status["database"] = "ok"
        status["postgis"] = session.execute(text("SELECT postgis_lib_version()")).scalar()
    except Exception as exc:  # reported, not hidden
        status["database"] = f"error: {type(exc).__name__}"
    try:
        lo, hi = load_de406().span_jd
        status["ephemeris"] = f"DE406 JD {lo}–{hi}"
    except Exception as exc:
        status["ephemeris"] = f"error: {exc}"
    status["ok"] = status.get("database") == "ok" and not str(status.get("ephemeris")).startswith("error")
    return status


@router.get("/meta/targets")
def targets():
    return {"targets": [t.as_dict() for t in TARGETS.values()]}


@router.get("/meta/versions")
def versions():
    return {"candidate": eng.versions(), "reference_a": reference_astropy.versions() | {
        "name": reference_astropy.REFERENCE_NAME, "version": reference_astropy.REFERENCE_VERSION},
        "reference_b": {"name": reference_analytic.REFERENCE_NAME, "version": reference_analytic.REFERENCE_VERSION,
                        "citation": reference_analytic.REFERENCE_CITATION}}


@router.get("/meta/formulas")
def formulas():
    return {"provenance": provenance.formula_description(), "compatibility": compatibility.formula_description()}


@router.get("/meta/conventions")
def conventions():
    return {
        "north_references": [
            {"key": "true", "label": "True (geodetic) north"},
            {"key": "astronomical", "label": "Astronomically determined north"},
            {"key": "magnetic", "label": "Magnetic north (needs documented declination)"},
            {"key": "grid", "label": "Grid north (needs projected CRS)"},
            {"key": "unspecified", "label": "Unspecified (blocks analysis)"},
        ],
        "axis_modes": [{"key": "directed", "label": "Directed (one facing direction)"},
                       {"key": "bidirectional", "label": "Bidirectional (undirected line, compared modulo 180°)"}],
        "methods": [{"key": m, "precision_class": METHOD_PRECISION_CLASS[m]} for m in Method.__args__],
        "bearing_units": ["deg", "grad", "mil_nato"],
        "calendars": ["julian", "gregorian_proleptic"],
        "year_numbering": "astronomical (0 = 1 BCE, −2499 = 2500 BCE)",
        "source_types": ["primary", "peer_reviewed", "monograph", "excavation_report", "survey_report", "secondary",
                         "database", "field_notes", "illustrative"],
        "limbs": ["upper_limb", "centre", "lower_limb"],
    }
