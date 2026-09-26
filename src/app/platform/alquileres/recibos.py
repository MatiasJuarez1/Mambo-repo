"""Recibos: numeración, textos, PDF, WhatsApp y envío en segundo plano.

Sin lógica de base: recibe objetos ya cargados y devuelve bytes o strings.
Lo único que toca I/O es `cargar_logo` (lee del storage) y `enviar_y_marcar`
(el `BackgroundTask`, con su propia sesión).
"""

from __future__ import annotations

import logging
import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
from urllib.parse import quote

from app.database import SessionLocal
from app.email import Adjunto, enviar_email
from app.formato import formato_moneda, monto_en_letras, nombre_periodo
from app.pdf import DocumentoMambo
from app.platform.alquileres.models import (
    Contrato,
    Gasto,
    Liquidacion,
    Pago,
    RolParteContrato,
)
from app.platform.inmobiliaria.models import Inmobiliaria
from app.platform.people.models import Person
from app.storage import leer_archivo

logger = logging.getLogger(__name__)

# Punto de venta fijo: hoy no significa nada, pero si algún día entra ARCA el
# número ya tiene la forma que pide y no hay que renumerar.
PUNTO_DE_VENTA = "0001"


def numero_formateado(numero: int) -> str:
    return f"{PUNTO_DE_VENTA}-{numero:08d}"


# ---------------------------------------------------------------------------
# Datos de las partes
# ---------------------------------------------------------------------------


def partes_con_rol(contrato: Contrato, rol: RolParteContrato) -> list[Person]:
    return [p.person for p in contrato.partes if p.rol == rol]


def nombres(personas: list[Person]) -> str:
    return " y ".join(p.full_name for p in personas)


def _contacto(person: Person, tipos: tuple[str, ...]) -> str | None:
    """El contacto primario del tipo pedido; si no hay primario, el primero."""
    candidatos = [c for c in person.contacts if c.type in tipos]
    if not candidatos:
        return None
    primarios = [c for c in candidatos if c.is_primary]
    return (primarios or candidatos)[0].value


def email_de(person: Person) -> str | None:
    return _contacto(person, ("email",))


def email_de_parte(contrato: Contrato, rol: RolParteContrato) -> str | None:
    """Email de la primera persona con ese rol que tenga uno (el primario, si hay)."""
    return next((e for p in partes_con_rol(contrato, rol) if (e := email_de(p))), None)


def normalizar_telefono(valor: str) -> str:
    """Solo dígitos, con prefijo 54 si no lo trae (wa.me exige código de país)."""
    digitos = re.sub(r"\D", "", valor)
    return digitos if digitos.startswith("54") else f"54{digitos}"


def telefono_whatsapp(person: Person) -> str | None:
    valor = _contacto(person, ("whatsapp", "phone"))
    return normalizar_telefono(valor) if valor else None


def armar_whatsapp_url(telefono: str, texto: str) -> str:
    return f"https://wa.me/{telefono}?text={quote(texto)}"


def cargar_logo(inmobiliaria: Inmobiliaria) -> bytes | None:
    if not inmobiliaria.logo_storage_key:
        return None
    try:
        return leer_archivo(inmobiliaria.logo_storage_key)
    except Exception:  # noqa: BLE001 — sin logo el recibo sale igual
        logger.warning("No se pudo leer el logo %s", inmobiliaria.logo_storage_key)
        return None


def lineas_inmobiliaria(inmobiliaria: Inmobiliaria) -> list[str]:
    lineas = []
    if inmobiliaria.cuit:
        lineas.append(f"CUIT {inmobiliaria.cuit}")
    if inmobiliaria.direccion:
        lineas.append(inmobiliaria.direccion)
    contacto = " · ".join(x for x in (inmobiliaria.telefono, inmobiliaria.email) if x)
    if contacto:
        lineas.append(contacto)
    return lineas


