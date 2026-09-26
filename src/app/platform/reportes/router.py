"""Router reportes: solo lectura, staff, con variante CSV en cada uno."""

from __future__ import annotations

from datetime import date
from typing import Literal

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.platform.auth.dependencies import require_role
from app.platform.reportes import service
from app.platform.reportes.exportar import csv_response
from app.platform.reportes.schemas import (
    ReporteAlquileres,
    ReporteComisiones,
    ReporteEmbudo,
    ReporteOperaciones,
)

router = APIRouter(prefix="/reportes", tags=["reportes"])

# Por endpoint y no en el APIRouter, siguiendo el criterio del resto de los módulos.
SOLO_STAFF = [Depends(require_role("staff", "admin"))]
MESES_POR_DEFECTO = 12

Formato = Literal["json", "csv"]


def periodo(
    desde: date | None = Query(default=None),
    hasta: date | None = Query(default=None),
) -> tuple[date, date]:
    """Ambos inclusivos. Default: los últimos 12 meses hasta hoy."""
    hasta = hasta or date.today()
    desde = desde or hasta.replace(day=1) - relativedelta(months=MESES_POR_DEFECTO - 1)
    if hasta < desde:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El período termina antes de empezar",
        )
    return desde, hasta


def _nombre(reporte: str, desde: date, hasta: date) -> str:
    return f"{reporte}_{desde}_{hasta}"


@router.get("/operaciones", response_model=ReporteOperaciones, dependencies=SOLO_STAFF)
def reporte_operaciones(
    rango: tuple[date, date] = Depends(periodo),
    pipeline_id: int | None = Query(default=None),
    agente_id: int | None = Query(default=None),
    formato: Formato = Query(default="json"),
    db: Session = Depends(get_db),
):
    desde, hasta = rango
    reporte = service.operaciones(db, desde, hasta, pipeline_id, agente_id)
    if formato == "csv":
        return csv_response(
            _nombre("operaciones", desde, hasta),
            service.COLUMNAS_OPERACIONES,
            service.filas_csv_operaciones(reporte),
        )
    return reporte


@router.get("/comisiones", response_model=ReporteComisiones, dependencies=SOLO_STAFF)
def reporte_comisiones(
    rango: tuple[date, date] = Depends(periodo),
    agente_id: int | None = Query(default=None),
    cobrada: bool | None = Query(default=None),
    formato: Formato = Query(default="json"),
    db: Session = Depends(get_db),
):
    desde, hasta = rango
    reporte = service.comisiones(db, desde, hasta, agente_id, cobrada)
    if formato == "csv":
        return csv_response(
            _nombre("comisiones", desde, hasta),
            service.COLUMNAS_COMISIONES,
            service.filas_csv_comisiones(reporte),
        )
    return reporte


@router.get("/embudo", response_model=ReporteEmbudo, dependencies=SOLO_STAFF)
def reporte_embudo(
    pipeline_id: int = Query(...),
    rango: tuple[date, date] = Depends(periodo),
    formato: Formato = Query(default="json"),
    db: Session = Depends(get_db),
):
    desde, hasta = rango
    reporte = service.embudo(db, desde, hasta, pipeline_id)
    if formato == "csv":
        return csv_response(
            _nombre("embudo", desde, hasta),
            service.COLUMNAS_EMBUDO,
            service.filas_csv_embudo(reporte),
        )
    return reporte


@router.get("/alquileres", response_model=ReporteAlquileres, dependencies=SOLO_STAFF)
def reporte_alquileres(
    rango: tuple[date, date] = Depends(periodo),
    formato: Formato = Query(default="json"),
    db: Session = Depends(get_db),
):
    desde, hasta = rango
    reporte = service.alquileres(db, desde, hasta)
    if formato == "csv":
        return csv_response(
            _nombre("alquileres", desde, hasta),
            service.COLUMNAS_ALQUILERES,
            service.filas_csv_alquileres(reporte),
        )
    return reporte
