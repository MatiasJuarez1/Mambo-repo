"""Tests del módulo de publicaciones: CRUD, permisos y paquete de descarga.

El módulo llegó al repo sin cobertura. Acá se fija primero lo que ya hacía
(alta, listados público y de staff, activación, borrado lógico y permisos) y en
el mismo archivo viven después los tests del paquete de descarga.
"""

import io
from zipfile import ZipFile

import pytest
from sqlalchemy.orm import Session as DBSession

from app import storage
from app.modules.propiedades.models import (
    EstadoComercial,
    Propiedad,
    PropiedadMedio,
    TipoMedio,
    TipoOperacion,
    TipoPropiedad,
)
from app.modules.publicaciones.models import Publicacion


@pytest.fixture
def propiedad(db: DBSession) -> Propiedad:
    prop = Propiedad(
        titulo="Casa en Rivadavia",
        tipo_propiedad=TipoPropiedad.casa,
        tipo_operacion=TipoOperacion.venta,
        estado_comercial=EstadoComercial.disponible,
        moneda="USD",
    )
    db.add(prop)
    db.commit()
    return prop


@pytest.fixture
def staff(client, crear_usuario, iniciar_sesion):
    """Sesión con rol `staff`: todo lo que no sea el listado público lo exige."""
    crear_usuario(email="staff.pub@mambo.com.ar", roles=("staff",))
    iniciar_sesion(email="staff.pub@mambo.com.ar")
    return client


def test_crear_publicacion_activa_la_deja_en_el_listado_publico(staff, propiedad):
    respuesta = staff.post(
        "/api/v1/publicaciones",
        json={
            "propiedad_id": propiedad.id,
            "titulo": "Casa 3 ambientes con jardín",
            "descripcion": "Luminosa, patio grande",
            "precio_publicado": 120000,
            "moneda_publicada": "USD",
        },
    )
    assert respuesta.status_code == 201, respuesta.text

    creada = respuesta.json()
    assert creada["estado"] == "activa"
    # Al nacer activa queda fechada: es lo que ordena el listado.
    assert creada["publicada_en"] is not None

    publicas = staff.get("/api/v1/publicaciones/publicas").json()
    assert [p["id"] for p in publicas] == [creada["id"]]


def test_una_pausada_no_sale_en_el_publico_pero_si_en_el_de_staff(staff, propiedad):
    creada = staff.post(
        "/api/v1/publicaciones",
        json={"propiedad_id": propiedad.id, "titulo": "Borrador", "estado": "pausada"},
    ).json()

    assert creada["publicada_en"] is None
    assert staff.get("/api/v1/publicaciones/publicas").json() == []
    assert [p["id"] for p in staff.get("/api/v1/publicaciones").json()] == [creada["id"]]


def test_activar_una_pausada_le_pone_fecha_de_publicacion(staff, propiedad):
    creada = staff.post(
        "/api/v1/publicaciones",
        json={"propiedad_id": propiedad.id, "titulo": "Borrador", "estado": "pausada"},
    ).json()

    actualizada = staff.put(
        f"/api/v1/publicaciones/{creada['id']}", json={"estado": "activa"}
    ).json()

    assert actualizada["estado"] == "activa"
    assert actualizada["publicada_en"] is not None


def test_eliminar_es_borrado_logico(staff, propiedad):
    creada = staff.post(
        "/api/v1/publicaciones",
        json={"propiedad_id": propiedad.id, "titulo": "Se va de circulación"},
    ).json()

    assert staff.delete(f"/api/v1/publicaciones/{creada['id']}").status_code == 204
    assert staff.get(f"/api/v1/publicaciones/{creada['id']}").status_code == 404
    assert staff.get("/api/v1/publicaciones").json() == []


def test_filtrar_por_propiedad(staff, db, propiedad):
    otra = Propiedad(
        titulo="Depto en el centro",
        tipo_propiedad=TipoPropiedad.depto,
        tipo_operacion=TipoOperacion.alquiler,
        estado_comercial=EstadoComercial.disponible,
        moneda="ARS",
    )
    db.add(otra)
    db.commit()

    de_la_casa = staff.post(
        "/api/v1/publicaciones",
        json={"propiedad_id": propiedad.id, "titulo": "Casa"},
    ).json()
    staff.post("/api/v1/publicaciones", json={"propiedad_id": otra.id, "titulo": "Depto"})

    filtradas = staff.get(f"/api/v1/publicaciones?propiedad_id={propiedad.id}").json()
    assert [p["id"] for p in filtradas] == [de_la_casa["id"]]


def test_el_listado_publico_es_anonimo_pero_el_de_staff_no(client, db, propiedad):
    db.add(Publicacion(propiedad_id=propiedad.id, titulo="Casa"))
    db.commit()

    assert client.get("/api/v1/publicaciones/publicas").status_code == 200
    assert client.get("/api/v1/publicaciones").status_code == 401
    assert (
        client.post(
            "/api/v1/publicaciones",
            json={"propiedad_id": propiedad.id, "titulo": "No debería entrar"},
        ).status_code
        == 401
    )


