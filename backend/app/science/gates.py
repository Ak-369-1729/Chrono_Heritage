"""Formal product gates and kill criteria (PRD §17, §18, §19.1).

Each gate is a pure function of an evidence dictionary assembled by the
service layer from persisted records.  A gate is ``passed`` only when every
condition is satisfied by recorded evidence; human sign-off satisfies only the
*review* condition and can never override a data condition.
"""

from __future__ import annotations

from dataclasses import dataclass, field

GATES_VERSION = "gates-1.0.0"

PHASE0_MIN_INVENTORY = 5
PHASE0_MIN_QUALIFIED = 3
CROSS_SITE_MIN_SITES = 15
CROSS_SITE_MAX_SITES = 20
CROSS_SITE_MIN_COMPATIBILITY = 0.85


@dataclass
class Condition:
    key: str
    label: str
    met: bool | None  # None = not yet evaluable
    detail: str

    def as_dict(self):
        return {"key": self.key, "label": self.label, "met": self.met, "detail": self.detail}


@dataclass
class GateResult:
    key: str
    title: str
    status: str  # passed | failed | pending | not_evaluated | omitted
    conditions: list[Condition] = field(default_factory=list)
    fail_action: str = ""
    kill_criterion: str | None = None

    def as_dict(self):
        return {"key": self.key, "title": self.title, "status": self.status,
                "conditions": [c.as_dict() for c in self.conditions],
                "fail_action": self.fail_action, "kill_criterion": self.kill_criterion,
                "gates_version": GATES_VERSION}


def _status(conds: list[Condition], fail_keys: set[str] = frozenset()) -> str:
    if any(c.met is False and c.key in fail_keys for c in conds):
        return "failed"
    if all(c.met is True for c in conds):
        return "passed"
    if all(c.met is None for c in conds):
        return "not_evaluated"
    return "pending"


def phase0_gate(ev: dict) -> GateResult:
    """ev: real_report(bool), inventory_count, qualified_count, compatibility_assessed, report_reviewed."""
    real = ev.get("real_report", False)
    inv, q = ev.get("inventory_count"), ev.get("qualified_count")
    conds = [
        Condition("real_dataset", "Inventory consists of real, sourced candidate records (not illustrative)",
                  True if real else (None if inv is None else False),
                  "Illustrative records can demonstrate the workflow but never count as evidence."),
        Condition("inventory", f"≥{PHASE0_MIN_INVENTORY} candidate sites inventoried",
                  None if not real else inv >= PHASE0_MIN_INVENTORY, f"{inv if real else '—'} real candidates"),
        Condition("qualified", f"≥{PHASE0_MIN_QUALIFIED} fully provenance-qualified sites",
                  None if not real else q >= PHASE0_MIN_QUALIFIED, f"{q if real else '—'} qualified"),
        Condition("compatibility", "Convention compatibility assessed",
                  None if not real else bool(ev.get("compatibility_assessed")), ""),
        Condition("review", "Feasibility report approved by a reviewer",
                  None if not real else bool(ev.get("report_reviewed")), ""),
    ]
    status = _status(conds, {"qualified"})
    return GateResult("phase0", "Phase 0 — Evidence (dataset feasibility)", status, conds,
                      "Fewer than 3 qualified → narrow / pivot / terminate (K-01). Below pooling threshold → prototype only.",
                      "K-01")


def benchmark_gate(ev: dict) -> GateResult:
    """ev: run_exists, classes{cls: {'pass','fail','blocked'}}, required_classes, published_case_passed,
    tolerances_frozen, tolerances_reviewed, critical_failures(int)."""
    if not ev.get("run_exists"):
        conds = [Condition("run", "Benchmark suite has been executed", None, "No run recorded")]
        return GateResult("phase0_5", "Phase 0.5 — Benchmark", "not_evaluated", conds,
                          "Block scientific release; investigate; no post-hoc tolerance relaxation (K-03).", "K-03")
    classes = ev.get("classes", {})
    conds = [Condition("tolerances_frozen", "Tolerances frozen before comparison", bool(ev.get("tolerances_frozen")),
                       ev.get("tolerance_hash", "")),
             Condition("tolerances_reviewed", "Frozen tolerances reviewed by a domain reviewer",
                       True if ev.get("tolerances_reviewed") else None, "")]
    for cls in ev.get("required_classes", []):
        c = classes.get(cls, {"pass": 0, "fail": 0, "blocked": 0})
        if c["fail"]:
            met, d = False, f"{c['fail']} failing case(s)"
        elif c["blocked"] or not c["pass"]:
            met, d = None, f"{c['blocked']} blocked, {c['pass']} passing"
        else:
            met, d = True, f"{c['pass']} passing"
        conds.append(Condition(f"class_{cls}", f"Class '{cls}' passes", met, d))
    conds.append(Condition("published_case", "At least one published case independently recalculated",
                           True if ev.get("published_case_passed") else None, ev.get("published_case_note", "")))
    status = _status(conds, {c.key for c in conds if c.key.startswith("class_")})
    return GateResult("phase0_5", "Phase 0.5 — Benchmark", status, conds,
                      "Block scientific release; investigate; no post-hoc tolerance relaxation (K-03).", "K-03")


