"""Recordatorios: qué hay que atender en los próximos N días.

Nada se persiste. La bandeja se arma en cada request sobre las consultas del
2a/2b: cobros con saldo (vencidos y por vencer), ajustes pendientes y contratos
que terminan. Lo atrasado entra siempre; `dias` acota solo lo futuro.

`enviar` manda la misma bandeja por email al staff, sincrónico: quien llama es
un cron que necesita saber si salió.
"""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import HTTPException, status
from sqlalchemy import and_
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.email import EmailNoEnviado, enviar_email
from app.formato import formato_moneda, nombre_periodo
from app.platform.alquileres import cobros as cobros_service
from app.platform.alquileres import recibos
from app.platform.alquileres.models import (
    Ajuste,
    Cobro,
    Contrato,
    ContratoParte,
    EstadoAjuste,
    EstadoContrato,
    IndiceAjuste,
    RolParteContrato,
)
from app.platform.alquileres.schemas import (
    EnvioRecordatorios,
    ParteOut,
    Recordatorio,
    Recordatorios,
    TipoRecordatorio,
)
from app.platform.auth.models import Role, User, UserRole
from app.platform.inmobiliaria.models import Inmobiliaria
from app.platform.inmobiliaria.service import obtener as obtener_inmobiliaria

ETIQUETA_INDICE: dict[IndiceAjuste, str] = {
    IndiceAjuste.icl: "ICL",
    IndiceAjuste.ipc: "IPC",
    IndiceAjuste.uva: "UVA",
    IndiceAjuste.casa_propia: "Casa Propia",
    IndiceAjuste.porcentaje_fijo: "Porcentaje fijo",
    IndiceAjuste.sin_ajuste: "Sin ajuste",
}


def _con_contrato(relacion):
    """Opciones de carga para traer propiedad, partes y ajustes del contrato en la
    misma consulta: la bandeja muestra propiedad e inquilinos en cada fila y el
    monto vigente sale de los ajustes."""
    return (
        selectinload(relacion).joinedload(Contrato.propiedad),
        selectinload(relacion).selectinload(Contrato.partes).joinedload(ContratoParte.person),
        selectinload(relacion).selectinload(Contrato.ajustes),
    )


def _inquilinos(contrato: Contrato) -> list[ParteOut]:
    return [
        ParteOut.model_validate(p) for p in contrato.partes if p.rol == RolParteContrato.inquilino
    ]


def _item(
    tipo: TipoRecordatorio,
    fecha: date,
    hoy: date,
    contrato: Contrato,
    referencia_id: int,
    monto,
    detalle: str,
) -> Recordatorio:
    return Recordatorio(
        tipo=tipo,
        fecha=fecha,
        dias=(fecha - hoy).days,
        contrato_id=contrato.id,
        referencia_id=referencia_id,
        propiedad=contrato.propiedad,
        inquilinos=_inquilinos(contrato),
        moneda=contrato.moneda,
        monto=monto,
        detalle=detalle,
    )


def _cobros_por_vencer(db: Session, hoy: date, dias: int) -> list[Cobro]:
    return (
        db.query(Cobro)
        .join(Cobro.contrato)
        .filter(
            Contrato.estado == EstadoContrato.vigente,
            Cobro.estado.in_(cobros_service.CON_SALDO),
            Cobro.fecha_vencimiento.between(hoy, hoy + timedelta(days=dias)),
        )
        .options(selectinload(Cobro.pagos), *_con_contrato(Cobro.contrato))
        .all()
    )


def _ajustes_pendientes(db: Session, hoy: date, dias: int) -> list[Ajuste]:
    return (
        db.query(Ajuste)
        .join(Ajuste.contrato)
        .filter(
            Contrato.estado == EstadoContrato.vigente,
            Ajuste.estado == EstadoAjuste.pendiente,
            Ajuste.fecha_prevista <= hoy + timedelta(days=dias),
        )
        .options(*_con_contrato(Ajuste.contrato))
        .all()
    )


def _contratos_que_terminan(db: Session, hoy: date, dias: int) -> list[Contrato]:
    return (
        db.query(Contrato)
        .filter(
            and_(
                Contrato.estado == EstadoContrato.vigente,
                Contrato.fecha_fin <= hoy + timedelta(days=dias),
            )
        )
        .options(
            selectinload(Contrato.propiedad),
            selectinload(Contrato.partes).joinedload(ContratoParte.person),
            selectinload(Contrato.ajustes),
            selectinload(Contrato.renovacion),
        )
        .all()
    )


def listar(db: Session, hoy: date, dias: int) -> Recordatorios:
    """La bandeja completa, ordenada por fecha. Solo contratos vigentes."""
    items: list[Recordatorio] = []

    for cobro in cobros_service.cobros_vencidos(db, hoy):
        # `cobros_vencidos` no carga el contrato: se accede lazy (pocas filas).
        items.append(
            _item(
                TipoRecordatorio.cobro_vencido,
                cobro.fecha_vencimiento,
                hoy,
                cobro.contrato,
                cobro.id,
                cobro.saldo,
                nombre_periodo(cobro.periodo),
            )
        )
    for cobro in _cobros_por_vencer(db, hoy, dias):
        items.append(
            _item(
                TipoRecordatorio.cobro_por_vencer,
                cobro.fecha_vencimiento,
                hoy,
                cobro.contrato,
                cobro.id,
                cobro.saldo,
                nombre_periodo(cobro.periodo),
            )
        )
    for ajuste in _ajustes_pendientes(db, hoy, dias):
        contrato = ajuste.contrato
        items.append(
            _item(
                TipoRecordatorio.ajuste,
                ajuste.fecha_prevista,
                hoy,
                contrato,
                ajuste.id,
                contrato.monto_vigente,
                f"Ajuste {ETIQUETA_INDICE[contrato.indice]}",
            )
        )
    for contrato in _contratos_que_terminan(db, hoy, dias):
        detalle = "Termina el contrato"
        if contrato.renovacion is not None:
            detalle += " · renovado"
        items.append(
            _item(
                TipoRecordatorio.fin_contrato,
                contrato.fecha_fin,
                hoy,
                contrato,
                contrato.id,
                contrato.monto_vigente,
                detalle,
            )
        )

    items.sort(key=lambda i: (i.fecha, i.tipo, i.contrato_id))
    por_tipo = dict.fromkeys(TipoRecordatorio, 0)
    for item in items:
        por_tipo[item.tipo] += 1
    return Recordatorios(hoy=hoy, dias=dias, total=len(items), por_tipo=por_tipo, items=items)