def test_crear_con_slug_repetido_da_409_legible(staff, propiedad):
    staff.post(
        "/api/v1/publicaciones",
        json={"propiedad_id": propiedad.id, "titulo": "Primera", "slug": "casa-linda"},
    )

    respuesta = staff.post(
        "/api/v1/publicaciones",
        json={"propiedad_id": propiedad.id, "titulo": "Segunda", "slug": "casa-linda"},
    )

    assert respuesta.status_code == 409
    assert "slug" in respuesta.json()["detail"].lower()


def test_editar_con_slug_repetido_da_409_legible(staff, propiedad):
    staff.post(
        "/api/v1/publicaciones",
        json={"propiedad_id": propiedad.id, "titulo": "Primera", "slug": "casa-linda"},
    )
    segunda = staff.post(
        "/api/v1/publicaciones",
        json={"propiedad_id": propiedad.id, "titulo": "Segunda", "slug": "otro-slug"},
    ).json()

    respuesta = staff.put(f"/api/v1/publicaciones/{segunda['id']}", json={"slug": "casa-linda"})

    assert respuesta.status_code == 409


def test_editar_manteniendo_el_propio_slug_no_choca_contra_si_misma(staff, propiedad):
    creada = staff.post(
        "/api/v1/publicaciones",
        json={"propiedad_id": propiedad.id, "titulo": "Casa", "slug": "casa-linda"},
    ).json()

    respuesta = staff.put(
        f"/api/v1/publicaciones/{creada['id']}",
        json={"slug": "casa-linda", "titulo": "Casa renovada"},
    )

    assert respuesta.status_code == 200


def test_el_slug_de_una_publicacion_borrada_sigue_ocupado(staff, propiedad):
    """Decisión de diseño: el borrado es lógico, la fila sigue ocupando el UNIQUE
    real de la base, así que liberar el slug al "borrar" sería mentir sobre lo
    que va a pasar al guardar."""
    primera = staff.post(
        "/api/v1/publicaciones",
        json={"propiedad_id": propiedad.id, "titulo": "Primera", "slug": "casa-linda"},
    ).json()
    staff.delete(f"/api/v1/publicaciones/{primera['id']}")

    respuesta = staff.post(
        "/api/v1/publicaciones",
        json={"propiedad_id": propiedad.id, "titulo": "Segunda", "slug": "casa-linda"},
    )

    assert respuesta.status_code == 409


def test_titulo_mas_largo_que_la_columna_da_422(staff, propiedad):
    respuesta = staff.post(
        "/api/v1/publicaciones",
        json={"propiedad_id": propiedad.id, "titulo": "x" * 256},
    )

    assert respuesta.status_code == 422


def test_slug_mas_largo_que_la_columna_da_422(staff, propiedad):
    respuesta = staff.post(
        "/api/v1/publicaciones",
        json={"propiedad_id": propiedad.id, "titulo": "Casa", "slug": "x" * 301},
    )

    assert respuesta.status_code == 422


def test_un_usuario_sin_rol_no_puede_escribir(client, crear_usuario, iniciar_sesion, propiedad):
    crear_usuario(email="sinrol@mambo.com.ar", roles=())
    iniciar_sesion(email="sinrol@mambo.com.ar")

    respuesta = client.post(
        "/api/v1/publicaciones",
        json={"propiedad_id": propiedad.id, "titulo": "Tampoco"},
    )

    assert respuesta.status_code == 403


# ── Paquete de descarga ───────────────────────────────────────────────────────


@pytest.fixture
def publicacion_con_fotos(db: DBSession, propiedad: Propiedad, media_tmp) -> Publicacion:
    """Una publicación cuya propiedad tiene una foto y un video de verdad en disco.

    El video está a propósito: el paquete es solo de fotos y tiene que dejarlo afuera.
    """
    foto = storage.guardar_imagen(b"bytes-de-la-foto", ".jpg")
    video = storage.guardar_archivo(b"bytes-del-video", "propiedades/tour.mp4")

    db.add(
        PropiedadMedio(
            propiedad_id=propiedad.id,
            tipo_medio=TipoMedio.imagen,
            url=foto.url,
            storage_key=foto.clave,
            orden=1,
        )
    )
    db.add(
        PropiedadMedio(
            propiedad_id=propiedad.id,
            tipo_medio=TipoMedio.video,
            url=video.url,
            storage_key=video.clave,
            orden=2,
        )
    )

    pub = Publicacion(
        propiedad_id=propiedad.id,
        titulo="Casa 3 ambientes con jardín",
        descripcion="Luminosa, patio grande",
        precio_publicado=120000,
        moneda_publicada="USD",
    )
    db.add(pub)
    db.commit()
    return pub


