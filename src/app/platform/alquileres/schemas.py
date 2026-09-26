"""Schemas Pydantic del módulo alquileres."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from app.modules.propiedades.schemas import PropiedadBrief
from app.platform.alquileres.models import (
    EstadoAjuste,
    EstadoCobro,
    EstadoContrato,
    EstadoLiquidacion,
    IndiceAjuste,
    MedioPago,
    RolParteContrato,
    TipoGasto,
)

Moneda = Literal["ARS", "USD"]


# ---------------------------------------------------------------------------
# Validaciones compartidas (alta, edición y renovación)
# ---------------------------------------------------------------------------


def validar_coherencia_ajuste(
    indice: IndiceAjuste, frecuencia_meses: int | None, porcentaje_fijo: Decimal | None
) -> None:
    """Qué combinación de índice / frecuencia / porcentaje tiene sentido. Lanza ValueError."""
    if indice == IndiceAjuste.sin_ajuste:
        if frecuencia_meses is not None or porcentaje_fijo is not None:
            raise ValueError("Sin ajuste no lleva frecuencia_meses ni porcentaje_fijo")
        return
    if frecuencia_meses is None:
        raise ValueError("El índice elegido necesita frecuencia_meses")
    if indice == IndiceAjuste.porcentaje_fijo:
        if porcentaje_fijo is None:
            raise ValueError("porcentaje_fijo es obligatorio con el índice porcentaje_fijo")
    elif porcentaje_fijo is not None:
        raise ValueError("porcentaje_fijo solo va con el índice porcentaje_fijo")


class ParteIn(BaseModel):
    person_id: int
    rol: RolParteContrato


def validar_partes(partes: list[ParteIn]) -> None:
    roles = {p.rol for p in partes}
    if RolParteContrato.inquilino not in roles:
        raise ValueError("El contrato necesita al menos un inquilino")
    if RolParteContrato.propietario not in roles:
        raise ValueError("El contrato necesita al menos un propietario")
    pares = [(p.person_id, p.rol) for p in partes]
    if len(pares) != len(set(pares)):
        raise ValueError("Una persona no puede repetirse con el mismo rol")


# ---------------------------------------------------------------------------
# Entrada
# ---------------------------------------------------------------------------


class ContratoCrear(BaseModel):
    property_id: int
    deal_id: int | None = None
    partes: list[ParteIn]
    fecha_inicio: date
    fecha_fin: date
    dia_vencimiento: int = Field(ge=1, le=28)
    monto_inicial: Decimal = Field(gt=0, decimal_places=2)
    moneda: Moneda = "ARS"
    indice: IndiceAjuste
    frecuencia_meses: int | None = Field(default=None, ge=1, le=24)
    porcentaje_fijo: Decimal | None = Field(default=None, gt=0, decimal_places=2)
    administrado: bool = False
    honorarios_pct: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=2)
    punitorio_diario_pct: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=3)
    notas: str | None = None

    @model_validator(mode="after")
    def _coherencia(self) -> ContratoCrear:
        if self.fecha_fin <= self.fecha_inicio:
            raise ValueError("fecha_fin debe ser posterior a fecha_inicio")
        validar_coherencia_ajuste(self.indice, self.frecuencia_meses, self.porcentaje_fijo)
        validar_partes(self.partes)
        return self


class ContratoActualizar(BaseModel):
    """PATCH parcial. La coherencia índice/frecuencia/porcentaje se valida en el
    servicio sobre el resultado del merge, porque acá no se conoce el valor actual."""

    property_id: int | None = None
    partes: list[ParteIn] | None = None
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    dia_vencimiento: int | None = Field(default=None, ge=1, le=28)
    monto_inicial: Decimal | None = Field(default=None, gt=0, decimal_places=2)
    moneda: Moneda | None = None
    indice: IndiceAjuste | None = None
    frecuencia_meses: int | None = Field(default=None, ge=1, le=24)
    porcentaje_fijo: Decimal | None = Field(default=None, gt=0, decimal_places=2)
    administrado: bool | None = None
    honorarios_pct: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=2)
    punitorio_diario_pct: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=3)
    notas: str | None = None

    @model_validator(mode="after")
    def _partes(self) -> ContratoActualizar:
        if self.partes is not None:
            validar_partes(self.partes)
        return self


class ContratoRenovar(BaseModel):
    """Todo opcional salvo `fecha_fin`: lo que no venga se copia del contrato anterior."""

    fecha_fin: date
    fecha_inicio: date | None = None
    partes: list[ParteIn] | None = None
    dia_vencimiento: int | None = Field(default=None, ge=1, le=28)
    monto_inicial: Decimal | None = Field(default=None, gt=0, decimal_places=2)
    moneda: Moneda | None = None
    indice: IndiceAjuste | None = None
    frecuencia_meses: int | None = Field(default=None, ge=1, le=24)
    porcentaje_fijo: Decimal | None = Field(default=None, gt=0, decimal_places=2)
    administrado: bool | None = None
    honorarios_pct: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=2)
    punitorio_diario_pct: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=3)
    notas: str | None = None


class RescindirIn(BaseModel):
    fecha_rescision: date
    motivo: str = Field(min_length=1)


# ---------------------------------------------------------------------------
# Cobros y pagos
# ---------------------------------------------------------------------------


class PagoCrear(BaseModel):
    fecha_pago: date
    monto: Decimal = Field(gt=0, decimal_places=2)
    # Ausente → se usa el sugerido por el backend; 0 → sin punitorio.
    punitorio: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    medio: MedioPago
    referencia: str | None = Field(default=None, max_length=100)
    notas: str | None = None

    @model_validator(mode="after")
    def _no_futura(self) -> PagoCrear:
        if self.fecha_pago > date.today():
            raise ValueError("La fecha de pago no puede ser futura")
        return self


class AnularIn(BaseModel):
    motivo: str = Field(min_length=1)


class EnviarIn(BaseModel):
    """Destinatario explícito. Sin él, el email primario del inquilino (recibo) o
    del propietario (liquidación)."""

    email: EmailStr | None = None


class CobroActualizar(BaseModel):
    monto: Decimal | None = Field(default=None, gt=0, decimal_places=2)
    fecha_vencimiento: date | None = None
    notas: str | None = None


class PunitorioSugerido(BaseModel):
    monto: Decimal
    dias_atraso: int
    pct: Decimal


class UsuarioRef(BaseModel):
    id: int
    name: str

    model_config = ConfigDict(from_attributes=True)


class PagoOut(BaseModel):
    id: int
    fecha_pago: date
    monto: Decimal
    punitorio: Decimal
    total: Decimal
    medio: MedioPago
    referencia: str | None
    recibo_numero: int
    recibo_numero_formateado: str
    recibo_pdf_url: str | None
    enviado_email_at: datetime | None
    anulado_at: datetime | None
    motivo_anulacion: str | None
    liquidacion_id: int | None
    notas: str | None
    registrado_por: UsuarioRef | None
    whatsapp_url: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CobroDetalle(BaseModel):
    id: int
    contrato_id: int
    periodo: date
    fecha_vencimiento: date
    monto: Decimal
    estado: EstadoCobro
    pagado: Decimal
    saldo: Decimal
    dias_atraso: int
    vencido: bool
    notas: str | None
    pagos: list[PagoOut]

    model_config = ConfigDict(from_attributes=True)


# Los cuatro estados reales más el virtual `vencido` (pendiente/parcial ya vencido).
FiltroEstadoCobro = Literal["pendiente", "parcial", "pagado", "anulado", "vencido"]


class CobroEnLista(BaseModel):
    """Fila de la lista transversal: el cobro más lo mínimo del contrato para nombrarlo."""

    id: int
    contrato_id: int
    propiedad: PropiedadBrief
    inquilinos: list[ParteOut]
    moneda: str
    periodo: date
    fecha_vencimiento: date
    monto: Decimal
    estado: EstadoCobro
    pagado: Decimal
    saldo: Decimal
    dias_atraso: int
    vencido: bool

    model_config = ConfigDict(from_attributes=True)


class PaginadoCobros(BaseModel):
    total: int
    items: list[CobroEnLista]


class ResumenCobros(BaseModel):
    """Bloque de la ficha del contrato."""

    vencidos: int
    saldo_vencido: Decimal
    proximo_vencimiento: date | None


class Resumen(BaseModel):
    """Tiles del dashboard. `esperado`/`cobrado` son del `periodo`; el resto, de hoy."""

    periodo: date
    esperado: Decimal
    cobrado: Decimal
    vencidos_cantidad: int
    vencido_monto: Decimal
    morosos: int
    liquidaciones_sin_emitir: int


class AplicarAjusteIn(BaseModel):
    coeficiente: Decimal | None = Field(default=None, gt=0, decimal_places=6)
    porcentaje: Decimal | None = Field(default=None, gt=-100, decimal_places=2)
    notas: str | None = None

    @model_validator(mode="after")
    def _uno_solo(self) -> AplicarAjusteIn:
        if (self.coeficiente is None) == (self.porcentaje is None):
            raise ValueError("Indicá coeficiente o porcentaje, no ambos")
        return self

    def coeficiente_efectivo(self) -> Decimal:
        if self.coeficiente is not None:
            return self.coeficiente
        return Decimal(1) + self.porcentaje / Decimal(100)


class OmitirAjusteIn(BaseModel):
    notas: str | None = None


# ---------------------------------------------------------------------------
# Salida
# ---------------------------------------------------------------------------


class ParteOut(BaseModel):
    person_id: int
    full_name: str
    rol: RolParteContrato

    model_config = ConfigDict(from_attributes=True)


class AjusteOut(BaseModel):
    id: int
    fecha_prevista: date
    estado: EstadoAjuste
    coeficiente: Decimal | None
    monto_anterior: Decimal | None
    monto_nuevo: Decimal | None
    aplicado_at: datetime | None
    notas: str | None

    model_config = ConfigDict(from_attributes=True)


class ContratoRef(BaseModel):
    id: int
    fecha_inicio: date
    fecha_fin: date

    model_config = ConfigDict(from_attributes=True)


class DealRef(BaseModel):
    id: int
    title: str

    model_config = ConfigDict(from_attributes=True)


class ContratoEnLista(BaseModel):
    id: int
    property_id: int
    propiedad: PropiedadBrief
    partes: list[ParteOut]
    estado: EstadoContrato
    fecha_inicio: date
    fecha_fin: date
    moneda: str
    monto_vigente: Decimal
    proximo_ajuste: date | None
    administrado: bool
    vencidos: int

    model_config = ConfigDict(from_attributes=True)


class ContratoDetalle(ContratoEnLista):
    deal_id: int | None
    deal: DealRef | None
    contrato_anterior: ContratoRef | None
    renovacion: ContratoRef | None
    dia_vencimiento: int
    monto_inicial: Decimal
    indice: IndiceAjuste
    frecuencia_meses: int | None
    porcentaje_fijo: Decimal | None
    honorarios_pct: Decimal | None
    punitorio_diario_pct: Decimal | None
    fecha_rescision: date | None
    motivo_rescision: str | None
    pdf_url: str | None
    notas: str | None
    ajustes: list[AjusteOut]
    cobros: list[CobroDetalle]
    gastos: list[GastoOut]
    liquidaciones: list[LiquidacionEnLista]
    resumen_cobros: ResumenCobros | None
    # Solo lo trae la respuesta de aplicar un ajuste: períodos con pagos que no se actualizaron.
    cobros_no_actualizados: int | None = None
    created_at: datetime
    updated_at: datetime


class PaginadoContratos(BaseModel):
    total: int
    items: list[ContratoEnLista]


# ---------------------------------------------------------------------------
# Gastos
# ---------------------------------------------------------------------------


class GastoCrear(BaseModel):
    fecha: date
    tipo: TipoGasto
    concepto: str = Field(min_length=1, max_length=150)
    monto: Decimal = Field(gt=0, decimal_places=2)


class GastoActualizar(BaseModel):
    fecha: date | None = None
    tipo: TipoGasto | None = None
    concepto: str | None = Field(default=None, min_length=1, max_length=150)
    monto: Decimal | None = Field(default=None, gt=0, decimal_places=2)


class GastoOut(BaseModel):
    id: int
    contrato_id: int
    fecha: date
    tipo: TipoGasto
    concepto: str
    monto: Decimal
    comprobante_url: str | None
    liquidacion_id: int | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Liquidaciones
# ---------------------------------------------------------------------------


class LiquidacionEmitir(BaseModel):
    periodo: str = Field(pattern=r"^\d{4}-\d{2}$")
    notas: str | None = None


class PagarLiquidacionIn(BaseModel):
    fecha_pago: date


# Los dos estados reales más `anulada`, que en la base es un timestamp y no un estado.
FiltroEstadoLiquidacion = Literal["emitida", "pagada", "anulada"]


class AnularLiquidacionIn(BaseModel):
    motivo: str = Field(min_length=1)


class LiquidacionPreview(BaseModel):
    periodo: date
    pagos: list[PagoOut]
    gastos: list[GastoOut]
    total_cobrado: Decimal
    total_punitorios: Decimal
    honorarios_pct: Decimal
    honorarios_monto: Decimal
    total_gastos: Decimal
    total_a_transferir: Decimal


class LiquidacionEnLista(BaseModel):
    id: int
    contrato_id: int
    propiedad: PropiedadBrief
    moneda: str
    periodo: date
    numero: int
    numero_formateado: str
    total_cobrado: Decimal
    total_punitorios: Decimal
    honorarios_pct: Decimal
    honorarios_monto: Decimal
    total_gastos: Decimal
    total_a_transferir: Decimal
    estado: EstadoLiquidacion
    anulada: bool
    motivo_anulacion: str | None
    fecha_pago: date | None
    comprobante_pdf_url: str | None
    enviado_email_at: datetime | None
    notas: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LiquidacionDetalle(LiquidacionEnLista):
    pagos: list[PagoOut]
    gastos: list[GastoOut]
    whatsapp_url: str | None


class PaginadoLiquidaciones(BaseModel):
    total: int
    items: list[LiquidacionEnLista]


# ---------------------------------------------------------------------------
# Recordatorios (2c)
# ---------------------------------------------------------------------------


class TipoRecordatorio(StrEnum):
    cobro_vencido = "cobro_vencido"
    cobro_por_vencer = "cobro_por_vencer"
    ajuste = "ajuste"
    fin_contrato = "fin_contrato"


class Recordatorio(BaseModel):
    """Un ítem de la bandeja. `dias` negativo = atrasado."""

    tipo: TipoRecordatorio
    fecha: date
    dias: int
    contrato_id: int
    # cobro_id / ajuste_id / contrato_id según el tipo, para linkear o resaltar.
    referencia_id: int
    propiedad: PropiedadBrief
    inquilinos: list[ParteOut]
    moneda: str
    # Saldo del cobro; monto vigente en ajuste y fin_contrato.
    monto: Decimal | None
    detalle: str


class Recordatorios(BaseModel):
    hoy: date
    dias: int
    total: int
    # Siempre las cuatro claves, aunque valgan 0.
    por_tipo: dict[TipoRecordatorio, int]
    items: list[Recordatorio]


class EnvioRecordatorios(BaseModel):
    enviado_a: list[str]
    items: int
