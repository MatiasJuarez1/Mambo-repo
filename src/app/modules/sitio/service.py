"""Lo que el sitio público necesita servir armado desde el servidor.

El sitio es una SPA: el HTML que baja es un `<div id="root">` vacío y todo lo
demás lo dibuja JavaScript. Google ejecuta ese JavaScript, pero los que arman la
vista previa de un link (WhatsApp, Facebook, Telegram…) no: leen las etiquetas
`og:` del HTML crudo y, sin ellas, un link a una propiedad se compartía sin foto
ni título. `vercel.json` desvía a esos lectores hacia `html_vista_previa`; las
personas siguen recibiendo la SPA de siempre.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from html import escape
from xml.sax.saxutils import escape as escape_xml

from sqlalchemy.orm import Session, selectinload

from app.formato import formato_moneda
from app.modules.propiedades.models import EstadoComercial, Propiedad, TipoMedio
from app.platform.inmobiliaria.service import obtener as obtener_inmobiliaria

# Los mismos que muestra el listado público (`ESTADOS_PUBLICOS` en el front): las
# cerradas quedan como antecedente de las operaciones de la inmobiliaria.
ESTADOS_PUBLICOS = (EstadoComercial.disponible, EstadoComercial.reservada, EstadoComercial.cerrada)

# Páginas fijas del sitio, además de una por propiedad.
PAGINAS_FIJAS = ("/", "/propiedades", "/nosotros", "/servicios")

# La variante de 800px pesa lo justo para la vista previa: WhatsApp descarta
# imágenes demasiado pesadas y la original puede pasar varios MB.
_ANCHO_VISTA_PREVIA = "800"
_LARGO_DESCRIPCION = 200

_OPERACION = {"venta": "en venta", "alquiler": "en alquiler", "temporal": "en alquiler temporal"}
_TIPO = {
    "casa": "Casa",
    "depto": "Departamento",
    "local": "Local",
    "terreno": "Terreno",
    "oficina": "Oficina",
    "otro": "Propiedad",
}


def absoluta(base: str, url: str) -> str:
    """Las fotos en R2 ya vienen absolutas; las del disco local son `/media/...`."""
    if url.startswith(("http://", "https://")):
        return url
    return f"{base}{url}"


def _foto(prop: Propiedad) -> str | None:
    imagenes = [m for m in prop.medios if m.tipo_medio == TipoMedio.imagen]
    if not imagenes:
        return None
    principal = next((m for m in imagenes if m.es_principal), imagenes[0])
    return (principal.variantes or {}).get(_ANCHO_VISTA_PREVIA) or principal.url


def precio_texto(prop: Propiedad) -> str:
    if prop.precio is None:
        return "Precio a consultar"
    texto = formato_moneda(Decimal(prop.precio), prop.moneda or "ARS")
    # Sin centavos: en una vista previa o una ficha "US$ 120.000,00" es ruido.
    return texto.removesuffix(",00")


def superficie_texto(valor: Decimal | float) -> str:
    """`250.50` → `250,5 m²`: sin ceros de más y con coma decimal, como en es-AR."""
    return f"{Decimal(valor).normalize():f}".replace(".", ",") + " m²"


def tipo_y_operacion(prop: Propiedad) -> str:
    return f"{_TIPO.get(prop.tipo_propiedad, 'Propiedad')} {_OPERACION[prop.tipo_operacion]}"


def resumen(prop: Propiedad) -> str:
    """Una línea con lo que decide si alguien abre el link: qué es, dónde y cuánto."""
    partes = [tipo_y_operacion(prop)]
    if prop.ubicacion and prop.ubicacion.ciudad:
        partes.append(prop.ubicacion.ciudad)
    if prop.dormitorios:
        partes.append(f"{prop.dormitorios} dorm.")
    superficie = prop.m2_totales or prop.m2_cubiertos
    if superficie:
        partes.append(superficie_texto(superficie))
    if prop.estado_comercial == EstadoComercial.cerrada:
        partes.append("Operación cerrada")
    else:
        partes.append(precio_texto(prop))
    return " · ".join(partes)


def descripcion(prop: Propiedad) -> str:
    texto = resumen(prop)
    if prop.descripcion:
        extracto = " ".join(prop.descripcion.split())
        if len(extracto) > _LARGO_DESCRIPCION:
            extracto = extracto[: _LARGO_DESCRIPCION - 1].rsplit(" ", 1)[0] + "…"
        texto = f"{texto}. {extracto}"
    return texto


def propiedad_publica(db: Session, propiedad_id: int) -> Propiedad | None:
    return (
        db.query(Propiedad)
        .options(selectinload(Propiedad.medios), selectinload(Propiedad.ubicacion))
        .filter(
            Propiedad.id == propiedad_id,
            Propiedad.eliminado_en.is_(None),
            Propiedad.estado_comercial.in_(ESTADOS_PUBLICOS),
        )
        .first()
    )


def html_vista_previa(db: Session, prop: Propiedad | None, base: str, ruta: str) -> str:
    """HTML mínimo con las etiquetas que leen los que arman vistas previas.

    Sin redirección a la SPA a propósito: `vercel.json` manda acá según el
    user-agent, así que redirigir al mismo link volvería a caer en esta página.
    """
    sitio = obtener_inmobiliaria(db).nombre
    url = f"{base}{ruta}"
    if prop is None:
        titulo, texto, imagen = sitio, f"Propiedades de {sitio}.", None
    else:
        titulo, texto = f"{prop.titulo} | {sitio}", descripcion(prop)
        foto = _foto(prop)
        imagen = absoluta(base, foto) if foto else None

    meta = [
        ("og:type", "website"),
        ("og:site_name", sitio),
        ("og:title", titulo),
        ("og:description", texto),
        ("og:url", url),
        ("og:locale", "es_AR"),
    ]
    if imagen:
        meta.append(("og:image", imagen))
    etiquetas = "\n".join(f'    <meta property="{p}" content="{escape(v)}" />' for p, v in meta)
    tarjeta = "summary_large_image" if imagen else "summary"
    return f"""<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>{escape(titulo)}</title>
    <meta name="description" content="{escape(texto)}" />
    <link rel="canonical" href="{escape(url)}" />
{etiquetas}
    <meta name="twitter:card" content="{tarjeta}" />
  </head>
  <body>
    <h1>{escape(titulo)}</h1>
    <p>{escape(texto)}</p>
    <p><a href="{escape(url)}">Ver en {escape(sitio)}</a></p>
  </body>
</html>
"""


def _fecha(valor: datetime | None) -> str | None:
    return valor.date().isoformat() if valor else None


def sitemap(db: Session, base: str) -> str:
    filas = (
        db.query(Propiedad.id, Propiedad.actualizado_en)
        .filter(
            Propiedad.eliminado_en.is_(None),
            Propiedad.estado_comercial.in_(ESTADOS_PUBLICOS),
        )
        .order_by(Propiedad.id)
        .all()
    )
    entradas = [(ruta, None) for ruta in PAGINAS_FIJAS]
    entradas += [(f"/propiedades/{pid}", _fecha(actualizado)) for pid, actualizado in filas]

    urls = []
    for ruta, lastmod in entradas:
        extra = f"<lastmod>{lastmod}</lastmod>" if lastmod else ""
        urls.append(f"  <url><loc>{escape_xml(base + ruta)}</loc>{extra}</url>")
    cuerpo = "\n".join(urls)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{cuerpo}\n</urlset>\n"
    )


def robots(base: str) -> str:
    # El panel no tiene nada que indexar y sus rutas solo muestran el login.
    return f"User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: {base}/sitemap.xml\n"
