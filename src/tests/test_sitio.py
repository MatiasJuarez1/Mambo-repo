"""Vistas previas para compartir, sitemap y robots.txt del sitio público."""

from datetime import UTC, datetime

import pytest

from app.config import get_settings
from app.modules.propiedades.models import (
    EstadoComercial,
    PropiedadMedio,
    PropiedadUbicacion,
    TipoMedio,
    TipoOperacion,
)
from tests.helpers_crm import crear_propiedad

API = "/api/v1/sitio"


@pytest.fixture
def sitio_url(monkeypatch):
    monkeypatch.setattr(get_settings(), "sitio_url", "https://mambogroups.com/")
    return "https://mambogroups.com"


def _con_foto(db, prop, url="https://fotos.r2.dev/casa.jpg", variantes=None, principal=True):
    db.add(
        PropiedadMedio(
            propiedad_id=prop.id,
            tipo_medio=TipoMedio.imagen,
            url=url,
            variantes=variantes,
            orden=0,
            es_principal=principal,
        )
    )
    db.commit()


def test_vista_previa_con_titulo_resumen_y_foto(client, db, sitio_url):
    prop = crear_propiedad(
        db,
        titulo="Casa con pileta",
        tipo_propiedad="casa",
        dormitorios=3,
        m2_totales=200,
        moneda="USD",
        descripcion="Hermosa casa\ncon jardín.",
    )
    db.add(PropiedadUbicacion(propiedad_id=prop.id, ciudad="Yerba Buena"))
    _con_foto(
        db,
        prop,
        variantes={
            "400": "https://fotos.r2.dev/c-400.jpg",
            "800": "https://fotos.r2.dev/c-800.jpg",
        },
    )

    r = client.get(f"{API}/propiedades/{prop.id}")

    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/html")
    html = r.text
    assert '<meta property="og:title" content="Casa con pileta | Mambo Groups" />' in html
    # La variante de 800px, no la original ni la de 400.
    assert '<meta property="og:image" content="https://fotos.r2.dev/c-800.jpg" />' in html
    assert f'<meta property="og:url" content="{sitio_url}/propiedades/{prop.id}" />' in html
    assert "Casa en venta · Yerba Buena · 3 dorm. · 200 m² · US$ 100.000" in html
    assert "Hermosa casa con jardín." in html
    assert "summary_large_image" in html


def test_foto_local_se_vuelve_absoluta(client, db, sitio_url):
    prop = crear_propiedad(db)
    _con_foto(db, prop, url="/media/propiedades/1/foto.jpg")

    html = client.get(f"{API}/propiedades/{prop.id}").text

    assert f'content="{sitio_url}/media/propiedades/1/foto.jpg"' in html


def test_escapa_el_html_del_titulo(client, db, sitio_url):
    prop = crear_propiedad(db, titulo='Depto "luminoso" <script>')

    html = client.get(f"{API}/propiedades/{prop.id}").text

    assert "<script>" not in html
    assert "&quot;luminoso&quot; &lt;script&gt;" in html


def test_cerrada_no_muestra_precio(client, db, sitio_url):
    prop = crear_propiedad(db, estado=EstadoComercial.cerrada, operacion=TipoOperacion.alquiler)

    html = client.get(f"{API}/propiedades/{prop.id}").text

    assert "Operación cerrada" in html
    assert "$ 100.000" not in html


@pytest.mark.parametrize("caso", ["inexistente", "baja", "borrada"])
def test_propiedad_no_publica_devuelve_la_vista_generica(client, db, sitio_url, caso):
    if caso == "inexistente":
        pid = 9999
    elif caso == "baja":
        pid = crear_propiedad(db, titulo="Secreta", estado=EstadoComercial.baja).id
    else:
        pid = crear_propiedad(db, titulo="Secreta", eliminado_en=datetime.now(UTC)).id

    r = client.get(f"{API}/propiedades/{pid}")

    assert r.status_code == 200
    assert "Secreta" not in r.text
    assert '<meta property="og:title" content="Mambo Groups" />' in r.text
    assert "og:image" not in r.text


def test_sin_sitio_url_usa_el_host_que_reenvia_el_proxy(client, db, monkeypatch):
    monkeypatch.setattr(get_settings(), "sitio_url", None)
    prop = crear_propiedad(db)

    html = client.get(
        f"{API}/propiedades/{prop.id}",
        headers={"X-Forwarded-Host": "mambo.vercel.app", "X-Forwarded-Proto": "https"},
    ).text

    assert f'content="https://mambo.vercel.app/propiedades/{prop.id}"' in html


def test_sitemap_lista_paginas_fijas_y_propiedades_publicas(client, db, sitio_url):
    disponible = crear_propiedad(db)
    cerrada = crear_propiedad(db, estado=EstadoComercial.cerrada)
    baja = crear_propiedad(db, estado=EstadoComercial.baja)
    borrada = crear_propiedad(db, eliminado_en=datetime.now(UTC))

    r = client.get(f"{API}/sitemap.xml")

    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/xml")
    xml = r.text
    assert f"<loc>{sitio_url}/</loc>" in xml
    assert f"<loc>{sitio_url}/nosotros</loc>" in xml
    assert f"<loc>{sitio_url}/propiedades/{disponible.id}</loc><lastmod>" in xml
    assert f"/propiedades/{cerrada.id}<" in xml
    assert f"/propiedades/{baja.id}<" not in xml
    assert f"/propiedades/{borrada.id}<" not in xml


def test_robots_apunta_al_sitemap_y_excluye_el_panel(client, sitio_url):
    r = client.get(f"{API}/robots.txt")

    assert r.status_code == 200
    assert "Disallow: /admin" in r.text
    assert f"Sitemap: {sitio_url}/sitemap.xml" in r.text
