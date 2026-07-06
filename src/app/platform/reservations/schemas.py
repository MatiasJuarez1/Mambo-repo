"""Schemas Pydantic para el módulo reservations."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, model_validator

ReservationStatus = Literal["activa", "cancelada", "vencida", "convertida"]


# ---------------------------------------------------------------------------
# Mutaciones
# ---------------------------------------------------------------------------

class ReservationCreate(BaseModel):
    person_id: int
    property_id: int
    amount: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    currency: str = Field(default="ARS", min_length=3, max_length=3)
    notes: str | None = None
    expires_at: datetime | None = None

    @model_validator(mode="after")
    def expires_must_be_future(self) -> ReservationCreate:
        if self.expires_at and self.expires_at <= datetime.now(self.expires_at.tzinfo):
            raise ValueError("expires_at debe ser una fecha futura")
        return self


class ReservationUpdate(BaseModel):
    amount: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    notes: str | None = None
    expires_at: datetime | None = None


# ---------------------------------------------------------------------------
# Respuestas
# ---------------------------------------------------------------------------

class PersonBrief(BaseModel):
    id: int
    full_name: str

    model_config = {"from_attributes": True}


class UserBrief(BaseModel):
    id: int
    email: str

    model_config = {"from_attributes": True}


class ReservationOut(BaseModel):
    id: int
    status: str
    person: PersonBrief
    property_id: int
    amount: Decimal | None
    currency: str
    notes: str | None
    expires_at: datetime | None
    created_by: UserBrief
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PaginatedReservations(BaseModel):
    total: int
    items: list[ReservationOut]
