from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ...deps import Actor, current_actor, db, require
from ...models import Source
from ...schemas import SourceIn
from ...services import audit
from ...services.sites import source_dict

router = APIRouter(prefix="/sources", tags=["sources"])


@router.get("")
def list_sources(q: str | None = Query(None, max_length=200), session: Session = Depends(db),
                 actor: Actor = Depends(current_actor)):
    stmt = select(Source).order_by(Source.created_at.desc()).limit(200)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Source.citation.ilike(like), Source.doi.ilike(like), Source.publisher.ilike(like)))
    return {"sources": [source_dict(s) for s in session.scalars(stmt).all()]}


@router.post("", status_code=201)
def create_source(body: SourceIn, session: Session = Depends(db), actor: Actor = Depends(require("researcher"))):
    if body.source_type == "illustrative":
        raise HTTPException(422, detail={"code": "illustrative_source",
                                         "message": "Illustrative sources are created only by the demo seed."})
    s = Source(**body.model_dump(), created_by=actor.id)
    session.add(s)
    session.flush()
    audit.record(session, entity_type="source", entity_id=s.id, action="create", actor=actor)
    session.commit()
    return source_dict(s)


@router.get("/{source_id}")
def get_source(source_id: str, session: Session = Depends(db)):
    s = session.get(Source, source_id)
    if not s:
        raise HTTPException(404, detail={"code": "not_found", "message": "Source not found."})
    return source_dict(s)
