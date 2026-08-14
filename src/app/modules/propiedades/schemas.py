from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.modules.propiedades.models import EstadoComercial, TipoMedio, TipoOperacion, TipoPropiedad

# ── Ubicación ────────────────────────────────────────────────────────────────

class UbicacionBase(BaseModel):
    direccion: str | None = None
    ciudad: str | None = None
    provincia: str | None = None
    pais: str | None = "AR"
    codigo_postal: str | None = None
    lat: Decimal | None = None
    lng: Decimal | None = None


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
    descripcion: str | None = None
    orden: int = 0
    es_principal: bool = False


class MedioCreate(MedioBase):
    pass


class MedioUpdate(BaseModel):
    tipo_medio: TipoMedio | None = None
    url: str | None = None
    descripcion: str | None = None
    orden: int | None = None
    es_principal: bool | None = None


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
    descripcion: str | None = None
    tipo_propiedad: TipoPropiedad = TipoPropiedad.otro
    tipo_operacion: TipoOperacion = TipoOperacion.venta
    estado_comercial: EstadoComercial = EstadoComercial.disponible
    moneda: str = "ARS"
    precio: Decimal | None = None
    dormitorios: int | None = None
    banos: int | None = None
    m2_cubiertos: Decimal | None = None
    m2_totales: Decimal | None = None
    propietario_persona_id: int | None = None


class PropiedadCreate(PropiedadBase):
    ubicacion: UbicacionCreate | None = None
    medios: list[MedioCreate] = []
    caracteristicas: list[CaracteristicaCreate] = []


class PropiedadUpdate(BaseModel):
    titulo: str | None = None
    descripcion: str | None = None
    tipo_propiedad: TipoPropiedad | None = None
    tipo_operacion: TipoOperacion | None = None
    estado_comercial: EstadoComercial | None = None
    moneda: str | None = None
    precio: Decimal | None = None
    dormitorios: int | None = None
    banos: int | None = None
    m2_cubiertos: Decimal | None = None
    m2_totales: Decimal | None = None
    propietario_persona_id: int | None = None
    ubicacion: UbicacionUpdate | None = None


class PropiedadResponse(PropiedadBase):
    id: int
    creado_en: datetime
    actualizado_en: datetime
    eliminado_en: datetime | None = None
    ubicacion: UbicacionResponse | None = None
    medios: list[MedioResponse] = []
    caracteristicas: list[CaracteristicaResponse] = []

    model_config = ConfigDict(from_attributes=True)


class PropiedadListItem(BaseModel):
    id: int
    titulo: str
    tipo_propiedad: TipoPropiedad
    tipo_operacion: TipoOperacion
    estado_comercial: EstadoComercial
    moneda: str
    precio: Decimal | None = None
    dormitorios: int | None = None
    banos: int | None = None
    m2_cubiertos: Decimal | None = None
    m2_totales: Decimal | None = None
    creado_en: datetime
    ubicacion: UbicacionResponse | None = None
    medios: list[MedioResponse] = []

    model_config = ConfigDict(from_attributes=True)
