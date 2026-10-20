"""Assemble gate evidence from persisted records and evaluate the formal gates."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import BehavioralPilot, BenchmarkSuite, DatasetFeasibilityReport, GateSignoff, WorkflowComparison
from ..science import compatibility, gates
from . import benchmarks as bench_svc
from . import sites as site_svc

COMPARISON_TOOLS = ["ArchaeoSky", "Gestirne", "Stellarium", "QGIS + plugin/equivalent", "ChronoHeritage"]


def _approved(session: Session, gate_key: str, condition_key: str) -> bool:
    s = session.scalars(select(GateSignoff).where(GateSignoff.gate_key == gate_key,
                                                  GateSignoff.condition_key == condition_key)
                        .order_by(GateSignoff.created_at.desc())).first()
    return bool(s and s.decision == "approve")


def phase0(session: Session) -> gates.GateResult:
    real = session.scalars(select(DatasetFeasibilityReport).where(DatasetFeasibilityReport.is_illustrative.is_(False))
                           .order_by(DatasetFeasibilityReport.created_at.desc())).first()
    if real is None:
        any_report = session.scalars(select(DatasetFeasibilityReport)).first()
        return gates.phase0_gate({"real_report": False, "inventory_count": 0 if any_report else None})
    return gates.phase0_gate({"real_report": True, "inventory_count": len(real.site_ids),
                              "qualified_count": real.qualified_count,
                              "compatibility_assessed": real.compatibility.get("dataset_score") is not None,
                              "report_reviewed": real.status == "reviewed"})


def benchmark(session: Session) -> gates.GateResult:
    run = bench_svc.latest_run(session)
    if run is None:
        return gates.benchmark_gate({"run_exists": False})
    suite = session.get(BenchmarkSuite, run.suite_id)
    pub = [r for r in run.results if r.case.test_class == "published"]
    return gates.benchmark_gate({
        "run_exists": True, "classes": run.summary.get("classes", {}),
        "required_classes": run.summary.get("required_classes", []),
        "tolerances_frozen": True, "tolerance_hash": suite.tolerance_hash[:16],
        "tolerances_reviewed": suite.tolerances_reviewed_at is not None,
        "published_case_passed": any(r.status == "pass" for r in pub),
        "published_case_note": "; ".join(r.explanation for r in pub)[:300],
    })


def differentiation(session: Session) -> gates.GateResult:
    rows = session.scalars(select(WorkflowComparison)).all()
    by_case: dict[str, dict[str, WorkflowComparison]] = {}
    for r in rows:
        by_case.setdefault(r.case_label, {})[r.tool] = r
    complete = {c: t for c, t in by_case.items() if set(COMPARISON_TOOLS) <= set(t)}
    improvements = []
    for case, tools in complete.items():
        ch = tools["ChronoHeritage"]
        others = [t for k, t in tools.items() if k != "ChronoHeritage"]
        if all(ch.elapsed_seconds < o.elapsed_seconds for o in others):
            improvements.append(f"{case}: elapsed time lower than every comparison tool")
        if all(ch.provenance_score > o.provenance_score for o in others):
            improvements.append(f"{case}: provenance completeness higher than every comparison tool")
        if all(ch.manual_steps < o.manual_steps for o in others):
            improvements.append(f"{case}: fewer manual steps than every comparison tool")
    covered = set().union(*[set(t) for t in by_case.values()]) if by_case else set()
    return gates.differentiation_gate({"tools_covered": covered, "complete_cases": len(complete),
                                       "quantified_improvements": improvements if len(complete) >= 2 else [],
                                       "reviewed": _approved(session, "differentiation", "review")})


def behavioral(session: Session) -> gates.GateResult:
    pilots = session.scalars(select(BehavioralPilot)).all()
    return gates.behavioral_gate({"pilots": [{"real_hypothesis": bool(p.hypothesis and p.consent_recorded),
                                              "citation_commitment": p.citation_commitment,
                                              "verified": p.verified_at is not None} for p in pilots]})


def cross_site_evidence(session: Session) -> dict:
    """Eligibility is computed from current records, never from a cached flag."""
    # cross-site eligibility is evaluated over every non-archived record regardless of visibility
    all_sites = session.scalars(site_svc.visible_sites_query(_SystemActor())).all()
    eligible = [s for s in all_sites if site_svc.eligibility(s)["cross_site_pooling"]["eligible"]]
    compat = compatibility.dataset_compatibility([site_svc.flat_record(s) for s in eligible]) if len(eligible) >= 2 \
        else {"dataset_score": None, "critical_blockers": []}
    return {
        "eligible_sites": len(eligible), "eligible_site_ids": [s.id for s in eligible],
        "compatibility_score": compat["dataset_score"], "critical_blockers": compat["critical_blockers"],
        "benchmark_status": benchmark(session).status,
        "null_model_approved": _approved(session, "cross_site", "null_model"),
        "domain_review_approved": _approved(session, "cross_site", "domain_review"),
    }


class _SystemActor:
    """Internal actor with full read scope, used only for gate evaluation."""

    id = None
    role = "admin"
    user = object()
    label = "system"

    def at_least(self, role):
        return True


def cross_site(session: Session) -> tuple[gates.GateResult, dict]:
    ev = cross_site_evidence(session)
    return gates.cross_site_gate(ev), ev


def all_gates(session: Session) -> dict:
    cs, ev = cross_site(session)
    return {
        "phase0": phase0(session).as_dict(),
        "phase0_5": benchmark(session).as_dict(),
        "differentiation": differentiation(session).as_dict(),
        "behavioral": behavioral(session).as_dict(),
        "cross_site": cs.as_dict() | {"evidence": {k: v for k, v in ev.items() if k != "eligible_site_ids"}},
        "ml": gates.ml_gate().as_dict(),
    }
