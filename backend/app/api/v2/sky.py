"""Historical Sky Explorer: stateless, exploratory calculations (PRD §14 'Historical sky view').

Nothing here is saved or reviewed. Every response says so, names the inputs
that came from the user rather than a sourced record, and never computes a
residual from an orientation that cannot be related to true north.
"""

from __future__ import annotations

import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ...deps import Actor, current_actor, db
from ...schemas import SkyIn
from ...science import angles
from ...science.astronomy import engine as eng
from ...science.astronomy import reference_analytic, reference_astropy
from ...science.astronomy.targets import TARGETS
from ...science.chronology import year_label
from ...science.conventions import to_true_azimuth
from ...science.horizon import HorizonKind, HorizonProfile
from ...science.refraction import AtmosphereParams, EventLimb, RefractionModel
from ...services import sites as site_svc
from .sites import _get

router = APIRouter(prefix="/sky", tags=["sky"])


def _err(msg: str, code: str = "sky_validation", errors=None):
    raise HTTPException(422, detail={"code": code, "message": msg, "errors": errors or []})


@router.post("/compute")
def compute(body: SkyIn, session: Session = Depends(db), actor: Actor = Depends(current_actor)):
    if body.target_key not in TARGETS:
        _err(f"Unknown target '{body.target_key}'.")
    target = TARGETS[body.target_key]
    if not target.supported:
        _err(f"'{target.label}' is not supported: {target.note}", "unsupported_target")

    warnings: list[dict] = []
    provenance_of_inputs: dict[str, str] = {}

    def warn(code, msg, severity="warning"):
        warnings.append({"code": code, "severity": severity, "message": msg})

    site = _get(session, body.site_id, actor) if body.site_id else None
    lat, lon, elev = body.lat, body.lon, body.elevation_m
    if site is not None:
        if site.lat is None:
            _err("The selected site has no coordinates.")
        lat, lon, elev = site.lat, site.lon, site.elevation_m or 0.0
        provenance_of_inputs["coordinates"] = f"site record {site.id}"
        if site.is_illustrative:
            warn("illustrative", "ILLUSTRATIVE SITE: fictional demonstration record.", "critical")
    elif lat is None or lon is None:
        _err("Provide a site or explicit latitude and longitude.")
    else:
        provenance_of_inputs["coordinates"] = "user-entered (unsourced)"

    # ----- years / date
    years: list[float] = []
    date = None
    if target.kind in ("solstice", "equinox"):
        if body.year is not None:
            y0, y1 = body.year, body.year_end if body.year_end is not None else body.year
            provenance_of_inputs["date"] = "user-entered year(s)"
        elif site is not None and site_svc.current_chronology(site) is not None:
            c = site_svc.current_chronology(site)
            if c.start_year is None or c.end_year is None:
                _err("The site chronology has no range; enter a year explicitly.")
            y0, y1 = c.start_year, c.end_year
            provenance_of_inputs["date"] = f"site chronology record {c.id} ({c.date_basis or 'basis not recorded'})"
        else:
            _err("A year or year range is required for solstice/equinox targets (no default date is assumed).")
        if y0 > y1:
            _err("year must not be after year_end.")
        n = int(min(13, max(2, (y1 - y0) // 50 + 2))) if y1 > y0 else 1
        years = list(np.linspace(y0, y1, n)) if n > 1 else [float(y0)]
    else:
        if None in (body.calendar_year, body.calendar_month, body.calendar_day):
            _err("This target needs calendar_year, calendar_month and calendar_day plus a calendar basis.")
        date = (body.calendar_year, body.calendar_month, body.calendar_day)
        provenance_of_inputs["date"] = f"user-entered calendar date ({body.calendar})"

    # ----- horizon
    if body.horizon_mode == "site_profile":
        h = site_svc.current_horizon(site) if site else None
        if h is None:
            _err("No horizon record exists for this site; choose 'flat' or 'constant'.")
        if h.kind == "none_declared":
            horizon = HorizonProfile.flat()
            provenance_of_inputs["horizon"] = f"site horizon record {h.id} declares no profile → flat 0° assumption"
        else:
            horizon = HorizonProfile(HorizonKind(h.kind), h.azimuths_deg, h.altitudes_deg,
                                     altitude_uncertainty_deg=h.altitude_uncertainty_deg,
                                     source_label=f"site horizon profile {h.id}")
            provenance_of_inputs["horizon"] = f"site horizon record {h.id} ({h.kind})"
    elif body.horizon_mode == "constant":
        if body.horizon_constant_deg is None:
            _err("horizon_constant_deg is required for a constant horizon.")
        horizon = HorizonProfile.constant(body.horizon_constant_deg, "user-entered constant horizon (assumption)")
        provenance_of_inputs["horizon"] = "user-entered constant altitude (assumption)"
        warn("assumed_horizon", f"Constant {body.horizon_constant_deg}° horizon is a user assumption.")
    else:
        horizon = HorizonProfile.flat()
        provenance_of_inputs["horizon"] = "flat 0° assumption"

    atm = AtmosphereParams(RefractionModel(body.refraction), body.pressure_hpa, body.temperature_c)
    limb = EventLimb(body.limb)
    engine = eng.CandidateEngine()
    common = dict(target_key=target.key, lat=lat, lon=lon, elevation_m=elev, horizon=horizon, limb=limb, atm=atm)
    try:
        if date:
            events = [engine.event(date=date, calendar=body.calendar, **common)]
        else:
            events = [engine.event(year=y, **common) for y in years]
    except eng.EngineError as exc:
        _err(str(exc), "engine_error")
    for w in events[0].warnings:
        warn("engine", w, "info")

    # ----- orientation
    orientation = None
    if body.orientation_deg is not None:
        if not body.north_reference or not body.axis_mode:
            _err("A custom orientation needs a north reference and an axis mode.")
        t = to_true_azimuth(raw_bearing=body.orientation_deg, unit="deg", north_reference=body.north_reference,
                            measurement_uncertainty_deg=body.orientation_sigma_deg, lat=lat, lon=lon,
                            magnetic_declination_deg=body.magnetic_declination_deg,
                            magnetic_declination_source="user-entered" if body.magnetic_declination_deg is not None else None)
        orientation = {"source": "user-entered (unsourced)", "axis_mode": body.axis_mode, **t.as_dict()}
        provenance_of_inputs["orientation"] = "user-entered (unsourced)"
    elif site is not None and site_svc.current_orientation(site) is not None:
        o = site_svc.current_orientation(site)
        t = site_svc.transformed_orientation(site) or {"status": "blocked", "true_azimuth_deg": None,
                                                     "combined_uncertainty_deg": None, "steps": [],
                                                     "blocking_reasons": ["Orientation incomplete."]}
        orientation = {"source": f"site orientation record {o.id}", "axis_mode": o.axis_mode, **t}
        provenance_of_inputs["orientation"] = f"site orientation record {o.id}"

    comparison = None
    if orientation is not None:
        if orientation["status"] == "blocked" or orientation["true_azimuth_deg"] is None or not orientation["axis_mode"]:
            warn("no_residual", "No residual computed: " + "; ".join(orientation.get("blocking_reasons") or
                                                                    ["axis mode missing"]), "critical")
        else:
            obs = orientation["true_azimuth_deg"]
            mode = orientation["axis_mode"]
            rows = [{"year": e_year, "label": year_label(int(round(e_year))) if e_year is not None else None,
                     "predicted_azimuth_deg": e.azimuth_deg,
                     "residual_signed_deg": float(angles.residual(obs, e.azimuth_deg, mode)),
                     "compared_bearing_deg": float(angles.matched_axis_end(obs, e.azimuth_deg, mode))}
                    for e_year, e in zip(years or [None], events)]
            res = [r["residual_signed_deg"] for r in rows]
            sigma = orientation.get("combined_uncertainty_deg")
            env = None
            if sigma:
                env = [min(res) - 2 * sigma, max(res) + 2 * sigma]
            comparison = {"observed_true_azimuth_deg": obs, "axis_mode": mode, "sigma_deg": sigma, "rows": rows,
                          "residual_span_deg": [min(res), max(res)], "approx_envelope_2sigma_deg": env,
                          "envelope_note": "Approximate envelope (date span ± 2σ) for exploration only. A saved "
                                           "analysis runs the full Monte Carlo propagation."}
            if mode == "bidirectional":
                warn("bidirectional", "Both ends of a bidirectional axis are compared; the nearer end is shown.")
            if not sigma:
                warn("no_sigma", "No orientation uncertainty available; envelope not computed.")
    if horizon.is_flat_assumption:
        warn("flat_horizon", "Flat 0° horizon assumed.")

    refs = None
    if body.compare_reference and target.kind == "solstice" and years:
        try:
            a = reference_astropy.solstice_event_azimuth(target_key=target.key, lat=lat, year=years[0], horizon=horizon,
                                                         limb=limb, atm=atm)
            b = reference_analytic.solstice_event_azimuth(target_key=target.key, lat=lat, year=years[0],
                                                          horizon=horizon, limb=limb, atm=atm)
            refs = {"year": years[0], "candidate_deg": events[0].azimuth_deg,
                    "path_a_astropy_deg": a["azimuth_deg"], "path_b_laskar_deg": b["azimuth_deg"],
                    "max_abs_difference_deg": max(abs(angles.signed_residual(a["azimuth_deg"], events[0].azimuth_deg)),
                                                  abs(angles.signed_residual(b["azimuth_deg"], events[0].azimuth_deg)))}
        except Exception as exc:
            refs = {"error": f"Reference comparison unavailable: {exc}"}

    path = engine.day_path(lat=lat, lon=lon, elevation_m=elev, center_tt_jd=events[0].event_tt_jd, atm=atm,
                           hours=24.0, step_min=12.0)
    return {
        "label": "EXPLORATORY — not saved, not reviewed, not a validated result",
        "target": target.as_dict(),
        "site": None if site is None else {"id": site.id, "name": site.name, "is_illustrative": site.is_illustrative},
        "location": {"lat": lat, "lon": lon, "elevation_m": elev},
        "inputs_provenance": provenance_of_inputs,
        "events": [{"year": y, **e.as_dict()} for y, e in zip(years or [None], events)],
        "orientation": orientation,
        "comparison": comparison,
        "reference_check": refs,
        "horizon": horizon.as_dict() | {"azimuths_deg": horizon.azimuths_deg.tolist(),
                                        "altitudes_deg": horizon.altitudes_deg.tolist()},
        "atmosphere": atm.as_dict(), "limb": limb.value,
        "day_path": path,
        "versions": eng.versions(),
        "warnings": warnings,
    }
