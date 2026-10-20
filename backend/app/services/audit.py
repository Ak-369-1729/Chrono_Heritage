from __future__ import annotations

from sqlalchemy.orm import Session

from ..models import AuditEvent


def record(session: Session, *, entity_type: str, entity_id: str, action: str, actor=None, changes: dict | None = None,
           note: str | None = None, correlation_id: str | None = None) -> AuditEvent:
    ev = AuditEvent(
        entity_type=entity_type,
        entity_id=str(entity_id),
        action=action,
        actor_id=getattr(actor, "id", None),
        actor_label=getattr(actor, "label", None) or "system",
        changes=changes or {},
        note=note,
        correlation_id=correlation_id,
    )
    session.add(ev)
    return ev


def diff(before: dict, after: dict) -> dict:
    return {k: {"from": before.get(k), "to": v} for k, v in after.items() if before.get(k) != v}
