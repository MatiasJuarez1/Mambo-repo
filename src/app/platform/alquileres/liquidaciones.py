"""Liquidación mensual al propietario: lo cobrado en el mes (por fecha de pago)
menos honorarios y gastos. Los totales se guardan como snapshot: el PDF y el
número no cambian aunque después se toque un gasto."""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import ROUND_HALF_UP, Decimal

from dateutil.relativedelta import relativedelta
from fastapi import BackgroundTasks, HTTPException, status
from sqlalchemy.orm import Session, joinedload, selectinload

from app.platform.alquileres import recibos
from app.platform.alquileres.cobros import conflicto, email_configurado_o_409, siguiente_numero
from app.platform.alquileres.models import (
    Contrato,
    EstadoLiquidacion,
    Gasto,
    Liquidacion,
    Pago,
    RolParteContrato,
)
from app.platform.alquileres.schemas import (
    AnularLiquidacionIn,
    FiltroEstadoLiquidacion,
    GastoOut,
    LiquidacionEmitir,
    LiquidacionPreview,
    PagarLiquidacionIn,
    PagoOut,
)
from app.platform.alquileres.service import obtener_contrato
from app.platform.inmobiliaria.models import Inmobiliaria
from app.platform.inmobiliaria.service import obtener as obtener_inmobiliaria
from app.storage import guardar_archivo


def periodo_desde(texto: str) -> date:
    """`"2026-10"` → `date(2026, 10, 1)`. 422 si no tiene esa forma."""
    try:
        anio, mes = texto.split("-")
        return date(int(anio), int(mes), 1)
    except (ValueError, AttributeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="periodo debe ser YYYY-MM"
        ) from exc


def _redondear(valor: Decimal) -> Decimal:
    return valor.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _pendientes(contrato: Contrato, periodo: date) -> tuple[list[Pago], list[Gasto]]:
    """Pagos del mes no anulados y sin liquidar; gastos sin liquidar hasta fin de mes."""
    fin = periodo + relativedelta(months=1)
    pagos = [
        p
        for c in contrato.cobros
        for p in c.pagos
        if not p.anulado and p.liquidacion_id is None and periodo <= p.fecha_pago < fin
    ]
    gastos = [g for g in contrato.gastos if g.liquidacion_id is None and g.fecha < fin]
    return pagos, gastos


def calcular(db: Session, contrato: Contrato, periodo: date) -> LiquidacionPreview:
    pagos, gastos = _pendientes(contrato, periodo)
    total_cobrado = sum((p.monto for p in pagos), Decimal("0"))
    total_punitorios = sum((p.punitorio for p in pagos), Decimal("0"))
    honorarios_pct = contrato.honorarios_pct or Decimal("0")
    honorarios_monto = _redondear(total_cobrado * honorarios_pct / Decimal(100))
    total_gastos = sum((g.monto for g in gastos), Decimal("0"))
    return LiquidacionPreview(
        periodo=periodo,
        pagos=[PagoOut.model_validate(p) for p in pagos],
        gastos=[GastoOut.model_validate(g) for g in gastos],
        total_cobrado=total_cobrado,
        total_punitorios=total_punitorios,
        honorarios_pct=honorarios_pct,
        honorarios_monto=honorarios_monto,
        total_gastos=total_gastos,
        # Los punitorios van íntegros al propietario (línea aparte en el PDF).
        total_a_transferir=total_cobrado + total_punitorios - honorarios_monto - total_gastos,
    )


def borrador_pdf(db: Session, contrato_id: int, periodo: date) -> bytes:
    """El mismo PDF que saldría al emitir, pero sin número y sin escribir nada:
    sirve para revisar el mes con el propietario antes de cerrarlo. Al no pasar
    por `siguiente_numero` no consume numeración."""
    contrato = obtener_contrato(db, contrato_id)
    pagos, gastos = _pendientes(contrato, periodo)
    if not pagos and not gastos:
        raise conflicto("No hay nada que liquidar en ese período")
    preview = calcular(db, contrato, periodo)
    datos = recibos.DatosLiquidacion(
        contrato=contrato,
        periodo=periodo,
        fecha=date.today(),
        numero=None,
        pagos=pagos,
        gastos=gastos,
        total_cobrado=preview.total_cobrado,
        total_punitorios=preview.total_punitorios,
        honorarios_pct=preview.honorarios_pct,
        honorarios_monto=preview.honorarios_monto,
        total_gastos=preview.total_gastos,
        total_a_transferir=preview.total_a_transferir,
        notas=None,
    )
    return recibos.liquidacion_pdf(datos, obtener_inmobiliaria(db))


def obtener(db: Session, contrato_id: int, liq_id: int) -> Liquidacion:
    liq = db.get(Liquidacion, liq_id)
    if liq is None or liq.contrato_id != contrato_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Liquidación no encontrada"
        )
    return liq


def listar_de_contrato(db: Session, contrato_id: int) -> list[Liquidacion]:
    # Se consulta aparte y no con `contrato.liquidaciones`: la relación no deja
    # precargar los pagos y gastos de cada una, que `LiquidacionDetalle` serializa.
    obtener_contrato(db, contrato_id)
    return (
        db.query(Liquidacion)
        .filter(Liquidacion.contrato_id == contrato_id)
        .options(
            selectinload(Liquidacion.pagos).options(
                joinedload(Pago.cobro), joinedload(Pago.registrado_por)
            ),
            selectinload(Liquidacion.gastos),
        )
        .order_by(Liquidacion.periodo.desc())
        .all()
    )


