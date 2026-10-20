"""Seed: users from environment, the frozen benchmark suite, and an ILLUSTRATIVE demo dataset.

    python -m app.seed [--no-demo]

The five demo sites are FICTIONAL.  Their names, coordinates, bearings,
chronologies and sources are invented to exercise the Phase 0 workflow
(complete, convertible, degraded and blocked records).  Every record and source
is flagged ``is_illustrative`` and can never be approved as evidence.
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import date

from geoalchemy2.elements import WKTElement
from sqlalchemy import func, select

from .db import session_scope
from .models import AuditEvent, ChronologyRecord, HorizonProfileRecord, Orientation, Site, SiteSource, Source, User
from .security import hash_password
from .services import benchmarks as bench_svc
from .services.accounts import password_problems

ILLUSTRATIVE_TAG = "ILLUSTRATIVE SOURCE — fictional placeholder created for workflow demonstration; not a real publication."


def _ensure_user(session, email: str, name: str, role: str, password: str | None) -> tuple[User | None, str]:
    """Create a bootstrap account from environment variables. Never generates or prints a password (V3)."""
    u = session.scalars(select(User).where(func.lower(User.email) == email)).first()
    if u:
        return u, f"{role} account {email} already exists (unchanged)."
    if not password:
        return None, (f"Skipped {role} account {email}: no password variable set. Create it with "
                      f"'python -m app.manage create-user --email {email} --role {role}'.")
    problems = password_problems(password, email=email)
    if problems:
        return None, f"Skipped {role} account {email}: password rejected ({' '.join(problems)})"
    u = User(email=email, display_name=name, role=role, password_hash=hash_password(password),
             registered_via="bootstrap")
    session.add(u)
    return u, f"Created {role} account {email} (password taken from the environment, not shown)."


def seed_users(session) -> list[str]:
    msgs = []
    spec = [("CHRONO_ADMIN_EMAIL", "CHRONO_ADMIN_PASSWORD", "Administrator", "admin"),
            ("CHRONO_REVIEWER_EMAIL", "CHRONO_REVIEWER_PASSWORD", "Reviewer", "reviewer"),
            ("CHRONO_STEWARD_EMAIL", "CHRONO_STEWARD_PASSWORD", "Data Steward", "steward"),
            ("CHRONO_RESEARCHER_EMAIL", "CHRONO_RESEARCHER_PASSWORD", "Researcher", "researcher")]
    for email_var, pw_var, name, role in spec:
        email = os.environ.get(email_var, "").strip().lower()
        if not email:
            continue
        _, msg = _ensure_user(session, email, name, role, os.environ.get(pw_var))
        msgs.append(msg)
    return msgs


def _src(session, key: str, text: str, kind: str) -> Source:
    s = Source(id=f"00000000-0000-4000-8000-{key:0>12}", citation=f"{ILLUSTRATIVE_TAG} {text}",
               source_type=kind, is_illustrative=True, licence="CC0 (fictional demonstration text)")
    session.add(s)
    return s


def seed_demo(session) -> bool:
    if session.get(Site, "ill-aster-hill"):
        return False
    s = {k: _src(session, k, t, kind) for k, t, kind in [
        ("1", "'Survey of the Aster Hill passage mound' (fictional excavation report).", "excavation_report"),
        ("2", "'Radiocarbon series for Aster Hill' (fictional journal article).", "peer_reviewed"),
        ("3", "'Theodolite horizon survey, Aster Hill' (fictional field notes).", "field_notes"),
        ("4", "'The Corran stone row: plan and orientation' (fictional monograph).", "monograph"),
        ("5", "'Dating the Corran row' (fictional journal article).", "peer_reviewed"),
        ("6", "'DEM horizon extraction for Corran' (fictional technical note).", "survey_report"),
        ("7", "'The Vellam shrine survey' (fictional survey report).", "survey_report"),
        ("8", "'Stylistic dating of Vellam carvings' (fictional monograph).", "monograph"),
        ("9", "'Tessaly gate temple: architectural notes' (fictional secondary summary).", "secondary"),
        ("10", "'A gazetteer of enclosures' (fictional database entry).", "database"),
    ]}
    session.flush()  # sources must exist before sites reference them
    sites = [
        dict(id="ill-aster-hill", name="Aster Hill Passage Mound (illustrative)", site_type="passage mound",
             region="Illustrative region A", country="—", lat=52.412, lon=-3.287, elevation_m=212, crs="EPSG:4326",
             stratum="passage mounds", src="1",
             desc="Fictional passage mound used to demonstrate a fully documented record: true-north total-station "
                  "survey, numeric uncertainty, sourced radiocarbon range and a measured horizon."),
        dict(id="ill-corran-row", name="Corran Stone Row (illustrative)", site_type="stone row",
             region="Illustrative region B", country="—", lat=56.805, lon=-5.112, elevation_m=94, crs="EPSG:4326",
             stratum="stone rows", src="4",
             desc="Fictional stone row: an undirected (bidirectional) axis with a DEM-derived horizon."),
        dict(id="ill-vellam-shrine", name="Vellam Shrine (illustrative)", site_type="rock-cut shrine",
             region="Illustrative region C", country="—", lat=12.931, lon=77.604, elevation_m=905, crs="EPSG:4326",
             stratum="shrines", src="7",
             desc="Fictional shrine measured with a prismatic compass; converted from magnetic north using a "
                  "documented declination. No horizon survey (flat-horizon assumption must be declared)."),
        dict(id="ill-tessaly-gate", name="Tessaly Gate Temple (illustrative)", site_type="gate temple",
             region="Illustrative region D", country="—", lat=36.214, lon=28.135, elevation_m=40, crs="EPSG:4326",
             stratum="temples", src="9",
             desc="Fictional temple: grid bearing without a recorded CRS and no reported uncertainty — demonstrates "
                  "a critical convention blocker."),
        dict(id="ill-marl-ridge", name="Marl Ridge Enclosure (illustrative)", site_type="enclosure",
             region="Illustrative region E", country="—", lat=-23.551, lon=133.402, elevation_m=610, crs=None,
             stratum="enclosures", src="10",
             desc="Fictional enclosure digitised from imagery: unspecified north reference and no chronology source."),
    ]
    for d in sites:
        site = Site(id=d["id"], name=d["name"], site_type=d["site_type"], region=d["region"], country=d["country"],
                    description=d["desc"], lat=d["lat"], lon=d["lon"], elevation_m=d["elevation_m"], crs=d["crs"],
                    coordinates_source_id=s[d["src"]].id if d["crs"] else None, status="unverified",
                    visibility="public", is_illustrative=True, stratum=d["stratum"],
                    geom=WKTElement(f"POINT({d['lon']} {d['lat']})", srid=4326))
        session.add(site)
        session.add(SiteSource(site_id=site.id, source_id=s[d["src"]].id, role="identity"))
    session.flush()

    def link(site_id, key, role):
        session.add(SiteSource(site_id=site_id, source_id=s[key].id, role=role))

    for d in sites:
        session.add(AuditEvent(entity_type="site", entity_id=d["id"], action="import", actor_label="demo seed",
                               note="Illustrative demonstration record created by app.seed; not evidence."))

    # 1 — complete
    link("ill-aster-hill", "2", "chronology")
    link("ill-aster-hill", "3", "horizon")
    link("ill-aster-hill", "1", "orientation")
    session.add(Orientation(site_id="ill-aster-hill", label="Passage axis, entrance → chamber (looking outward)",
                            axis_definition="Line from the chamber back-stone centre through the entrance mid-point, "
                                            "taken in the outward (viewing) direction.",
                            raw_bearing=131.6, bearing_unit="deg", axis_mode="directed", north_reference="true",
                            method="total_station", uncertainty_deg=0.4, measured_at=date(2019, 6, 2),
                            source_id=s["1"].id, status="unverified"))
    session.add(ChronologyRecord(site_id="ill-aster-hill", start_year=-2899, end_year=-2599,
                                 calendar_basis="julian", date_basis="radiocarbon (calibrated, 95% range)",
                                 model="uniform", uncertainty_note="Range from a fictional calibrated series; "
                                                                   "uniform sampling within bounds.",
                                 source_id=s["2"].id))
    session.add(HorizonProfileRecord(site_id="ill-aster-hill", kind="measured",
                                     azimuths_deg=[90, 100, 110, 120, 125, 130, 135, 140, 150, 160, 170],
                                     altitudes_deg=[1.1, 1.3, 1.0, 0.8, 0.9, 1.2, 1.6, 1.4, 0.9, 0.6, 0.5],
                                     altitude_uncertainty_deg=0.1, observer_height_m=1.6,
                                     resolution_note="Fictional theodolite profile, 5–10° sampling in the SE quadrant.",
                                     source_id=s["3"].id))
    # 2 — bidirectional, DEM horizon
    link("ill-corran-row", "5", "chronology")
    link("ill-corran-row", "6", "horizon")
    link("ill-corran-row", "4", "orientation")
    session.add(Orientation(site_id="ill-corran-row", label="Row alignment (undirected)",
                            axis_definition="Best-fit line through stone centres; no facing direction is implied.",
                            raw_bearing=226.0, bearing_unit="deg", axis_mode="bidirectional", north_reference="true",
                            method="surveyed_plan", uncertainty_deg=1.0, source_id=s["4"].id, status="unverified"))
    session.add(ChronologyRecord(site_id="ill-corran-row", start_year=-2299, end_year=-1799, calendar_basis="julian",
                                 date_basis="associated-artefact typology", model="uniform",
                                 uncertainty_note="Broad typological bracket (fictional).", source_id=s["5"].id))
    session.add(HorizonProfileRecord(site_id="ill-corran-row", kind="dem",
                                     azimuths_deg=list(range(0, 360, 15)),
                                     altitudes_deg=[2.0, 2.4, 1.8, 1.1, 0.7, 0.5, 0.9, 1.4, 2.6, 3.1, 2.2, 1.6,
                                                    1.2, 0.8, 0.6, 0.9, 1.7, 2.9, 3.8, 3.2, 2.5, 1.9, 1.5, 1.8],
                                     altitude_uncertainty_deg=0.25,
                                     resolution_note="Fictional 30 m DEM, 15° sampling; illustrative only.",
                                     source_id=s["6"].id))
    # 3 — magnetic with documented declination, no horizon
    link("ill-vellam-shrine", "8", "chronology")
    link("ill-vellam-shrine", "7", "orientation")
    session.add(Orientation(site_id="ill-vellam-shrine", label="Shrine axis, doorway outward",
                            axis_definition="Doorway centre-line, outward.", raw_bearing=88.5, bearing_unit="deg",
                            axis_mode="directed", north_reference="magnetic", magnetic_declination_deg=-1.3,
                            magnetic_declination_uncertainty_deg=0.3,
                            magnetic_declination_source="ILLUSTRATIVE: fictional geomagnetic model value for the survey date.",
                            method="prismatic_compass", uncertainty_deg=1.5, measured_at=date(2021, 1, 14),
                            source_id=s["7"].id, status="unverified"))
    session.add(ChronologyRecord(site_id="ill-vellam-shrine", start_year=850, end_year=1050, calendar_basis="julian",
                                 date_basis="stylistic (carvings)", model="uniform",
                                 uncertainty_note="Stylistic attribution (fictional).", source_id=s["8"].id))
    session.add(HorizonProfileRecord(site_id="ill-vellam-shrine", kind="none_declared",
                                     resolution_note="No horizon survey; flat horizon must be declared in analyses."))
    # 4 — grid without CRS, uncertainty missing with reason
    session.add(Orientation(site_id="ill-tessaly-gate", label="Gate axis",
                            axis_definition="Gate passage centre-line, outward.", raw_bearing=95.0,
                            bearing_unit="deg", axis_mode="directed", north_reference="grid", grid_crs=None,
                            method="published_plan_estimate", uncertainty_deg=None,
                            uncertainty_unavailable_reason="Not reported in the (fictional) secondary source.",
                            source_id=s["9"].id, status="unverified"))
    link("ill-tessaly-gate", "9", "orientation")
    session.add(ChronologyRecord(site_id="ill-tessaly-gate", start_year=-599, end_year=-399, calendar_basis=None,
                                 date_basis="terminus post quem only (fictional)", model="uniform",
                                 uncertainty_note=None, source_id=None))
    # 5 — unspecified north, no chronology source
    session.add(Orientation(site_id="ill-marl-ridge", label="Enclosure long axis",
                            axis_definition="Long axis estimated from imagery.", raw_bearing=63.0, bearing_unit="deg",
                            axis_mode="bidirectional", north_reference="unspecified", method="satellite_imagery",
                            uncertainty_deg=None, uncertainty_unavailable_reason=None, source_id=None,
                            status="unverified"))
    return True


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-demo", action="store_true", help="Do not load the illustrative demo dataset")
    args = ap.parse_args(argv)
    session = session_scope()
    try:
        msgs = seed_users(session)
        loaded = False if args.no_demo else seed_demo(session)
        session.commit()
        bench_svc.ensure_suite(session)
    finally:
        session.close()
    for m in msgs:
        print(m)
    print("Benchmark suite registered.")
    print("Illustrative demo dataset loaded." if loaded else "Demo dataset not loaded (exists or disabled).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
