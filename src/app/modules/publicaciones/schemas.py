from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.modules.propiedades.schemas import PropiedadListItem
from app.modules.publicaciones.models import EstadoPublicacion


class PublicacionBase(BaseModel):
    titulo: str
    descripcion: str | None = None
    estado: EstadoPublicacion = EstadoPublicacion.activa
    precio_publicado: Decimal | None = None
    moneda_publicada: str = "ARS"
    slug: str | None = None


class PublicacionCreate(PublicacionBase):
    propiedad_id: int


class PublicacionUpdate(BaseModel):
    titulo: str | None = None
    descripcion: str | None = None
    estado: EstadoPublicacion | None = None
    precio_publicado: Decimal | None = None
    moneda_publicada: str | None = None
    slug: str | None = None


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