def listar(
    db: Session,
    *,
    estado: FiltroEstadoLiquidacion | None = None,
    periodo: date | None = None,
    contrato_id: int | None = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[int, list[Liquidacion]]:
    """Liquidaciones de todos los contratos, las más recientes primero. Sin filtro
    de estado salen también las anuladas, que quedan como historial."""
    consulta = db.query(Liquidacion)
    if estado == "anulada":
        consulta = consulta.filter(Liquidacion.anulada_at.is_not(None))
    elif estado is not None:
        # Una anulada conserva su `estado`, así que hay que excluirla a mano.
        consulta = consulta.filter(
            Liquidacion.estado == EstadoLiquidacion(estado), Liquidacion.anulada_at.is_(None)
        )
    if periodo is not None:
        consulta = consulta.filter(Liquidacion.periodo == periodo)
    if contrato_id is not None:
        consulta = consulta.filter(Liquidacion.contrato_id == contrato_id)
    total = consulta.count()
    items = (
        consulta.options(joinedload(Liquidacion.contrato).joinedload(Contrato.propiedad))
        .order_by(Liquidacion.periodo.desc(), Liquidacion.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return total, items


def emitir(db: Session, contrato_id: int, datos: LiquidacionEmitir, user_id: int) -> Liquidacion:
    inmobiliaria = obtener_inmobiliaria(db)
    contrato = obtener_contrato(db, contrato_id)
    periodo = periodo_desde(datos.periodo)
    if any(liq.periodo == periodo and not liq.anulada for liq in contrato.liquidaciones):
        raise conflicto("Ya existe una liquidación para ese período")
    pagos, gastos = _pendientes(contrato, periodo)
    if not pagos and not gastos:
        raise conflicto("No hay nada que liquidar en ese período")

    preview = calcular(db, contrato, periodo)
    liq = Liquidacion(
        contrato_id=contrato.id,
        periodo=periodo,
        numero=siguiente_numero(db, Inmobiliaria.ultima_liquidacion),
        total_cobrado=preview.total_cobrado,
        total_punitorios=preview.total_punitorios,
        honorarios_pct=preview.honorarios_pct,
        honorarios_monto=preview.honorarios_monto,
        total_gastos=preview.total_gastos,
        total_a_transferir=preview.total_a_transferir,
        notas=datos.notas,
        created_by_user_id=user_id,
    )
    db.add(liq)
    db.flush()
    for pago in pagos:
        pago.liquidacion_id = liq.id
    for gasto in gastos:
        gasto.liquidacion_id = liq.id
    db.flush()
    db.refresh(liq)

    try:
        contenido = recibos.generar_liquidacion_pdf(liq, inmobiliaria)
        guardado = guardar_archivo(contenido, f"liquidaciones/{contrato_id}/{liq.numero}.pdf")
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo generar el comprobante; la liquidación no se emitió",
        ) from exc
    liq.comprobante_pdf_url = guardado.url
    liq.comprobante_pdf_key = guardado.clave
    db.commit()
    db.refresh(liq)
    return liq


def pagar(db: Session, contrato_id: int, liq_id: int, datos: PagarLiquidacionIn) -> Liquidacion:
    liq = obtener(db, contrato_id, liq_id)
    if liq.anulada:
        raise conflicto("La liquidación está anulada")
    if liq.estado == EstadoLiquidacion.pagada:
        raise conflicto("La liquidación ya está pagada")
    liq.estado = EstadoLiquidacion.pagada
    liq.fecha_pago = datos.fecha_pago
    db.commit()
    db.refresh(liq)
    return liq


def anular(db: Session, contrato_id: int, liq_id: int, datos: AnularLiquidacionIn) -> Liquidacion:
    """Deshace una liquidación emitida por error. La fila se conserva —el número
    queda quemado y el PDF puede haberse enviado ya— pero sus pagos y gastos
    vuelven a quedar pendientes, y el período se libera para volver a emitirlo.

    Una liquidación ya pagada no se anula: la plata salió, y anularla dejaría los
    pagos disponibles para una segunda liquidación del mismo dinero.
    """
    liq = obtener(db, contrato_id, liq_id)
    if liq.anulada:
        raise conflicto("La liquidación ya está anulada")
    if liq.estado == EstadoLiquidacion.pagada:
        raise conflicto("La liquidación ya fue pagada al propietario; no se puede anular")
    liq.anulada_at = datetime.now(UTC)
    liq.motivo_anulacion = datos.motivo
    for pago in list(liq.pagos):
        pago.liquidacion_id = None
    for gasto in list(liq.gastos):
        gasto.liquidacion_id = None
    db.commit()
    db.refresh(liq)
    return liq


def enviar(
    db: Session, contrato_id: int, liq_id: int, email: str | None, background: BackgroundTasks
) -> Liquidacion:
    """Igual que `cobros.enviar_recibo`, al propietario."""
    email_configurado_o_409()
    liq = obtener(db, contrato_id, liq_id)
    if liq.anulada:
        raise conflicto("La liquidación está anulada")
    if not liq.comprobante_pdf_key:
        raise conflicto("La liquidación no tiene comprobante generado")
    destinatario = email or recibos.email_de_parte(liq.contrato, RolParteContrato.propietario)
    if not destinatario:
        raise conflicto("El propietario no tiene email cargado; indicá uno")

    inmobiliaria = obtener_inmobiliaria(db)
    background.add_task(
        recibos.enviar_y_marcar,
        Liquidacion,
        liq.id,
        destinatario,
        recibos.asunto_liquidacion(liq),
        recibos.texto_liquidacion(liq, inmobiliaria),
        liq.comprobante_pdf_key,
        f"liquidacion-{liq.numero_formateado}.pdf",
    )
    return liq
