"""Postgres-backed job queue for analyses and benchmark runs (PRD §8 batch jobs).

Jobs are idempotent by ``idempotency_key``; a failure is recorded on the job and
on the subject (analysis run / benchmark run), never swallowed.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import session_scope
from ..models import AnalysisRun, BenchmarkRun, Job

log = logging.getLogger("chronoheritage.jobs")


ACTIVE = ("queued", "claimed", "running")


def check_quota(session: Session, actor) -> None:
    """Refuse new work when a (non-admin) user already has too many unfinished jobs (V3 abuse limit)."""
    from ..config import get_settings

    if actor.user is None or actor.at_least("admin"):
        return
    limit = get_settings().max_active_jobs_per_user
    n = session.scalar(select(func.count()).select_from(Job).where(Job.created_by == actor.id,
                                                                   Job.status.in_(ACTIVE))) or 0
    if n >= limit:
        raise HTTPException(429, detail={"code": "too_many_jobs",
                                         "message": f"You already have {n} calculations queued or running (limit "
                                                    f"{limit}). Wait for one to finish and try again."})


def enqueue(session: Session, *, kind: str, payload: dict, idempotency_key: str, actor_id: str | None) -> Job:
    existing = session.scalars(select(Job).where(Job.idempotency_key == idempotency_key)).first()
    if existing:
        return existing
    job = Job(kind=kind, payload=payload, idempotency_key=idempotency_key, created_by=actor_id)
    session.add(job)
    session.commit()
    return job


def _dispatch(session: Session, job: Job) -> dict:
    if job.kind == "analysis":
        from . import analysis, gates

        run = session.get(AnalysisRun, job.payload["run_id"])
        bstatus = gates.benchmark(session).status
        run = analysis.execute_run(session, run, benchmark_status=bstatus)
        return {"run_id": run.id, "status": run.status}
    if job.kind == "benchmark":
        from . import benchmarks

        run = session.get(BenchmarkRun, job.payload["run_id"])
        try:
            run = benchmarks.execute_run(session, run)
        except Exception as exc:
            session.rollback()
            run = session.get(BenchmarkRun, job.payload["run_id"])
            run.status = "failed"
            run.summary = {"error": f"{type(exc).__name__}: {exc}"}
            run.finished_at = datetime.now(UTC)
            session.commit()
            raise
        return {"run_id": run.id, "status": run.status}
    raise ValueError(f"Unknown job kind {job.kind}")


def run_job(job_id: str) -> None:
    session = session_scope()
    try:
        job = session.get(Job, job_id)
        if job is None or job.status not in ("queued", "claimed"):
            return
        job.status, job.started_at, job.attempts = "running", datetime.now(UTC), job.attempts + 1
        session.commit()
        try:
            job.result = _dispatch(session, job)
            job.status = "succeeded"
        except Exception as exc:
            log.exception("job %s failed", job_id)
            session.rollback()
            job = session.get(Job, job_id)
            job.status, job.error = "failed", f"{type(exc).__name__}: {exc}"
        job.finished_at = datetime.now(UTC)
        session.commit()
    finally:
        session.close()


def claim_next(session: Session) -> str | None:
    """Atomically claim the oldest queued job (row lock + status change in one transaction)."""
    job = session.scalars(select(Job).where(Job.status == "queued").order_by(Job.created_at)
                          .with_for_update(skip_locked=True).limit(1)).first()
    if job is None:
        return None
    job.status = "claimed"
    return job.id