def differentiation_gate(ev: dict) -> GateResult:
    """ev: tools_covered(set), cases_covered(int), quantified_improvements(list), reviewed(bool)."""
    required = {"ArchaeoSky", "Gestirne", "Stellarium", "QGIS + plugin/equivalent", "ChronoHeritage"}
    covered = set(ev.get("tools_covered", set()))
    n_cases = ev.get("complete_cases", 0)
    imps = ev.get("quantified_improvements", [])
    conds = [
        Condition("cases", "Same 2–3 cases measured in every tool", n_cases >= 2 if covered else None,
                  f"{n_cases} case(s) measured across all required tools"),
        Condition("tools", "All comparison tools measured", (required <= covered) if covered else None,
                  "missing: " + ", ".join(sorted(required - covered)) if required - covered else "all tools"),
        Condition("improvement", "≥1 quantified workflow improvement",
                  (len(imps) >= 1) if n_cases >= 2 else None, "; ".join(imps) or "none measured"),
        Condition("review", "Comparison reviewed", True if ev.get("reviewed") else None, ""),
    ]
    return GateResult("differentiation", "Differentiation gate", _status(conds, {"improvement"}), conds,
                      "No differentiation claim; rescope or stop productization (K-04).", "K-04")


def behavioral_gate(ev: dict) -> GateResult:
    """ev: pilots(list of dicts with real_hypothesis, citation_commitment, verified)."""
    pilots = ev.get("pilots", [])
    qualifying = [p for p in pilots if p.get("real_hypothesis") and p.get("citation_commitment") == "explicit_agreement"]
    verified = [p for p in qualifying if p.get("verified")]
    conds = [
        Condition("real_run", "A researcher ran a real hypothesis through the prototype",
                  True if any(p.get("real_hypothesis") for p in pilots) else None, f"{len(pilots)} pilot record(s)"),
        Condition("citation", "Explicit agreement to cite the tool/output",
                  True if qualifying else None, "Stated interest or praise does not count."),
        Condition("verified", "Pilot record verified by a reviewer", True if verified else None, ""),
    ]
    return GateResult("behavioral", "Behavioral user gate", _status(conds), conds,
                      "Demand unvalidated; prototype only or revisit problem (K-05).", "K-05")


def cross_site_gate(ev: dict) -> GateResult:
    """ev: eligible_sites, compatibility_score, critical_blockers(list), benchmark_status,
    null_model_approved(bool), domain_review_approved(bool)."""
    n = ev.get("eligible_sites", 0)
    score = ev.get("compatibility_score")
    blockers = ev.get("critical_blockers", [])
    conds = [
        Condition("sites", f"{CROSS_SITE_MIN_SITES}–{CROSS_SITE_MAX_SITES} qualified, reviewed, non-illustrative sites",
                  n >= CROSS_SITE_MIN_SITES, f"{n} eligible"),
        Condition("compatibility", f"Dataset compatibility ≥ {CROSS_SITE_MIN_COMPATIBILITY}",
                  score is not None and score >= CROSS_SITE_MIN_COMPATIBILITY,
                  "not computed" if score is None else f"{score:.3f}"),
        Condition("blockers", "No unresolved critical convention mismatch", not blockers,
                  f"{len(blockers)} critical blocker(s)"),
        Condition("benchmark", "Phase 0.5 benchmark gate passed", ev.get("benchmark_status") == "passed",
                  f"benchmark gate: {ev.get('benchmark_status')}"),
        Condition("null_model", "Null model approved by a domain reviewer", bool(ev.get("null_model_approved")), ""),
        Condition("domain_review", "Domain review of the statistical protocol approved",
                  bool(ev.get("domain_review_approved")), ""),
    ]
    status = "passed" if all(c.met for c in conds) else "failed"
    return GateResult("cross_site", "Cross-site statistical tier (Tier 2)", status, conds,
                      "Disable pooled inference and p-values (K-02).", "K-02")


def ml_gate() -> GateResult:
    conds = [Condition("reviewed_labels", "Expert-reviewed labels exist", False, "No reviewed label set exists."),
             Condition("decision", "Signed decision", True, "ML omitted from this build (V3.0; PRD §13.4 default).")]
    return GateResult("ml", "Machine-learning gate", "omitted", conds, "Omit ML entirely (K-06).", "K-06")
