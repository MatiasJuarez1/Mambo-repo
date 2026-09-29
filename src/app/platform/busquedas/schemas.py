"""Schemas Pydantic para el módulo busquedas."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field, model_validator

from app.modules.propiedades.models import TipoOperacion, TipoPropiedad
from app.modules.propiedades.schemas import PropiedadBrief


class _Criterios(BaseModel):
    tipo_operacion: TipoOperacion | None = None
    tipo_propiedad: TipoPropiedad | None = None
    ciudad: str | None = Field(default=None, max_length=120)
    moneda: str | None = Field(default=None, max_length=3)
    precio_min: Decimal | None = Field(default=None, ge=0)
    precio_max: Decimal | None = Field(default=None, ge=0)
    dormitorios_min: int | None = Field(default=None, ge=0)
    notas: str | None = None

    @model_validator(mode="after")
    def _rango_coherente(self):
        if (self.precio_min is not None or self.precio_max is not None) and not self.moneda:
            raise ValueError("Un rango de precio necesita la moneda")
        if (
            self.precio_min is not None
            and self.precio_max is not None
            and self.precio_min > self.precio_max
        ):
            raise ValueError("El precio mínimo no puede superar al máximo")
        return self


class BusquedaCreate(_Criterios):
    person_id: int


class BusquedaUpdate(_Criterios):
    """PATCH: solo cambia lo que viene. `activa` pausa o reactiva la búsqueda."""

    activa: bool | None = None


class PersonaBrief(BaseModel):
    id: int
    full_name: str

    model_config = {"from_attributes": True}


class BusquedaOut(BaseModel):
    id: int
    person: PersonaBrief
    tipo_operacion: str | None
    tipo_propiedad: str | None
    ciudad: str | None
    moneda: str | None
    precio_min: Decimal | None
    precio_max: Decimal | None
    dormitorios_min: int | None
    notas: str | None
    activa: bool
    created_at: datetime
    # Propiedades disponibles que hoy cumplen la búsqueda (se calcula, no se guarda).
    coincidencias: int = 0

    model_config = {"from_attributes": True}


class CoincidenciasOut(BaseModel):
    busqueda_id: int
    propiedades: list[PropiedadBrief]
