"""ReportLab PDF rendering for analysis, feasibility, benchmark and comparison reports.

Every report carries: status banner, caveat, inputs, sources, methods,
software versions, parameters, uncertainty, exclusions/warnings, limitations and
a reproducibility block (PRD FR-19, Appendix I).
"""

from __future__ import annotations

import io
from datetime import UTC, datetime
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.shapes import Drawing, Line, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

FONT_DIR = Path(__file__).parent / "fonts"
_registered = False

INK = colors.HexColor("#141a26")
MUTED = colors.HexColor("#5b6272")
GOLD = colors.HexColor("#a8812f")
BRONZE = colors.HexColor("#8a6a45")
TERRACOTTA = colors.HexColor("#a5523a")
BLUE = colors.HexColor("#4f6a86")
RULE = colors.HexColor("#d8cfbd")
PAPER_TINT = colors.HexColor("#f6f1e6")

LIMITATIONS = [
    "A small angular residual identifies a candidate alignment consistent with the stated hypothesis under the "
    "stated assumptions. It is not evidence of intent.",
    "Construction dates are taken only from the sourced chronology; no date was inferred from the alignment under test.",
    "Refraction near the horizon is variable; the sensitivity table shows the effect of alternative atmospheres.",
    "Provenance completeness measures documentation, not factual correctness.",
    "Human review approves the stated data-quality process only; it does not certify historical intent.",
]


def _fonts():
    global _registered
    if _registered:
        return
    for name, file in [("Sans", "DejaVuSans.ttf"), ("Sans-Bold", "DejaVuSans-Bold.ttf"),
                       ("Serif", "DejaVuSerif.ttf"), ("Serif-Bold", "DejaVuSerif-Bold.ttf"),
                       ("Serif-Italic", "DejaVuSerif-Italic.ttf"), ("Mono", "DejaVuSansMono.ttf")]:
        pdfmetrics.registerFont(TTFont(name, str(FONT_DIR / file)))
    _registered = True


def _styles():
    _fonts()
    return {
        "title": ParagraphStyle("title", fontName="Serif-Bold", fontSize=20, leading=24, textColor=INK, spaceAfter=4),
        "subtitle": ParagraphStyle("subtitle", fontName="Serif-Italic", fontSize=10.5, leading=14, textColor=MUTED,
                                   spaceAfter=10),
        "h2": ParagraphStyle("h2", fontName="Serif-Bold", fontSize=13, leading=16, textColor=INK, spaceBefore=12,
                             spaceAfter=5),
        "h3": ParagraphStyle("h3", fontName="Sans-Bold", fontSize=9, leading=12, textColor=BRONZE, spaceBefore=6,
                             spaceAfter=3),
        "body": ParagraphStyle("body", fontName="Sans", fontSize=8.8, leading=12.2, textColor=INK, alignment=TA_LEFT),
        "small": ParagraphStyle("small", fontName="Sans", fontSize=7.6, leading=10, textColor=MUTED),
        "cell": ParagraphStyle("cell", fontName="Sans", fontSize=7.6, leading=9.6, textColor=INK),
        "cellb": ParagraphStyle("cellb", fontName="Sans-Bold", fontSize=7.6, leading=9.6, textColor=INK),
        "mono": ParagraphStyle("mono", fontName="Mono", fontSize=7.2, leading=9.4, textColor=INK),
        "banner": ParagraphStyle("banner", fontName="Sans-Bold", fontSize=8.6, leading=11.5,
                                 textColor=colors.white),
        "caveat": ParagraphStyle("caveat", fontName="Serif-Italic", fontSize=9.5, leading=13, textColor=INK),
    }


def P(text, style="body"):
    """Paragraph from untrusted text (always escaped)."""
    return Paragraph(escape(str(text)), _styles()[style])


def M(markup, style="body"):
    """Paragraph from trusted markup assembled in this module (inputs escaped by the caller)."""
    return Paragraph(markup, _styles()[style])


def fmt(v, nd=3, unit=""):
    if v is None:
        return "—"
    if isinstance(v, float):
        return f"{v:.{nd}f}{unit}"
    return f"{v}{unit}"


def kv_table(rows: list[tuple[str, str]], widths=(48 * mm, 122 * mm)):
    data = [[P(k, "cellb"), P(v, "cell")] for k, v in rows]
    t = Table(data, colWidths=widths)
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, RULE),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
    ]))
    return t


