from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from geoalchemy2 import Geography
from geoalchemy2.elements import WKTElement
from geoalchemy2.functions import ST_DWithin, ST_Intersects, ST_MakeEnvelope
from sqlalchemy import cast, or_, select
from sqlalchemy.orm import Session

from ...config import get_settings
from ...deps import Actor, current_actor, db, require
from ...models import (
    AuditEvent,
    ChronologyRecord,
    HorizonProfileRecord,
    Observation,
    Orientation,
    Site,
    SiteImage,
    SiteSource,
    Source,
)
from ...schemas import ChronologyIn, HorizonIn, ObservationIn, OrientationIn, ReviewIn, SiteIn, SitePatch, SiteSourceIn
from ...science import provenance
from ...services import audit
from ...services import sites as svc

router = APIRouter(prefix="/sites", tags=["sites"])

IMAGE_SIGNATURES = {b"\x89PNG\r\n\x1a\n": ("image/png", "png"), b"\xff\xd8\xff": ("image/jpeg", "jpg"),
                    b"RIFF": ("image/webp", "webp")}


def _get(session: Session, site_id: str, actor: Actor) -> Site:
    site = session.scalars(svc.visible_sites_query(actor, include_archived=True).where(Site.id == site_id)).first()
    if site is None or not svc.can_view(site, actor):
        raise HTTPException(404, detail={"code": "not_found", "message": f"Site '{site_id}' not found."})
    return site


def _editable(session: Session, site_id: str, actor: Actor, *, curate: bool = True) -> Site:
    site = _get(session, site_id, actor)
    if not svc.can_edit(site, actor, curate=curate):
        raise HTTPException(403, detail={"code": "forbidden", "message": "You cannot edit this record."})
    if site.is_illustrative and not actor.at_least("admin"):
        raise HTTPException(409, detail={"code": "illustrative_locked",
                                         "message": "Illustrative demo records are read-only."})
    return site


def _require_publish(actor: Actor) -> None:
    if not svc.can_publish(actor):
        raise HTTPException(403, detail={
            "code": "steward_required",
            "message": "Publishing a record to the public registry requires the Data Steward role. Save it as "
                       "private, or request the Data Steward role from your account page."})


def _check_source(session: Session, source_id: str | None):
    if source_id and not session.get(Source, source_id):
        raise HTTPException(422, detail={"code": "unknown_source", "message": f"Source '{source_id}' does not exist."})


def _material_change(session: Session, site: Site, actor: Actor, what: str):
    if site.status == "reviewed":
        site.status = "submitted"
        audit.record(session, entity_type="site", entity_id=site.id, action="status_reset", actor=actor,
                     changes={"status": {"from": "reviewed", "to": "submitted"}},
                     note=f"{what} changed after review; re-review required.")
    site.updated_at = datetime.now(UTC)


@router.get("")
def list_sites(
    q: str | None = Query(None, max_length=200),
    status: str | None = Query(None, pattern="^(imported|submitted|unverified|reviewed|rejected)$"),
    illustrative: bool | None = None,
    eligible: bool | None = Query(None, description="Single-site analysis eligibility"),
    qualified: bool | None = Query(None, description="All critical provenance fields present"),
    bbox: str | None = Query(None, description="minLon,minLat,maxLon,maxLat"),
    near: str | None = Query(None, description="lat,lon,radius_km"),
    session: Session = Depends(db), actor: Actor = Depends(current_actor),
):
    stmt = svc.visible_sites_query(actor).order_by(Site.name)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Site.name.ilike(like), Site.region.ilike(like), Site.country.ilike(like),
                              Site.site_type.ilike(like), Site.id.ilike(like)))
    if status:
        stmt = stmt.where(Site.status == status)
    if illustrative is not None:
        stmt = stmt.where(Site.is_illustrative.is_(illustrative))
    try:
        if bbox:
            a, b, c, d = (float(x) for x in bbox.split(","))
            stmt = stmt.where(ST_Intersects(Site.geom, cast(ST_MakeEnvelope(a, b, c, d, 4326), Geography)))
        if near:
            lat, lon, km = (float(x) for x in near.split(","))
            stmt = stmt.where(ST_DWithin(Site.geom, WKTElement(f"POINT({lon} {lat})", srid=4326), km * 1000.0))
    except ValueError as exc:
        raise HTTPException(422, detail={"code": "bad_spatial_filter", "message": str(exc)}) from exc
    rows = [svc.summary(s, actor) for s in session.scalars(stmt).all()]
    if eligible is not None:
        rows = [r for r in rows if r["eligibility"]["single_site_analysis"]["eligible"] is eligible]
    if qualified is not None:
        rows = [r for r in rows if r["fully_qualified"] is qualified]
    return {"sites": rows, "count": len(rows)}


