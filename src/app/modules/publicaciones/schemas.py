from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict

from app.modules.propiedades.schemas import PropiedadListItem
from app.modules.publicaciones.models import EstadoPublicacion


# ── Publicación ───────────────────────────────────────────────────────────────

class PublicacionBase(BaseModel):
    titulo: str
    descripcion: Optional[str] = None
    estado: EstadoPublicacion = EstadoPublicacion.activa


class PublicacionCreate(PublicacionBase):
    propiedad_id: int


class PublicacionUpdate(BaseModel):
    titulo: Optional[str] = None
    descripcion: Optional[str] = None
    estado: Optional[EstadoPublicacion] = None


class PublicacionResponse(PublicacionBase):
    id: int
    propiedad_id: int
    publicada_en: Optional[datetime] = None
    creado_en: datetime
    actualizado_en: datetime
    eliminado_en: Optional[datetime] = None
    propiedad: Optional[PropiedadListItem] = None

    model_config = ConfigDict(from_attributes=True)


class PublicacionListItem(BaseModel):
    id: int
    propiedad_id: int
    titulo: str
    estado: EstadoPublicacion
    publicada_en: Optional[datetime] = None
    creado_en: datetime
    propiedad: Optional[PropiedadListItem] = None

    model_config = ConfigDict(from_attributes=True)