def firma(inmobiliaria: Inmobiliaria) -> str:
    return " · ".join(
        x for x in (inmobiliaria.nombre, inmobiliaria.telefono, inmobiliaria.email) if x
    )


def _propiedad_texto(contrato: Contrato) -> str:
    prop = contrato.propiedad
    partes = [prop.titulo]
    if getattr(prop, "direccion", None):
        partes.append(prop.direccion)
    if getattr(prop, "ciudad", None):
        partes.append(prop.ciudad)
    return ", ".join(partes)


# ---------------------------------------------------------------------------
# Recibo
# ---------------------------------------------------------------------------


def asunto_recibo(pago: Pago) -> str:
    contrato = pago.cobro.contrato
    return (
        f"Recibo N° {numero_formateado(pago.recibo_numero)} · "
        f"{contrato.propiedad.titulo} · {nombre_periodo(pago.cobro.periodo)}"
    )


def texto_recibo(
    pago: Pago, inmobiliaria: Inmobiliaria | None = None, para_whatsapp: bool = False
) -> str:
    cobro = pago.cobro
    contrato = cobro.contrato
    inquilinos = partes_con_rol(contrato, RolParteContrato.inquilino)
    total = formato_moneda(pago.total, contrato.moneda)
    lineas = [
        f"Hola {inquilinos[0].first_name if inquilinos else ''},".replace(" ,", ","),
        f"Te enviamos el recibo N° {numero_formateado(pago.recibo_numero)} por el alquiler de "
        f"{contrato.propiedad.titulo}, período {nombre_periodo(cobro.periodo)}: {total}.",
    ]
    if cobro.saldo > 0:
        lineas.append(
            f"Queda un saldo pendiente de {formato_moneda(cobro.saldo, contrato.moneda)}."
        )
    if para_whatsapp:
        lineas.append(f"Recibo en PDF: {pago.recibo_pdf_url}")
    else:
        lineas.append("Adjuntamos el recibo en PDF.")
    if inmobiliaria is not None:
        lineas.append(firma(inmobiliaria))
    return "\n".join(lineas)


def whatsapp_url_recibo(pago: Pago) -> str | None:
    inquilinos = partes_con_rol(pago.cobro.contrato, RolParteContrato.inquilino)
    telefono = next((t for p in inquilinos if (t := telefono_whatsapp(p))), None)
    if telefono is None:
        return None
    return armar_whatsapp_url(telefono, texto_recibo(pago, para_whatsapp=True))


def generar_recibo_pdf(pago: Pago, inmobiliaria: Inmobiliaria, registrado_por: str) -> bytes:
    cobro = pago.cobro
    contrato = cobro.contrato
    moneda = contrato.moneda
    periodo = nombre_periodo(cobro.periodo)

    doc = DocumentoMambo()
    doc.encabezado(
        inmobiliaria.nombre, lineas_inmobiliaria(inmobiliaria), cargar_logo(inmobiliaria)
    )
    doc.titulo("RECIBO", numero_formateado(pago.recibo_numero), pago.fecha_pago)

    inquilinos = partes_con_rol(contrato, RolParteContrato.inquilino)
    documentos = ", ".join(
        f"{p.document_type or 'DNI'} {p.document_number}" for p in inquilinos if p.document_number
    )
    doc.parrafo(
        f"Recibí de {nombres(inquilinos)}"
        + (f" ({documentos})" if documentos else "")
        + f" la suma de {formato_moneda(pago.total, moneda)} "
        f"({monto_en_letras(pago.total)}) en concepto de:"
    )
    doc.parrafo(f"Propiedad: {_propiedad_texto(contrato)}")

    filas = [[f"Alquiler período {periodo}", formato_moneda(pago.monto, moneda)]]
    if pago.punitorio > 0:
        dias = max(0, (pago.fecha_pago - cobro.fecha_vencimiento).days)
        filas.append(
            [f"Punitorio por {dias} días de atraso", formato_moneda(pago.punitorio, moneda)]
        )
    doc.tabla(["Concepto", "Monto"], filas, derecha=(1,))
    doc.total("Total", formato_moneda(pago.total, moneda))

    medio = {"efectivo": "Efectivo", "transferencia": "Transferencia", "otro": "Otro"}[pago.medio]
    detalle = f"Medio de pago: {medio}" + (f" · Ref. {pago.referencia}" if pago.referencia else "")
    doc.parrafo(detalle)
    if cobro.saldo > 0:
        doc.parrafo(f"Saldo pendiente del período: {formato_moneda(cobro.saldo, moneda)}")
    doc.parrafo(f"Registrado por {registrado_por}")
    doc.pie()
    return doc.bytes()


