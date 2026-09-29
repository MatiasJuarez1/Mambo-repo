"""Schemas Pydantic para las consultas que llegan desde el sitio público."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, EmailStr, Field, field_validator


class ConsultaCreate(BaseModel):
    """Lo que manda el formulario "Solicitar visita" de la ficha de una propiedad.

    Los largos máximos calcan las columnas de `people` y `people_contacts`: el
    endpoint es anónimo y sin esto un valor largo explota en Postgres.
    """

    propiedad_id: int
    nombre: str = Field(min_length=1, max_length=100)
    apellido: str = Field(min_length=1, max_length=100)
    telefono: str = Field(min_length=6, max_length=50)
    email: EmailStr | None = None
    fecha_preferida: date | None = None
    mensaje: str | None = Field(default=None, max_length=2000)
    # Trampa para bots: el formulario lo oculta, así que una persona nunca lo llena.
    sitio_web: str | None = None

    # `before`: recortar antes de que corra `min_length`, o "   " pasaría como nombre.
    @field_validator("nombre", "apellido", "telefono", "mensaje", mode="before")
    @classmethod
    def _recortar(cls, v: str | None) -> str | None:
        return v.strip() if isinstance(v, str) else v

    @field_validator("telefono")
    @classmethod
    def _telefono_con_digitos(cls, v: str) -> str:
        if sum(c.isdigit() for c in v) < 6:
            raise ValueError("El teléfono debe tener al menos 6 dígitos")
        return v


class ConsultaRecibida(BaseModel):
    """Respuesta deliberadamente vacía de datos: el endpoint es anónimo y no debe
    revelar si esa persona ya estaba cargada ni qué ids se crearon."""

    mensaje: str