@router.post("", status_code=201)
def create_site(body: SiteIn, session: Session = Depends(db), actor: Actor = Depends(require("researcher"))):
    if session.get(Site, body.id):
        raise HTTPException(409, detail={"code": "id_taken", "message": f"Site id '{body.id}' already exists."})
    if body.visibility == "public":
        _require_publish(actor)
    _check_source(session, body.coordinates_source_id)
    site = Site(**body.model_dump(), status="submitted", created_by=actor.id)
    if body.lat is not None:
        site.geom = WKTElement(f"POINT({body.lon} {body.lat})", srid=4326)
    session.add(site)
    if body.coordinates_source_id:
        session.add(SiteSource(site_id=site.id, source_id=body.coordinates_source_id, role="coordinates"))
    audit.record(session, entity_type="site", entity_id=site.id, action="create", actor=actor,
                 changes=body.model_dump(mode="json"))
    session.commit()
    return svc.detail(_get(session, site.id, actor), actor)


@router.get("/{site_id}")
def get_site(site_id: str, session: Session = Depends(db), actor: Actor = Depends(current_actor)):
    return svc.detail(_get(session, site_id, actor), actor)


@router.patch("/{site_id}")
def patch_site(site_id: str, body: SitePatch, session: Session = Depends(db),
               actor: Actor = Depends(require("researcher"))):
    site = _editable(session, site_id, actor)
    changes = body.model_dump(exclude_unset=True)
    if changes.get("visibility") == "public" and site.visibility != "public":
        _require_publish(actor)
    _check_source(session, changes.get("coordinates_source_id"))
    before = {k: getattr(site, k) for k in changes}
    for k, v in changes.items():
        setattr(site, k, v)
    if (site.lat is None) != (site.lon is None):
        raise HTTPException(422, detail={"code": "coords", "message": "lat and lon must be set together."})
    if {"lat", "lon"} & set(changes) and site.lat is not None:
        site.geom = WKTElement(f"POINT({site.lon} {site.lat})", srid=4326)
    if {"lat", "lon", "crs", "coordinates_source_id"} & set(changes):
        _material_change(session, site, actor, "Coordinates")
    audit.record(session, entity_type="site", entity_id=site.id, action="update", actor=actor,
                 changes=audit.diff({k: str(v) for k, v in before.items()}, {k: str(v) for k, v in changes.items()}))
    session.commit()
    return svc.detail(_get(session, site_id, actor), actor)


@router.post("/{site_id}/archive")
def archive_site(site_id: str, session: Session = Depends(db), actor: Actor = Depends(require("researcher"))):
    site = _editable(session, site_id, actor, curate=False)
    site.archived_at = datetime.now(UTC)
    audit.record(session, entity_type="site", entity_id=site.id, action="archive", actor=actor)
    session.commit()
    return {"id": site.id, "archived_at": site.archived_at.isoformat()}


@router.post("/{site_id}/review")
def review_site(site_id: str, body: ReviewIn, session: Session = Depends(db),
                actor: Actor = Depends(require("reviewer"))):
    site = _get(session, site_id, actor)
    if body.decision == "approve":
        if site.is_illustrative:
            raise HTTPException(409, detail={"code": "illustrative_record",
                                             "message": "Illustrative records can never be marked reviewed."})
        prov = provenance.score_record(svc.flat_record(site))
        if not prov.fully_qualified:
            raise HTTPException(409, detail={"code": "provenance_incomplete",
                                             "message": "Approval requires every critical provenance field.",
                                             "errors": prov.critical_missing})
    before = site.status
    site.status = "reviewed" if body.decision == "approve" else "rejected"
    audit.record(session, entity_type="site", entity_id=site.id, action=f"review_{body.decision}", actor=actor,
                 changes={"status": {"from": before, "to": site.status}}, note=body.note)
    session.commit()
    return svc.detail(site, actor)