# ---------------------------------------------------------------------------
# Liquidación
# ---------------------------------------------------------------------------


def asunto_liquidacion(liq: Liquidacion) -> str:
    return f"Liquidación {nombre_periodo(liq.periodo)} · {liq.contrato.propiedad.titulo}"


def texto_liquidacion(
    liq: Liquidacion, inmobiliaria: Inmobiliaria | None = None, para_whatsapp: bool = False
) -> str:
    contrato = liq.contrato
    propietarios = partes_con_rol(contrato, RolParteContrato.propietario)
    lineas = [
        f"Hola {propietarios[0].first_name if propietarios else ''},".replace(" ,", ","),
        f"Te enviamos la liquidación N° {numero_formateado(liq.numero)} de "
        f"{contrato.propiedad.titulo}, período {nombre_periodo(liq.periodo)}. "
        f"Total a transferir: {formato_moneda(liq.total_a_transferir, contrato.moneda)}.",
    ]
    if para_whatsapp:
        lineas.append(f"Comprobante en PDF: {liq.comprobante_pdf_url}")
    else:
        lineas.append("Adjuntamos el comprobante en PDF.")
    if inmobiliaria is not None:
        lineas.append(firma(inmobiliaria))
    return "\n".join(lineas)


def whatsapp_url_liquidacion(liq: Liquidacion) -> str | None:
    propietarios = partes_con_rol(liq.contrato, RolParteContrato.propietario)
    telefono = next((t for p in propietarios if (t := telefono_whatsapp(p))), None)
    if telefono is None:
        return None
    return armar_whatsapp_url(telefono, texto_liquidacion(liq, para_whatsapp=True))


@dataclass(frozen=True)
class DatosLiquidacion:
    """Lo que el PDF necesita, desacoplado de la fila en la base: así el mismo
    layout sirve para una liquidación emitida y para el borrador de un período
    que todavía no se emitió. `numero` en None es lo que marca el borrador."""

    contrato: Contrato
    periodo: date
    fecha: date
    numero: str | None
    pagos: Sequence[Pago]
    gastos: Sequence[Gasto]
    total_cobrado: Decimal
    total_punitorios: Decimal
    honorarios_pct: Decimal
    honorarios_monto: Decimal
    total_gastos: Decimal
    total_a_transferir: Decimal
    notas: str | None


def datos_de_liquidacion(liq: Liquidacion) -> DatosLiquidacion:
    return DatosLiquidacion(
        contrato=liq.contrato,
        periodo=liq.periodo,
        fecha=liq.created_at.date(),
        numero=numero_formateado(liq.numero),
        pagos=liq.pagos,
        gastos=liq.gastos,
        total_cobrado=liq.total_cobrado,
        total_punitorios=liq.total_punitorios,
        honorarios_pct=liq.honorarios_pct,
        honorarios_monto=liq.honorarios_monto,
        total_gastos=liq.total_gastos,
        total_a_transferir=liq.total_a_transferir,
        notas=liq.notas,
    )


