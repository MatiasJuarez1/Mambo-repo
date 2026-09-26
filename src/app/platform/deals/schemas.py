"""Schemas Pydantic: Pipeline, PipelineStage, Deal, DealParty, Comision."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.modules.propiedades.schemas import PropiedadBrief
from app.platform.reservations.schemas import PersonBrief

PartyRole = Literal[
    "comprador", "vendedor", "inquilino", "propietario", "garante", "interesado", "otro"
]


# ---------------------------------------------------------------------------
# PipelineStage
# ---------------------------------------------------------------------------

class PipelineStageBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    position: int = Field(ge=0)
    is_won: bool = False
    is_lost: bool = False


class PipelineStageCreate(PipelineStageBase):
    pass


class PipelineStageUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    position: int | None = Field(default=None, ge=0)
    is_won: bool | None = None
    is_lost: bool | None = None


class PipelineStageOut(PipelineStageBase):
    id: int
    pipeline_id: int

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------

class PipelineBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = None
    is_active: bool = True


class PipelineCreate(PipelineBase):
    stages: list[PipelineStageCreate] = []


class PipelineUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = None
    is_active: bool | None = None


class PipelineOut(PipelineBase):
    id: int
    stages: list[PipelineStageOut] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class PipelineListOut(BaseModel):
    id: int
    name: str
    is_active: bool
    stage_count: int

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# DealParty
# ---------------------------------------------------------------------------

class DealPartyCreate(BaseModel):
    person_id: int
    role: PartyRole
    notes: str | None = None


class DealPartyOut(BaseModel):
    id: int
    deal_id: int
    person_id: int
    person: PersonBrief
    role: str
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Deal
# ---------------------------------------------------------------------------

class DealBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    pipeline_id: int
    stage_id: int
    assigned_to_user_id: int | None = None
    property_id: int | None = None
    amount: Decimal | None = Field(default=None, decimal_places=2)
    currency: str = Field(default="ARS", min_length=3, max_length=3)
    notes: str | None = None


class DealCreate(DealBase):
    parties: list[DealPartyCreate] = []


class DealUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    assigned_to_user_id: int | None = None
    property_id: int | None = None
    amount: Decimal | None = Field(default=None, decimal_places=2)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    notes: str | None = None


class DealMoveStage(BaseModel):
    stage_id: int


class DealOut(DealBase):
    id: int
    is_won: bool
    is_lost: bool
    closed_at: datetime | None
    propiedad: PropiedadBrief | None = None
    stage_changed_at: datetime
    dias_en_etapa: int
    parties: list[DealPartyOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DealListOut(BaseModel):
    id: int
    title: str
    pipeline_id: int
    stage_id: int
    assigned_to_user_id: int | None
    property_id: int | None
    amount: Decimal | None
    currency: str
    is_won: bool
    is_lost: bool
    propiedad: PropiedadBrief | None = None
    stage_changed_at: datetime
    dias_en_etapa: int
    parties: list[DealPartyOut] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class PaginatedDeals(BaseModel):
    total: int
    items: list[DealListOut]


# ---------------------------------------------------------------------------
# Comisión (Bloque 4)
# ---------------------------------------------------------------------------


class RepartoIn(BaseModel):
    user_id: int
    pct: Decimal = Field(gt=0, le=100, decimal_places=2)


class ComisionIn(BaseModel):
    """Reemplaza la comisión entera, reparto incluido. Manda `monto`; sin él se calcula de `pct`."""

    monto_operacion: Decimal = Field(ge=0, decimal_places=2)
    pct: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=2)
    monto: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    cobrada: bool = False
    fecha_cobro: date | None = None
    notas: str | None = None
    reparto: list[RepartoIn] = []

    @model_validator(mode="after")
    def _coherente(self) -> ComisionIn:
        if self.pct is None and self.monto is None:
            raise ValueError("Indicá porcentaje o monto")
        if sum((r.pct for r in self.reparto), Decimal(0)) > 100:
            raise ValueError("El reparto supera el 100 %")
        ids = [r.user_id for r in self.reparto]
        if len(ids) != len(set(ids)):
            raise ValueError("Un agente aparece dos veces en el reparto")
        if self.fecha_cobro is not None and not self.cobrada:
            raise ValueError("La fecha de cobro requiere marcar la comisión como cobrada")
        return self


class RepartoOut(BaseModel):
    user_id: int
    nombre: str
    pct: Decimal
    monto: Decimal

    model_config = {"from_attributes": True}


class ComisionOut(BaseModel):
    deal_id: int
    monto_operacion: Decimal
    moneda: str
    pct: Decimal | None
    monto: Decimal
    cobrada: bool
    fecha_cobro: date | None
    notas: str | None
    reparto: list[RepartoOut]
    sin_monto: bool
    updated_at: datetime

    model_config = {"from_attributes": True}
