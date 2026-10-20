"""CSV and JSON exports (FR-19, FR-20). Units and missingness are explicit in every file."""

from __future__ import annotations

import csv
import io
import json

SCHEMA_VERSION = "chronoheritage-export-1.0"


def to_json(kind: str, payload: dict) -> bytes:
    return json.dumps({"schema_version": SCHEMA_VERSION, "kind": kind, **payload}, indent=2, default=str,
                      ensure_ascii=False).encode()


def _csv(rows: list[list], header: list[str], preamble: list[str] = ()) -> bytes:
    buf = io.StringIO()
    for line in preamble:
        buf.write(f"# {line}\n")
    w = csv.writer(buf)
    w.writerow(header)
    for r in rows:
        w.writerow(["" if v is None else v for v in r])
    return buf.getvalue().encode()


MISSING_NOTE = "Empty cells mean the value is missing or unavailable; no value has been imputed."


def analysis_csv(run: dict) -> bytes:
    res = run.get("result") or {}
    mc = res.get("monte_carlo", {})
    rows = []
    for q, block in (("predicted_azimuth", mc.get("predicted_azimuth", {})),
                     ("residual_signed", mc.get("residual_signed", {})),
                     ("residual_abs", mc.get("residual_abs", {}))):
        for k, v in block.items():
            rows.append(["monte_carlo", f"{q}.{k}", v, "deg"])
    for k, v in mc.get("within_window", {}).items():
        rows.append(["monte_carlo", f"share_abs_residual_le_{k}deg", v, "fraction (descriptive, not a p-value)"])
    for b in res.get("range_bounds", []):
        rows.append(["range_bound", f"{b['label']}.predicted_azimuth", b["predicted_azimuth_deg"], "deg"])
        rows.append(["range_bound", f"{b['label']}.residual_signed", b["residual_signed_deg"], "deg"])
    for s in res.get("sensitivity", []):
        rows.append(["sensitivity", f"{s['parameter']}={s['value']}.predicted_azimuth", s.get("predicted_azimuth_deg"), "deg"])
        rows.append(["sensitivity", f"{s['parameter']}={s['value']}.delta_vs_baseline", s.get("delta_vs_baseline_deg"), "deg"])
    obs = res.get("observed", {})
    rows += [["input", "true_azimuth", obs.get("true_azimuth_deg"), "deg (true north, clockwise)"],
             ["input", "combined_uncertainty", obs.get("combined_uncertainty_deg"), "deg (1σ)"],
             ["input", "axis_mode", obs.get("axis_mode"), ""],
             ["input", "raw_bearing", obs.get("raw_bearing"), obs.get("raw_unit")],
             ["input", "raw_north_reference", obs.get("raw_north_reference"), ""],
             ["reproducibility", "seed", run["seed"], ""], ["reproducibility", "input_hash", run["input_hash"], "sha256"]]
    pre = [f"ChronoHeritage analysis export · run {run['id']} · {SCHEMA_VERSION}",
           "Candidate alignment is not proof of intent." + (" ILLUSTRATIVE INPUTS." if run["is_illustrative"] else ""),
           MISSING_NOTE]
    return _csv(rows, ["section", "quantity", "value", "unit"], pre)


def feasibility_csv(rep: dict) -> bytes:
    rows = []
    for r in rep["inventory"]:
        o, c, p = r["orientation"], r["chronology"], r["provenance"]
        rows.append([r["site_id"], r["name"], r["is_illustrative"], o["raw_bearing"], o["bearing_unit"], o["axis_mode"],
                     o["north_reference"], o["method"], o["uncertainty_deg"], o["uncertainty_unavailable_reason"],
                     c["start_year"], c["end_year"], c["calendar_basis"], c["date_basis"], p["score"],
                     p["fully_qualified"], ";".join(p["critical_missing"]),
                     r["eligibility"]["single_site_analysis"]["eligible"], len(r["sources"])])
    pre = [f"Dataset feasibility inventory · {rep['dataset_version']} · status {rep['status']}"
           + (" · ILLUSTRATIVE" if rep["is_illustrative"] else ""),
           "Years are astronomical (0 = 1 BCE). Bearings in the stated unit, from the stated north reference.",
           "provenance_score is documentation completeness, not truth.", MISSING_NOTE]
    return _csv(rows, ["site_id", "name", "illustrative", "raw_bearing", "bearing_unit", "axis_mode", "north_reference",
                       "method", "uncertainty_deg", "uncertainty_unavailable_reason", "start_year", "end_year",
                       "calendar_basis", "date_basis", "provenance_score", "fully_qualified", "critical_missing",
                       "single_site_eligible", "n_sources"], pre)


def benchmark_csv(run: dict) -> bytes:
    rows = [[r["case_key"], r["test_class"], r["critical"], r["status"], r["max_abs_difference_deg"],
             r["tolerance_deg"], r["reference_kind"], r["input_hash"], r["explanation"]] for r in run["results"]]
    pre = [f"Benchmark run {run['id']} · suite {run['suite_id']} · tolerance hash {run['summary']['tolerance_hash']}",
           "Differences in degrees. 'blocked' means a required reference was unavailable; it is not a pass."]
    return _csv(rows, ["case_key", "class", "critical", "status", "max_abs_difference_deg", "tolerance_deg",
                       "reference_kind", "input_hash", "explanation"], pre)


def comparison_csv(rows: list[dict]) -> bytes:
    data = [[r["case_label"], r["tool"], r["tool_version"], r["operator_label"], r["measured_at"], r["elapsed_seconds"],
             r["manual_steps"], r["provenance_score"], r["uncertainty_propagation"], r["reproducibility_steps"],
             r["evidence_ref"], r["status"]] for r in rows]
    return _csv(data, ["case", "tool", "tool_version", "operator", "measured_at", "elapsed_seconds", "manual_steps",
                       "provenance_score", "uncertainty_propagation", "reproducibility_steps", "evidence", "status"],
                ["Workflow comparison measurements. Only measured values are listed."])
