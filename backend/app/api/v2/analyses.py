from __future__ import annotations

import secrets
from datetime import UTC, datetime

import numpy as np
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from ...config import get_settings
from ...deps import Actor, current_actor, db, require
from ...models import AnalysisResult, AnalysisRun, Site
from ...schemas import AnalysisIn, CrossSiteIn, RerunIn, ReviewIn
from ...science import statistics as st
from ...science.angles import AxisMode, circular_mean_deg
from ...science.astronomy import engine as eng
from ...science.astronomy.targets import TARGETS
from ...science.refraction import AtmosphereParams
from ...services import analysis as svc
from ...services import audit, jobs
from ...services import gates as gate_svc
from ...services import sites as site_svc
from .sites import _get

router = APIRouter(prefix="/analyses", tags=["analyses"])


def _load(session: Session, run_id: str, actor: Actor) -> AnalysisRun:
    run = session.scalars(select(AnalysisRun).options(selectinload(AnalysisRun.results))
                          .where(AnalysisRun.id == run_id)).first()
    if run is None or not svc.can_view_run(run, actor):
        raise HTTPException(404, detail={"code": "not_found", "message": "Analysis not found."})
    return run


def _schedule(session: Session, run: AnalysisRun, actor: Actor, background: BackgroundTasks):
    job = jobs.enqueue(session, kind="analysis", payload={"run_id": run.id}, idempotency_key=f"analysis:{run.id}",
                       actor_id=actor.id)
    if get_settings().run_jobs_inline:
        background.add_task(jobs.run_job, job.id)
    return job


@router.get("")
def list_runs(site_id: str | None = None, status: str | None = Query(None, max_length=20),
              session: Session = Depends(db), actor: Actor = Depends(current_actor)):
    stmt = select(AnalysisRun).options(selectinload(AnalysisRun.results)).order_by(AnalysisRun.created_at.desc()).limit(200)
    if not actor.at_least("reviewer"):
        stmt = stmt.where(or_(AnalysisRun.visibility == "public", AnalysisRun.created_by == actor.id)) if actor.user \
            else stmt.where(AnalysisRun.visibility == "public")
    if site_id:
        stmt = stmt.where(AnalysisRun.site_id == site_id)
    if status:
        stmt = stmt.where(AnalysisRun.status == status)
    return {"analyses": [svc.serialize_run(r, include_results=False) for r in session.scalars(stmt).all()]}


@router.post("/single-site", status_code=202)
def create_single_site(body: AnalysisIn, background: BackgroundTasks, session: Session = Depends(db),
                       actor: Actor = Depends(require("researcher"))):
    site = _get(session, body.site_id, actor)
    jobs.check_quota(session, actor)
    run = svc.create_run(session, site=site, body=body.model_dump(), actor=actor)
    job = _schedule(session, run, actor, background)
    return {"id": run.id, "status": run.status, "job_id": job.id, "input_hash": run.input_hash}


@router.get("/cross-site/gate")
def cross_site_gate(session: Session = Depends(db)):
    gate, ev = gate_svc.cross_site(session)
    return gate.as_dict() | {"evidence": ev}