def grid_table(header: list[str], rows: list[list], widths=None, status_col: int | None = None):
    data = [[P(h, "cellb") for h in header]] + [[P(c, "cell") for c in r] for r in rows]
    t = Table(data, colWidths=widths, repeatRows=1)
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, 0), PAPER_TINT),
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, BRONZE),
        ("LINEBELOW", (0, 1), (-1, -1), 0.25, RULE),
        ("TOPPADDING", (0, 0), (-1, -1), 2.2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.2),
    ]
    t.setStyle(TableStyle(style))
    return t


def banner(labels: list[tuple[str, str]]):
    """labels: (text, tone) with tone in {'critical','warning','info','ok'}."""
    tone_color = {"critical": TERRACOTTA, "warning": BRONZE, "info": BLUE, "ok": colors.HexColor("#3f6b4f")}
    cells = [[P(text, "banner")] for text, _ in labels]
    t = Table(cells, colWidths=[170 * mm])
    t.setStyle(TableStyle([("BACKGROUND", (0, i), (0, i), tone_color[tone]) for i, (_, tone) in enumerate(labels)]
                          + [("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                             ("LEFTPADDING", (0, 0), (-1, -1), 6)]))
    return t


def histogram(counts: list[int], edges: list[float], title: str):
    d = Drawing(170 * mm, 52 * mm)
    ch = VerticalBarChart()
    ch.x, ch.y, ch.width, ch.height = 30, 22, 170 * mm - 40, 52 * mm - 36
    ch.data = [counts]
    ch.bars[0].fillColor = BLUE
    ch.bars[0].strokeColor = None
    ch.valueAxis.valueMin = 0
    ch.valueAxis.labels.fontName = "Sans"
    ch.valueAxis.labels.fontSize = 6
    ch.categoryAxis.labels.fontName = "Sans"
    ch.categoryAxis.labels.fontSize = 6
    step = max(1, len(edges) // 8)
    ch.categoryAxis.categoryNames = [f"{edges[i]:.2f}" if i % step == 0 else "" for i in range(len(counts))]
    ch.barSpacing = 0.2
    d.add(ch)
    # zero-residual marker
    if edges[0] < 0 < edges[-1]:
        x = ch.x + ch.width * (0 - edges[0]) / (edges[-1] - edges[0])
        d.add(Line(x, ch.y, x, ch.y + ch.height, strokeColor=GOLD, strokeWidth=1))
        d.add(String(x + 2, ch.y + ch.height - 6, "0°", fontName="Sans", fontSize=6, fillColor=GOLD))
    d.add(String(0, 52 * mm - 8, title, fontName="Sans-Bold", fontSize=7.5, fillColor=INK))
    return d


def _doc(buffer, title: str, subtitle: str):
    def on_page(canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(GOLD)
        canvas.setLineWidth(0.8)
        canvas.line(20 * mm, A4[1] - 14 * mm, A4[0] - 20 * mm, A4[1] - 14 * mm)
        canvas.setFont("Sans", 7)
        canvas.setFillColor(MUTED)
        canvas.drawString(20 * mm, A4[1] - 12 * mm, "CHRONOHERITAGE · reproducible archaeoastronomy research report")
        canvas.drawRightString(A4[0] - 20 * mm, A4[1] - 12 * mm, title[:80])
        canvas.drawString(20 * mm, 10 * mm, f"Generated {datetime.now(UTC):%Y-%m-%d %H:%M} UTC")
        canvas.drawRightString(A4[0] - 20 * mm, 10 * mm, f"Page {doc.page}")
        canvas.restoreState()

    _fonts()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=20 * mm,
                            bottomMargin=18 * mm, title=title, author="ChronoHeritage", subject=subtitle)
    return doc, on_page


def _atm(a: dict | None) -> str:
    if not a:
        return "—"
    if a.get("model") == "none":
        return "No refraction applied"
    return f"Refraction {a.get('model')}, {a.get('pressure_hpa')} hPa, {a.get('temperature_c')} °C"


def _limitations(story, extra: list[str] = ()):
    story.append(P("Scientific limitations", "h2"))
    for item in list(LIMITATIONS) + list(extra):
        story.append(P(f"• {item}"))


# --------------------------------------------------------------- analysis

def analysis_pdf(run: dict) -> bytes:
    s = _styles()  # noqa: F841 (ensures fonts)
    res = run["result"] or {}
    snap = run["input_snapshot"]
    site = snap["site"]
    buf = io.BytesIO()
    title = f"Single-site analysis — {site['name']}"
    doc, on_page = _doc(buf, title, "Single-site analysis")
    story = [P(title, "title"), P(f"Run {run['id']} · {run['hypothesis']['target_key']} · created {run['created_at']}",
                                  "subtitle")]
    labels = []
    if run["is_illustrative"]:
        labels.append(("ILLUSTRATIVE — fictional demonstration inputs; not a scientific result.", "critical"))
    sl = res.get("status_labels", {})
    if sl.get("validation") != "benchmark_gate_passed":
        labels.append(("UNVALIDATED — the Phase 0.5 benchmark gate has not passed.", "critical"))
    labels.append((f"Inputs review: {sl.get('inputs_review', '—')} · Human review of this run: {run['review_status']}",
                   "warning" if run["review_status"] != "reviewed" else "ok"))
    story += [banner(labels), Spacer(1, 6), P(res.get("caveat", ""), "caveat")]

    story.append(P("Hypothesis", "h2"))
    h = run["hypothesis"]
    story.append(kv_table([("Statement", h["statement"]), ("Target", res.get("target", {}).get("label", h["target_key"])),
                           ("Target definition", res.get("target", {}).get("note", "")),
                           ("Mode", h["mode"]), ("Registered before computation", h["registered_at"])]))

    story.append(P("Inputs (raw → transformed)", "h2"))
    o = snap["orientation_raw"]
    tr = snap["orientation_transformed"]
    obs = res.get("observed", {})
    story.append(kv_table([
        ("Site", f"{site['name']} ({site['id']}) — status {site['status']}"),
        ("Coordinates", f"{site['lat']:.5f}, {site['lon']:.5f} (WGS84), elevation {fmt(site['elevation_m'], 0, ' m')}"),
        ("Orientation (raw)", f"{o['raw_bearing']} {o['bearing_unit']} from {o['north_reference']} north; "
                              f"axis {o['axis_mode']}; method {o['method']}"),
        ("Axis definition", o.get("axis_definition") or "—"),
        ("Orientation uncertainty (raw)", fmt(o.get("uncertainty_deg"), 2, "°") if o.get("uncertainty_deg") is not None
         else f"Unavailable — {o.get('uncertainty_unavailable_reason') or 'no reason recorded'}"),
        ("Transformation", "; ".join(f"{st['op']}" + (f" → {st['output']:.4f}°" if isinstance(st.get('output'), float) else "")
                                     for st in tr["steps"]) or "none required"),
        ("True azimuth used", f"{fmt(obs.get('true_azimuth_deg'), 4, '°')} ± {fmt(obs.get('combined_uncertainty_deg'), 3, '°')}"),
        ("Chronology", f"{res.get('chronology', {}).get('label', '—')} · model {res.get('chronology', {}).get('model')} · "
                       f"basis {snap['chronology'].get('date_basis')} · calendar {snap['chronology'].get('calendar_basis')}"),
        ("Chronology note", snap["chronology"].get("uncertainty_note") or "—"),
        ("Horizon", f"{res.get('horizon', {}).get('kind')} — {res.get('horizon', {}).get('source_label')}"),
        ("Atmosphere / event", _atm(res.get("atmosphere")) + f"; event limb: {res.get('limb')}"),
    ]))

    story.append(P("Sources", "h2"))
    for src in snap["sources"]:
        tag = " [ILLUSTRATIVE SOURCE]" if src.get("is_illustrative") else ""
        story.append(P(f"• ({src['role']}) {src['citation']}{tag}"
                       + (f" — {src['url']}" if src.get("url") else "")
                       + (f" — accessed {src['accessed_at']}" if src.get("accessed_at") else "")))

    story.append(P("Results", "h2"))
    mc = res.get("monte_carlo", {})
    rs, ra, pa = mc.get("residual_signed", {}), mc.get("residual_abs", {}), mc.get("predicted_azimuth", {})
    story.append(grid_table(["Quantity", "Median", "68% interval", "95% interval"], [
        ["Predicted azimuth (°)", fmt(pa.get("median"), 4), f"{fmt(pa.get('q16'), 4)} – {fmt(pa.get('q84'), 4)}",
         f"{fmt(pa.get('q025'), 4)} – {fmt(pa.get('q975'), 4)}"],
        ["Signed residual (°)", fmt(rs.get("median"), 4), f"{fmt(rs.get('q16'), 4)} – {fmt(rs.get('q84'), 4)}",
         f"{fmt(rs.get('q025'), 4)} – {fmt(rs.get('q975'), 4)}"],
        ["|Residual| (°)", fmt(ra.get("median"), 4), f"{fmt(ra.get('q16'), 4)} – {fmt(ra.get('q84'), 4)}",
         f"{fmt(ra.get('q025'), 4)} – {fmt(ra.get('q975'), 4)}"],
    ], widths=[52 * mm, 30 * mm, 44 * mm, 44 * mm]))
    story.append(Spacer(1, 4))
    ww = mc.get("within_window", {})
    story.append(P("Share of propagated samples with |residual| ≤ window: " +
                   ", ".join(f"±{k}°: {v:.3f}" for k, v in ww.items()) + ". " + mc.get("within_window_note", ""), "small"))
    story.append(P(f"Components propagated: {', '.join(mc.get('components_propagated', []))}. "
                   f"Not propagated: {', '.join(mc.get('components_unavailable', [])) or 'none'}.", "small"))
    if mc.get("histogram"):
        story.append(histogram(mc["histogram"]["counts"], mc["histogram"]["edges"],
                               "Distribution of signed residuals (degrees)"))
    story.append(P("Evaluation at chronology bounds", "h3"))
    story.append(grid_table(["Bound", "Predicted az (°)", "Signed residual (°)", "Compared bearing (°)"],
                            [[b["label"], fmt(b["predicted_azimuth_deg"], 4), fmt(b["residual_signed_deg"], 4),
                              fmt(b["compared_bearing_deg"], 4)] for b in res.get("range_bounds", [])],
                            widths=[60 * mm, 36 * mm, 38 * mm, 36 * mm]))
    story.append(P(res.get("statistics", {}).get("reason", ""), "small"))

    story.append(KeepTogether([P("Sensitivity analysis (one-at-a-time, at range start)", "h2"),
                               grid_table(["Parameter", "Value", "Predicted az (°)", "Residual (°)", "Δ vs baseline (°)"],
                                          [[r["parameter"], r["value"], fmt(r.get("predicted_azimuth_deg"), 4),
                                            fmt(r.get("residual_signed_deg"), 4), fmt(r.get("delta_vs_baseline_deg"), 4)
                                            if "error" not in r else r["error"]] for r in res.get("sensitivity", [])],
                                          widths=[30 * mm, 50 * mm, 30 * mm, 28 * mm, 32 * mm])]))
    if res.get("assumed_sigma_sweep"):
        story.append(P("Assumed orientation uncertainty sweep (ASSUMED values — not documented)", "h3"))
        story.append(grid_table(["Assumed σ (°)", "Median |residual| (°)", "95% signed interval (°)"],
                                [[fmt(r["assumed_sigma_deg"], 1), fmt(r["residual_abs_median"], 4),
                                  f"{fmt(r['residual_signed_q025'], 3)} – {fmt(r['residual_signed_q975'], 3)}"]
                                 for r in res["assumed_sigma_sweep"]]))

    story.append(P("Warnings and exclusions", "h2"))
    for w in run.get("warnings", []):
        story.append(P(f"• [{w['severity'].upper()}] {w['message']}"))
    _limitations(story)

    story.append(P("Methods, versions and reproducibility", "h2"))
    v = run["versions"]
    story.append(kv_table([(k, str(val)) for k, val in v.items()] + [
        ("Monte Carlo", f"{mc.get('n_samples')} samples, RNG {mc.get('rng')}, seed {run['seed']} ({run['parameters'].get('seed_source')})"),
        ("Interpolation check", f"max {fmt(res.get('prediction_grid', {}).get('max_interpolation_error_deg'), 6, '°')} over "
                                f"{len(res.get('prediction_grid', {}).get('years', []))} grid years"),
        ("Input snapshot hash (SHA-256)", run["input_hash"]),
        ("Run / parent", f"{run['id']} / {run['parent_run_id'] or '—'}"),
        ("Rerun", f"POST /api/v2/analyses/{run['id']}/rerun (same seed and parameters; new run id)"),
    ]))
    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    return buf.getvalue()


# ------------------------------------------------------------- feasibility

def feasibility_pdf(rep: dict) -> bytes:
    buf = io.BytesIO()
    title = f"Dataset Feasibility Report — {rep['title']}"
    doc, on_page = _doc(buf, title, "Phase 0")
    story = [P(title, "title"), P(f"Dataset version {rep['dataset_version']} · status {rep['status']} · "
                                  f"created {rep['created_at']}", "subtitle")]
    labels = []
    if rep["is_illustrative"]:
        labels.append(("ILLUSTRATIVE DATASET — demonstrates the Phase 0 mechanics only. No tier or kill decision is "
                       "recorded and the Phase 0 gate is not evaluated.", "critical"))
    labels.append((f"Report status: {rep['status']}. A proposed, unreviewed report is not a validated dataset.",
                   "warning" if rep["status"] != "reviewed" else "ok"))
    story += [banner(labels), Spacer(1, 6)]
    rec = rep["recommendation"]
    story.append(P("Decision summary", "h2"))
    story.append(kv_table([
        ("Recommendation", rec["label"]), ("Rationale", rec["rationale"]),
        ("Rule output if these records were real", rec.get("mechanics_output_if_real", "—")),
        ("Inventory", f"{rep['inventory_count']} candidate sites"),
        ("Fully provenance-qualified", str(rep["qualified_count"])),
        ("Eligible for single-site analysis", str(rep["eligible_count"])),
        ("Dataset compatibility", f"{fmt(rep['compatibility_score'], 3)} (threshold 0.85); pooling "
                                  f"{'permitted' if rep['pooling_allowed'] else 'NOT permitted'}"),
        ("Critical blockers", "; ".join(rep["critical_blockers"]) or "none"),
        ("Reviewer note", rep.get("review_note") or "—"),
    ]))
    story.append(P("Candidate inventory", "h2"))
    rows = []
    for r in rep["inventory"]:
        o, c = r["orientation"], r["chronology"]
        unc = (f"{o['uncertainty_deg']}°" if o["uncertainty_deg"] is not None
               else f"unavailable: {o['uncertainty_unavailable_reason'] or 'NO REASON RECORDED'}")
        rows.append([f"{r['name']}{' (illustrative)' if r['is_illustrative'] else ''}",
                     f"{o['raw_bearing']} {o['bearing_unit'] or ''}; {o['axis_mode'] or 'axis ?'}; "
                     f"{o['north_reference'] or 'north ?'}; {o['method'] or 'method ?'}",
                     unc,
                     f"{c['start_year']} – {c['end_year']} ({c['date_basis'] or 'basis ?'})" if c["start_year"] is not None else "MISSING",
                     f"{r['provenance']['score']:.2f}{' ✓' if r['provenance']['fully_qualified'] else ' ✗'}"])
    story.append(grid_table(["Site", "Orientation convention", "Uncertainty", "Chronology", "Prov."], rows,
                            widths=[34 * mm, 52 * mm, 34 * mm, 36 * mm, 14 * mm]))
    story.append(P("Provenance score = Σ(weight·present)/Σweight (formula "
                   f"{rep['formula_versions']['provenance']['version']}). Completeness is not truth; ✓ requires every "
                   "critical field.", "small"))
    story.append(P("Missing evidence by site", "h3"))
    for r in rep["inventory"]:
        miss = r["provenance"]["missing"]
        story.append(P(f"• {r['name']}: " + (", ".join(f"{m['label']}{' (CRITICAL)' if m['critical'] else ''}"
                                                       for m in miss) or "none")))
    story.append(P("Sources", "h3"))
    for r in rep["inventory"]:
        for src in r["sources"]:
            story.append(P(f"• {r['name']} ({src['role']}): {src['citation']}"
                           + (" [ILLUSTRATIVE]" if src.get("is_illustrative") else ""), "small"))
    story.append(PageBreak())
    story.append(P("Pairwise convention compatibility", "h2"))
    names = {r["site_id"]: r["name"] for r in rep["inventory"]}
    ids = [r["site_id"] for r in rep["inventory"]]
    score = {(p["a"], p["b"]): p for p in rep["compatibility"]["pairs"]}
    mat = []
    for a in ids:
        row = [names[a][:22]]
        for b in ids:
            if a == b:
                row.append("—")
            else:
                p = score.get((a, b)) or score.get((b, a))
                row.append(f"{p['score']:.2f}{' !' if p['critical_blockers'] else ''}")
        mat.append(row)
    w = (170 * mm - 40 * mm) / max(1, len(ids))
    story.append(grid_table([""] + [names[i][:14] for i in ids], mat, widths=[40 * mm] + [w] * len(ids)))
    story.append(P("“!” marks a pair with an unresolved critical mismatch, which blocks pooling regardless of score.",
                   "small"))
    story.append(P("Field reasons", "h3"))
    for p in rep["compatibility"]["pairs"]:
        story.append(M(f"<b>{escape(names[p['a']])} × {escape(names[p['b']])}</b> — " + "; ".join(
            f"{f['field']}: {f['status']} ({escape(f['reason'])})" for f in p["fields"]), "small"))
    story.append(P("Exclusions", "h2"))
    for e in rep["exclusions"]:
        story.append(P(f"• {e['name']}: " + "; ".join(e["reasons"])))
    if not rep["exclusions"]:
        story.append(P("None."))
    story.append(P("Kill-criterion worksheet (Appendix F)", "h2"))
    story.append(grid_table(["Criterion", "Record", "Rule", "Outcome"],
                            [[v.get("criterion"), v.get("record", "—"), v.get("rule", "—"), v.get("outcome", "—")]
                             for v in rep["kill_worksheet"].values()], widths=[26 * mm, 40 * mm, 72 * mm, 32 * mm]))
    _limitations(story, ["A feasibility report records documentation completeness and comparability; it does not "
                         "establish that any orientation is astronomically motivated."])
    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    return buf.getvalue()


# --------------------------------------------------------------- benchmark

def benchmark_pdf(run: dict, gate: dict) -> bytes:
    buf = io.BytesIO()
    title = f"Benchmark report — {run['suite_id']}"
    doc, on_page = _doc(buf, title, "Phase 0.5")
    story = [P(title, "title"), P(f"Run {run['id']} · finished {run['finished_at']}", "subtitle")]
    story.append(banner([(f"Phase 0.5 gate: {gate['status'].upper()}. Blocked cases are never counted as passed.",
                          "ok" if gate["status"] == "passed" else "critical")]))
    story.append(P("Summary by class", "h2"))
    story.append(grid_table(["Class", "Pass", "Fail", "Blocked"],
                            [[k, v["pass"], v["fail"], v["blocked"]] for k, v in run["summary"]["classes"].items()]))
    story.append(P(f"Tolerance hash {run['summary']['tolerance_hash']} (frozen before comparison).", "small"))
    story.append(P("Cases", "h2"))
    story.append(grid_table(["Case", "Class", "Status", "max |Δ| (°)", "Tol. (°)"],
                            [[r["case_key"], r["test_class"], r["status"].upper(),
                              fmt(r["max_abs_difference_deg"], 6), fmt(r["tolerance_deg"], 3)] for r in run["results"]],
                            widths=[24 * mm, 30 * mm, 24 * mm, 30 * mm, 24 * mm]))
    for r in run["results"]:
        story.append(KeepTogether([P(f"{r['case_key']} — {r['title']}", "h3"), P(r["explanation"]),
                                   P(f"Reference: {r['reference_kind']}. Independence: {r['independence_note']}", "small"),
                                   P(f"Licence/attribution: {r['licence_note']}", "small")]))
    story.append(P("Environment", "h2"))
    env = run["environment"]
    story.append(kv_table([("Python", env.get("python")), ("Platform", env.get("platform")),
                           ("Packages", ", ".join(f"{k} {v}" for k, v in (env.get("packages") or {}).items())),
                           ("requirements.lock SHA-256", str(env.get("requirements_lock_sha256"))),
                           ("Git SHA", str(env.get("git_sha")))]))
    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    return buf.getvalue()


# -------------------------------------------------------------- comparison

def comparison_pdf(rows: list[dict], gate: dict) -> bytes:
    buf = io.BytesIO()
    title = "Workflow comparison report"
    doc, on_page = _doc(buf, title, "Differentiation gate")
    story = [P(title, "title"), P("Head-to-head measurements on the same cases (PRD Appendix G)", "subtitle")]
    story.append(banner([(f"Differentiation gate: {gate['status'].upper()}. No differentiation claim is made unless "
                          "a quantified improvement is measured.", "ok" if gate["status"] == "passed" else "critical")]))
    if not rows:
        story.append(P("No measurements have been recorded. No timings are shown because none have been measured.", "h3"))
    else:
        story.append(grid_table(["Case", "Tool", "Elapsed (min)", "Manual steps", "Provenance", "Uncertainty",
                                 "Repro. steps", "Evidence"],
                                [[r["case_label"], f"{r['tool']} {r['tool_version']}", fmt(r["elapsed_seconds"] / 60, 1),
                                  r["manual_steps"], fmt(r["provenance_score"], 2), r["uncertainty_propagation"],
                                  r["reproducibility_steps"], r["evidence_ref"]] for r in rows]))
    story.append(P("Gate conditions", "h2"))
    for c in gate["conditions"]:
        story.append(P(f"• {c['label']}: {'met' if c['met'] else ('not met' if c['met'] is False else 'pending')} — {c['detail']}"))
    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    return buf.getvalue()
