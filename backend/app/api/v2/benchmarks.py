from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ...config import get_settings
from ...deps import Actor, db, require
from ...models import BenchmarkResult, BenchmarkRun
from ...schemas import ReviewIn
from ...services import audit, jobs
from ...services import benchmarks as svc
from ...services import gates as gate_svc

router = APIRouter(prefix="/benchmarks", tags=["benchmarks"])


def _suite(session: Session):
    try:
        return svc.ensure_suite(session)
    except RuntimeError as exc:  # a frozen suite was edited on disk
        raise HTTPException(409, detail={"code": "suite_modified", "message": str(exc)}) from exc


@router.get("/suite")
def suite(session: Session = Depends(db)):
    s = _suite(session)
    return {"id": s.id, "description": s.description, "tolerances": s.tolerances, "tolerance_hash": s.tolerance_hash,
            "frozen_at": s.frozen_at.isoformat(), "frozen_by": s.frozen_by,
            "tolerances_reviewed_at": s.tolerances_reviewed_at.isoformat() if s.tolerances_reviewed_at else None,
            "cases": [{"case_key": c.case_key, "title": c.title, "test_class": c.test_class, "critical": c.critical,
                       "inputs": c.inputs, "reference_kind": c.reference_kind, "independence_note": c.independence_note,
                       "tolerance_deg": c.tolerance_deg, "tolerance_rationale": c.tolerance_rationale,
                       "licence_note": c.licence_note, "input_hash": c.input_hash} for c in s.cases]}


@router.post("/suite/review-tolerances")
def review_tolerances(body: ReviewIn, session: Session = Depends(db), actor: Actor = Depends(require("reviewer"))):
    s = _suite(session)
    if body.decision == "approve":
        s.tolerances_reviewed_by, s.tolerances_reviewed_at = actor.id, datetime.now(UTC)
    else:
        s.tolerances_reviewed_by = s.tolerances_reviewed_at = None
    audit.record(session, entity_type="benchmark_suite", entity_id=s.id, action=f"tolerance_review_{body.decision}",
                 actor=actor, note=body.note)
    session.commit()
    return {"id": s.id, "tolerances_reviewed_at": s.tolerances_reviewed_at.isoformat() if s.tolerances_reviewed_at else None}


@router.post("/runs", status_code=202)
def start_run(background: BackgroundTasks, session: Session = Depends(db), actor: Actor = Depends(require("researcher"))):
    running = session.scalars(select(BenchmarkRun).where(BenchmarkRun.status == "running")).first()
    if running:
        raise HTTPException(409, detail={"code": "already_running", "message": "A benchmark run is in progress.",
                                         "run_id": running.id})
    _suite(session)
    jobs.check_quota(session, actor)
    run = svc.start_run(session, actor)
    job = jobs.enqueue(session, kind="benchmark", payload={"run_id": run.id}, idempotency_key=f"benchmark:{run.id}",
                       actor_id=actor.id)
    if get_settings().run_jobs_inline:
        background.add_task(jobs.run_job, job.id)
    return {"id": run.id, "status": run.status, "job_id": job.id}


@router.get("/runs")
def list_runs(session: Session = Depends(db)):
    rows = session.scalars(select(BenchmarkRun).order_by(BenchmarkRun.created_at.desc()).limit(50)).all()
    return {"runs": [svc.serialize_run(r, with_results=False) for r in rows]}


@router.get("/runs/latest")
def latest(session: Session = Depends(db)):
    run = svc.latest_run(session)
    if run is None:
        raise HTTPException(404, detail={"code": "no_run", "message": "The benchmark suite has not been run yet."})
    return svc.serialize_run(run) | {"gate": gate_svc.benchmark(session).as_dict()}


@router.get("/runs/{run_id}")
def get_run(run_id: str, session: Session = Depends(db)):
    run = session.scalars(select(BenchmarkRun).options(selectinload(BenchmarkRun.results).selectinload(BenchmarkResult.case))
                          .where(BenchmarkRun.id == run_id)).first()
    if run is None:
        raise HTTPException(404, detail={"code": "not_found", "message": "Benchmark run not found."})
    return svc.serialize_run(run)
