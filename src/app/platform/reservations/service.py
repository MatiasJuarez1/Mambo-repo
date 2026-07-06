"""Lógica de negocio: CRUD reservations con reglas de estado."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session as DBSession

from app.platform.reservations.models import Reservation
from app.platform.reservations.schemas import ReservationCreate, ReservationUpdate

# Transiciones de estado permitidas
_ALLOWED_TRANSITIONS: dict[str, list[str]] = {
    "activa":     ["cancelada", "vencida", "convertida"],
    "vencida":    ["cancelada"],
    "cancelada":  [],
    "convertida": [],
}


# ---------------------------------------------------------------------------
# Queries
# ---------------------------------------------------------------------------

def list_reservations(
    db: DBSession,
    *,
    person_id: int | None = None,
    property_id: int | None = None,
    res_status: str | None = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[int, list[Reservation]]:
    q = db.query(Reservation)

    if person_id is not None:
        q = q.filter(Reservation.person_id == person_id)
    if property_id is not None:
        q = q.filter(Reservation.property_id == property_id)
    if res_status is not None:
        q = q.filter(Reservation.status == res_status)

    total = q.count()
    items = q.order_by(Reservation.created_at.desc()).offset(skip).limit(limit).all()
    return total, items


def get_reservation_or_404(db: DBSession, reservation_id: int) -> Reservation:
    r = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not r:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reserva no encontrada")
    return r


# ---------------------------------------------------------------------------
# Mutaciones
# ---------------------------------------------------------------------------

def create_reservation(
    db: DBSession, data: ReservationCreate, created_by_user_id: int
) -> Reservation:
    # Regla: solo una reserva activa por propiedad a la vez
    existing_active = (
        db.query(Reservation)
        .filter(
            Reservation.property_id == data.property_id,
            Reservation.status == "activa",
        )
        .first()
    )
    if existing_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"La propiedad {data.property_id} ya tiene una reserva activa (id={existing_active.id})",
        )

    reservation = Reservation(
        **data.model_dump(),
        status="activa",
        created_by_user_id=created_by_user_id,
    )
    db.add(reservation)
    db.commit()
    db.refresh(reservation)
    return reservation


def update_reservation(db: DBSession, reservation_id: int, data: ReservationUpdate) -> Reservation:
    reservation = get_reservation_or_404(db, reservation_id)

    if not reservation.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Solo se pueden editar reservas activas",
        )

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(reservation, field, value)

    reservation.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(reservation)
    return reservation


def change_status(db: DBSession, reservation_id: int, new_status: str) -> Reservation:
    reservation = get_reservation_or_404(db, reservation_id)
    allowed = _ALLOWED_TRANSITIONS.get(reservation.status, [])

    if new_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"No se puede pasar de '{reservation.status}' a '{new_status}'",
        )

    reservation.status = new_status
    reservation.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(reservation)
    return reservation