@router.post("/{site_id}/sources", status_code=201)
def link_source(site_id: str, body: SiteSourceIn, session: Session = Depends(db),
                actor: Actor = Depends(require("researcher"))):
    site = _editable(session, site_id, actor)
    _check_source(session, body.source_id)
    if session.get(SiteSource, (site.id, body.source_id, body.role)):
        raise HTTPException(409, detail={"code": "already_linked", "message": "Source already linked in that role."})
    session.add(SiteSource(site_id=site.id, source_id=body.source_id, role=body.role))
    audit.record(session, entity_type="site", entity_id=site.id, action="link_source", actor=actor,
                 changes={"source_id": body.source_id, "role": body.role})
    session.commit()
    session.expire(site)
    return svc.detail(_get(session, site_id, actor), actor)


def _supersede(items, predicate=lambda x: True):
    for it in items:
        if it.is_current and predicate(it):
            it.is_current = False


@router.post("/{site_id}/orientations", status_code=201)
def add_orientation(site_id: str, body: OrientationIn, session: Session = Depends(db),
                    actor: Actor = Depends(require("researcher"))):
    site = _editable(session, site_id, actor)
    _check_source(session, body.source_id)
    if body.is_primary:
        _supersede(site.orientations, lambda o: o.is_primary)
    o = Orientation(site_id=site.id, created_by=actor.id, **body.model_dump())
    session.add(o)
    if body.source_id and not session.get(SiteSource, (site.id, body.source_id, "orientation")):
        session.add(SiteSource(site_id=site.id, source_id=body.source_id, role="orientation"))
    _material_change(session, site, actor, "Orientation")
    session.flush()
    audit.record(session, entity_type="site", entity_id=site.id, action="add_orientation", actor=actor,
                 changes=body.model_dump(mode="json") | {"orientation_id": o.id})
    session.commit()
    session.expire(site)
    return svc.detail(_get(session, site_id, actor), actor)


@router.post("/{site_id}/chronologies", status_code=201)
def add_chronology(site_id: str, body: ChronologyIn, session: Session = Depends(db),
                   actor: Actor = Depends(require("researcher"))):
    site = _editable(session, site_id, actor)
    _check_source(session, body.source_id)
    _supersede(site.chronologies)
    c = ChronologyRecord(site_id=site.id, created_by=actor.id, **body.model_dump())
    session.add(c)
    if body.source_id and not session.get(SiteSource, (site.id, body.source_id, "chronology")):
        session.add(SiteSource(site_id=site.id, source_id=body.source_id, role="chronology"))
    _material_change(session, site, actor, "Chronology")
    session.flush()
    audit.record(session, entity_type="site", entity_id=site.id, action="add_chronology", actor=actor,
                 changes=body.model_dump(mode="json") | {"chronology_id": c.id})
    session.commit()
    session.expire(site)
    return svc.detail(_get(session, site_id, actor), actor)


@router.post("/{site_id}/horizons", status_code=201)
def add_horizon(site_id: str, body: HorizonIn, session: Session = Depends(db),
                actor: Actor = Depends(require("researcher"))):
    site = _editable(session, site_id, actor)
    _check_source(session, body.source_id)
    _supersede(site.horizons)
    h = HorizonProfileRecord(site_id=site.id, **body.model_dump())
    session.add(h)
    if body.source_id and not session.get(SiteSource, (site.id, body.source_id, "horizon")):
        session.add(SiteSource(site_id=site.id, source_id=body.source_id, role="horizon"))
    _material_change(session, site, actor, "Horizon")
    session.flush()
    audit.record(session, entity_type="site", entity_id=site.id, action="add_horizon", actor=actor,
                 changes={"kind": body.kind, "n_samples": len(body.azimuths_deg), "horizon_id": h.id})
    session.commit()
    session.expire(site)
    return svc.detail(_get(session, site_id, actor), actor)


@router.get("/{site_id}/audit")
def site_audit(site_id: str, session: Session = Depends(db), actor: Actor = Depends(current_actor)):
    site = _get(session, site_id, actor)
    evs = session.scalars(select(AuditEvent).where(AuditEvent.entity_type == "site", AuditEvent.entity_id == site.id)
                          .order_by(AuditEvent.at.desc()).limit(500)).all()
    return {"events": [{"id": e.id, "action": e.action, "actor": e.actor_label, "at": e.at.isoformat(),
                        "changes": e.changes if actor.at_least("researcher") else {}, "note": e.note} for e in evs]}


# ---------------------------------------------------------------- survey

