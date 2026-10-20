"""Single-site analysis runs (PRD §6.1, §10.3, FR-13–FR-15, FR-18, FR-27; Appendix C).

Lifecycle: validate → snapshot (immutable, hashed) → compute → persist results.
A completed run is never mutated; ``rerun`` creates a new run that points to its
parent and records whether the inputs or outputs changed.
"""

from __future__ import annotations

import hashlib
import json
import platform
import secrets
from datetime import UTC, datetime

import numpy as np
from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..deps import Actor
from ..models import AnalysisResult, AnalysisRun, Site
from ..science import angles, montecarlo
from ..science.angles import AxisMode
from ..science.astronomy import engine as eng
from ..science.astronomy.targets import TARGETS, get_target
from ..science.chronology import Chronology, ChronologyModel, year_label
from ..science.horizon import HorizonKind, HorizonProfile
from ..science.refraction import AtmosphereParams, EventLimb, RefractionModel
from . import audit
from . import sites as site_svc

# DE406 spans JD 625360.5–2816848.5; whole tropical years safely inside that span:
EPHEMERIS_MIN_YEAR, EPHEMERIS_MAX_YEAR = -2998, 2998

CANDIDATE_CAVEAT = (
    "A small angular residual identifies a candidate alignment that is consistent with the selected hypothesis "
    "under the stated assumptions. It is not evidence of intent and does not establish that the builders "
    "oriented the structure deliberately."
)


def _canonical(obj) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), default=str)


def software_versions() -> dict:
    import scipy

    v = eng.versions()
    v.update({"numpy": np.__version__, "scipy": scipy.__version__, "python": platform.python_version(),
              "montecarlo": montecarlo.MC_ALGORITHM_VERSION})
    return v


def validate_request(site: Site, body: dict) -> dict:
    """Validate and normalise the request; raise 422 with explicit reasons (no silent defaults)."""
    errors = []
    hyp = body.get("hypothesis") or {}
    target_key = hyp.get("target_key")
    if target_key not in TARGETS:
        errors.append(f"Unknown target '{target_key}'.")
    else:
        t = get_target(target_key)
        if not t.supported:
            errors.append(f"Target '{t.label}' is not supported: {t.note}")
        if t.kind == "date":
            errors.append("Single-site analysis over a chronology range requires a solstice or equinox target; "
                          "calendar-date targets are available in the Sky Explorer.")
    statement = (hyp.get("statement") or "").strip()
    if len(statement) < 20:
        errors.append("State the hypothesis in at least 20 characters before running the analysis.")
    mode = hyp.get("mode", "confirmatory")
    if mode not in ("confirmatory", "exploratory"):
        errors.append("hypothesis.mode must be 'confirmatory' or 'exploratory'.")

    elig = site_svc.eligibility(site)["single_site_analysis"]
    if not elig["eligible"]:
        errors.extend(elig["reasons"])
    chron = site_svc.current_chronology(site)
    if chron is not None and chron.start_year is not None and chron.end_year is not None:
        if chron.start_year < EPHEMERIS_MIN_YEAR or chron.end_year > EPHEMERIS_MAX_YEAR:
            errors.append(
                f"Chronology {year_label(chron.start_year)} – {year_label(chron.end_year)} extends beyond the DE406 "
                f"ephemeris coverage ({year_label(EPHEMERIS_MIN_YEAR)} – {year_label(EPHEMERIS_MAX_YEAR)}). The range "
                "is not truncated automatically; a longer-span ephemeris is required."
            )

    p = body.get("parameters") or {}
    horizon_mode = p.get("horizon_mode", "site_profile")
    if horizon_mode not in ("site_profile", "flat"):
        errors.append("parameters.horizon_mode must be 'site_profile' or 'flat'.")
    if horizon_mode == "site_profile" and site_svc.current_horizon(site) is None:
        errors.append("No horizon profile is recorded for this site. Choose horizon_mode='flat' explicitly "
                      "(the flat-horizon assumption will be reported).")
    try:
        limb = EventLimb(p.get("limb", "upper_limb")).value
    except ValueError:
        errors.append("Unknown event limb.")
        limb = None
    atm = p.get("atmosphere") or {}
    try:
        atm_obj = AtmosphereParams(RefractionModel(atm.get("model", "bennett_1982")),
                                   float(atm.get("pressure_hpa", 1010.0)), float(atm.get("temperature_c", 10.0)))
    except (ValueError, TypeError):
        errors.append("Invalid atmosphere parameters.")
        atm_obj = AtmosphereParams()
    n = int(p.get("n_samples", 10_000))
    if not 1000 <= n <= 100_000:
        errors.append("n_samples must be between 1 000 and 100 000.")
    windows = p.get("windows_deg", [0.5, 1.0, 2.0])
    if not windows or any((not isinstance(w, (int, float))) or w <= 0 or w > 30 for w in windows):
        errors.append("windows_deg must be positive numbers ≤ 30.")
    seed = p.get("seed")
    if seed is not None and (not isinstance(seed, int) or seed < 0 or seed >= 2**31):
        errors.append("seed must be an integer in [0, 2^31).")
    if errors:
        raise HTTPException(422, detail={"code": "analysis_validation", "message": "Analysis cannot run.",
                                         "errors": errors})
    return {
        "hypothesis": {"target_key": target_key, "statement": statement, "mode": mode,
                       "rationale": (hyp.get("rationale") or "").strip() or None,
                       "registered_at": datetime.now(UTC).isoformat()},
        "parameters": {"horizon_mode": horizon_mode, "limb": limb, "atmosphere": atm_obj.as_dict(),
                       "n_samples": n, "windows_deg": [float(w) for w in windows],
                       "seed": seed if seed is not None else secrets.randbelow(2**31),
                       "seed_source": "user" if seed is not None else "generated"},
    }


