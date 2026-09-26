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
    punitorio_diario_pct: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=3)
    dias_gracia: int | None = Field(default=None, ge=0, le=60)
    dias_aviso_recordatorios: int | None = Field(default=None, ge=1, le=180)


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
    punitorio_diario_pct: Decimal | None
    dias_gracia: int
    dias_aviso_recordatorios: int
    actualizado_en: datetime
    email_configurado: bool = False
    recordatorios_configurado: bool = False

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def desde(cls, fila) -> InmobiliariaOut:
        """`email_configurado` sale de `Settings`, no de la fila."""
        from app.config import get_settings

        out = cls.model_validate(fila)
        out.email_configurado = get_settings().email_configurado
        out.recordatorios_configurado = get_settings().recordatorios_configurado
        return out
