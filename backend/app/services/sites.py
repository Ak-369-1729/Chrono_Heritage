"""Site records: assembly, visibility, provenance, eligibility and serialisation."""

from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.orm import selectinload

from ..deps import Actor
from ..models import ChronologyRecord, HorizonProfileRecord, Orientation, Site, SiteSource, Source
from ..science import provenance
from ..science.conventions import ConversionStatus, to_true_azimuth


def visible_sites_query(actor: Actor, include_archived: bool = False):
    q = select(Site).options(
        selectinload(Site.orientations).selectinload(Orientation.source),
        selectinload(Site.chronologies).selectinload(ChronologyRecord.source),
        selectinload(Site.horizons),
        selectinload(Site.source_links).selectinload(SiteSource.source),
    )
    if not include_archived:
        q = q.where(Site.archived_at.is_(None))
    if actor.at_least("reviewer"):
        return q
    if actor.user is not None:
        return q.where(or_(Site.visibility == "public", Site.created_by == actor.id))
    return q.where(Site.visibility == "public")


def can_view(site: Site, actor: Actor) -> bool:
    if actor.at_least("reviewer"):
        return True
    if site.visibility == "public" and site.archived_at is None:
        return True
    return actor.user is not None and site.created_by == actor.id


def can_edit(site: Site, actor: Actor, *, curate: bool = True) -> bool:
    """Owner researchers edit their own records; reviewers edit any.

    V3: data stewards may also curate (extend and correct) any *public* registry record they can see. Every change
    is audited and a material change still sends the record back for review. ``curate=False`` is used for
    destructive actions such as archiving, which stay with the owner or a reviewer.
    """
    if actor.at_least("reviewer") or (actor.at_least("researcher") and site.created_by == actor.id):
        return True
    return curate and actor.at_least("steward") and site.visibility == "public"


def can_publish(actor: Actor) -> bool:
    """Only data stewards and above may place a record in the public registry."""
    return actor.at_least("steward")


def current_orientation(site: Site) -> Orientation | None:
    cur = [o for o in site.orientations if o.is_current]
    prim = [o for o in cur if o.is_primary]
    return (prim or cur or [None])[-1]


def current_chronology(site: Site) -> ChronologyRecord | None:
    cur = [c for c in site.chronologies if c.is_current]
    return cur[-1] if cur else None


def current_horizon(site: Site) -> HorizonProfileRecord | None:
    cur = [h for h in site.horizons if h.is_current]
    return cur[-1] if cur else None


def orientation_dict(o: Orientation | None) -> dict | None:
    if o is None:
        return None
    return {
        "id": o.id, "label": o.label, "axis_definition": o.axis_definition, "raw_bearing": o.raw_bearing,
        "bearing_unit": o.bearing_unit, "axis_mode": o.axis_mode, "north_reference": o.north_reference,
        "magnetic_declination_deg": o.magnetic_declination_deg,
        "magnetic_declination_uncertainty_deg": o.magnetic_declination_uncertainty_deg,
        "magnetic_declination_source": o.magnetic_declination_source, "grid_crs": o.grid_crs,
        "method": o.method, "uncertainty_deg": o.uncertainty_deg,
        "uncertainty_distribution": o.uncertainty_distribution,
        "uncertainty_unavailable_reason": o.uncertainty_unavailable_reason,
        "measured_at": o.measured_at.isoformat() if o.measured_at else None,
        "source_id": o.source_id, "status": o.status, "is_primary": o.is_primary,
        "created_at": o.created_at.isoformat(),
    }


def chronology_dict(c: ChronologyRecord | None) -> dict | None:
    if c is None:
        return None
    return {
        "id": c.id, "start_year": c.start_year, "end_year": c.end_year, "calendar_basis": c.calendar_basis,
        "date_basis": c.date_basis, "model": c.model, "central_year": c.central_year,
        "sigma_years": c.sigma_years, "uncertainty_note": c.uncertainty_note, "source_id": c.source_id,
        "status": c.status, "created_at": c.created_at.isoformat(),
    }


def horizon_dict(h: HorizonProfileRecord | None, include_samples: bool = True) -> dict | None:
    if h is None:
        return None
    d = {"id": h.id, "kind": h.kind, "altitude_uncertainty_deg": h.altitude_uncertainty_deg,
         "resolution_note": h.resolution_note, "observer_height_m": h.observer_height_m, "source_id": h.source_id,
         "n_samples": len(h.azimuths_deg or [])}
    if include_samples:
        d["azimuths_deg"] = h.azimuths_deg
        d["altitudes_deg"] = h.altitudes_deg
    return d


def source_dict(s: Source) -> dict:
    return {"id": s.id, "citation": s.citation, "source_type": s.source_type, "url": s.url, "doi": s.doi,
            "publisher": s.publisher, "accessed_at": s.accessed_at.isoformat() if s.accessed_at else None,
            "licence": s.licence, "checksum": s.checksum, "is_illustrative": s.is_illustrative}


def flat_record(site: Site) -> dict:
    """Flattened record consumed by provenance and compatibility scoring."""
    o, c, h = current_orientation(site), current_chronology(site), current_horizon(site)
    return {
        "id": site.id, "label": site.name, "lat": site.lat, "lon": site.lon, "crs": site.crs,
        "coordinates_source_id": site.coordinates_source_id,
        "sources": [{"source_type": link.source.source_type} for link in site.source_links],
        "orientation": orientation_dict(o), "chronology": chronology_dict(c),
        "horizon_kind": h.kind if h else None,
    }


