"""Reportes de solo lectura (Bloque 4).

Las consultas traen las filas del período y la agregación se hace en Python: el
volumen es de cientos de operaciones y así corre igual en SQLite (tests) y Postgres.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal

from dateutil.relativedelta import relativedelta
from fastapi import HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.formato import redondear
from app.platform.alquileres.models import (
    Cobro,
    Contrato,
    EstadoCobro,
    EstadoContrato,
    Liquidacion,
    Pago,
)
from app.platform.deals.models import Comision, Deal, DealStageHistory, Pipeline
from app.platform.deals.schemas import RepartoOut
from app.platform.reportes.schemas import (
    FilaAgente,
    FilaAlquileres,
    FilaComision,
    FilaEmbudo,
    FilaOperaciones,
    ReporteAlquileres,
    ReporteComisiones,
    ReporteEmbudo,
    ReporteOperaciones,
)

CERO = Decimal("0.00")
SIN_ASIGNAR = "Sin asignar"


def meses_del_rango(desde: date, hasta: date) -> list[str]:
    meses = []
    cursor = desde.replace(day=1)
    while cursor <= hasta:
        meses.append(cursor.strftime("%Y-%m"))
        cursor += relativedelta(months=1)
    return meses


def _mes(valor: date | datetime) -> str:
    return valor.strftime("%Y-%m")


def _utc(valor: datetime) -> datetime:
    # SQLite devuelve la fecha sin zona; se guardó en UTC.
    return valor if valor.tzinfo is not None else valor.replace(tzinfo=UTC)


def _limites(desde: date, hasta: date) -> tuple[datetime, datetime]:
    """[desde 00:00, hasta + 1 día 00:00) en UTC, para comparar columnas datetime."""
    return (
        datetime.combine(desde, time.min, tzinfo=UTC),
        datetime.combine(hasta + timedelta(days=1), time.min, tzinfo=UTC),
    )


def _deals_cerrados(
    db: Session,
    desde: date,
    hasta: date,
    pipeline_id: int | None = None,
    agente_id: int | None = None,
) -> list[Deal]:
    inicio, fin = _limites(desde, hasta)
    q = (
        db.query(Deal)
        .options(joinedload(Deal.comision).joinedload(Comision.reparto), joinedload(Deal.pipeline))
        .filter(
            Deal.deleted_at.is_(None),
            Deal.closed_at.isnot(None),
            Deal.closed_at >= inicio,
            Deal.closed_at < fin,
            (Deal.is_won.is_(True)) | (Deal.is_lost.is_(True)),
        )
    )
    if pipeline_id is not None:
        q = q.filter(Deal.pipeline_id == pipeline_id)
    if agente_id is not None:
        q = q.filter(Deal.assigned_to_user_id == agente_id)
    return q.all()


def _monedas(valores: set[str]) -> list[str]:
    return sorted(valores) or ["ARS"]


# ---------------------------------------------------------------------------
# Operaciones
# ---------------------------------------------------------------------------


def operaciones(
    db: Session,
    desde: date,
    hasta: date,
    pipeline_id: int | None = None,
    agente_id: int | None = None,
) -> ReporteOperaciones:
    deals = _deals_cerrados(db, desde, hasta, pipeline_id, agente_id)
    monedas = _monedas({d.currency for d in deals})
    filas = {
        (mes, moneda): FilaOperaciones(mes=mes, moneda=moneda)
        for mes in meses_del_rango(desde, hasta)
        for moneda in monedas
    }
    for d in deals:
        fila = filas[(_mes(d.closed_at), d.currency)]
        if d.is_won:
            fila.ganadas += 1
            fila.monto_ganado += d.amount or CERO
            if d.comision is not None:
                fila.comisiones += d.comision.monto
                if d.comision.cobrada:
                    fila.comisiones_cobradas += d.comision.monto
        else:
            fila.perdidas += 1
    return ReporteOperaciones(
        desde=desde,
        hasta=hasta,
        pipeline_id=pipeline_id,
        agente_id=agente_id,
        filas=list(filas.values()),
        totales=[_total_operaciones(filas.values(), moneda) for moneda in monedas],
    )


def _total_operaciones(filas: Iterable[FilaOperaciones], moneda: str) -> FilaOperaciones:
    propias = [f for f in filas if f.moneda == moneda]
    return FilaOperaciones(
        mes="total",
        moneda=moneda,
        ganadas=sum(f.ganadas for f in propias),
        perdidas=sum(f.perdidas for f in propias),
        monto_ganado=sum((f.monto_ganado for f in propias), CERO),
        comisiones=sum((f.comisiones for f in propias), CERO),
        comisiones_cobradas=sum((f.comisiones_cobradas for f in propias), CERO),
    )


COLUMNAS_OPERACIONES = [
    "mes", "moneda", "ganadas", "perdidas", "monto_ganado", "comisiones", "comisiones_cobradas",
]  # fmt: skip


def filas_csv_operaciones(reporte: ReporteOperaciones) -> list[list[object]]:
    return [[getattr(f, c) for c in COLUMNAS_OPERACIONES] for f in reporte.filas + reporte.totales]


# ---------------------------------------------------------------------------
# Comisiones
# ---------------------------------------------------------------------------


def comisiones(
    db: Session,
    desde: date,
    hasta: date,
    agente_id: int | None = None,
    cobrada: bool | None = None,
) -> ReporteComisiones:
    deals = [d for d in _deals_cerrados(db, desde, hasta) if d.is_won and d.comision is not None]
    if cobrada is not None:
        deals = [d for d in deals if d.comision.cobrada is cobrada]
    if agente_id is not None:
        deals = [
            d
            for d in deals
            if d.assigned_to_user_id == agente_id
            or any(r.user_id == agente_id for r in d.comision.reparto)
        ]
    deals.sort(key=lambda d: _utc(d.closed_at), reverse=True)

    filas = [
        FilaComision(
            deal_id=d.id,
            titulo=d.title,
            pipeline=d.pipeline.name,
            closed_at=d.closed_at.date(),
            moneda=d.comision.moneda,
            monto_operacion=d.comision.monto_operacion,
            pct=d.comision.pct,
            monto=d.comision.monto,
            cobrada=d.comision.cobrada,
            fecha_cobro=d.comision.fecha_cobro,
            reparto=[RepartoOut.model_validate(r) for r in d.comision.reparto],
        )
        for d in deals
    ]

    por_agente: dict[tuple[int | None, str], FilaAgente] = {}

    def acumular(
        user_id: int | None, nombre: str, moneda: str, monto: Decimal, esta_cobrada: bool
    ) -> None:
        fila = por_agente.setdefault(
            (user_id, moneda), FilaAgente(user_id=user_id, nombre=nombre, moneda=moneda)
        )
        fila.operaciones += 1
        fila.comision += monto
        if esta_cobrada:
            fila.cobrada += monto

    for d in deals:
        c = d.comision
        repartido = CERO
        for r in c.reparto:
            acumular(r.user_id, r.nombre, c.moneda, r.monto, c.cobrada)
            repartido += r.monto
        resto = c.monto - repartido
        if resto > 0:
            acumular(None, SIN_ASIGNAR, c.moneda, resto, c.cobrada)

    return ReporteComisiones(
        desde=desde,
        hasta=hasta,
        agente_id=agente_id,
        cobrada=cobrada,
        filas=filas,
        por_agente=sorted(por_agente.values(), key=lambda f: f.comision, reverse=True),
    )


COLUMNAS_COMISIONES = [
    "operacion", "titulo", "pipeline", "cerrada_el", "moneda", "monto_operacion", "pct",
    "comision", "cobrada", "fecha_cobro", "reparto",
]  # fmt: skip


def _reparto_plano(fila: FilaComision) -> str:
    return " · ".join(f"{r.nombre} {r.pct:.2f} %".replace(".", ",") for r in fila.reparto)


def filas_csv_comisiones(reporte: ReporteComisiones) -> list[list[object]]:
    return [
        [
            f.deal_id, f.titulo, f.pipeline, f.closed_at, f.moneda, f.monto_operacion, f.pct,
            f.monto, f.cobrada, f.fecha_cobro, _reparto_plano(f),
        ]
        for f in reporte.filas
    ]  # fmt: skip


# ---------------------------------------------------------------------------
# Embudo
# ---------------------------------------------------------------------------


def _promedio_dias(pares: list[tuple[datetime, datetime]]) -> Decimal | None:
    if not pares:
        return None
    segundos = sum((_utc(fin) - _utc(inicio)).total_seconds() for inicio, fin in pares)
    return redondear(Decimal(segundos) / Decimal(86400 * len(pares)))


def _porcentaje(parte: int, total: int) -> Decimal | None:
    if total == 0:
        return None
    return redondear(Decimal(parte) * 100 / Decimal(total))


def embudo(db: Session, desde: date, hasta: date, pipeline_id: int) -> ReporteEmbudo:
    pipeline = db.get(Pipeline, pipeline_id)
    if pipeline is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pipeline no encontrado")
    inicio, fin = _limites(desde, hasta)

    del_periodo = (
        db.query(DealStageHistory)
        .join(Deal, Deal.id == DealStageHistory.deal_id)
        .filter(
            Deal.deleted_at.is_(None),
            Deal.pipeline_id == pipeline_id,
            DealStageHistory.entered_at >= inicio,
            DealStageHistory.entered_at < fin,
        )
        .all()
    )
    por_etapa: dict[int, list[DealStageHistory]] = defaultdict(list)
    for e in del_periodo:
        por_etapa[e.stage_id].append(e)

    # Para "avanzó" se mira el historial completo de esos deals, no solo el del período.
    deal_ids = {e.deal_id for e in del_periodo}
    por_deal: dict[int, list[DealStageHistory]] = defaultdict(list)
    if deal_ids:
        for e in db.query(DealStageHistory).filter(DealStageHistory.deal_id.in_(deal_ids)).all():
            por_deal[e.deal_id].append(e)
    posicion = {s.id: s.position for s in pipeline.stages}
    perdida = {s.id: s.is_lost for s in pipeline.stages}

    etapas = []
    for s in pipeline.stages:
        propias = por_etapa.get(s.id, [])
        ingresaron = {e.deal_id for e in propias}
        conversion = None
        if not (s.is_won or s.is_lost):
            avanzaron = 0
            for deal_id in ingresaron:
                primera = min(_utc(e.entered_at) for e in propias if e.deal_id == deal_id)
                if any(
                    _utc(x.entered_at) > primera
                    and posicion[x.stage_id] > s.position
                    and not perdida[x.stage_id]
                    for x in por_deal[deal_id]
                ):
                    avanzaron += 1
            conversion = _porcentaje(avanzaron, len(ingresaron))
        actuales = db.query(Deal).filter(Deal.stage_id == s.id, Deal.deleted_at.is_(None)).count()
        etapas.append(
            FilaEmbudo(
                stage_id=s.id,
                nombre=s.name,
                position=s.position,
                is_won=s.is_won,
                is_lost=s.is_lost,
                ingresaron=len(ingresaron),
                actuales=actuales,
                dias_promedio=_promedio_dias(
                    [(e.entered_at, e.left_at) for e in propias if e.left_at is not None]
                ),
                conversion_pct=conversion,
            )
        )

    cerrados = _deals_cerrados(db, desde, hasta, pipeline_id)
    ganados = [d for d in cerrados if d.is_won]
    perdidos = [d for d in cerrados if d.is_lost]
    return ReporteEmbudo(
        desde=desde,
        hasta=hasta,
        pipeline_id=pipeline.id,
        pipeline=pipeline.name,
        etapas=etapas,
        ganadas=len(ganados),
        perdidas=len(perdidos),
        tasa_cierre_pct=_porcentaje(len(ganados), len(cerrados)),
        dias_promedio_cierre=_promedio_dias([(d.created_at, d.closed_at) for d in ganados]),
    )


COLUMNAS_EMBUDO = ["etapa", "ingresaron", "actuales", "dias_promedio", "conversion_pct"]


def filas_csv_embudo(reporte: ReporteEmbudo) -> list[list[object]]:
    return [
        [e.nombre, e.ingresaron, e.actuales, e.dias_promedio, e.conversion_pct]
        for e in reporte.etapas
    ]


# ---------------------------------------------------------------------------
# Alquileres
# ---------------------------------------------------------------------------


def alquileres(db: Session, desde: date, hasta: date) -> ReporteAlquileres:
    meses = meses_del_rango(desde, hasta)
    primer_dia = date.fromisoformat(meses[0] + "-01")
    fin_exclusivo = date.fromisoformat(meses[-1] + "-01") + relativedelta(months=1)

    cobros = (
        db.query(Cobro)
        .options(joinedload(Cobro.contrato), joinedload(Cobro.pagos))
        .filter(
            Cobro.periodo >= primer_dia,
            Cobro.periodo < fin_exclusivo,
            Cobro.estado != EstadoCobro.anulado,
        )
        .all()
    )
    pagos = (
        db.query(Pago)
        .join(Cobro, Cobro.id == Pago.cobro_id)
        .options(joinedload(Pago.cobro).joinedload(Cobro.contrato))
        .filter(
            Pago.anulado_at.is_(None),
            Pago.fecha_pago >= primer_dia,
            Pago.fecha_pago < fin_exclusivo,
        )
        .all()
    )
    liquidaciones = (
        db.query(Liquidacion)
        .options(joinedload(Liquidacion.contrato))
        .filter(Liquidacion.periodo >= primer_dia, Liquidacion.periodo < fin_exclusivo)
        .all()
    )
    contratos = (
        db.query(Contrato)
        .filter(Contrato.fecha_inicio < fin_exclusivo, Contrato.fecha_fin >= primer_dia)
        .all()
    )

    monedas = _monedas({c.contrato.moneda for c in cobros} | {c.moneda for c in contratos})
    filas = {
        (mes, moneda): FilaAlquileres(mes=mes, moneda=moneda) for mes in meses for moneda in monedas
    }
    for c in cobros:
        fila = filas[(_mes(c.periodo), c.contrato.moneda)]
        fila.esperado += c.monto
        if c.estado in (EstadoCobro.pendiente, EstadoCobro.parcial):
            fila.pendiente += c.saldo
    for p in pagos:
        filas[(_mes(p.fecha_pago), p.cobro.contrato.moneda)].cobrado += p.monto
    for liq in liquidaciones:
        filas[(_mes(liq.periodo), liq.contrato.moneda)].honorarios += liq.honorarios_monto
    for c in contratos:
        for mes in meses:
            inicio_mes = date.fromisoformat(mes + "-01")
            fin_mes = inicio_mes + relativedelta(months=1) - timedelta(days=1)
            rescindido_antes = (
                c.estado == EstadoContrato.rescindido
                and c.fecha_rescision is not None
                and c.fecha_rescision < inicio_mes
            )
            if c.fecha_inicio <= fin_mes and c.fecha_fin >= inicio_mes and not rescindido_antes:
                filas[(mes, c.moneda)].contratos_vigentes += 1

    return ReporteAlquileres(
        desde=desde,
        hasta=hasta,
        filas=list(filas.values()),
        totales=[_total_alquileres(filas.values(), moneda) for moneda in monedas],
    )


def _total_alquileres(filas: Iterable[FilaAlquileres], moneda: str) -> FilaAlquileres:
    propias = [f for f in filas if f.moneda == moneda]
    return FilaAlquileres(
        mes="total",
        moneda=moneda,
        esperado=sum((f.esperado for f in propias), CERO),
        cobrado=sum((f.cobrado for f in propias), CERO),
        pendiente=sum((f.pendiente for f in propias), CERO),
        honorarios=sum((f.honorarios for f in propias), CERO),
        contratos_vigentes=max((f.contratos_vigentes for f in propias), default=0),
    )


COLUMNAS_ALQUILERES = [
    "mes", "moneda", "esperado", "cobrado", "pendiente", "honorarios", "contratos_vigentes",
]  # fmt: skip


def filas_csv_alquileres(reporte: ReporteAlquileres) -> list[list[object]]:
    return [[getattr(f, c) for c in COLUMNAS_ALQUILERES] for f in reporte.filas + reporte.totales]
