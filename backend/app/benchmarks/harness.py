"""Benchmark harness (PRD §12.4, §15.1, FR-28, FR-29; Appendix D).

Runs the frozen suite against independent references and returns
machine-readable outcomes.  It has no database dependency so it can run in CI:

    python -m app.benchmarks.harness --out benchmark-results.json

Outcome rules
* ``pass``    — every required reference was obtained and every difference is
                within the frozen tolerance.
* ``fail``    — a reference was obtained and a difference exceeds tolerance.
* ``blocked`` — a required reference (or required input pack) is unavailable.
                Blocked is never counted as pass.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import sys
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from importlib import metadata
from pathlib import Path

import numpy as np

SUITE_DIR = Path(__file__).parent / "suite_v1"


@dataclass
class CaseOutcome:
    case_key: str
    test_class: str
    status: str
    explanation: str
    candidate_output: dict | None = None
    reference_outputs: dict | None = None
    max_abs_difference_deg: float | None = None
    tolerance_deg: float | None = None
    reference_metadata: dict = field(default_factory=dict)
    log: list = field(default_factory=list)
    retrievals: list = field(default_factory=list)

    def as_dict(self):
        return self.__dict__.copy()


def canonical_hash(obj) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def load_suite() -> dict:
    suite = json.loads((SUITE_DIR / "suite.json").read_text())
    suite["tolerance_hash"] = canonical_hash({"tolerances": suite["tolerances"],
                                              "cases": [{k: c[k] for k in ("case_key", "test_class", "inputs")}
                                                        for c in suite["cases"]]})
    for c in suite["cases"]:
        c["input_hash"] = canonical_hash(c["inputs"])
        c["tolerance_deg"] = suite["tolerances"][c["test_class"]]["tolerance_deg"]
        c["tolerance_rationale"] = suite["tolerances"][c["test_class"]]["rationale"]
    return suite


def environment() -> dict:
    pkgs = {}
    for name in ("skyfield", "astropy", "pyerfa", "numpy", "scipy", "jplephem", "de406", "httpx"):
        try:
            pkgs[name] = metadata.version(name)
        except metadata.PackageNotFoundError:
            pkgs[name] = None
    lock = Path(__file__).resolve().parents[2] / "requirements.lock"
    return {
        "python": platform.python_version(), "platform": platform.platform(), "packages": pkgs,
        "requirements_lock_sha256": hashlib.sha256(lock.read_bytes()).hexdigest() if lock.exists() else None,
        "git_sha": __import__("os").environ.get("CHRONO_GIT_SHA"),
    }


# ----------------------------------------------------------------- executors

def _ang(a, b):
    return float(((a - b + 180.0) % 360.0) - 180.0)


def run_modern(case: dict, tol: float, *, horizons_enabled: bool = True, cached: dict | None = None) -> CaseOutcome:
    from ..science.astronomy import horizons, reference_astropy
    from ..science.astronomy.engine import CandidateEngine

    inp = case["inputs"]
    eng = CandidateEngine()
    alt, az, _ = eng.sun_altaz(eng.ts.tt_jd(np.array(inp["tt_jds"])), inp["lat"], inp["lon"], inp["elev_m"])
    candidate = [{"tt_jd": j, "az_deg": float(z), "el_deg": float(a)} for j, a, z in zip(inp["tt_jds"], alt, az)]
    supplementary = []
    for j in inp["tt_jds"]:
        a2, z2 = reference_astropy.instant_altaz_airless(j, inp["lat"], inp["lon"], inp["elev_m"])
        supplementary.append({"tt_jd": j, "az_deg": z2, "el_deg": a2})
    out = CaseOutcome(case["case_key"], "modern", "blocked", "", {"rows": candidate},
                      {"astropy_supplementary_not_gate_reference": supplementary}, tolerance_deg=tol)
    params = horizons.build_params(lat=inp["lat"], lon=inp["lon"], elev_m=inp["elev_m"], tt_jds=inp["tt_jds"])
    result = None
    if horizons_enabled:
        try:
            result = horizons.fetch_sun_azel(lat=inp["lat"], lon=inp["lon"], elev_m=inp["elev_m"], tt_jds=inp["tt_jds"])
            out.retrievals.append({"provider": "jpl_horizons", "case_key": case["case_key"],
                                   "request_params": result.request_params, "retrieved_at": result.retrieved_at,
                                   "api_version": result.api_version, "response_sha256": result.response_sha256,
                                   "extracted": {"rows": result.rows}, "attribution": horizons.ATTRIBUTION})
            out.log.append(f"Live Horizons retrieval at {result.retrieved_at} (sha256 {result.response_sha256[:12]}…).")
        except horizons.ReferenceUnavailable as exc:
            out.log.append(f"Live Horizons retrieval failed: {exc}")
    else:
        out.log.append("Horizons retrieval disabled by configuration.")
    if result is None and cached:
        out.log.append(f"Using previously logged retrieval from {cached['retrieved_at']} (same request parameters).")
        result = horizons.HorizonsResult(cached["extracted"]["rows"], cached["request_params"], cached["retrieved_at"],
                                         cached.get("api_version"), cached["response_sha256"])
    out.reference_metadata = {"provider": "jpl_horizons", "request_params": params, "attribution": horizons.ATTRIBUTION,
                              "licence": horizons.LICENCE_NOTE, "frame": "airless apparent topocentric az/el, TT instants",
                              "candidate_frame": "Skyfield apparent (light-time, aberration, deflection), airless"}
    if result is None:
        out.explanation = ("BLOCKED: no JPL Horizons reference could be obtained and no logged retrieval exists. "
                           "The Astropy values are shown as a supplementary cross-check only; they cannot pass this case.")
        return out
    if len(result.rows) != len(candidate):
        out.status, out.explanation = "fail", "Reference row count differs from candidate."
        return out
    diffs = []
    for c, r in zip(candidate, result.rows):
        diffs.append(abs(_ang(c["az_deg"], r["az_deg"])))
        diffs.append(abs(c["el_deg"] - r["el_deg"]))
    out.reference_outputs["jpl_horizons"] = result.rows
    out.reference_metadata.update({"retrieved_at": result.retrieved_at, "api_version": result.api_version,
                                   "response_sha256": result.response_sha256})
    out.max_abs_difference_deg = float(max(diffs))
    out.status = "pass" if out.max_abs_difference_deg <= tol else "fail"
    out.explanation = f"Max |Δ| az/el = {out.max_abs_difference_deg:.6f}° vs tolerance {tol}°."
    return out


def run_historical(case: dict, tol: float) -> CaseOutcome:
    from ..science.astronomy import reference_analytic, reference_astropy
    from ..science.astronomy.engine import CandidateEngine, EngineError

    inp = case["inputs"]
    out = CaseOutcome(case["case_key"], "historical", "blocked", "", tolerance_deg=tol)
    try:
        cand = CandidateEngine().event(target_key=inp["target_key"], lat=inp["lat"], lon=inp["lon"],
                                       elevation_m=inp["elev_m"], year=inp["year"], limb=inp["limb"])
        out.candidate_output = {"azimuth_deg": cand.azimuth_deg, "declination_deg": cand.declination_deg,
                                "instant_tt_jd": cand.reference_instant_tt_jd, "event_tt_jd": cand.event_tt_jd}
    except EngineError as exc:
        out.explanation = f"BLOCKED: candidate could not compute: {exc}"
        return out
    refs, errs = {}, []
    for name, fn in (("path_a_astropy", reference_astropy.solstice_event_azimuth),
                     ("path_b_laskar", reference_analytic.solstice_event_azimuth)):
        t0 = time.time()
        try:
            refs[name] = fn(target_key=inp["target_key"], lat=inp["lat"], year=inp["year"], limb=inp["limb"])
            out.log.append(f"{name} computed in {time.time() - t0:.2f}s")
        except Exception as exc:  # each failure is recorded, case becomes blocked
            errs.append(f"{name}: {type(exc).__name__}: {exc}")
    out.reference_outputs = refs
    out.reference_metadata = {"paths": list(refs), "event_definition": "Sun limb/centre at flat 0° apparent horizon, "
                              "Bennett refraction at 1010 hPa / 10 °C, solstice instant", "time_scale": "TT"}
    if errs:
        out.explanation = "BLOCKED: " + "; ".join(errs)
        return out
    diffs = {k: abs(_ang(v["azimuth_deg"], cand.azimuth_deg)) for k, v in refs.items()}
    out.max_abs_difference_deg = float(max(diffs.values()))
    out.status = "pass" if out.max_abs_difference_deg <= tol else "fail"
    out.explanation = ("|Δ| vs " + ", ".join(f"{k} = {v:.5f}°" for k, v in diffs.items()) + f"; tolerance {tol}°. "
                       "Both independent paths are required to agree.")
    return out


def run_horizon(case: dict, tol: float) -> CaseOutcome:
    from ..science.astronomy import reference_analytic
    from ..science.astronomy.engine import CandidateEngine
    from ..science.horizon import HorizonKind, HorizonProfile

    inp = case["inputs"]
    if case["reference_kind"] == "documented_terrain":
        return CaseOutcome(case["case_key"], "horizon", "blocked",
                           "BLOCKED: no documented, licensed DEM-derived horizon and independent reference have been "
                           "added to the suite.", tolerance_deg=tol)
    h = inp["horizon"]
    prof = HorizonProfile(HorizonKind(h["kind"]), h["azimuths_deg"], h["altitudes_deg"])
    cand = CandidateEngine().event(target_key=inp["target_key"], lat=inp["lat"], lon=inp["lon"],
                                   elevation_m=inp["elev_m"], year=inp["year"], limb=inp["limb"], horizon=prof)
    ref = reference_analytic.solstice_event_azimuth(target_key=inp["target_key"], lat=inp["lat"], year=inp["year"],
                                                    limb=inp["limb"], horizon=prof)
    flat = CandidateEngine().event(target_key=inp["target_key"], lat=inp["lat"], lon=inp["lon"],
                                   elevation_m=inp["elev_m"], year=inp["year"], limb=inp["limb"])
    d = abs(_ang(ref["azimuth_deg"], cand.azimuth_deg))
    shift = _ang(cand.azimuth_deg, flat.azimuth_deg)
    return CaseOutcome(case["case_key"], "horizon", "pass" if d <= tol else "fail",
                       f"|Δ| = {d:.5f}° (tolerance {tol}°). Horizon shifts the candidate azimuth by {shift:+.3f}° "
                       "relative to a flat horizon.",
                       {"azimuth_deg": cand.azimuth_deg, "horizon_altitude_deg": cand.horizon_altitude_deg,
                        "flat_horizon_azimuth_deg": flat.azimuth_deg},
                       {"path_b_laskar": ref}, d, tol, {"profile": h})


def run_wraparound(case: dict, tol: float) -> CaseOutcome:
    from ..science.angles import residual

    rows, worst = [], 0.0
    for c in case["inputs"]["cases"]:
        got = float(residual(c["observed"], c["predicted"], c["axis_mode"]))
        d = abs(got - c["expected"])
        worst = max(worst, d)
        rows.append({**c, "candidate": got, "abs_difference": d})
    return CaseOutcome(case["case_key"], "wraparound", "pass" if worst <= tol else "fail",
                       f"{len(rows)} sub-cases; max |Δ| = {worst:.3e}° (tolerance {tol}°).",
                       {"rows": rows}, {"expected": [c["expected"] for c in case["inputs"]["cases"]]}, worst, tol)


def run_published(case: dict, tol) -> CaseOutcome:
    return CaseOutcome(case["case_key"], "published", "blocked",
                       "BLOCKED: no published-case source pack has been loaded. A data steward must add the citation "
                       "and reported values; nothing is entered from memory.", tolerance_deg=tol)


def run_reproducibility(case: dict, tol) -> CaseOutcome:
    from ..science.angles import AxisMode
    from ..science.chronology import Chronology
    from ..science.montecarlo import OrientationInput, PredictionGrid, propagate

    i = case["inputs"]
    grid = PredictionGrid(np.array(i["grid_years"], float), np.array(i["grid_azimuths"], float))

    def run(seed):
        r = propagate(orientation=OrientationInput(i["azimuth_deg"], i["sigma_deg"], AxisMode(i["axis_mode"])),
                      chronology=Chronology(**i["chronology"]), grid=grid, horizon_sigma_deg=None,
                      n_samples=i["n_samples"], seed=seed)
        return canonical_hash(r)

    h1, h2, h3 = run(i["seed"]), run(i["seed"]), run(i["seed"] + 1)
    ok = h1 == h2 and h1 != h3
    return CaseOutcome(case["case_key"], "reproducibility", "pass" if ok else "fail",
                       "Same seed → identical output hash; different seed → different hash." if ok
                       else "Reproducibility property violated.",
                       {"hash_seed": h1, "hash_seed_repeat": h2, "hash_other_seed": h3}, None,
                       0.0 if ok else None, tol)


def run_missing_data(case: dict, tol) -> CaseOutcome:
    from ..science.astronomy.engine import CandidateEngine, EngineError
    from ..science.chronology import Chronology
    from ..science.conventions import to_true_azimuth

    checks = {}
    r = to_true_azimuth(raw_bearing=100, unit="deg", north_reference="unspecified", measurement_uncertainty_deg=1,
                        lat=50, lon=0)
    checks["unspecified_north"] = r.status.value == "blocked" and r.true_azimuth_deg is None
    r = to_true_azimuth(raw_bearing=100, unit="deg", north_reference="magnetic", measurement_uncertainty_deg=1,
                        lat=50, lon=0)
    checks["magnetic_without_declination"] = r.status.value == "blocked" and r.true_azimuth_deg is None
    e = CandidateEngine()
    try:
        e.event(target_key="sun_june_solstice_rise", lat=50, lon=0)
        checks["missing_year_for_solstice"] = False
    except EngineError:
        checks["missing_year_for_solstice"] = True
    try:
        e.event(target_key="moon_major_standstill", lat=50, lon=0, year=2000)
        checks["unsupported_target"] = False
    except EngineError:
        checks["unsupported_target"] = True
    try:
        Chronology(-1000, -1500)
        checks["chronology_missing"] = False
    except ValueError:
        checks["chronology_missing"] = True
    ok = all(checks.values())
    return CaseOutcome(case["case_key"], "missing_data", "pass" if ok else "fail",
                       "All incomplete inputs were refused without fabricated values." if ok
                       else "A missing input was silently filled: " + ", ".join(k for k, v in checks.items() if not v),
                       {"checks": checks}, None, None, tol)


EXECUTORS = {"historical": run_historical, "horizon": run_horizon, "wraparound": run_wraparound,
             "published": run_published, "reproducibility": run_reproducibility, "missing_data": run_missing_data}


def run_suite(*, horizons_enabled: bool = True, cached_retrievals: dict | None = None,
              only: list[str] | None = None) -> dict:
    suite = load_suite()
    started = datetime.now(UTC).isoformat()
    outcomes = []
    for case in suite["cases"]:
        if only and case["case_key"] not in only:
            continue
        tol = case["tolerance_deg"]
        try:
            if case["test_class"] == "modern":
                o = run_modern(case, tol, horizons_enabled=horizons_enabled,
                               cached=(cached_retrievals or {}).get(case["case_key"]))
            else:
                o = EXECUTORS[case["test_class"]](case, tol)
        except Exception as exc:  # an executor crash is a visible failure, never a pass
            o = CaseOutcome(case["case_key"], case["test_class"], "fail", f"Executor error: {type(exc).__name__}: {exc}",
                            tolerance_deg=tol)
        outcomes.append(o.as_dict())
    classes: dict[str, dict] = {}
    for o in outcomes:
        c = classes.setdefault(o["test_class"], {"pass": 0, "fail": 0, "blocked": 0})
        c[o["status"]] += 1
    return {
        "suite_id": suite["suite_id"], "tolerance_hash": suite["tolerance_hash"], "frozen_at": suite["frozen_at"],
        "started_at": started, "finished_at": datetime.now(UTC).isoformat(), "environment": environment(),
        "classes": classes, "required_classes": suite["required_classes"], "outcomes": outcomes,
    }


def render_markdown(result: dict) -> str:
    lines = [f"# Benchmark run — {result['suite_id']}", "",
             f"Tolerance hash `{result['tolerance_hash'][:16]}…`, frozen {result['frozen_at']}.", "",
             "| Case | Class | Status | max abs diff (deg) | Tolerance | Explanation |", "|---|---|---|---|---|---|"]
    for o in result["outcomes"]:
        d = "—" if o["max_abs_difference_deg"] is None else f"{o['max_abs_difference_deg']:.6f}"
        lines.append(f"| {o['case_key']} | {o['test_class']} | **{o['status'].upper()}** | {d} | "
                     f"{o['tolerance_deg']} | {o['explanation'].replace('|', '/')} |")
    return "\n".join(lines) + "\n"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Run the ChronoHeritage benchmark suite.")
    ap.add_argument("--out", default="benchmark-results.json")
    ap.add_argument("--markdown", default="benchmark-results.md")
    ap.add_argument("--no-horizons", action="store_true", help="Do not contact JPL Horizons (cases become blocked).")
    ap.add_argument("--fail-on", choices=["fail", "fail_or_blocked"], default="fail")
    args = ap.parse_args(argv)
    result = run_suite(horizons_enabled=not args.no_horizons)
    Path(args.out).write_text(json.dumps(result, indent=2, default=str))
    Path(args.markdown).write_text(render_markdown(result))
    print(render_markdown(result))
    bad = {"fail"} if args.fail_on == "fail" else {"fail", "blocked"}
    return 1 if any(o["status"] in bad and o["test_class"] in result["required_classes"] for o in result["outcomes"]) else 0


if __name__ == "__main__":
    sys.exit(main())
