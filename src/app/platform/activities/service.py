"""Lógica de negocio: CRUD activities, filtros y cierre de tarea."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session as DBSession

from app.platform.activities.models import Activity
from app.platform.activities.schemas import ActivityCreate, ActivityUpdate


# ---------------------------------------------------------------------------
# Queries
# ---------------------------------------------------------------------------

def list_activities(
    db: DBSession,
    *,
    person_id: int | None = None,
    assigned_to_user_id: int | None = None,
    activity_status: str | None = None,
    activity_type: str | None = None,
    property_id: int | None = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[int, list[Activity]]:
    q = db.query(Activity)

    if person_id is not None:
        q = q.filter(Activity.person_id == person_id)
    if assigned_to_user_id is not None:
        q = q.filter(Activity.assigned_to_user_id == assigned_to_user_id)
    if activity_status is not None:
        q = q.filter(Activity.status == activity_status)
    if activity_type is not None:
        q = q.filter(Activity.activity_type == activity_type)
    if property_id is not None:
        q = q.filter(Activity.property_id == property_id)

    total = q.count()
    items = q.order_by(Activity.due_at.asc().nullslast(), Activity.created_at.desc()).offset(skip).limit(limit).all()
    return total, items


def get_activity_or_404(db: DBSession, activity_id: int) -> Activity:
    activity = db.query(Activity).filter(Activity.id == activity_id).first()
    if not activity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Actividad no encontrada")
    return activity


# ---------------------------------------------------------------------------
# Mutaciones
# ---------------------------------------------------------------------------

def create_activity(db: DBSession, data: ActivityCreate, created_by_user_id: int) -> Activity:
    activity = Activity(
        **data.model_dump(),
        created_by_user_id=created_by_user_id,
        status="pendiente",
    )
    db.add(activity)
    db.commit()
    db.refresh(activity)
    return activity


def update_activity(db: DBSession, activity_id: int, data: ActivityUpdate) -> Activity:
    activity = get_activity_or_404(db, activity_id)

    if activity.status == "hecha":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se puede editar una actividad ya completada",
        )

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(activity, field, value)

    activity.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(activity)
    return activity


def mark_done(db: DBSession, activity_id: int) -> Activity:
    activity = get_activity_or_404(db, activity_id)

    if activity.status == "hecha":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La actividad ya está completada",
        )

    activity.status = "hecha"
    activity.done_at = datetime.now(timezone.utc)
    activity.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(activity)
    return activity


def cancel_activity(db: DBSession, activity_id: int) -> Activity:
    activity = get_activity_or_404(db, activity_id)

    if activity.status != "pendiente":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Solo se pueden cancelar actividades pendientes",
        )

    activity.status = "cancelada"
    activity.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(activity)
    return activity


def delete_activity(db: DBSession, activity_id: int) -> None:
    activity = get_activity_or_404(db, activity_id)
    db.delete(activity)
    db.commit()
