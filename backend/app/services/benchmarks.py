"""Persist the frozen suite, run it, and store outcomes (FR-28, FR-29)."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..benchmarks import harness
from ..config import get_settings
from ..models import BenchmarkCase, BenchmarkResult, BenchmarkRun, BenchmarkSuite, ReferenceRetrieval
from . import audit


def ensure_suite(session: Session) -> BenchmarkSuite:
    suite = harness.load_suite()
    existing = session.get(BenchmarkSuite, suite["suite_id"])
    if existing:
        if existing.tolerance_hash != suite["tolerance_hash"]:
            raise RuntimeError(
                f"Frozen suite {suite['suite_id']} on disk no longer matches the stored tolerance hash. "
                "Tolerances or cases changed: create a new suite version instead of editing a frozen one."
            )
        return existing
    s = BenchmarkSuite(id=suite["suite_id"], description=suite["description"], tolerances=suite["tolerances"],
                       tolerance_hash=suite["tolerance_hash"], frozen_at=datetime.fromisoformat(suite["frozen_at"]),
                       frozen_by=suite["frozen_by"])
    session.add(s)
    for c in suite["cases"]:
        session.add(BenchmarkCase(suite_id=s.id, case_key=c["case_key"], test_class=c["test_class"], title=c["title"],
                                  critical=c["critical"], inputs=c["inputs"], reference_kind=c["reference_kind"],
                                  independence_note=c["independence_note"], tolerance_deg=c["tolerance_deg"],
                                  tolerance_rationale=c["tolerance_rationale"], licence_note=c["licence_note"],
                                  input_hash=c["input_hash"]))
    session.commit()
    return s


def _cached_retrievals(session: Session) -> dict:
    out = {}
    for r in session.scalars(select(ReferenceRetrieval).order_by(ReferenceRetrieval.retrieved_at)).all():
        if r.case_key:
            out[r.case_key] = {"request_params": r.request_params, "retrieved_at": r.retrieved_at.isoformat(),
                               "api_version": r.api_version, "response_sha256": r.response_sha256,
                               "extracted": r.extracted}
    return out


def execute_run(session: Session, run: BenchmarkRun) -> BenchmarkRun:
    suite = ensure_suite(session)
    settings = get_settings()
    result = harness.run_suite(horizons_enabled=settings.horizons_enabled, cached_retrievals=_cached_retrievals(session))
    cases = {c.case_key: c for c in suite.cases}
    for o in result["outcomes"]:
        for r in o.pop("retrievals", []):
            session.add(ReferenceRetrieval(provider=r["provider"], case_key=r["case_key"],
                                           request_params=r["request_params"],
                                           retrieved_at=datetime.fromisoformat(r["retrieved_at"]),
                                           api_version=r["api_version"], response_sha256=r["response_sha256"],
                                           extracted=r["extracted"], attribution=r["attribution"]))
        session.add(BenchmarkResult(run_id=run.id, case_id=cases[o["case_key"]].id, status=o["status"],
                                    candidate_output=o["candidate_output"], reference_outputs=o["reference_outputs"],
                                    max_abs_difference_deg=o["max_abs_difference_deg"],
                                    tolerance_deg=o["tolerance_deg"], explanation=o["explanation"],
                                    reference_metadata=o["reference_metadata"], log=o["log"]))
    run.environment = result["environment"]
    run.summary = {"classes": result["classes"], "required_classes": result["required_classes"],
                   "tolerance_hash": result["tolerance_hash"], "started_at": result["started_at"],
                   "finished_at": result["finished_at"]}
    run.status = "completed"
    run.finished_at = datetime.now(UTC)
    audit.record(session, entity_type="benchmark_run", entity_id=run.id, action="complete",
                 changes={"classes": result["classes"]})
    session.commit()
    return run


def start_run(session: Session, actor) -> BenchmarkRun:
    suite = ensure_suite(session)
    run = BenchmarkRun(suite_id=suite.id, status="running", triggered_by=getattr(actor, "id", None))
    session.add(run)
    audit.record(session, entity_type="benchmark_run", entity_id=run.id, action="start", actor=actor)
    session.commit()
    return run


def latest_run(session: Session) -> BenchmarkRun | None:
    return session.scalars(select(BenchmarkRun).where(BenchmarkRun.status == "completed")
                          .options(selectinload(BenchmarkRun.results).selectinload(BenchmarkResult.case))
                          .order_by(BenchmarkRun.created_at.desc())).first()


def serialize_run(run: BenchmarkRun, with_results: bool = True) -> dict:
    d = {"id": run.id, "suite_id": run.suite_id, "status": run.status, "created_at": run.created_at.isoformat(),
         "finished_at": run.finished_at.isoformat() if run.finished_at else None, "summary": run.summary,
         "environment": run.environment}
    if with_results:
        d["results"] = sorted([{
            "case_key": r.case.case_key, "title": r.case.title, "test_class": r.case.test_class,
            "critical": r.case.critical, "status": r.status, "candidate_output": r.candidate_output,
            "reference_outputs": r.reference_outputs, "max_abs_difference_deg": r.max_abs_difference_deg,
            "tolerance_deg": r.tolerance_deg, "tolerance_rationale": r.case.tolerance_rationale,
            "explanation": r.explanation, "reference_kind": r.case.reference_kind,
            "independence_note": r.case.independence_note, "licence_note": r.case.licence_note,
            "reference_metadata": r.reference_metadata, "log": r.log, "inputs": r.case.inputs,
            "input_hash": r.case.input_hash,
        } for r in run.results], key=lambda x: x["case_key"])
    return d
