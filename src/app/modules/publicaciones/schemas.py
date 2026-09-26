from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.propiedades.schemas import PropiedadListItem
from app.modules.publicaciones.models import EstadoPublicacion


class PublicacionBase(BaseModel):
    # max_length calcado de la columna (titulo String(255), slug String(300)):
    # sin esto un valor más largo pasa Pydantic y explota en Postgres, que sí
    # valida el largo del varchar (SQLite, con el que corren los tests, no).
    titulo: str = Field(max_length=255)
    descripcion: str | None = None
    estado: EstadoPublicacion = EstadoPublicacion.activa
    precio_publicado: Decimal | None = None
    moneda_publicada: str = "ARS"
    slug: str | None = Field(default=None, max_length=300)


class PublicacionCreate(PublicacionBase):
    propiedad_id: int


class PublicacionUpdate(BaseModel):
    titulo: str | None = Field(default=None, max_length=255)
    descripcion: str | None = None
    estado: EstadoPublicacion | None = None
    precio_publicado: Decimal | None = None
    moneda_publicada: str | None = None
    slug: str | None = Field(default=None, max_length=300)


class PublicacionResponse(PublicacionBase):
    id: int
    propiedad_id: int
    publicada_en: datetime | None = None
    creado_en: datetime
    actualizado_en: datetime
    eliminado_en: datetime | None = None
    propiedad: PropiedadListItem | None = None

    model_config = ConfigDict(from_attributes=True)


class PublicacionListItem(BaseModel):
    id: int
    propiedad_id: int
    titulo: str
    estado: EstadoPublicacion
    precio_publicado: Decimal | None = None
    moneda_publicada: str = "ARS"
    slug: str | None = None
    publicada_en: datetime | None = None
    creado_en: datetime
    propiedad: PropiedadListItem | None = None

    model_config = ConfigDict(from_attributes=True)
