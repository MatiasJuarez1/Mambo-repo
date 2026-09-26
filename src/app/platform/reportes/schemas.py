"""DTOs de los reportes (Bloque 4). Todo agrupado por moneda: nunca se suman ARS con USD."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel

from app.platform.deals.schemas import RepartoOut


class FilaOperaciones(BaseModel):
    mes: str  # "YYYY-MM"; "total" en `totales`
    moneda: str
    ganadas: int = 0
    perdidas: int = 0
    monto_ganado: Decimal = Decimal("0.00")
    comisiones: Decimal = Decimal("0.00")
    comisiones_cobradas: Decimal = Decimal("0.00")


class ReporteOperaciones(BaseModel):
    desde: date
    hasta: date
    pipeline_id: int | None
    agente_id: int | None
    filas: list[FilaOperaciones]
    totales: list[FilaOperaciones]


class FilaComision(BaseModel):
    deal_id: int
    titulo: str
    pipeline: str
    closed_at: date
    moneda: str
    monto_operacion: Decimal
    pct: Decimal | None
    monto: Decimal
    cobrada: bool
    fecha_cobro: date | None
    reparto: list[RepartoOut]


class FilaAgente(BaseModel):
    user_id: int | None  # None = parte no repartida: queda para la inmobiliaria
    nombre: str
    moneda: str
    operaciones: int = 0
    comision: Decimal = Decimal("0.00")
    cobrada: Decimal = Decimal("0.00")


class ReporteComisiones(BaseModel):
    desde: date
    hasta: date
    agente_id: int | None
    cobrada: bool | None
    filas: list[FilaComision]
    por_agente: list[FilaAgente]


class FilaEmbudo(BaseModel):
    stage_id: int
    nombre: str
    position: int
    is_won: bool
    is_lost: bool
    ingresaron: int
    actuales: int
    dias_promedio: Decimal | None
    conversion_pct: Decimal | None


class ReporteEmbudo(BaseModel):
    desde: date
    hasta: date
    pipeline_id: int
    pipeline: str
    etapas: list[FilaEmbudo]
    ganadas: int
    perdidas: int
    tasa_cierre_pct: Decimal | None
    dias_promedio_cierre: Decimal | None


class FilaAlquileres(BaseModel):
    mes: str
    moneda: str
    esperado: Decimal = Decimal("0.00")
    cobrado: Decimal = Decimal("0.00")
    pendiente: Decimal = Decimal("0.00")
    honorarios: Decimal = Decimal("0.00")
    contratos_vigentes: int = 0


class ReporteAlquileres(BaseModel):
    desde: date
    hasta: date
    filas: list[FilaAlquileres]
    totales: list[FilaAlquileres]
