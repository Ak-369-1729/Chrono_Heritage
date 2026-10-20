"""Phase 0 Dataset Feasibility workflow (PRD §6.2, §14.1, FR-23–FR-26, Appendix E/F)."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..deps import Actor
from ..models import ConventionCompatibilityScore, DatasetFeasibilityReport, Site
from ..science import compatibility, provenance
from ..science.gates import PHASE0_MIN_INVENTORY, PHASE0_MIN_QUALIFIED
from . import audit
from . import sites as site_svc


def _inventory_row(site: Site) -> dict:
    rec = site_svc.flat_record(site)
    prov = provenance.score_record(rec).as_dict()
    o, c = rec["orientation"] or {}, rec["chronology"] or {}
    elig = site_svc.eligibility(site, prov)
    sources = [site_svc.source_dict(link.source) | {"role": link.role} for link in site.source_links]
    return {
        "site_id": site.id, "name": site.name, "site_type": site.site_type, "region": site.region,
        "is_illustrative": site.is_illustrative, "status": site.status,
        "sources": sources,
        "orientation": {
            "raw_bearing": o.get("raw_bearing"), "bearing_unit": o.get("bearing_unit"),
            "axis_mode": o.get("axis_mode"), "axis_definition": o.get("axis_definition"),
            "north_reference": o.get("north_reference"), "method": o.get("method"),
            "uncertainty_deg": o.get("uncertainty_deg"),
            "uncertainty_unavailable_reason": o.get("uncertainty_unavailable_reason"),
        },
        "chronology": {
            "start_year": c.get("start_year"), "end_year": c.get("end_year"),
            "calendar_basis": c.get("calendar_basis"), "date_basis": c.get("date_basis"),
            "uncertainty_note": c.get("uncertainty_note"),
        },
        "transformation": site_svc.transformed_orientation(site),
        "provenance": prov,
        "eligibility": elig,
    }


def _kill_worksheet(*, real: bool, qualified_first5: int | None, compat: dict, gates_snapshot: dict) -> dict:
    score = compat.get("dataset_score")
    k01 = {
        "criterion": "K-01", "record": f"{qualified_first5} of 5" if qualified_first5 is not None else "—",
        "rule": "<3 → narrow/pivot/terminate",
    }
    k02 = {"criterion": "K-02", "record": f"{score} (formula {compat['formula_version']})" if score is not None else "—",
           "rule": "<0.85 or blocker → no pooled statistics"}
    if not real:
        k01["outcome"] = "not_applicable"
        k01["note"] = "Illustrative dataset: the rule is shown for workflow demonstration only and records no decision."
        k02["outcome"] = "not_applicable"
        k02["note"] = k01["note"]
    else:
        k01["outcome"] = "triggered" if qualified_first5 < PHASE0_MIN_QUALIFIED else "not_triggered"
        k02["outcome"] = "triggered" if (score is None or score < compatibility.POOLING_THRESHOLD
                                         or compat["critical_blockers"]) else "not_triggered"
    rest = {k: {"criterion": k.upper(), "outcome": v.get("status"), "rule": v.get("fail_action")}
            for k, v in gates_snapshot.items()}
    return {"K-01": k01, "K-02": k02, **{f"gate:{k}": v for k, v in rest.items()}}


def _recommendation(*, real: bool, qualified: int, compat: dict, inventory: int) -> dict:
    if not real:
        mech = ("prototype" if qualified >= PHASE0_MIN_QUALIFIED else "narrow_pivot_terminate")
        return {
            "decision": "no_decision_illustrative",
            "label": "No decision — illustrative dataset",
            "rationale": ("This report is computed on explicitly illustrative records. It demonstrates the "
                          "feasibility mechanics only and cannot support a tier or kill decision."),
            "mechanics_output_if_real": mech,
        }
    if inventory < PHASE0_MIN_INVENTORY:
        return {"decision": "incomplete_inventory", "label": "Inventory incomplete",
                "rationale": f"Phase 0 requires {PHASE0_MIN_INVENTORY} candidate sites; {inventory} provided."}
    if qualified < PHASE0_MIN_QUALIFIED:
        return {"decision": "narrow_pivot_terminate", "label": "Narrow / pivot / terminate (K-01 triggered)",
                "rationale": f"Only {qualified} of {inventory} candidates are fully provenance-qualified."}
    pooled = compat["pooling_allowed"]
    return {
        "decision": "prototype_tier",
        "label": "Published-Case-Study Prototype (Tier 1)",
        "rationale": (f"{qualified} qualified sites meet the Tier 1 minimum. Pooled inference "
                      + ("is not excluded by compatibility, but Tier 2 additionally needs 15–20 sites and "
                         "benchmark/domain review." if pooled else "is not permitted (K-02).")),
    }


def create_report(session: Session, *, site_ids: list[str], title: str, actor: Actor, gates_snapshot: dict) -> DatasetFeasibilityReport:
    if not site_ids:
        raise HTTPException(422, detail={"code": "empty_inventory", "message": "Select at least one site."})
    rows = session.scalars(site_svc.visible_sites_query(actor).where(Site.id.in_(site_ids))).all()
    found = {s.id: s for s in rows}
    missing = [i for i in site_ids if i not in found]
    if missing:
        raise HTTPException(404, detail={"code": "site_not_found", "message": f"Unknown or hidden sites: {missing}"})
    ordered = [found[i] for i in site_ids]
    inventory = [_inventory_row(s) for s in ordered]
    illustrative = any(s.is_illustrative for s in ordered)
    real = not illustrative
    compat = compatibility.dataset_compatibility([site_svc.flat_record(s) for s in ordered])
    qualified = sum(1 for r in inventory if r["provenance"]["fully_qualified"])
    eligible = sum(1 for r in inventory if r["eligibility"]["single_site_analysis"]["eligible"]
                   and r["provenance"]["fully_qualified"])
    first5 = inventory[:PHASE0_MIN_INVENTORY]
    qualified_first5 = sum(1 for r in first5 if r["provenance"]["fully_qualified"])
    exclusions = []
    for r in inventory:
        reasons = []
        if not r["provenance"]["fully_qualified"]:
            reasons.append("Missing critical provenance: " + ", ".join(r["provenance"]["critical_missing"]))
        reasons.extend(r["eligibility"]["single_site_analysis"]["reasons"])
        if reasons:
            exclusions.append({"site_id": r["site_id"], "name": r["name"], "reasons": sorted(set(reasons))})
    digest = hashlib.sha256(json.dumps(inventory, sort_keys=True, default=str).encode()).hexdigest()[:12]
    report = DatasetFeasibilityReport(
        dataset_version=f"ds-{datetime.now(UTC):%Y%m%d}-{digest}",
        title=title,
        site_ids=site_ids,
        inventory=inventory,
        compatibility={k: v for k, v in compat.items() if k != "pairs"} | {"pairs": compat["pairs"]},
        qualified_count=qualified,
        eligible_count=eligible,
        exclusions=exclusions,
        kill_worksheet=_kill_worksheet(real=real, qualified_first5=qualified_first5 if real else None,
                                       compat=compat, gates_snapshot=gates_snapshot),
        recommendation=_recommendation(real=real, qualified=qualified, compat=compat, inventory=len(inventory)),
        formula_versions={"provenance": provenance.formula_description(),
                          "compatibility": compatibility.formula_description()},
        status="proposed",
        is_illustrative=illustrative,
        created_by=actor.id,
    )
    session.add(report)
    session.flush()
    for p in compat["pairs"]:
        session.add(ConventionCompatibilityScore(
            report_id=report.id, site_a=p["a"], site_b=p["b"], pair_score=p["score"], fields=p["fields"],
            critical_blockers=p["critical_blockers"], formula_version=compat["formula_version"]))
    audit.record(session, entity_type="feasibility_report", entity_id=report.id, action="create", actor=actor,
                 changes={"site_ids": site_ids, "qualified": qualified, "illustrative": illustrative})
    session.commit()
    return report


def review_report(session: Session, report: DatasetFeasibilityReport, *, actor: Actor, decision: str, note: str):
    if report.is_illustrative and decision == "approve":
        raise HTTPException(409, detail={"code": "illustrative_report",
                                         "message": "Illustrative reports cannot be approved as Phase 0 evidence."})
    if decision not in ("approve", "reject"):
        raise HTTPException(422, detail={"code": "bad_decision", "message": "decision must be approve or reject"})
    report.status = "reviewed" if decision == "approve" else "rejected"
    report.reviewed_by, report.reviewed_at, report.review_note = actor.id, datetime.now(UTC), note
    audit.record(session, entity_type="feasibility_report", entity_id=report.id, action=f"review_{decision}",
                 actor=actor, note=note)
    session.commit()
    return report


def serialize(report: DatasetFeasibilityReport, include_inventory: bool = True) -> dict:
    d = {
        "id": report.id, "title": report.title, "dataset_version": report.dataset_version,
        "created_at": report.created_at.isoformat(), "status": report.status,
        "is_illustrative": report.is_illustrative, "site_ids": report.site_ids,
        "qualified_count": report.qualified_count, "eligible_count": report.eligible_count,
        "inventory_count": len(report.site_ids),
        "compatibility_score": report.compatibility.get("dataset_score"),
        "pooling_allowed": report.compatibility.get("pooling_allowed"),
        "critical_blockers": report.compatibility.get("critical_blockers", []),
        "recommendation": report.recommendation,
        "reviewed_at": report.reviewed_at.isoformat() if report.reviewed_at else None,
        "review_note": report.review_note,
    }
    if include_inventory:
        d.update({"inventory": report.inventory, "compatibility": report.compatibility,
                  "exclusions": report.exclusions, "kill_worksheet": report.kill_worksheet,
                  "formula_versions": report.formula_versions})
    return d


def latest_report(session: Session) -> DatasetFeasibilityReport | None:
    return session.scalars(select(DatasetFeasibilityReport).order_by(DatasetFeasibilityReport.created_at.desc())).first()
