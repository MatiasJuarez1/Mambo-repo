"""Cobros esperados y pagos de contratos administrados.

Los cobros se **materializan** al crear el contrato (una fila por mes), igual
que los ajustes: no hay cron en Render free, y así "vencidos" y "vencen esta
semana" son SQL directo y cada período es editable. `estado` solo refleja
pagos; el atraso se deriva de `fecha_vencimiento` en la consulta.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from dateutil.relativedelta import relativedelta
from fastapi import BackgroundTasks, HTTPException, status
from sqlalchemy import and_, func, or_, update
from sqlalchemy.orm import Session, contains_eager, selectinload

from app.config import get_settings
from app.modules.propiedades.models import Propiedad
from app.platform.alquileres import recibos
from app.platform.alquileres.models import (
    Ajuste,
    Cobro,
    Contrato,
    ContratoParte,
    EstadoCobro,
    EstadoContrato,
    Pago,
    RolParteContrato,
)
from app.platform.alquileres.schemas import (
    AnularIn,
    CobroActualizar,
    FiltroEstadoCobro,
    PagoCrear,
    PunitorioSugerido,
    Resumen,
)
from app.platform.auth.models import User
from app.platform.inmobiliaria.models import Inmobiliaria
from app.platform.inmobiliaria.service import ID_UNICO
from app.platform.inmobiliaria.service import obtener as obtener_inmobiliaria
from app.platform.people.models import Person
from app.storage import guardar_archivo


def conflicto(detalle: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detalle)


# ---------------------------------------------------------------------------
# Generación
# ---------------------------------------------------------------------------


def periodos(fecha_inicio: date, fecha_fin: date) -> list[date]:
    """Primer día de cada mes entre inicio y fin, ambos incluidos."""
    periodo = fecha_inicio.replace(day=1)
    salida: list[date] = []
    while periodo <= fecha_fin:
        salida.append(periodo)
        periodo += relativedelta(months=1)
    return salida


def _vencimiento(periodo: date, dia: int, fecha_inicio: date) -> date:
    """Día `dia` del mes; en el primer mes, nunca antes del inicio del contrato."""
    return max(periodo.replace(day=dia), fecha_inicio)


def generar_cobros(contrato: Contrato) -> list[Cobro]:
    """Un cobro `pendiente` por mes con el monto vigente a ese período. Pura."""
    if not contrato.administrado:
        return []
    return [
        Cobro(
            periodo=p,
            fecha_vencimiento=_vencimiento(p, contrato.dia_vencimiento, contrato.fecha_inicio),
            monto=contrato.monto_vigente_a(p),
        )
        for p in periodos(contrato.fecha_inicio, contrato.fecha_fin)
    ]


def _regenerable(cobro: Cobro) -> bool:
    """Se puede borrar y rehacer: pendiente y sin ningún pago (ni siquiera anulado,
    porque borrarlo se llevaría el recibo)."""
    return cobro.estado == EstadoCobro.pendiente and not cobro.pagos


_CAMPOS_COBROS = {"fecha_inicio", "fecha_fin", "dia_vencimiento"}


def sincronizar_cobros(
    db: Session, contrato: Contrato, cambios: set[str], era_administrado: bool
) -> None:
    """Después de un PATCH: genera, borra o regenera los cobros según qué cambió.

    No commitea: corre dentro de `actualizar_contrato`. Las validaciones (409)
    van antes de tocar nada, así el rollback del caller no tiene nada que deshacer.
    """
    if not contrato.administrado:
        if era_administrado:
            if any(c.tiene_pagos for c in contrato.cobros):
                raise conflicto(
                    "El contrato tiene cobros registrados; no puede dejar de ser administrado"
                )
            for cobro in list(contrato.cobros):
                db.delete(cobro)
        return

    if not era_administrado:
        contrato.cobros = generar_cobros(contrato)
        return

    if not cambios & _CAMPOS_COBROS:
        return

    ultimo_periodo = contrato.fecha_fin.replace(day=1)
    if any(c.tiene_pagos and c.periodo > ultimo_periodo for c in contrato.cobros):
        raise conflicto("Hay períodos con pagos fuera del nuevo plazo del contrato")

    for cobro in list(contrato.cobros):
        if _regenerable(cobro):
            db.delete(cobro)
    db.flush()
    db.expire(contrato, ["cobros"])
    existentes = {c.periodo for c in contrato.cobros}
    contrato.cobros.extend(c for c in generar_cobros(contrato) if c.periodo not in existentes)


def reflejar_ajuste(contrato: Contrato, ajuste: Ajuste) -> int:
    """Pone `monto_nuevo` en los cobros desde el período del ajuste que no tengan
    pagos. Devuelve cuántos quedaron sin tocar (para avisar en el panel)."""
    sin_tocar = 0
    for cobro in contrato.cobros:
        if cobro.periodo < ajuste.fecha_prevista or cobro.estado == EstadoCobro.anulado:
            continue
        if cobro.pagos:
            sin_tocar += 1
            continue
        cobro.monto = ajuste.monto_nuevo
    return sin_tocar


def anular_posteriores(contrato: Contrato, corte: date, nota: str) -> None:
    """Al terminar el contrato: los meses posteriores al de corte, sin pagos, se anulan.
    El mes de corte queda pendiente por si hay que prorratearlo a mano."""
    mes_corte = corte.replace(day=1)
    for cobro in contrato.cobros:
        if cobro.periodo > mes_corte and _regenerable(cobro):
            cobro.estado = EstadoCobro.anulado
            cobro.notas = nota


# ---------------------------------------------------------------------------
# Cobros: lectura y edición
# ---------------------------------------------------------------------------


def obtener_cobro(db: Session, contrato_id: int, cobro_id: int) -> Cobro:
    cobro = db.get(Cobro, cobro_id)
    if cobro is None or cobro.contrato_id != contrato_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cobro no encontrado")
    return cobro


def actualizar_cobro(db: Session, contrato_id: int, cobro_id: int, datos: CobroActualizar) -> Cobro:
    cobro = obtener_cobro(db, contrato_id, cobro_id)
    if cobro.estado == EstadoCobro.anulado:
        raise conflicto("El cobro está anulado")
    cambios = datos.model_dump(exclude_unset=True)
    if cambios.keys() & {"monto", "fecha_vencimiento"} and cobro.tiene_pagos:
        raise conflicto("El cobro tiene pagos; no se puede cambiar el monto ni el vencimiento")
    for campo, valor in cambios.items():
        setattr(cobro, campo, valor)
    db.commit()
    db.refresh(cobro)
    return cobro


def anular_cobro(db: Session, contrato_id: int, cobro_id: int, datos: AnularIn) -> Cobro:
    """Un mes que no se cobra (bonificado, etc.). No se des-anula en esta versión."""
    cobro = obtener_cobro(db, contrato_id, cobro_id)
    if cobro.estado == EstadoCobro.anulado:
        raise conflicto("El cobro ya está anulado")
    if cobro.tiene_pagos:
        raise conflicto("El cobro tiene pagos; anulalos primero")
    cobro.estado = EstadoCobro.anulado
    cobro.notas = datos.motivo
    db.commit()
    db.refresh(cobro)
    return cobro


# ---------------------------------------------------------------------------
# Punitorio
# ---------------------------------------------------------------------------


def calcular_punitorio(
    cobro: Cobro, fecha_pago: date, inmobiliaria: Inmobiliaria
) -> PunitorioSugerido:
    """`saldo × pct/100 × días de atraso` (descontando la gracia). Es una sugerencia:
    el staff puede cambiarla al registrar."""
    pct = cobro.contrato.punitorio_diario_pct
    if pct is None:
        pct = inmobiliaria.punitorio_diario_pct or Decimal("0")
    dias = max(0, (fecha_pago - cobro.fecha_vencimiento).days - inmobiliaria.dias_gracia)
    monto = (cobro.saldo * pct / Decimal(100) * dias).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    return PunitorioSugerido(monto=monto, dias_atraso=dias, pct=pct)


# ---------------------------------------------------------------------------
# Numeración
# ---------------------------------------------------------------------------


def siguiente_numero(db: Session, columna) -> int:
    """`UPDATE inmobiliaria SET col = col + 1 RETURNING col`, dentro de la transacción
    actual. Postgres serializa los updates sobre la misma fila: dos pagos simultáneos
    reciben números distintos y consecutivos. Si la transacción hace rollback, el
    contador vuelve atrás y el número no se pierde."""
    stmt = (
        update(Inmobiliaria)
        .where(Inmobiliaria.id == ID_UNICO)
        .values({columna.key: columna + 1})
        .returning(columna)
    )
    numero = db.execute(stmt).scalar_one()
    db.expire(db.get(Inmobiliaria, ID_UNICO), [columna.key])
    return numero


# ---------------------------------------------------------------------------
# Pagos
# ---------------------------------------------------------------------------


def _recalcular_estado(cobro: Cobro) -> None:
    if cobro.estado == EstadoCobro.anulado:
        return
    if cobro.saldo <= 0:
        cobro.estado = EstadoCobro.pagado
    elif cobro.tiene_pagos:
        cobro.estado = EstadoCobro.parcial
    else:
        cobro.estado = EstadoCobro.pendiente


def registrar_pago(
    db: Session, contrato_id: int, cobro_id: int, datos: PagoCrear, user_id: int
) -> Cobro:
    """Pago total o parcial con su recibo. Pago, número y PDF van en una transacción:
    si la subida falla, no queda pago ni se consume el número."""
    inmobiliaria = obtener_inmobiliaria(db)  # crea la fila si falta; commitea antes de empezar
    cobro = obtener_cobro(db, contrato_id, cobro_id)
    if cobro.contrato.estado != EstadoContrato.vigente:
        raise conflicto("El contrato no está vigente")
    if cobro.estado in (EstadoCobro.pagado, EstadoCobro.anulado):
        raise conflicto("El cobro ya está pagado o anulado")
    if datos.monto > cobro.saldo:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El monto supera el saldo del período",
        )

    punitorio = datos.punitorio
    if punitorio is None:
        punitorio = calcular_punitorio(cobro, datos.fecha_pago, inmobiliaria).monto

    pago = Pago(
        fecha_pago=datos.fecha_pago,
        monto=datos.monto,
        punitorio=punitorio,
        medio=datos.medio,
        referencia=datos.referencia,
        notas=datos.notas,
        registrado_por_user_id=user_id,
        recibo_numero=siguiente_numero(db, Inmobiliaria.ultimo_recibo),
    )
    cobro.pagos.append(pago)
    _recalcular_estado(cobro)
    db.flush()

    usuario = db.get(User, user_id)
    try:
        contenido = recibos.generar_recibo_pdf(pago, inmobiliaria, usuario.name if usuario else "")
        guardado = guardar_archivo(contenido, f"recibos/{contrato_id}/{pago.recibo_numero}.pdf")
    except Exception as exc:  # noqa: BLE001 — cualquier falla deshace el pago entero
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo generar el recibo; el pago no se registró",
        ) from exc
    pago.recibo_pdf_url = guardado.url
    pago.recibo_pdf_key = guardado.clave
    db.commit()
    db.refresh(cobro)
    return cobro


def anular_pago(
    db: Session, contrato_id: int, cobro_id: int, pago_id: int, datos: AnularIn
) -> Cobro:
    cobro = obtener_cobro(db, contrato_id, cobro_id)
    pago = _pago_de(cobro, pago_id)
    if pago.anulado:
        raise conflicto("El pago ya está anulado")
    if pago.liquidacion_id is not None:
        raise conflicto(f"El pago está en la liquidación N° {pago.liquidacion.numero_formateado}")
    pago.anulado_at = datetime.now(UTC)
    pago.motivo_anulacion = datos.motivo
    _recalcular_estado(cobro)
    db.commit()
    db.refresh(cobro)
    return cobro


# ---------------------------------------------------------------------------
# Envío del recibo
# ---------------------------------------------------------------------------


def _pago_de(cobro: Cobro, pago_id: int) -> Pago:
    pago = next((p for p in cobro.pagos if p.id == pago_id), None)
    if pago is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pago no encontrado")
    return pago


def email_configurado_o_409() -> None:
    """El panel deshabilita el botón con `inmobiliaria.email_configurado`; esto cubre
    el caso de que lo llamen igual."""
    if not get_settings().email_configurado:
        raise conflicto("Email no configurado: definir SMTP_* en el servidor")


def enviar_recibo(
    db: Session,
    contrato_id: int,
    cobro_id: int,
    pago_id: int,
    email: str | None,
    background: BackgroundTasks,
) -> Pago:
    """Encola el envío del recibo y devuelve el pago sin esperar.

    Las validaciones (409) van acá, en la request; el envío en sí corre en
    `recibos.enviar_y_marcar` después de la respuesta, con su propia sesión.
    Si falla, queda en el log y `enviado_email_at` sigue en null para reintentar.
    """
    email_configurado_o_409()
    cobro = obtener_cobro(db, contrato_id, cobro_id)
    pago = _pago_de(cobro, pago_id)
    if pago.anulado:
        raise conflicto("El pago está anulado")
    if not pago.recibo_pdf_key:
        raise conflicto("El pago no tiene recibo generado")
    destinatario = email or recibos.email_de_parte(cobro.contrato, RolParteContrato.inquilino)
    if not destinatario:
        raise conflicto("El inquilino no tiene email cargado; indicá uno")

    inmobiliaria = obtener_inmobiliaria(db)
    background.add_task(
        recibos.enviar_y_marcar,
        Pago,
        pago.id,
        destinatario,
        recibos.asunto_recibo(pago),
        recibos.texto_recibo(pago, inmobiliaria),
        pago.recibo_pdf_key,
        f"recibo-{pago.recibo_numero_formateado}.pdf",
    )
    return pago


# ---------------------------------------------------------------------------
# Listado transversal y resumen
# ---------------------------------------------------------------------------

# Estados con saldo por cobrar. Lo comparte `recordatorios.py`.
CON_SALDO = (EstadoCobro.pendiente, EstadoCobro.parcial)
_CON_SALDO = CON_SALDO


def listar_cobros(
    db: Session,
    *,
    estado: FiltroEstadoCobro | None = None,
    vence_en_dias: int | None = None,
    contrato_id: int | None = None,
    property_id: int | None = None,
    q: str | None = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[int, list[Cobro]]:
    """Cobros de contratos vigentes (o de un contrato dado, en cualquier estado),
    ordenados por vencimiento. `vencido` es virtual: pendiente/parcial y ya vencido."""
    hoy = date.today()
    consulta = db.query(Cobro).join(Cobro.contrato)

    if contrato_id is not None:
        consulta = consulta.filter(Cobro.contrato_id == contrato_id)
    else:
        consulta = consulta.filter(Contrato.estado == EstadoContrato.vigente)
    if property_id is not None:
        consulta = consulta.filter(Contrato.property_id == property_id)
    if estado == "vencido":
        consulta = consulta.filter(Cobro.estado.in_(_CON_SALDO), Cobro.fecha_vencimiento < hoy)
    elif estado is not None:
        consulta = consulta.filter(Cobro.estado == EstadoCobro(estado))
    if vence_en_dias is not None:
        consulta = consulta.filter(
            Cobro.estado.in_(_CON_SALDO),
            Cobro.fecha_vencimiento.between(hoy, hoy + timedelta(days=vence_en_dias)),
        )
    if q and q.strip():
        patron = f"%{q.strip()}%"
        nombre_completo = Person.first_name + " " + Person.last_name
        consulta = consulta.filter(
            or_(
                Contrato.propiedad.has(Propiedad.titulo.ilike(patron)),
                Contrato.partes.any(
                    and_(
                        ContratoParte.rol == RolParteContrato.inquilino,
                        ContratoParte.person.has(nombre_completo.ilike(patron)),
                    )
                ),
            )
        )

    total = consulta.count()
    items = (
        consulta.options(
            # El join ya está: se reutiliza para el contrato y de ahí se cuelga lo
            # que muestra cada fila, así una página de 50 no dispara 150 queries.
            contains_eager(Cobro.contrato).joinedload(Contrato.propiedad),
            contains_eager(Cobro.contrato)
            .selectinload(Contrato.partes)
            .joinedload(ContratoParte.person),
            selectinload(Cobro.pagos),
        )
        .order_by(Cobro.fecha_vencimiento.asc(), Cobro.id.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return total, items


def criterio_sin_liquidar(hoy: date):
    """Contrato vigente y administrado con pagos válidos, no liquidados, de meses
    anteriores al actual. Lo comparten el filtro `sin_liquidar` de la lista de
    contratos y el tile del dashboard, para que cuenten lo mismo."""
    inicio_mes = hoy.replace(day=1)
    return and_(
        Contrato.estado == EstadoContrato.vigente,
        Contrato.administrado.is_(True),
        Contrato.cobros.any(
            Cobro.pagos.any(
                and_(
                    Pago.anulado_at.is_(None),
                    Pago.liquidacion_id.is_(None),
                    Pago.fecha_pago < inicio_mes,
                )
            )
        ),
    )


def cobros_vencidos(db: Session, hoy: date) -> list[Cobro]:
    """Todos los vencidos de contratos vigentes, con sus pagos cargados para sumar saldos."""
    return (
        db.query(Cobro)
        .join(Cobro.contrato)
        .filter(
            Contrato.estado == EstadoContrato.vigente,
            Cobro.estado.in_(_CON_SALDO),
            Cobro.fecha_vencimiento < hoy,
        )
        .options(selectinload(Cobro.pagos))
        .all()
    )


def _decimal(valor) -> Decimal:
    """SQLite devuelve float en los SUM sobre Numeric; Postgres, Decimal. Unifica."""
    return Decimal(str(valor or 0)).quantize(Decimal("0.01"))


def resumen(db: Session, periodo: date | None = None) -> Resumen:
    """Los números del dashboard. `esperado` y `cobrado` son del mes pedido (default:
    el actual); vencidos, morosos y liquidaciones pendientes son del momento."""
    hoy = date.today()
    periodo = periodo or hoy.replace(day=1)
    fin = periodo + relativedelta(months=1)

    esperado = (
        db.query(func.sum(Cobro.monto))
        .filter(Cobro.periodo == periodo, Cobro.estado != EstadoCobro.anulado)
        .scalar()
    )
    cobrado = (
        db.query(func.sum(Pago.monto))
        .filter(Pago.anulado_at.is_(None), Pago.fecha_pago >= periodo, Pago.fecha_pago < fin)
        .scalar()
    )

    vencidos = cobros_vencidos(db, hoy)
    por_contrato: dict[int, list[Cobro]] = defaultdict(list)
    for cobro in vencidos:
        por_contrato[cobro.contrato_id].append(cobro)
    morosos = sum(
        1
        for lista in por_contrato.values()
        if len(lista) >= 2 or any(c.dias_atraso > 30 for c in lista)
    )
    sin_emitir = db.query(Contrato).filter(criterio_sin_liquidar(hoy)).count()

    return Resumen(
        periodo=periodo,
        esperado=_decimal(esperado),
        cobrado=_decimal(cobrado),
        vencidos_cantidad=len(vencidos),
        vencido_monto=sum((c.saldo for c in vencidos), Decimal("0")),
        morosos=morosos,
        liquidaciones_sin_emitir=sin_emitir,
    )
