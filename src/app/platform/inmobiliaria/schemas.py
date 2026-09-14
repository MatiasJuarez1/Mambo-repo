"""DTOs de la configuración de la inmobiliaria."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class InmobiliariaUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=150)
    telefono: str | None = Field(default=None, max_length=50)
    email: str | None = Field(default=None, max_length=255)
    cuit: str | None = Field(default=None, max_length=20)
    direccion: str | None = Field(default=None, max_length=255)
    honorarios_venta_pct: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=2)
    honorarios_alquiler_pct: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=2)


class InmobiliariaOut(BaseModel):
    id: int
    nombre: str
    logo_url: str | None
    telefono: str | None
    email: str | None
    cuit: str | None
    direccion: str | None
    honorarios_venta_pct: Decimal | None
    honorarios_alquiler_pct: Decimal | None
    actualizado_en: datetime

    model_config = ConfigDict(from_attributes=True)
