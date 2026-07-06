"""Router reservations: CRUD /reservations + cambios de estado."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.platform.auth.dependencies import get_current_user, require_role
from app.platform.auth.models import User
from app.platform.reservations import service
from app.platform.reservations.schemas import (
    PaginatedReservations,
    ReservationCreate,
    ReservationOut,
    ReservationUpdate,
)

router = APIRouter(prefix="/reservations", tags=["reservations"])

_staff = Depends(require_role("staff", "admin"))


# ---------------------------------------------------------------------------
# Listado y detalle
# ---------------------------------------------------------------------------

@router.get("", response_model=PaginatedReservations)
def list_reservations(
    person_id: int | None = Query(default=None),
    property_id: int | None = Query(default=None),
    res_status: str | None = Query(default=None, alias="status"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: DBSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> PaginatedReservations:
    total, items = service.list_reservations(
        db,
        person_id=person_id,
        property_id=property_id,
        res_status=res_status,
        skip=skip,
        limit=limit,
    )
    return PaginatedReservations(
        total=total,
        items=[ReservationOut.model_validate(r) for r in items],
    )


@router.get("/{reservation_id}", response_model=ReservationOut)
def get_reservation(
    reservation_id: int,
    db: DBSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ReservationOut:
    r = service.get_reservation_or_404(db, reservation_id)
    return ReservationOut.model_validate(r)


# ---------------------------------------------------------------------------
# Mutaciones
# ---------------------------------------------------------------------------

@router.post("", response_model=ReservationOut, status_code=status.HTTP_201_CREATED)
def create_reservation(
    body: ReservationCreate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(require_role("staff", "admin")),
) -> ReservationOut:
    r = service.create_reservation(db, body, created_by_user_id=current_user.id)
    return ReservationOut.model_validate(r)


@router.patch("/{reservation_id}", response_model=ReservationOut, dependencies=[_staff])
def update_reservation(
    reservation_id: int,
    body: ReservationUpdate,
    db: DBSession = Depends(get_db),
) -> ReservationOut:
    r = service.update_reservation(db, reservation_id, body)
    return ReservationOut.model_validate(r)


# ---------------------------------------------------------------------------
# Cambios de estado
# ---------------------------------------------------------------------------

@router.patch("/{reservation_id}/cancel", response_model=ReservationOut, dependencies=[_staff])
def cancel_reservation(
    reservation_id: int,
    db: DBSession = Depends(get_db),
) -> ReservationOut:
    r = service.change_status(db, reservation_id, "cancelada")
    return ReservationOut.model_validate(r)


@router.patch("/{reservation_id}/expire", response_model=ReservationOut, dependencies=[_staff])
def expire_reservation(
    reservation_id: int,
    db: DBSession = Depends(get_db),
) -> ReservationOut:
    r = service.change_status(db, reservation_id, "vencida")
    return ReservationOut.model_validate(r)


@router.patch("/{reservation_id}/convert", response_model=ReservationOut, dependencies=[_staff])
def convert_reservation(
    reservation_id: int,
    db: DBSession = Depends(get_db),
) -> ReservationOut:
    """Marca la reserva como convertida (se cerró la venta/deal)."""
    r = service.change_status(db, reservation_id, "convertida")
    return ReservationOut.model_validate(r)