def test_el_paquete_trae_las_fotos_y_el_texto(staff, publicacion_con_fotos):
    respuesta = staff.get(f"/api/v1/publicaciones/{publicacion_con_fotos.id}/descargar")

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.headers["content-type"] == "application/zip"
    assert (
        f'filename="publicacion-{publicacion_con_fotos.id}.zip"'
        in respuesta.headers["content-disposition"]
    )

    with ZipFile(io.BytesIO(respuesta.content)) as zf:
        # El video queda afuera: el paquete es material para redes, no el archivo
        # entero de la propiedad.
        assert zf.namelist() == ["foto-01.jpg", "descripcion.txt"]
        assert zf.read("foto-01.jpg") == b"bytes-de-la-foto"
        texto = zf.read("descripcion.txt").decode("utf-8")

    assert "Casa 3 ambientes con jardín" in texto
    assert "USD" in texto
    assert "120000" in texto
    assert "Luminosa, patio grande" in texto


def test_una_foto_de_un_tercero_se_baja_por_http(staff, db, propiedad, monkeypatch):
    """Los medios del seed no tienen `storage_key`: se traen por su URL pública."""

    class _RespuestaFalsa:
        content = b"bytes-de-un-tercero"

        def raise_for_status(self):
            return self

    monkeypatch.setattr(
        "app.modules.publicaciones.service.httpx.get",
        lambda url, timeout: _RespuestaFalsa(),
    )

    db.add(
        PropiedadMedio(
            propiedad_id=propiedad.id,
            tipo_medio=TipoMedio.imagen,
            url="https://fotos.example.com/casa.png",
            storage_key=None,
            orden=1,
        )
    )
    pub = Publicacion(propiedad_id=propiedad.id, titulo="Casa del seed")
    db.add(pub)
    db.commit()

    respuesta = staff.get(f"/api/v1/publicaciones/{pub.id}/descargar")

    assert respuesta.status_code == 200
    with ZipFile(io.BytesIO(respuesta.content)) as zf:
        assert zf.namelist() == ["foto-01.png", "descripcion.txt"]
        assert zf.read("foto-01.png") == b"bytes-de-un-tercero"


def test_una_foto_de_un_tercero_con_query_string_se_nombra_sin_ella(
    staff, db, propiedad, monkeypatch
):
    """La URL trae `?token=...` (típico de un CDN firmado): no debe colarse en el nombre."""

    class _RespuestaFalsa:
        content = b"bytes-de-un-tercero"

        def raise_for_status(self):
            return self

    monkeypatch.setattr(
        "app.modules.publicaciones.service.httpx.get",
        lambda url, timeout: _RespuestaFalsa(),
    )

    db.add(
        PropiedadMedio(
            propiedad_id=propiedad.id,
            tipo_medio=TipoMedio.imagen,
            url="https://fotos.example.com/casa.jpg?token=abc123",
            storage_key=None,
            orden=1,
        )
    )
    pub = Publicacion(propiedad_id=propiedad.id, titulo="Casa del seed")
    db.add(pub)
    db.commit()

    respuesta = staff.get(f"/api/v1/publicaciones/{pub.id}/descargar")

    assert respuesta.status_code == 200
    with ZipFile(io.BytesIO(respuesta.content)) as zf:
        assert zf.namelist() == ["foto-01.jpg", "descripcion.txt"]
        assert zf.read("foto-01.jpg") == b"bytes-de-un-tercero"


def test_una_foto_que_no_se_puede_leer_no_invalida_el_paquete(
    staff, publicacion_con_fotos, monkeypatch
):
    def explotar(clave):
        raise OSError("el archivo no está")

    monkeypatch.setattr("app.modules.publicaciones.service.storage.leer_archivo", explotar)

    respuesta = staff.get(f"/api/v1/publicaciones/{publicacion_con_fotos.id}/descargar")

    # Mejor un paquete con el texto que un 500: el agente igual se lleva algo.
    assert respuesta.status_code == 200
    with ZipFile(io.BytesIO(respuesta.content)) as zf:
        assert zf.namelist() == ["descripcion.txt"]


def test_una_publicacion_sin_fotos_igual_da_un_zip(staff, db, propiedad):
    pub = Publicacion(propiedad_id=propiedad.id, titulo="Todavía sin fotos")
    db.add(pub)
    db.commit()

    respuesta = staff.get(f"/api/v1/publicaciones/{pub.id}/descargar")

    assert respuesta.status_code == 200
    with ZipFile(io.BytesIO(respuesta.content)) as zf:
        assert zf.namelist() == ["descripcion.txt"]


def test_descargar_una_publicacion_que_no_existe_da_404(staff):
    assert staff.get("/api/v1/publicaciones/9999/descargar").status_code == 404


def test_descargar_exige_sesion_con_rol(client, crear_usuario, iniciar_sesion, db, propiedad):
    pub = Publicacion(propiedad_id=propiedad.id, titulo="Casa")
    db.add(pub)
    db.commit()

    assert client.get(f"/api/v1/publicaciones/{pub.id}/descargar").status_code == 401

    crear_usuario(email="sinrol.descarga@mambo.com.ar", roles=())
    iniciar_sesion(email="sinrol.descarga@mambo.com.ar")

    assert client.get(f"/api/v1/publicaciones/{pub.id}/descargar").status_code == 403