# ---------------------------------------------------------------------------
# Email diario
# ---------------------------------------------------------------------------

ROLES_STAFF = ("staff", "admin")

_TITULO_GRUPO = {
    TipoRecordatorio.cobro_vencido: "COBROS VENCIDOS",
    TipoRecordatorio.cobro_por_vencer: "COBROS POR VENCER",
    TipoRecordatorio.ajuste: "AJUSTES",
    TipoRecordatorio.fin_contrato: "CONTRATOS QUE TERMINAN",
}


def destinatarios_staff(db: Session) -> list[str]:
    """Emails de los usuarios activos, no eliminados, con rol staff o admin."""
    filas = (
        db.query(User.email)
        .join(User.user_roles)
        .join(UserRole.role)
        .filter(
            User.is_active.is_(True),
            User.deleted_at.is_(None),
            Role.name.in_(ROLES_STAFF),
        )
        .distinct()
        .order_by(User.email)
        .all()
    )
    return [f[0] for f in filas]


def _en_dias(dias: int, futuro: str = "en", pasado: str = "hace") -> str:
    if dias == 0:
        return "hoy"
    if dias == 1:
        return "mañana"
    if dias < 0:
        return f"{pasado} {-dias} día{'' if dias == -1 else 's'}"
    return f"{futuro} {dias} días"


def _nombres(item: Recordatorio) -> str:
    return " y ".join(p.full_name for p in item.inquilinos)


def _linea(item: Recordatorio) -> str:
    fecha = item.fecha.strftime("%d/%m")
    monto = formato_moneda(item.monto, item.moneda) if item.monto is not None else ""
    if item.tipo == TipoRecordatorio.cobro_vencido:
        return (
            f"- {item.propiedad.titulo} · {_nombres(item)} · {item.detalle} · saldo {monto}"
            f" · vencido {_en_dias(item.dias)}"
        )
    if item.tipo == TipoRecordatorio.cobro_por_vencer:
        return (
            f"- {item.propiedad.titulo} · {_nombres(item)} · {item.detalle} · {monto}"
            f" · vence {_en_dias(item.dias)} ({fecha})"
        )
    if item.tipo == TipoRecordatorio.ajuste:
        return (
            f"- {item.propiedad.titulo} · {item.detalle} · previsto {fecha}"
            f" ({_en_dias(item.dias, pasado='atrasado')}) · monto actual {monto}"
        )
    return f"- {item.propiedad.titulo} · {_nombres(item)} · termina {fecha} ({_en_dias(item.dias)})"


def asunto_email(r: Recordatorios, inmobiliaria: Inmobiliaria) -> str:
    return (
        f"Recordatorios {inmobiliaria.nombre} · {r.hoy.strftime('%d/%m/%Y')} · {r.total} pendientes"
    )


def texto_email(r: Recordatorios, inmobiliaria: Inmobiliaria) -> str:
    lineas = [
        "Hola,",
        f"Esto es lo que hay que atender en los próximos {r.dias} días ({r.total} ítems).",
        "",
    ]
    for tipo in TipoRecordatorio:
        del_tipo = [i for i in r.items if i.tipo == tipo]
        if not del_tipo:
            continue
        lineas.append(f"{_TITULO_GRUPO[tipo]} ({len(del_tipo)})")
        lineas.extend(_linea(i) for i in del_tipo)
        lineas.append("")
    # El primer origen de CORS es el frontend en producción; en dev no hay ninguno.
    origenes = get_settings().cors_origins_lista
    if origenes:
        lineas.append(f"Panel: {origenes[0]}/admin/alquileres/recordatorios")
    lineas.append(recibos.firma(inmobiliaria))
    return "\n".join(lineas)


def enviar(db: Session) -> EnvioRecordatorios:
    """Manda la bandeja al staff. Sincrónico: el cron necesita saber si salió.

    Bandeja vacía → no se manda nada: un email diario que dice "nada" se deja de
    leer a la semana.
    """
    cobros_service.email_configurado_o_409()
    inmobiliaria = obtener_inmobiliaria(db)
    bandeja = listar(db, date.today(), inmobiliaria.dias_aviso_recordatorios)
    if bandeja.total == 0:
        return EnvioRecordatorios(enviado_a=[], items=0)

    destinatarios = destinatarios_staff(db)
    if not destinatarios:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="No hay usuarios staff con email"
        )
    try:
        enviar_email(
            ", ".join(destinatarios),
            asunto_email(bandeja, inmobiliaria),
            texto_email(bandeja, inmobiliaria),
        )
    except EmailNoEnviado as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"No se pudo enviar el email: {exc}",
        ) from exc
    return EnvioRecordatorios(enviado_a=destinatarios, items=bandeja.total)