@router.post("/{site_id}/observations", status_code=201)
def add_observation(site_id: str, body: ObservationIn, session: Session = Depends(db),
                    actor: Actor = Depends(require("researcher"))):
    site = _get(session, site_id, actor)
    import numpy as np

    from ...science.angles import circular_mean_deg, mean_resultant_length

    ob = Observation(site_id=site.id, created_by=actor.id, **body.model_dump())
    session.add(ob)
    session.flush()
    audit.record(session, entity_type="site", entity_id=site.id, action="add_observation", actor=actor,
                 changes={"observation_id": ob.id, "n_readings": len(body.readings_deg)})
    session.commit()
    r = np.asarray(body.readings_deg)
    rbar = mean_resultant_length(r)
    return {"id": ob.id, "n": int(r.size), "circular_mean_deg": circular_mean_deg(r),
            "circular_sd_deg": float(np.rad2deg(np.sqrt(-2 * np.log(rbar)))) if 0 < rbar < 1 else 0.0,
            "note": "Summary of repeat readings only; it does not replace the orientation record or its source."}


@router.get("/{site_id}/observations")
def list_observations(site_id: str, session: Session = Depends(db), actor: Actor = Depends(require("researcher"))):
    site = _get(session, site_id, actor)
    stmt = select(Observation).where(Observation.site_id == site.id)
    if not actor.at_least("reviewer"):
        stmt = stmt.where(or_(Observation.visibility == "public", Observation.created_by == actor.id))
    return {"observations": [{"id": o.id, "observer_label": o.observer_label,
                              "observed_at": o.observed_at.isoformat() if o.observed_at else None, "method": o.method,
                              "north_reference": o.north_reference, "readings_deg": o.readings_deg, "notes": o.notes,
                              "quality_flag": o.quality_flag, "visibility": o.visibility}
                             for o in session.scalars(stmt).all()]}


@router.post("/{site_id}/images", status_code=201)
async def upload_image(site_id: str, file: UploadFile = File(...), attribution: str = Form(..., min_length=3),
                       licence: str = Form(..., min_length=2), caption: str | None = Form(None),
                       session: Session = Depends(db), actor: Actor = Depends(require("researcher"))):
    site = _get(session, site_id, actor)
    settings = get_settings()
    data = await file.read(settings.max_upload_bytes + 1)
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(413, detail={"code": "too_large", "message": "Image exceeds the upload limit."})
    kind = next(((ct, ext) for sig, (ct, ext) in IMAGE_SIGNATURES.items() if data.startswith(sig)), None)
    if kind is None or (kind[1] == "webp" and data[8:12] != b"WEBP"):
        raise HTTPException(415, detail={"code": "bad_type", "message": "Only PNG, JPEG or WebP images are accepted."})
    key = f"images/{site.id}/{uuid.uuid4()}.{kind[1]}"
    path = Path(settings.artifact_dir) / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    img = SiteImage(site_id=site.id, storage_key=key, content_type=kind[0], size_bytes=len(data),
                    sha256=hashlib.sha256(data).hexdigest(), attribution=attribution, licence=licence,
                    caption=caption, created_by=actor.id)
    session.add(img)
    session.flush()
    audit.record(session, entity_type="site", entity_id=site.id, action="add_image", actor=actor,
                 changes={"image_id": img.id, "licence": licence})
    session.commit()
    return {"id": img.id, "content_type": img.content_type, "size_bytes": img.size_bytes, "sha256": img.sha256}


@router.get("/{site_id}/images")
def list_images(site_id: str, session: Session = Depends(db), actor: Actor = Depends(current_actor)):
    site = _get(session, site_id, actor)
    stmt = select(SiteImage).where(SiteImage.site_id == site.id)
    if not actor.at_least("reviewer"):
        stmt = stmt.where(or_(SiteImage.visibility == "public", SiteImage.created_by == actor.id)) if actor.user \
            else stmt.where(SiteImage.visibility == "public")
    return {"images": [{"id": i.id, "caption": i.caption, "attribution": i.attribution, "licence": i.licence,
                        "url": f"/api/v2/sites/{site.id}/images/{i.id}/file"} for i in session.scalars(stmt).all()]}


@router.get("/{site_id}/images/{image_id}/file")
def image_file(site_id: str, image_id: str, session: Session = Depends(db), actor: Actor = Depends(current_actor)):
    site = _get(session, site_id, actor)
    img = session.get(SiteImage, image_id)
    if img is None or img.site_id != site.id:
        raise HTTPException(404, detail={"code": "not_found", "message": "Image not found."})
    if img.visibility != "public" and not (actor.at_least("reviewer") or (actor.user and img.created_by == actor.id)):
        raise HTTPException(404, detail={"code": "not_found", "message": "Image not found."})
    return FileResponse(Path(get_settings().artifact_dir) / img.storage_key, media_type=img.content_type)