def transformed_orientation(site: Site) -> dict | None:
    o = current_orientation(site)
    if o is None or o.raw_bearing is None or o.north_reference is None or site.lat is None:
        return None
    return to_true_azimuth(
        raw_bearing=o.raw_bearing, unit=o.bearing_unit, north_reference=o.north_reference,
        measurement_uncertainty_deg=o.uncertainty_deg, lat=site.lat, lon=site.lon,
        magnetic_declination_deg=o.magnetic_declination_deg,
        magnetic_declination_uncertainty_deg=o.magnetic_declination_uncertainty_deg,
        magnetic_declination_source=o.magnetic_declination_source, grid_crs=o.grid_crs,
    ).as_dict()


def eligibility(site: Site, prov: dict | None = None) -> dict:
    prov = prov or provenance.score_record(flat_record(site)).as_dict()
    o, c = current_orientation(site), current_chronology(site)
    t = transformed_orientation(site)
    single: list[str] = []
    if site.lat is None or site.lon is None:
        single.append("Coordinates missing.")
    if o is None:
        single.append("No orientation record.")
    else:
        if not o.axis_mode:
            single.append("Axis mode (directed / bidirectional) not recorded.")
        if t is None or t["status"] == ConversionStatus.BLOCKED.value:
            single.extend((t or {}).get("blocking_reasons") or ["Orientation cannot be converted to true azimuth."])
    if c is None or c.start_year is None or c.end_year is None:
        single.append("Chronology range missing.")
    pooled: list[str] = []
    if not prov["fully_qualified"]:
        pooled.append("Missing critical provenance: " + ", ".join(prov["critical_missing"]))
    if site.status != "reviewed":
        pooled.append(f"Record status is '{site.status}', not 'reviewed'.")
    if site.is_illustrative:
        pooled.append("Illustrative record — never eligible as evidence.")
    if o is not None and o.uncertainty_deg is None:
        pooled.append("No numeric orientation uncertainty; cannot be propagated in pooled statistics.")
    pooled.extend(single)
    return {
        "single_site_analysis": {"eligible": not single, "reasons": single},
        "cross_site_pooling": {"eligible": not pooled, "reasons": sorted(set(pooled), key=pooled.index)},
        "phase0_qualified": prov["fully_qualified"],
    }


def _coords(site: Site, actor: Actor) -> dict:
    if site.lat is None or site.lon is None:
        return {"lat": None, "lon": None, "generalized": False}
    if site.sensitivity == "restricted" and not actor.at_least("reviewer"):
        return {"lat": round(site.lat, 1), "lon": round(site.lon, 1), "generalized": True}
    return {"lat": site.lat, "lon": site.lon, "generalized": False}


def summary(site: Site, actor: Actor) -> dict:
    prov = provenance.score_record(flat_record(site)).as_dict()
    o, c, h = current_orientation(site), current_chronology(site), current_horizon(site)
    elig = eligibility(site, prov)
    t = transformed_orientation(site)
    return {
        "id": site.id, "name": site.name, "site_type": site.site_type, "region": site.region,
        "country": site.country, **_coords(site, actor), "elevation_m": site.elevation_m,
        "status": site.status, "visibility": site.visibility, "is_illustrative": site.is_illustrative,
        "sensitivity": site.sensitivity, "stratum": site.stratum,
        "provenance_score": prov["score"], "critical_missing": prov["critical_missing"],
        "fully_qualified": prov["fully_qualified"],
        "orientation": None if o is None else {
            "raw_bearing": o.raw_bearing, "bearing_unit": o.bearing_unit, "axis_mode": o.axis_mode,
            "north_reference": o.north_reference, "uncertainty_deg": o.uncertainty_deg,
            "true_azimuth_deg": (t or {}).get("true_azimuth_deg"),
            "conversion_status": (t or {}).get("status"),
        },
        "chronology": None if c is None else {"start_year": c.start_year, "end_year": c.end_year,
                                              "date_basis": c.date_basis},
        "horizon_kind": h.kind if h else None,
        "eligibility": elig,
        "updated_at": site.updated_at.isoformat() if site.updated_at else None,
    }


def detail(site: Site, actor: Actor) -> dict:
    prov = provenance.score_record(flat_record(site)).as_dict()
    sources = {link.source.id: {**source_dict(link.source), "roles": []} for link in site.source_links}
    for link in site.source_links:
        sources[link.source.id]["roles"].append(link.role)
    return {
        **summary(site, actor),
        "description": site.description, "crs": site.crs, "coordinates_source_id": site.coordinates_source_id,
        "created_at": site.created_at.isoformat(), "archived_at": site.archived_at.isoformat() if site.archived_at else None,
        "provenance": prov,
        "orientation_record": orientation_dict(current_orientation(site)),
        "orientation_transformation": transformed_orientation(site),
        "orientation_history": [orientation_dict(o) for o in site.orientations],
        "chronology_record": chronology_dict(current_chronology(site)),
        "chronology_history": [chronology_dict(c) for c in site.chronologies],
        "horizon": horizon_dict(current_horizon(site)),
        "sources": list(sources.values()),
        # V3: what the current viewer may do, computed by the same rules the write endpoints enforce.
        "permissions": permissions(site, actor),
    }


def permissions(site: Site, actor: Actor) -> dict:
    locked = site.is_illustrative and not actor.at_least("admin")
    return {
        "can_edit": can_edit(site, actor) and not locked,
        "can_archive": can_edit(site, actor, curate=False) and not locked and site.archived_at is None,
        "can_publish": can_publish(actor) and not locked,
        "can_review": actor.at_least("reviewer"),
        "is_owner": actor.user is not None and site.created_by == actor.id,
        "illustrative_locked": site.is_illustrative,
    }
