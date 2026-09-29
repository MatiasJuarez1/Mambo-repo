"""Ficha de una propiedad en PDF, para mandar por WhatsApp o mail a un interesado.

Reusa `DocumentoMambo` (el de los recibos) para que todo lo que sale de la
inmobiliaria tenga el mismo encabezado con logo. No incluye nada interno: ni el
propietario ni el estado del contrato, porque el destino es un cliente.
"""

from __future__ import annotations

import io
import logging
import unicodedata
from datetime import date

from PIL import Image
from sqlalchemy.orm import Session

from app.config import get_settings
from app.modules.propiedades.models import EstadoComercial, Propiedad, PropiedadMedio, TipoMedio
from app.modules.sitio.service import precio_texto, superficie_texto, tipo_y_operacion
from app.pdf import DocumentoMambo
from app.platform.alquileres.recibos import cargar_logo, firma, lineas_inmobiliaria
from app.platform.inmobiliaria.service import obtener as obtener_inmobiliaria
from app.storage import clave_de_variante, leer_archivo

logger = logging.getLogger(__name__)

_FOTOS_CHICAS = 3
# La variante de 800px alcanza para imprimir a media página y mantiene el PDF
# liviano: con las originales, una ficha de cuatro fotos pasaba fácil los 10 MB.
_ANCHO_FOTO = "800"

_SUPERFICIES = (
    ("m2_terreno", "Superficie del terreno"),
    ("m2_construidos", "Superficie construida"),
    ("m2_cubiertos", "Superficie cubierta"),
    ("m2_propios", "Superficie propia"),
    ("m2_totales", "Superficie total"),
)


def _es_tildada(valor: str) -> bool:
    """Misma regla que `esTildada` del front: "si", "Sí", " SI " cuentan."""
    sin_tildes = unicodedata.normalize("NFD", valor.strip().lower())
    return "".join(c for c in sin_tildes if not unicodedata.combining(c)) == "si"


def _imagenes(prop: Propiedad) -> list[PropiedadMedio]:
    """La principal primero y el resto por orden, como las ve el público."""
    imagenes = sorted(
        (m for m in prop.medios if m.tipo_medio == TipoMedio.imagen), key=lambda m: m.orden
    )
    return sorted(imagenes, key=lambda m: not m.es_principal)


def _leer_foto(medio: PropiedadMedio) -> bytes | None:
    """JPEG listo para el PDF, o None si la foto no es nuestra o no se puede leer.

    Las fotos con URL de terceros (sin `storage_key`, como las del seed) se
    omiten: bajarlas haría depender la ficha de un servidor ajeno.
    """
    if not medio.storage_key:
        return None
    clave = medio.storage_key
    if _ANCHO_FOTO in (medio.variantes or {}):
        clave = clave_de_variante(medio.storage_key, _ANCHO_FOTO)
    try:
        imagen = Image.open(io.BytesIO(leer_archivo(clave)))
        # fpdf2 incrusta JPEG tal cual; WEBP/PNG/GIF los recodificaría él igual.
        salida = io.BytesIO()
        imagen.convert("RGB").save(salida, format="JPEG", quality=82)
        return salida.getvalue()
    except Exception:  # noqa: BLE001 — una foto rota no debe impedir la ficha
        logger.warning("No se pudo leer la foto %s para la ficha", clave)
        return None


def _datos(prop: Propiedad) -> list[tuple[str, str]]:
    filas: list[tuple[str, str]] = []
    if prop.dormitorios is not None:
        filas.append(("Dormitorios", str(prop.dormitorios)))
    if prop.banos is not None:
        filas.append(("Baños", str(prop.banos)))
    for campo, etiqueta in _SUPERFICIES:
        valor = getattr(prop, campo)
        if valor is not None:
            filas.append((etiqueta, superficie_texto(valor)))
    return filas


def _ubicacion(prop: Propiedad) -> str:
    u = prop.ubicacion
    if u is None:
        return ""
    return " · ".join(x for x in (u.direccion, u.ciudad, u.provincia) if x)


def generar_ficha(db: Session, prop: Propiedad) -> bytes:
    inmobiliaria = obtener_inmobiliaria(db)
    doc = DocumentoMambo()
    doc.encabezado(
        inmobiliaria.nombre, lineas_inmobiliaria(inmobiliaria), cargar_logo(inmobiliaria)
    )

    doc.set_font("DejaVu", "B", 16)
    doc.multi_cell(0, 8, prop.titulo, new_x="LMARGIN", new_y="NEXT")
    doc.set_font("DejaVu", "", 10)
    doc.set_text_color(90, 90, 90)
    subtitulo = " · ".join(x for x in (tipo_y_operacion(prop), _ubicacion(prop)) if x)
    doc.multi_cell(0, 6, subtitulo, new_x="LMARGIN", new_y="NEXT")
    doc.set_text_color(0, 0, 0)
    doc.set_font("DejaVu", "B", 14)
    cerrada = prop.estado_comercial == EstadoComercial.cerrada
    doc.cell(0, 10, "Operación cerrada" if cerrada else precio_texto(prop))
    doc.ln(12)

    fotos = [f for m in _imagenes(prop)[: 1 + _FOTOS_CHICAS] if (f := _leer_foto(m))]
    if fotos:
        doc.image(io.BytesIO(fotos[0]), x=15, w=180, h=110, keep_aspect_ratio=True)
        doc.ln(3)
    if len(fotos) > 1:
        alto, ancho, separacion = 40, 58, 3
        if doc.will_page_break(alto):
            doc.add_page()
        y = doc.get_y()
        for i, foto in enumerate(fotos[1:]):
            x = 15 + i * (ancho + separacion)
            doc.image(io.BytesIO(foto), x=x, y=y, w=ancho, h=alto, keep_aspect_ratio=True)
        doc.set_y(y + alto + 4)

    datos = _datos(prop)
    if datos:
        doc.set_font("DejaVu", "B", 11)
        doc.cell(0, 8, "Datos", new_x="LMARGIN", new_y="NEXT")
        doc.tabla(["Detalle", "Valor"], datos, derecha=(1,))

    if prop.caracteristicas:
        tildadas = [c.clave for c in prop.caracteristicas if _es_tildada(c.valor)]
        libres = [f"{c.clave}: {c.valor}" for c in prop.caracteristicas if not _es_tildada(c.valor)]
        doc.set_font("DejaVu", "B", 11)
        doc.cell(0, 8, "Características", new_x="LMARGIN", new_y="NEXT")
        doc.parrafo(" · ".join(tildadas + libres))

    if prop.descripcion:
        doc.set_font("DejaVu", "B", 11)
        doc.cell(0, 8, "Descripción", new_x="LMARGIN", new_y="NEXT")
        doc.parrafo(prop.descripcion)

    doc.ln(4)
    doc.set_font("DejaVu", "", 9)
    doc.set_text_color(90, 90, 90)
    contacto = firma(inmobiliaria)
    sitio = get_settings().sitio_url
    if sitio:
        contacto += f"\nMás fotos y consultas: {sitio.rstrip('/')}/propiedades/{prop.id}"
    doc.multi_cell(0, 5, f"{contacto}\nFicha generada el {date.today():%d/%m/%Y}.")
    doc.set_text_color(0, 0, 0)
    return doc.bytes()
