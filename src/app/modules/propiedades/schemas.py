from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict

from app.modules.propiedades.models import EstadoComercial, TipoMedio, TipoOperacion, TipoPropiedad


# ── Ubicación ────────────────────────────────────────────────────────────────

class UbicacionBase(BaseModel):
    direccion: Optional[str] = None
    ciudad: Optional[str] = None
    provincia: Optional[str] = None
    pais: Optional[str] = "AR"
    codigo_postal: Optional[str] = None
    lat: Optional[Decimal] = None
    lng: Optional[Decimal] = None


class UbicacionCreate(UbicacionBase):
    pass


class UbicacionUpdate(UbicacionBase):
    pass


class UbicacionResponse(UbicacionBase):
    id: int
    propiedad_id: int
    creado_en: datetime

    model_config = ConfigDict(from_attributes=True)


# ── Medios ────────────────────────────────────────────────────────────────────

class MedioBase(BaseModel):
    tipo_medio: TipoMedio = TipoMedio.imagen
    url: str
    descripcion: Optional[str] = None
    orden: int = 0
    es_principal: bool = False


class MedioCreate(MedioBase):
    pass


class MedioUpdate(BaseModel):
    tipo_medio: Optional[TipoMedio] = None
    url: Optional[str] = None
    descripcion: Optional[str] = None
    orden: Optional[int] = None
    es_principal: Optional[bool] = None


class MedioResponse(MedioBase):
    id: int
    propiedad_id: int
    creado_en: datetime

    model_config = ConfigDict(from_attributes=True)


# ── Características ───────────────────────────────────────────────────────────

class CaracteristicaBase(BaseModel):
    clave: str
    valor: str


class CaracteristicaCreate(CaracteristicaBase):
    pass


class CaracteristicaResponse(CaracteristicaBase):
    id: int
    propiedad_id: int
    creado_en: datetime

    model_config = ConfigDict(from_attributes=True)


# ── Propiedad ─────────────────────────────────────────────────────────────────

class PropiedadBase(BaseModel):
    titulo: str
    descripcion: Optional[str] = None
    tipo_propiedad: TipoPropiedad = TipoPropiedad.otro
    tipo_operacion: TipoOperacion = TipoOperacion.venta
    estado_comercial: EstadoComercial = EstadoComercial.disponible
    moneda: str = "ARS"
    precio: Optional[Decimal] = None
    dormitorios: Optional[int] = None
    banos: Optional[int] = None
    m2_cubiertos: Optional[Decimal] = None
    m2_totales: Optional[Decimal] = None
    propietario_persona_id: Optional[int] = None


class PropiedadCreate(PropiedadBase):
    ubicacion: Optional[UbicacionCreate] = None
    medios: List[MedioCreate] = []
    caracteristicas: List[CaracteristicaCreate] = []


class PropiedadUpdate(BaseModel):
    titulo: Optional[str] = None
    descripcion: Optional[str] = None
    tipo_propiedad: Optional[TipoPropiedad] = None
    tipo_operacion: Optional[TipoOperacion] = None
    estado_comercial: Optional[EstadoComercial] = None
    moneda: Optional[str] = None
    precio: Optional[Decimal] = None
    dormitorios: Optional[int] = None
    banos: Optional[int] = None
    m2_cubiertos: Optional[Decimal] = None
    m2_totales: Optional[Decimal] = None
    propietario_persona_id: Optional[int] = None
    ubicacion: Optional[UbicacionUpdate] = None


class PropiedadResponse(PropiedadBase):
    id: int
    creado_en: datetime
    actualizado_en: datetime
    eliminado_en: Optional[datetime] = None
    ubicacion: Optional[UbicacionResponse] = None
    medios: List[MedioResponse] = []
    caracteristicas: List[CaracteristicaResponse] = []

    model_config = ConfigDict(from_attributes=True)


class PropiedadListItem(BaseModel):
    id: int
    titulo: str
    tipo_propiedad: TipoPropiedad
    tipo_operacion: TipoOperacion
    estado_comercial: EstadoComercial
    moneda: str
    precio: Optional[Decimal] = None
    dormitorios: Optional[int] = None
    banos: Optional[int] = None
    m2_cubiertos: Optional[Decimal] = None
    m2_totales: Optional[Decimal] = None
    creado_en: datetime
    ubicacion: Optional[UbicacionResponse] = None
    medios: List[MedioResponse] = []

    model_config = ConfigDict(from_attributes=True)
