"""Ficha de propiedad en PDF: permisos, contenido y fotos."""

import io

import pytest
from PIL import Image

from app.modules.propiedades import ficha
from app.modules.propiedades.models import (
    PropiedadCaracteristica,
    PropiedadMedio,
    TipoMedio,
)
from app.storage import guardar_imagen
from tests.helpers_crm import crear_propiedad


def _jpeg(color: str = "red") -> bytes:
    salida = io.BytesIO()
    Image.new("RGB", (64, 48), color).save(salida, format="JPEG")
    return salida.getvalue()


def _medio(db, prop, *, url, clave=None, orden=0, principal=False):
    medio = PropiedadMedio(
        propiedad_id=prop.id,
        tipo_medio=TipoMedio.imagen,
        url=url,
        storage_key=clave,
        orden=orden,
        es_principal=principal,
    )
    db.add(medio)
    db.commit()
    return medio


@pytest.fixture
def staff(client, crear_usuario, iniciar_sesion):
    crear_usuario(roles=("staff",))
    iniciar_sesion()


def test_anonimo_no_puede_descargarla(client, db):
    prop = crear_propiedad(db)
    assert client.get(f"/api/v1/propiedades/{prop.id}/ficha.pdf").status_code == 401


def test_propiedad_inexistente_404(client, db, staff):
    assert client.get("/api/v1/propiedades/9999/ficha.pdf").status_code == 404


def test_devuelve_un_pdf_con_la_foto_incrustada(client, db, staff, media_tmp):
    prop = crear_propiedad(db, dormitorios=2, m2_cubiertos=70, descripcion="Luminoso.")
    guardada = guardar_imagen(_jpeg(), ".jpg")
    _medio(db, prop, url=guardada.url, clave=guardada.clave, principal=True)
    db.add(PropiedadCaracteristica(propiedad_id=prop.id, clave="Balcón", valor="Sí"))
    db.commit()

    r = client.get(f"/api/v1/propiedades/{prop.id}/ficha.pdf")

    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert f"ficha-propiedad-{prop.id}.pdf" in r.headers["content-disposition"]
    assert r.content.startswith(b"%PDF")
    assert b"/Subtype /Image" in r.content


def test_sin_fotos_propias_sale_igual(client, db, staff):
    """Las fotos con URL de terceros (el seed) no se bajan: la ficha sale sin ellas."""
    prop = crear_propiedad(db)
    _medio(db, prop, url="https://images.unsplash.com/foto.jpg", principal=True)

    r = client.get(f"/api/v1/propiedades/{prop.id}/ficha.pdf")

    assert r.status_code == 200
    assert b"/Subtype /Image" not in r.content


def test_foto_ilegible_no_rompe_la_ficha(client, db, staff, media_tmp):
    prop = crear_propiedad(db)
    _medio(db, prop, url="/media/no-existe.jpg", clave="propiedades/no-existe.jpg")

    r = client.get(f"/api/v1/propiedades/{prop.id}/ficha.pdf")

    assert r.status_code == 200
    assert r.content.startswith(b"%PDF")


def test_ordena_la_principal_primero_y_el_resto_por_orden(db):
    prop = crear_propiedad(db)
    segunda = _medio(db, prop, url="/b.jpg", orden=2)
    primera_por_orden = _medio(db, prop, url="/a.jpg", orden=1)
    principal = _medio(db, prop, url="/p.jpg", orden=5, principal=True)
    db.refresh(prop)

    assert [m.url for m in ficha._imagenes(prop)] == [
        principal.url,
        primera_por_orden.url,
        segunda.url,
    ]


def test_datos_solo_incluye_lo_cargado(db):
    prop = crear_propiedad(db, dormitorios=3, m2_totales=250.50)

    assert ficha._datos(prop) == [("Dormitorios", "3"), ("Superficie total", "250,5 m²")]


@pytest.mark.parametrize("valor", ["si", "Sí", " SI "])
def test_reconoce_tildadas_como_el_front(valor):
    assert ficha._es_tildada(valor)
