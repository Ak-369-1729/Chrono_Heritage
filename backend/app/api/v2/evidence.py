"""Workflow comparisons, behavioral pilots, gates, reports, jobs and audit."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ...deps import Actor, current_actor, db, require
from ...models import AnalysisRun, AuditEvent, BehavioralPilot, GateSignoff, GeneratedReport, Job, WorkflowComparison
from ...schemas import ComparisonIn, PilotIn, ReportIn, ReviewIn, SignoffIn
from ...science.provenance import PROVENANCE_FIELDS
from ...services import analysis as an_svc
from ...services import audit
from ...services import gates as gate_svc
from ...services import reports as rep_svc

router = APIRouter(tags=["evidence"])

GATE_KEYS = {"phase0", "phase0_5", "differentiation", "behavioral", "cross_site", "ml"}


# ------------------------------------------------------------ comparisons

@router.get("/workflow-comparisons")
def list_comparisons(session: Session = Depends(db)):
    rows = rep_svc.comparison_rows(session)
    cases = sorted({r["case_label"] for r in rows})
    matrix = {c: {t: next((r for r in rows if r["case_label"] == c and r["tool"] == t), None)
                  for t in gate_svc.COMPARISON_TOOLS} for c in cases}
    return {"measurements": rows, "tools": gate_svc.COMPARISON_TOOLS, "cases": cases, "matrix": matrix,
            "provenance_fields": [{"field": k, "label": label} for k, label, _, _ in PROVENANCE_FIELDS],
            "gate": gate_svc.differentiation(session).as_dict()}


@router.post("/workflow-comparisons", status_code=201)
def create_comparison(body: ComparisonIn, session: Session = Depends(db), actor: Actor = Depends(require("researcher"))):
    known = {k for k, _, _, _ in PROVENANCE_FIELDS}
    unknown = set(body.provenance_fields_preserved) - known
    if unknown:
        raise HTTPException(422, detail={"code": "unknown_fields", "message": f"Unknown provenance fields: {sorted(unknown)}"})
    total = sum(w for _, _, w, _ in PROVENANCE_FIELDS)
    score = sum(w for k, _, w, _ in PROVENANCE_FIELDS if k in body.provenance_fields_preserved) / total
    if session.scalars(select(WorkflowComparison).where(WorkflowComparison.case_label == body.case_label,
                                                        WorkflowComparison.tool == body.tool)).first():
        raise HTTPException(409, detail={"code": "duplicate", "message": "A measurement for this case and tool exists."})
    row = WorkflowComparison(**body.model_dump(), provenance_score=score, created_by=actor.id)
    session.add(row)
    session.flush()
    audit.record(session, entity_type="workflow_comparison", entity_id=row.id, action="create", actor=actor)
    session.commit()
    return rep_svc.serialize_comparison(row)


@router.post("/workflow-comparisons/{row_id}/review")
def review_comparison(row_id: str, body: ReviewIn, session: Session = Depends(db),
                      actor: Actor = Depends(require("reviewer"))):
    row = session.get(WorkflowComparison, row_id)
    if row is None:
        raise HTTPException(404, detail={"code": "not_found", "message": "Measurement not found."})
    row.status = "reviewed" if body.decision == "approve" else "rejected"
    audit.record(session, entity_type="workflow_comparison", entity_id=row.id, action=f"review_{body.decision}",
                 actor=actor, note=body.note)
    session.commit()
    return rep_svc.serialize_comparison(row)


# ----------------------------------------------------------------- pilots

def _pilot(p: BehavioralPilot, full: bool) -> dict:
    d = {"id": p.id, "researcher_role": p.researcher_role, "run_date": p.run_date.isoformat(),
         "citation_commitment": p.citation_commitment, "would_return": p.would_return,
         "verified": p.verified_at is not None, "elapsed_minutes": p.elapsed_minutes,
         "created_at": p.created_at.isoformat()}
    if full:
        d.update({"hypothesis": p.hypothesis, "hypothesis_source": p.hypothesis_source, "steps": p.steps,
                  "external_tools": p.external_tools, "friction": p.friction,
                  "output_sections_used": p.output_sections_used, "limitations_noted": p.limitations_noted,
                  "return_reason": p.return_reason, "citation_venue": p.citation_venue,
                  "evidence_note": p.evidence_note, "analysis_run_id": p.analysis_run_id})
    return d


@router.get("/behavioral-pilots")
def list_pilots(session: Session = Depends(db), actor: Actor = Depends(current_actor)):
    rows = session.scalars(select(BehavioralPilot).order_by(BehavioralPilot.created_at.desc())).all()
    full = actor.at_least("reviewer")
    return {"pilots": [_pilot(p, full or (actor.user is not None and p.created_by == actor.id)) for p in rows],
            "gate": gate_svc.behavioral(session).as_dict()}


@router.post("/behavioral-pilots", status_code=201)
def create_pilot(body: PilotIn, session: Session = Depends(db), actor: Actor = Depends(require("researcher"))):
    if body.analysis_run_id and not session.get(AnalysisRun, body.analysis_run_id):
        raise HTTPException(422, detail={"code": "unknown_run", "message": "analysis_run_id does not exist."})
    p = BehavioralPilot(**body.model_dump(), created_by=actor.id)
    session.add(p)
    session.flush()
    audit.record(session, entity_type="behavioral_pilot", entity_id=p.id, action="create", actor=actor)
    session.commit()
    return _pilot(p, True)


@router.post("/behavioral-pilots/{pilot_id}/verify")
def verify_pilot(pilot_id: str, body: ReviewIn, session: Session = Depends(db), actor: Actor = Depends(require("reviewer"))):
    p = session.get(BehavioralPilot, pilot_id)
    if p is None:
        raise HTTPException(404, detail={"code": "not_found", "message": "Pilot not found."})
    if p.created_by == actor.id:
        raise HTTPException(409, detail={"code": "self_verification", "message": "A pilot cannot be verified by its recorder."})
    p.verified_by, p.verified_at = (actor.id, datetime.now(UTC)) if body.decision == "approve" else (None, None)
    audit.record(session, entity_type="behavioral_pilot", entity_id=p.id, action=f"verify_{body.decision}", actor=actor,
                 note=body.note)
    session.commit()
    return _pilot(p, True)


# ------------------------------------------------------------------ gates

@router.get("/gates")
def gates(session: Session = Depends(db)):
    return gate_svc.all_gates(session)


@router.get("/gates/{gate_key}/signoffs")
def list_signoffs(gate_key: str, session: Session = Depends(db)):
    if gate_key not in GATE_KEYS:
        raise HTTPException(404, detail={"code": "unknown_gate", "message": "Unknown gate."})
    rows = session.scalars(select(GateSignoff).where(GateSignoff.gate_key == gate_key)
                           .order_by(GateSignoff.created_at.desc())).all()
    return {"signoffs": [{"id": s.id, "condition_key": s.condition_key, "decision": s.decision, "rationale": s.rationale,
                          "evidence_refs": s.evidence_refs, "created_at": s.created_at.isoformat()} for s in rows]}


@router.post("/gates/{gate_key}/signoffs", status_code=201)
def create_signoff(gate_key: str, body: SignoffIn, session: Session = Depends(db),
                   actor: Actor = Depends(require("reviewer"))):
    allowed = {"cross_site": {"null_model", "domain_review"}, "differentiation": {"review"}}
    if body.condition_key not in allowed.get(gate_key, set()):
        raise HTTPException(422, detail={"code": "not_signable",
                                         "message": "Only review conditions can be signed off; data conditions are "
                                                    "computed from records.", "errors": [f"allowed: {sorted(allowed.get(gate_key, []))}"]})
    s = GateSignoff(gate_key=gate_key, condition_key=body.condition_key, decision=body.decision,
                    rationale=body.rationale, evidence_refs=body.evidence_refs, reviewer_id=actor.id)
    session.add(s)
    session.flush()
    audit.record(session, entity_type="gate", entity_id=gate_key, action=f"signoff_{body.decision}", actor=actor,
                 changes={"condition": body.condition_key}, note=body.rationale)
    session.commit()
    return {"id": s.id, "gate": gate_key, "condition_key": s.condition_key, "decision": s.decision}


# ---------------------------------------------------------------- reports

def _can_view_report(session: Session, r: GeneratedReport, actor: Actor) -> bool:
    if r.kind == "analysis":
        run = session.get(AnalysisRun, r.subject_id)
        return run is not None and an_svc.can_view_run(run, actor)
    return True


@router.get("/reports")
def list_reports(kind: str | None = None, session: Session = Depends(db), actor: Actor = Depends(current_actor)):
    stmt = select(GeneratedReport).order_by(GeneratedReport.created_at.desc()).limit(200)
    if kind:
        stmt = stmt.where(GeneratedReport.kind == kind)
    rows = [r for r in session.scalars(stmt).all() if _can_view_report(session, r, actor)]
    return {"reports": [rep_svc.serialize(r) for r in rows]}


@router.post("/reports", status_code=201)
def create_report(body: ReportIn, session: Session = Depends(db), actor: Actor = Depends(require("researcher"))):
    return rep_svc.serialize(rep_svc.generate(session, kind=body.kind, subject_id=body.subject_id, actor=actor))


@router.get("/reports/{report_id}")
def get_report(report_id: str, session: Session = Depends(db), actor: Actor = Depends(current_actor)):
    r = session.get(GeneratedReport, report_id)
    if r is None or not _can_view_report(session, r, actor):
        raise HTTPException(404, detail={"code": "not_found", "message": "Report not found."})
    return rep_svc.serialize(r)


@router.get("/reports/{report_id}/download/{fmt}")
def download(report_id: str, fmt: str, session: Session = Depends(db), actor: Actor = Depends(current_actor)):
    r = session.get(GeneratedReport, report_id)
    if r is None or not _can_view_report(session, r, actor):
        raise HTTPException(404, detail={"code": "not_found", "message": "Report not found."})
    if fmt not in ("pdf", "csv", "json"):
        raise HTTPException(404, detail={"code": "format_not_found", "message": "Unknown format."})
    media = {"pdf": "application/pdf", "csv": "text/csv; charset=utf-8", "json": "application/json"}[fmt]
    safe = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in r.title)[:80].strip("-")
    return FileResponse(rep_svc.file_path(r, fmt), media_type=media, filename=f"chronoheritage-{safe}.{fmt}")


# ------------------------------------------------------------- jobs/audit

@router.get("/jobs/{job_id}")
def job(job_id: str, session: Session = Depends(db), actor: Actor = Depends(require("researcher"))):
    j = session.get(Job, job_id)
    if j is None or (j.created_by != actor.id and not actor.at_least("reviewer")):
        raise HTTPException(404, detail={"code": "not_found", "message": "Job not found."})
    return {"id": j.id, "kind": j.kind, "status": j.status, "attempts": j.attempts, "error": j.error, "result": j.result}


@router.get("/audit")
def audit_events(entity_type: str | None = None, entity_id: str | None = None, limit: int = Query(100, le=500),
                 session: Session = Depends(db), actor: Actor = Depends(require("reviewer"))):
    stmt = select(AuditEvent).order_by(AuditEvent.at.desc()).limit(limit)
    if entity_type:
        stmt = stmt.where(AuditEvent.entity_type == entity_type)
    if entity_id:
        stmt = stmt.where(or_(AuditEvent.entity_id == entity_id))
    return {"events": [{"id": e.id, "entity_type": e.entity_type, "entity_id": e.entity_id, "action": e.action,
                        "actor": e.actor_label, "at": e.at.isoformat(), "changes": e.changes, "note": e.note}
                       for e in session.scalars(stmt).all()]}
