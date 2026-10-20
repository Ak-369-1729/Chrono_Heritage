"""Report generation, storage and retrieval (PRD FR-19, FR-20, FR-26, FR-30)."""

from __future__ import annotations

import hashlib
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..deps import Actor
from ..models import AnalysisRun, BenchmarkRun, DatasetFeasibilityReport, GeneratedReport, WorkflowComparison
from ..reports import exports, pdf
from . import analysis as an_svc
from . import audit
from . import benchmarks as bench_svc
from . import feasibility as feas_svc
from . import gates as gate_svc

KINDS = ("analysis", "feasibility", "benchmark", "comparison", "cross_site")


def _store(report_id: str, fmt: str, data: bytes) -> dict:
    root = Path(get_settings().artifact_dir) / "reports" / report_id
    root.mkdir(parents=True, exist_ok=True)
    name = {"pdf": "report.pdf", "csv": "report.csv", "json": "report.json"}[fmt]
    (root / name).write_bytes(data)
    return {"storage_key": f"reports/{report_id}/{name}", "sha256": hashlib.sha256(data).hexdigest(), "size": len(data)}


def comparison_rows(session: Session) -> list[dict]:
    rows = session.scalars(select(WorkflowComparison).order_by(WorkflowComparison.case_label, WorkflowComparison.tool)).all()
    return [serialize_comparison(r) for r in rows]


def serialize_comparison(r: WorkflowComparison) -> dict:
    return {"id": r.id, "case_label": r.case_label, "tool": r.tool, "tool_version": r.tool_version,
            "operator_label": r.operator_label, "task_definition": r.task_definition,
            "elapsed_seconds": r.elapsed_seconds, "manual_steps": r.manual_steps,
            "provenance_fields_preserved": r.provenance_fields_preserved, "provenance_score": r.provenance_score,
            "uncertainty_propagation": r.uncertainty_propagation, "reproducibility_steps": r.reproducibility_steps,
            "notes": r.notes, "evidence_ref": r.evidence_ref, "measured_at": r.measured_at.isoformat(),
            "status": r.status, "created_at": r.created_at.isoformat()}


def generate(session: Session, *, kind: str, subject_id: str | None, actor: Actor) -> GeneratedReport:
    if kind not in KINDS:
        raise HTTPException(422, detail={"code": "bad_kind", "message": f"kind must be one of {KINDS}"})
    illustrative = False
    if kind == "analysis":
        run = session.get(AnalysisRun, subject_id or "")
        if run is None or not an_svc.can_view_run(run, actor):
            raise HTTPException(404, detail={"code": "not_found", "message": "Analysis not found."})
        if run.status != "succeeded":
            raise HTTPException(409, detail={"code": "run_not_complete",
                                             "message": f"Analysis status is '{run.status}'; no report can be generated."})
        data = an_svc.serialize_run(run)
        title = f"Analysis — {data['site_name']} — {run.hypothesis['target_key']}"
        files = {"pdf": pdf.analysis_pdf(data), "csv": exports.analysis_csv(data),
                 "json": exports.to_json("analysis", {"analysis": data})}
        illustrative = run.is_illustrative
    elif kind == "feasibility":
        rep = session.get(DatasetFeasibilityReport, subject_id or "")
        if rep is None:
            raise HTTPException(404, detail={"code": "not_found", "message": "Feasibility report not found."})
        data = feas_svc.serialize(rep)
        title = f"Dataset feasibility — {rep.title}"
        files = {"pdf": pdf.feasibility_pdf(data), "csv": exports.feasibility_csv(data),
                 "json": exports.to_json("feasibility", {"report": data})}
        illustrative = rep.is_illustrative
    elif kind == "benchmark":
        run = session.get(BenchmarkRun, subject_id) if subject_id else bench_svc.latest_run(session)
        if run is None or run.status != "completed":
            raise HTTPException(404, detail={"code": "not_found", "message": "No completed benchmark run."})
        data = bench_svc.serialize_run(run)
        gate = gate_svc.benchmark(session).as_dict()
        title = f"Benchmark — {run.suite_id} — {run.id[:8]}"
        subject_id = run.id
        files = {"pdf": pdf.benchmark_pdf(data, gate), "csv": exports.benchmark_csv(data),
                 "json": exports.to_json("benchmark", {"run": data, "gate": gate})}
    elif kind == "comparison":
        rows = comparison_rows(session)
        gate = gate_svc.differentiation(session).as_dict()
        title = "Workflow comparison"
        subject_id = "all"
        files = {"pdf": pdf.comparison_pdf(rows, gate), "csv": exports.comparison_csv(rows),
                 "json": exports.to_json("comparison", {"measurements": rows, "gate": gate})}
    else:  # cross_site
        gate, _ = gate_svc.cross_site(session)
        if gate.status != "passed":
            raise HTTPException(409, detail={"code": "tier_gate_closed",
                                             "message": "Cross-site reports are disabled until the Tier 2 gate passes.",
                                             "gate": gate.as_dict()})
        raise HTTPException(409, detail={"code": "no_cross_site_run", "message": "No cross-site analysis exists."})

    rep_row = GeneratedReport(kind=kind, subject_id=subject_id or "", title=title, is_illustrative=illustrative,
                              created_by=actor.id, params={"formats": list(files)})
    session.add(rep_row)
    session.flush()
    rep_row.files = {fmt: _store(rep_row.id, fmt, data) for fmt, data in files.items()}
    audit.record(session, entity_type="report", entity_id=rep_row.id, action="generate", actor=actor,
                 changes={"kind": kind, "subject_id": subject_id})
    session.commit()
    return rep_row


def serialize(r: GeneratedReport) -> dict:
    return {"id": r.id, "kind": r.kind, "subject_id": r.subject_id, "title": r.title, "status": r.status,
            "is_illustrative": r.is_illustrative, "created_at": r.created_at.isoformat(),
            "files": {k: {"sha256": v["sha256"], "size": v["size"], "url": f"/api/v2/reports/{r.id}/download/{k}"}
                      for k, v in (r.files or {}).items()}}


def file_path(r: GeneratedReport, fmt: str) -> Path:
    info = (r.files or {}).get(fmt)
    if not info:
        raise HTTPException(404, detail={"code": "format_not_found", "message": f"No {fmt} file for this report."})
    p = Path(get_settings().artifact_dir) / info["storage_key"]
    if not p.exists():
        raise HTTPException(410, detail={"code": "artifact_missing", "message": "Report artifact is missing from storage."})
    return p
