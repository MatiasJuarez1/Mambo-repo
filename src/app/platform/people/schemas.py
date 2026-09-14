"""Schemas Pydantic para el módulo people."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from app.modules.propiedades.schemas import PropiedadBrief

ContactType = Literal["email", "phone", "whatsapp", "other"]


# ---------------------------------------------------------------------------
# PersonContact
# ---------------------------------------------------------------------------

class PersonContactBase(BaseModel):
    type: ContactType
    value: str = Field(min_length=1, max_length=255)
    is_primary: bool = False


class PersonContactCreate(PersonContactBase):
    pass


class PersonContactUpdate(BaseModel):
    is_primary: bool | None = None


class PersonContactOut(PersonContactBase):
    id: int
    person_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Person
# ---------------------------------------------------------------------------

class PersonBase(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    document_type: str | None = Field(default=None, max_length=20)
    document_number: str | None = Field(default=None, max_length=50)
    notes: str | None = None


class PersonCreate(PersonBase):
    contacts: list[PersonContactCreate] = []


class PersonUpdate(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)
    document_type: str | None = None
    document_number: str | None = None
    notes: str | None = None


class PersonOut(PersonBase):
    id: int
    full_name: str
    contacts: list[PersonContactOut] = []
    tags: list[str] = []
    roles: dict[str, int] = {}
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PersonListOut(BaseModel):
    id: int
    full_name: str
    document_type: str | None
    document_number: str | None
    tags: list[str] = []
    roles: dict[str, int] = {}
    created_at: datetime

    model_config = {"from_attributes": True}


class PaginatedPeople(BaseModel):
    total: int
    items: list[PersonListOut]


# ---------------------------------------------------------------------------
# Tags
# ---------------------------------------------------------------------------

class TagsUpdate(BaseModel):
    tags: list[str]


class TagCount(BaseModel):
    nombre: str
    cantidad: int


# ---------------------------------------------------------------------------
# Vínculos (ficha)
# ---------------------------------------------------------------------------

class PropiedadVinculoOut(BaseModel):
    id: int
    titulo: str
    tipo_operacion: str
    estado_comercial: str
    foto_principal: str | None


class ReservaVinculoOut(BaseModel):
    id: int
    status: str
    amount: Decimal | None
    currency: str
    expires_at: datetime | None
    propiedad: PropiedadBrief


class DealVinculoOut(BaseModel):
    id: int
    title: str
    pipeline: str
    stage: str
    is_won: bool
    is_lost: bool
    amount: Decimal | None
    currency: str
    role: str
    propiedad: PropiedadBrief | None


class ActividadVinculoOut(BaseModel):
    id: int
    activity_type: str
    status: str
    title: str
    due_at: datetime | None


class PersonLinksOut(BaseModel):
    propiedades: list[PropiedadVinculoOut]
    reservas: list[ReservaVinculoOut]
    deals: list[DealVinculoOut]
    actividades: list[ActividadVinculoOut]
