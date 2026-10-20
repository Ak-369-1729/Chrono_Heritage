from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...deps import Actor, current_actor, db, require
from ...models import DatasetFeasibilityReport, Site
from ...schemas import FeasibilityIn, ReviewIn
from ...science import compatibility
from ...services import feasibility as svc
from ...services import gates as gate_svc
from ...services import sites as site_svc

router = APIRouter(tags=["feasibility"])


def _gates_snapshot(session: Session) -> dict:
    return {"phase0_5": gate_svc.benchmark(session).as_dict(),
            "differentiation": gate_svc.differentiation(session).as_dict(),
            "behavioral": gate_svc.behavioral(session).as_dict(), "ml": gate_svc.gates.ml_gate().as_dict()}


@router.get("/dataset-feasibility/reports")
def list_reports(session: Session = Depends(db)):
    rows = session.scalars(select(DatasetFeasibilityReport).order_by(DatasetFeasibilityReport.created_at.desc())).all()
    return {"reports": [svc.serialize(r, include_inventory=False) for r in rows]}


@router.post("/dataset-feasibility/reports", status_code=201)
def create_report(body: FeasibilityIn, session: Session = Depends(db), actor: Actor = Depends(require("researcher"))):
    if len(set(body.site_ids)) != len(body.site_ids):
        raise HTTPException(422, detail={"code": "duplicate_sites", "message": "Site ids must be unique."})
    rep = svc.create_report(session, site_ids=body.site_ids, title=body.title, actor=actor,
                            gates_snapshot=_gates_snapshot(session))
    return svc.serialize(rep)


@router.get("/dataset-feasibility/reports/latest")
def latest(session: Session = Depends(db)):
    rep = svc.latest_report(session)
    if rep is None:
        raise HTTPException(404, detail={"code": "no_report", "message": "No feasibility report has been generated."})
    return svc.serialize(rep)


@router.get("/dataset-feasibility/reports/{report_id}")
def get_report(report_id: str, session: Session = Depends(db)):
    rep = session.get(DatasetFeasibilityReport, report_id)
    if rep is None:
        raise HTTPException(404, detail={"code": "not_found", "message": "Feasibility report not found."})
    return svc.serialize(rep)


@router.post("/dataset-feasibility/reports/{report_id}/review")
def review_report(report_id: str, body: ReviewIn, session: Session = Depends(db),
                  actor: Actor = Depends(require("reviewer"))):
    rep = session.get(DatasetFeasibilityReport, report_id)
    if rep is None:
        raise HTTPException(404, detail={"code": "not_found", "message": "Feasibility report not found."})
    return svc.serialize(svc.review_report(session, rep, actor=actor, decision=body.decision, note=body.note))


@router.get("/provenance/compatibility")
def live_compatibility(site_ids: list[str] = Query(..., min_length=2, max_length=50), session: Session = Depends(db),
                       actor: Actor = Depends(current_actor)):
    rows = session.scalars(site_svc.visible_sites_query(actor).where(Site.id.in_(site_ids))).all()
    if len(rows) != len(set(site_ids)):
        raise HTTPException(404, detail={"code": "site_not_found", "message": "One or more sites not found."})
    order = {sid: i for i, sid in enumerate(site_ids)}
    rows = sorted(rows, key=lambda s: order[s.id])
    return compatibility.dataset_compatibility([site_svc.flat_record(s) for s in rows])