@router.post("/cross-site", status_code=201)
def create_cross_site(body: CrossSiteIn, session: Session = Depends(db), actor: Actor = Depends(require("researcher"))):
    """Server-side Tier 2 gate: refuses unless every gate condition is met by recorded evidence."""
    gate, ev = gate_svc.cross_site(session)
    if gate.status != "passed":
        raise HTTPException(409, detail={"code": "tier_gate_closed",
                                         "message": "Cross-site statistical analysis is disabled: the Tier 2 gate "
                                                    "has not passed.", "gate": gate.as_dict()})
    target = TARGETS.get(body.target_key)
    if target is None or not target.supported or target.kind not in ("solstice", "equinox"):
        raise HTTPException(422, detail={"code": "bad_target", "message": "Choose a supported solstice/equinox target."})
    sites = session.scalars(site_svc.visible_sites_query(gate_svc._SystemActor())
                            .where(Site.id.in_(ev["eligible_site_ids"]))).all()
    engine = eng.CandidateEngine()
    inputs, snapshot = [], []
    for s in sites:
        t = site_svc.transformed_orientation(s)
        o, c, h = site_svc.current_orientation(s), site_svc.current_chronology(s), site_svc.current_horizon(s)
        from ...services.analysis import _horizon_from_snapshot

        horizon = _horizon_from_snapshot({"horizon": site_svc.horizon_dict(h)}, "site_profile" if h else "flat")
        preds = [engine.event(target_key=target.key, lat=s.lat, lon=s.lon, elevation_m=s.elevation_m or 0.0, year=y,
                              horizon=horizon, atm=AtmosphereParams()).azimuth_deg
                 for y in np.linspace(c.start_year, c.end_year, 5)]
        spread = float(np.ptp(np.unwrap(preds, period=360.0)))
        inputs.append(st.SiteInput(s.id, s.stratum or "unstratified", t["true_azimuth_deg"],
                                   t["combined_uncertainty_deg"], AxisMode(o.axis_mode), circular_mean_deg(preds),
                                   spread / np.sqrt(12.0)))
        snapshot.append({"site_id": s.id, "orientation": t, "predicted_grid_deg": preds, "stratum": s.stratum})
    spec = st.NullSpec(st.NullModel(body.null_model), body.null_justification, body.reference_orientations,
                       sectors={k: tuple(v) for k, v in body.sectors.items()})
    seed = body.seed if body.seed is not None else secrets.randbelow(2**31)
    try:
        result = st.null_comparison(sites=inputs, spec=spec, statistic=st.Statistic(body.statistic),
                                    window_deg=body.window_deg, n_null=body.n_null, n_uncertainty=4000, seed=seed)
    except ValueError as exc:
        raise HTTPException(422, detail={"code": "null_model_invalid", "message": str(exc)}) from exc
    result.pop("_null_stats", None)
    if body.correction == "none":
        result["correction"] = {"method": "none", "note": "Single pre-registered test."}
    else:
        result["correction"] = {"method": body.correction,
                                "adjusted_p": st.correct([result["p_value_mc"]], "holm" if body.correction ==
                                                         "max_statistic" else body.correction)[0],
                                "family_size": 1}
    run = AnalysisRun(kind="cross_site", tier="cross_site_statistical", status="succeeded",
                      hypothesis={"target_key": body.target_key, "statement": body.statement, "mode": "confirmatory",
                                  "registered_at": datetime.now(UTC).isoformat()},
                      parameters=body.model_dump(mode="json") | {"seed": seed}, input_snapshot={"sites": snapshot},
                      input_hash=svc.hashlib.sha256(svc._canonical(snapshot).encode()).hexdigest(),
                      versions=svc.software_versions() | {"statistics": st.STATS_ALGORITHM_VERSION}, seed=seed,
                      created_by=actor.id, completed_at=datetime.now(UTC),
                      warnings=[{"code": "caveat", "severity": "info", "message": svc.CANDIDATE_CAVEAT}])
    session.add(run)
    session.flush()
    session.add(AnalysisResult(run_id=run.id, kind="cross_site", payload=svc._jsonable(result)))
    audit.record(session, entity_type="analysis_run", entity_id=run.id, action="create_cross_site", actor=actor)
    session.commit()
    return {"id": run.id, "result": svc._jsonable(result)}


@router.get("/{run_id}")
def get_run(run_id: str, session: Session = Depends(db), actor: Actor = Depends(current_actor)):
    return svc.serialize_run(_load(session, run_id, actor))


@router.post("/{run_id}/rerun", status_code=202)
def rerun(run_id: str, body: RerunIn, background: BackgroundTasks, session: Session = Depends(db),
          actor: Actor = Depends(require("researcher"))):
    parent = _load(session, run_id, actor)
    jobs.check_quota(session, actor)
    if parent.kind != "single_site":
        raise HTTPException(409, detail={"code": "not_rerunnable", "message": "Only single-site runs can be rerun here."})
    site = _get(session, parent.site_id, actor)
    params = dict(parent.parameters)
    params.pop("seed_source", None)
    params["seed"] = body.seed if body.seed is not None else parent.seed
    hyp = {k: parent.hypothesis[k] for k in ("target_key", "statement", "mode")}
    hyp["rationale"] = parent.hypothesis.get("rationale")
    run = svc.create_run(session, site=site, body={"hypothesis": hyp, "parameters": params,
                                                    "visibility": parent.visibility}, actor=actor, parent=parent)
    job = _schedule(session, run, actor, background)
    return {"id": run.id, "status": run.status, "job_id": job.id, "parent_run_id": parent.id,
            "input_hash": run.input_hash, "inputs_changed": run.input_hash != parent.input_hash}


@router.post("/{run_id}/review")
def review(run_id: str, body: ReviewIn, session: Session = Depends(db), actor: Actor = Depends(require("reviewer"))):
    run = _load(session, run_id, actor)
    if run.status != "succeeded":
        raise HTTPException(409, detail={"code": "not_complete", "message": "Only completed runs can be reviewed."})
    if run.is_illustrative and body.decision == "approve":
        raise HTTPException(409, detail={"code": "illustrative_run",
                                         "message": "Illustrative runs cannot be approved as reviewed results."})
    run.review_status = "reviewed" if body.decision == "approve" else "rejected"
    run.reviewed_by, run.reviewed_at, run.review_note = actor.id, datetime.now(UTC), body.note
    audit.record(session, entity_type="analysis_run", entity_id=run.id, action=f"review_{body.decision}", actor=actor,
                 note=body.note)
    session.commit()
    return svc.serialize_run(run, include_results=False)


@router.patch("/{run_id}/visibility")
def set_visibility(run_id: str, visibility: str = Query(..., pattern="^(private|public)$"),
                   session: Session = Depends(db), actor: Actor = Depends(require("researcher"))):
    run = _load(session, run_id, actor)
    if run.created_by != actor.id and not actor.at_least("reviewer"):
        raise HTTPException(403, detail={"code": "forbidden", "message": "Only the author can change visibility."})
    run.visibility = visibility
    audit.record(session, entity_type="analysis_run", entity_id=run.id, action="visibility", actor=actor,
                 changes={"visibility": visibility})
    session.commit()
    return {"id": run.id, "visibility": visibility}