def build_snapshot(site: Site) -> dict:
    o = site_svc.current_orientation(site)
    c = site_svc.current_chronology(site)
    h = site_svc.current_horizon(site)
    sources = [site_svc.source_dict(link.source) | {"role": link.role} for link in site.source_links]
    prov = site_svc.provenance.score_record(site_svc.flat_record(site)).as_dict()
    return {
        "site": {"id": site.id, "name": site.name, "lat": site.lat, "lon": site.lon,
                 "elevation_m": site.elevation_m, "crs": site.crs, "status": site.status,
                 "is_illustrative": site.is_illustrative, "coordinates_source_id": site.coordinates_source_id},
        "orientation_raw": site_svc.orientation_dict(o),
        "orientation_transformed": site_svc.transformed_orientation(site),
        "chronology": site_svc.chronology_dict(c),
        "horizon": site_svc.horizon_dict(h),
        "sources": sources,
        "provenance": prov,
    }


def create_run(session: Session, *, site: Site, body: dict, actor: Actor, parent: AnalysisRun | None = None) -> AnalysisRun:
    req = validate_request(site, body)
    snapshot = build_snapshot(site)
    versions = software_versions()
    input_hash = hashlib.sha256(_canonical({"snapshot": snapshot, "parameters": req["parameters"],
                                            "target": req["hypothesis"]["target_key"],
                                            "versions": versions}).encode()).hexdigest()
    run = AnalysisRun(
        site_id=site.id, kind="single_site", tier="published_case_study", status="queued",
        hypothesis=req["hypothesis"], parameters=req["parameters"], input_snapshot=snapshot,
        input_hash=input_hash, versions=versions, seed=req["parameters"]["seed"],
        parent_run_id=parent.id if parent else None, is_illustrative=site.is_illustrative,
        visibility=body.get("visibility", "private") if body.get("visibility") in ("private", "public") else "private",
        created_by=actor.id,
    )
    session.add(run)
    session.flush()
    audit.record(session, entity_type="analysis_run", entity_id=run.id, action="create" if not parent else "rerun",
                 actor=actor, changes={"site_id": site.id, "input_hash": input_hash,
                                       "parent_run_id": parent.id if parent else None})
    session.commit()
    return run


