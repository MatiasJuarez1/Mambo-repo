"""Schemas Pydantic para el módulo activities."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.modules.propiedades.schemas import PropiedadBrief
from app.platform.auth.schemas import UserBrief

ActivityType = Literal["llamada", "visita", "tarea", "whatsapp", "email", "otro"]
ActivityStatus = Literal["pendiente", "hecha", "cancelada"]


# ---------------------------------------------------------------------------
# Base y mutaciones
# ---------------------------------------------------------------------------


class ActivityCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    activity_type: ActivityType
    description: str | None = None
    due_at: datetime | None = None

    assigned_to_user_id: int | None = None
    person_id: int | None = None
    property_id: int | None = None
    deal_id: int | None = None
    listing_id: int | None = None


class ActivityUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    activity_type: ActivityType | None = None
    description: str | None = None
    due_at: datetime | None = None
    assigned_to_user_id: int | None = None
    person_id: int | None = None
    property_id: int | None = None
    deal_id: int | None = None
    listing_id: int | None = None


# ---------------------------------------------------------------------------
# Respuestas
# ---------------------------------------------------------------------------


class PersonBrief(BaseModel):
    id: int
    full_name: str

    model_config = {"from_attributes": True}


class DealBrief(BaseModel):
    id: int
    title: str

    model_config = {"from_attributes": True}


class ActivityOut(BaseModel):
    id: int
    title: str
    activity_type: str
    status: str
    description: str | None
    due_at: datetime | None
    done_at: datetime | None
    assigned_to: UserBrief | None
    # None en las que llegan desde el sitio público (consultas web).
    created_by: UserBrief | None
    person: PersonBrief | None
    propiedad: PropiedadBrief | None
    deal: DealBrief | None
    listing_id: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PaginatedActivities(BaseModel):
    total: int
    items: list[ActivityOut]