def liquidacion_pdf(datos: DatosLiquidacion, inmobiliaria: Inmobiliaria) -> bytes:
    contrato = datos.contrato
    moneda = contrato.moneda
    m = lambda v: formato_moneda(v, moneda)  # noqa: E731
    borrador = datos.numero is None

    doc = DocumentoMambo()
    doc.encabezado(
        inmobiliaria.nombre, lineas_inmobiliaria(inmobiliaria), cargar_logo(inmobiliaria)
    )
    doc.titulo("LIQUIDACIÓN (BORRADOR)" if borrador else "LIQUIDACIÓN", datos.numero, datos.fecha)
    if borrador:
        doc.parrafo(
            "Documento preliminar, sin número asignado y sin valor como comprobante. "
            "Los importes son los del cálculo de hoy y pueden cambiar hasta que la "
            "liquidación se emita."
        )
    doc.parrafo(f"Propietario: {nombres(partes_con_rol(contrato, RolParteContrato.propietario))}")
    doc.parrafo(f"Propiedad: {_propiedad_texto(contrato)}")
    doc.parrafo(f"Período: {nombre_periodo(datos.periodo)}")

    doc.tabla(
        ["Fecha", "Recibo", "Período", "Alquiler", "Punitorio"],
        [
            [
                p.fecha_pago.strftime("%d/%m/%Y"),
                numero_formateado(p.recibo_numero),
                nombre_periodo(p.cobro.periodo),
                m(p.monto),
                m(p.punitorio),
            ]
            for p in datos.pagos
        ],
        derecha=(3, 4),
    )
    doc.total("Cobrado", m(datos.total_cobrado + datos.total_punitorios), destacado=False)
    doc.total(
        f"Honorarios de administración {datos.honorarios_pct} %",
        m(-datos.honorarios_monto),
        destacado=False,
    )

    if datos.gastos:
        tipos = {
            "expensas": "Expensas",
            "reparacion": "Reparación",
            "impuesto": "Impuesto",
            "otro": "Otro",
        }
        doc.tabla(
            ["Fecha", "Tipo", "Concepto", "Monto"],
            [
                [g.fecha.strftime("%d/%m/%Y"), tipos[g.tipo], g.concepto, m(g.monto)]
                for g in datos.gastos
            ],
            derecha=(3,),
        )
        doc.total("Gastos", m(-datos.total_gastos), destacado=False)

    if datos.total_a_transferir >= 0:
        doc.total("Total a transferir", m(datos.total_a_transferir))
    else:
        doc.total("Saldo a favor de la inmobiliaria", m(-datos.total_a_transferir))
    if datos.notas:
        doc.parrafo(datos.notas)
    doc.pie()
    return doc.bytes()


def generar_liquidacion_pdf(liq: Liquidacion, inmobiliaria: Inmobiliaria) -> bytes:
    return liquidacion_pdf(datos_de_liquidacion(liq), inmobiliaria)


# ---------------------------------------------------------------------------
# Envío en segundo plano
# ---------------------------------------------------------------------------


def enviar_y_marcar(
    modelo: type,
    fila_id: int,
    destinatario: str,
    asunto: str,
    cuerpo: str,
    pdf_key: str,
    nombre_pdf: str,
) -> None:
    """Cuerpo del `BackgroundTask`: sesión propia (la de la request ya se cerró).

    Si falla, queda en el log y `enviado_email_at` no se marca: el botón del panel
    vuelve a estar disponible para reintentar.
    """
    try:
        contenido = leer_archivo(pdf_key)
        enviar_email(
            destinatario, asunto, cuerpo, [Adjunto(nombre_pdf, contenido, "application/pdf")]
        )
    except Exception:  # noqa: BLE001
        logger.exception("No se pudo enviar %s #%s a %s", modelo.__name__, fila_id, destinatario)
        return
    with SessionLocal() as db:
        fila = db.get(modelo, fila_id)
        if fila is not None:
            fila.enviado_email_at = datetime.now(UTC)
            db.commit()