def _horizon_from_snapshot(snap: dict, mode: str) -> HorizonProfile:
    h = snap.get("horizon")
    if mode == "flat" or not h:
        return HorizonProfile.flat()
    return HorizonProfile(HorizonKind(h["kind"]), h["azimuths_deg"], h["altitudes_deg"],
                          altitude_uncertainty_deg=h.get("altitude_uncertainty_deg"),
                          source_label=f"site profile {h['id']}", resolution_note=h.get("resolution_note"))


def execute_run(session: Session, run: AnalysisRun, benchmark_status: str | None = None) -> AnalysisRun:
    if run.status not in ("queued", "running"):
        return run
    run.status = "running"
    session.commit()
    try:
        _compute(session, run, benchmark_status)
        run.status = "succeeded"
    except eng.EngineError as exc:
        session.rollback()
        run.status = "failed"
        run.error = {"code": "engine_error", "message": str(exc)}
    except Exception as exc:  # recorded as a visible failure; no partial success
        session.rollback()
        run.status = "failed"
        run.error = {"code": "internal_error", "message": f"{type(exc).__name__}: {exc}"}
    run.completed_at = datetime.now(UTC)
    session.add(run)
    session.commit()
    return run


def _compute(session: Session, run: AnalysisRun, benchmark_status: str | None):
    snap, p, hyp = run.input_snapshot, run.parameters, run.hypothesis
    site = snap["site"]
    target = get_target(hyp["target_key"])
    tr = snap["orientation_transformed"]
    raw = snap["orientation_raw"]
    chron = snap["chronology"]
    horizon = _horizon_from_snapshot(snap, p["horizon_mode"])
    limb = EventLimb(p["limb"])
    atm = AtmosphereParams(RefractionModel(p["atmosphere"]["model"]), p["atmosphere"]["pressure_hpa"],
                           p["atmosphere"]["temperature_c"])
    axis_mode = AxisMode(raw["axis_mode"])
    chronology = Chronology(chron["start_year"], chron["end_year"], ChronologyModel(chron.get("model") or "uniform"),
                            chron.get("central_year"), chron.get("sigma_years"))
    engine = eng.CandidateEngine()
    common = dict(target_key=target.key, lat=site["lat"], lon=site["lon"], elevation_m=site["elevation_m"] or 0.0)

    warnings: list[dict] = []

    def warn(code, msg, severity="warning"):
        warnings.append({"code": code, "severity": severity, "message": msg})

    years, az_grid, interp_err = eng.predicted_azimuth_grid(engine, years=chronology.grid(), horizon=horizon,
                                                            limb=limb, atm=atm, **common)
    sens_dh = None
    if horizon.altitude_uncertainty_deg:
        mid = float(years[len(years) // 2])
        base = engine.event(year=mid, horizon=horizon, limb=limb, atm=atm, **common).azimuth_deg
        bumped = HorizonProfile(horizon.kind, horizon.azimuths_deg, horizon.altitudes_deg + 0.1)
        up = engine.event(year=mid, horizon=bumped, limb=limb, atm=atm, **common).azimuth_deg
        sens_dh = angles.signed_residual(up, base) / 0.1

    grid = montecarlo.PredictionGrid(years, az_grid, sens_dh)
    sigma = tr.get("combined_uncertainty_deg")
    mc = montecarlo.propagate(
        orientation=montecarlo.OrientationInput(tr["true_azimuth_deg"], sigma, axis_mode,
                                                raw.get("uncertainty_distribution") or "normal"),
        chronology=chronology, grid=grid,
        horizon_sigma_deg=horizon.altitude_uncertainty_deg if not horizon.is_flat_assumption else None,
        n_samples=p["n_samples"], seed=run.seed, windows_deg=tuple(p["windows_deg"]))

    start_ev = engine.event(year=chronology.start_year, horizon=horizon, limb=limb, atm=atm, **common)
    end_ev = engine.event(year=chronology.end_year, horizon=horizon, limb=limb, atm=atm, **common)
    observed = tr["true_azimuth_deg"]

    def res(pred):
        return float(angles.residual(observed, pred, axis_mode))

    bounds = [
        {"label": f"Range start ({year_label(chronology.start_year)})", "year": chronology.start_year,
         "predicted_azimuth_deg": start_ev.azimuth_deg, "residual_signed_deg": res(start_ev.azimuth_deg),
         "compared_bearing_deg": float(angles.matched_axis_end(observed, start_ev.azimuth_deg, axis_mode)),
         "event": start_ev.as_dict()},
        {"label": f"Range end ({year_label(chronology.end_year)})", "year": chronology.end_year,
         "predicted_azimuth_deg": end_ev.azimuth_deg, "residual_signed_deg": res(end_ev.azimuth_deg),
         "compared_bearing_deg": float(angles.matched_axis_end(observed, end_ev.azimuth_deg, axis_mode)),
         "event": end_ev.as_dict()},
    ]

    # --- sensitivity (one-at-a-time around the range start; each row is a full recomputation)
    sens_rows = []

    def sens(parameter, value, **kw):
        args = dict(year=chronology.start_year, horizon=horizon, limb=limb, atm=atm)
        args.update(kw)
        try:
            ev = engine.event(**args, **common)
            sens_rows.append({"parameter": parameter, "value": value, "predicted_azimuth_deg": ev.azimuth_deg,
                              "residual_signed_deg": res(ev.azimuth_deg),
                              "delta_vs_baseline_deg": float(angles.signed_residual(ev.azimuth_deg, start_ev.azimuth_deg))})
        except eng.EngineError as exc:
            sens_rows.append({"parameter": parameter, "value": value, "error": str(exc)})

    for lb in EventLimb:
        sens("event limb", lb.value, limb=lb)
    sens("refraction", "none", atm=AtmosphereParams(RefractionModel.NONE))
    sens("refraction", "cold (−5 °C, 1030 hPa)", atm=AtmosphereParams(RefractionModel.BENNETT, 1030.0, -5.0))
    sens("refraction", "hot (30 °C, 990 hPa)", atm=AtmosphereParams(RefractionModel.BENNETT, 990.0, 30.0))
    if not horizon.is_flat_assumption:
        sens("horizon", "flat 0° (assumption)", horizon=HorizonProfile.flat())
    sens("chronology", f"range end ({year_label(chronology.end_year)})", year=chronology.end_year)
    sigma_sweep = None
    if sigma is None:
        sigma_sweep = montecarlo.assumed_sigma_sweep(azimuth_deg=observed, axis_mode=axis_mode, chronology=chronology,
                                                     grid=grid, seed=run.seed)

    # --- warnings & labels (never silent)
    if site["is_illustrative"]:
        warn("illustrative", "ILLUSTRATIVE RECORD: inputs are fictional demonstration data. Not a scientific result.",
             "critical")
    if site["status"] != "reviewed":
        warn("unreviewed_inputs", f"Site record status is '{site['status']}' (not yet approved by a reviewer).")
    if benchmark_status != "passed":
        warn("benchmark_gate", f"Phase 0.5 benchmark gate status is '{benchmark_status or 'unknown'}'. Outputs "
             "cannot be described as scientifically validated.", "critical")
    if horizon.is_flat_assumption:
        warn("flat_horizon", "Flat 0° horizon assumed; real horizon altitude can shift rise/set azimuths by "
             "degrees.")
    if axis_mode is AxisMode.BIDIRECTIONAL:
        warn("bidirectional", "Bidirectional axis: both ends were evaluated and the nearer end reported. This "
             "doubles the opportunity for a coincidental match.")
    if sigma is None:
        warn("no_orientation_uncertainty", "Orientation uncertainty is not documented "
             f"({raw.get('uncertainty_unavailable_reason') or 'no reason recorded'}); it was not propagated. "
             "The assumed-σ sweep is for sensitivity only.")
    if "historical" not in target.benchmark_classes:
        warn("target_not_historically_benchmarked", f"No independent historical benchmark class exists for "
             f"'{target.label}'. Treat historical outputs for this target as unbenchmarked.")
    if hyp["mode"] == "exploratory":
        warn("exploratory", "Exploratory analysis: if several targets or date windows were examined, residuals "
             "must not be presented as confirmatory evidence.")
    if interp_err > 0.02:
        warn("interpolation", f"Chronology-grid interpolation error up to {interp_err:.4f}° (above 0.02°). "
             "Short-period terms (nutation, sunrise timing relative to the solstice instant) are not resolved by "
             "the grid.", "info")
    if mc["straddles_cut"]:
        warn("wide_residuals", "Residual samples exceed ±150°: the hypothesis direction is far from the axis.")
    for ev in (start_ev, end_ev):
        for w in ev.warnings:
            if not any(x["message"] == w for x in warnings):
                warn("engine", w, "info")

    primary = {
        "tier": "published_case_study",
        "caveat": CANDIDATE_CAVEAT,
        "status_labels": {
            "evidence": "illustrative" if site["is_illustrative"] else "real_inputs",
            "inputs_review": site["status"],
            "validation": "benchmark_gate_passed" if benchmark_status == "passed" else "unvalidated",
            "human_review": run.review_status,
        },
        "target": target.as_dict(),
        "observed": {
            "raw_bearing": raw["raw_bearing"], "raw_unit": raw["bearing_unit"],
            "raw_north_reference": raw["north_reference"], "true_azimuth_deg": observed,
            "combined_uncertainty_deg": sigma, "axis_mode": axis_mode.value,
            "transformation_steps": tr["steps"],
        },
        "chronology": chronology.as_dict(),
        "horizon": horizon.as_dict(),
        "atmosphere": atm.as_dict(),
        "limb": limb.value,
        "prediction_grid": {"years": years.tolist(), "azimuths_deg": az_grid.tolist(),
                            "max_interpolation_error_deg": interp_err,
                            "horizon_sensitivity_deg_per_deg": sens_dh},
        "range_bounds": bounds,
        "monte_carlo": mc,
        "sensitivity": sens_rows,
        "assumed_sigma_sweep": sigma_sweep,
        "statistics": {"p_value": None, "reason": "Single-site Tier 1 analysis: no null model is defined, so no "
                       "p-value is computed (PRD §5.3, §13)."},
        "day_path": engine.day_path(lat=site["lat"], lon=site["lon"], elevation_m=site["elevation_m"] or 0.0,
                                    center_tt_jd=start_ev.event_tt_jd, atm=atm, hours=20.0, step_min=15.0),
    }
    session.add(AnalysisResult(run_id=run.id, kind="primary",
                               predicted_azimuth_deg=mc["predicted_azimuth"]["median"],
                               residual_signed_deg=mc["residual_signed"]["median"],
                               residual_abs_deg=mc["residual_abs"]["median"], payload=_jsonable(primary)))
    run.warnings = warnings


def _jsonable(obj):
    return json.loads(json.dumps(obj, default=lambda o: o.tolist() if hasattr(o, "tolist") else str(o)))


def serialize_run(run: AnalysisRun, include_results: bool = True) -> dict:
    d = {
        "id": run.id, "site_id": run.site_id, "kind": run.kind, "tier": run.tier, "status": run.status,
        "hypothesis": run.hypothesis, "parameters": run.parameters, "input_hash": run.input_hash,
        "versions": run.versions, "seed": run.seed, "parent_run_id": run.parent_run_id,
        "review_status": run.review_status, "review_note": run.review_note,
        "reviewed_at": run.reviewed_at.isoformat() if run.reviewed_at else None,
        "visibility": run.visibility, "is_illustrative": run.is_illustrative, "error": run.error,
        "warnings": run.warnings, "created_at": run.created_at.isoformat(),
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        "site_name": (run.input_snapshot.get("site") or {}).get("name"),
    }
    primary = next((r for r in run.results if r.kind == "primary"), None)
    d["summary"] = None if primary is None else {
        "predicted_azimuth_median_deg": primary.predicted_azimuth_deg,
        "residual_signed_median_deg": primary.residual_signed_deg,
        "residual_abs_median_deg": primary.residual_abs_deg,
    }
    if include_results:
        d["input_snapshot"] = run.input_snapshot
        d["result"] = primary.payload if primary else None
    return d


def can_view_run(run: AnalysisRun, actor: Actor) -> bool:
    return run.visibility == "public" or actor.at_least("reviewer") or (actor.user is not None and run.created_by == actor.id)
