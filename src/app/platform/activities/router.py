"""Router activities: CRUD /activities + PATCH /{id}/done y /{id}/cancel."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.platform.auth.dependencies import get_current_user, require_role
from app.platform.auth.models import User
from app.platform.activities import service
from app.platform.activities.schemas import (
    ActivityCreate,
    ActivityOut,
    ActivityUpdate,
    PaginatedActivities,
)

router = APIRouter(prefix="/activities", tags=["activities"])

_staff = Depends(require_role("staff", "admin"))


# ---------------------------------------------------------------------------
# Listado
# ---------------------------------------------------------------------------

@router.get("", response_model=PaginatedActivities)
def list_activities(
    person_id: int | None = Query(default=None),
    assigned_to_user_id: int | None = Query(default=None),
    activity_status: str | None = Query(default=None, alias="status"),
    activity_type: str | None = Query(default=None, alias="type"),
    property_id: int | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: DBSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> PaginatedActivities:
    total, items = service.list_activities(
        db,
        person_id=person_id,
        assigned_to_user_id=assigned_to_user_id,
        activity_status=activity_status,
        activity_type=activity_type,
        property_id=property_id,
        skip=skip,
        limit=limit,
    )
    return PaginatedActivities(
        total=total,
        items=[ActivityOut.model_validate(a) for a in items],
    )


# ---------------------------------------------------------------------------
# CRUD base
# ---------------------------------------------------------------------------

@router.get("/{activity_id}", response_model=ActivityOut)
def get_activity(
    activity_id: int,
    db: DBSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ActivityOut:
    activity = service.get_activity_or_404(db, activity_id)
    return ActivityOut.model_validate(activity)


@router.post("", response_model=ActivityOut, status_code=status.HTTP_201_CREATED)
def create_activity(
    body: ActivityCreate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(require_role("staff", "admin")),
) -> ActivityOut:
    activity = service.create_activity(db, body, created_by_user_id=current_user.id)
    return ActivityOut.model_validate(activity)


@router.patch("/{activity_id}", response_model=ActivityOut, dependencies=[_staff])
def update_activity(
    activity_id: int,
    body: ActivityUpdate,
    db: DBSession = Depends(get_db),
) -> ActivityOut:
    activity = service.update_activity(db, activity_id, body)
    return ActivityOut.model_validate(activity)


@router.delete("/{activity_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[_staff])
def delete_activity(
    activity_id: int,
    db: DBSession = Depends(get_db),
) -> None:
    service.delete_activity(db, activity_id)


# ---------------------------------------------------------------------------
# Cambios de estado
# ---------------------------------------------------------------------------

@router.patch("/{activity_id}/done", response_model=ActivityOut, dependencies=[_staff])
def mark_done(
    activity_id: int,
    db: DBSession = Depends(get_db),
) -> ActivityOut:
    activity = service.mark_done(db, activity_id)
    return ActivityOut.model_validate(activity)


@router.patch("/{activity_id}/cancel", response_model=ActivityOut, dependencies=[_staff])
def cancel_activity(
    activity_id: int,
    db: DBSession = Depends(get_db),
) -> ActivityOut:
    activity = service.cancel_activity(db, activity_id)
    return ActivityOut.model_validate(activity)
