"""Búsquedas guardadas: CRUD, coincidencias, interesados y tareas automáticas de "ofrecer"."""

from datetime import UTC, datetime

import pytest

from app.modules.propiedades.models import (
    EstadoComercial,
    PropiedadUbicacion,
    TipoOperacion,
)
from app.platform.activities.models import Activity
from app.platform.busquedas.models import Busqueda
from app.platform.busquedas.service import coincide
from tests.helpers_crm import crear_persona, crear_propiedad

API = "/api/v1/busquedas"
PROPIEDADES = "/api/v1/propiedades"


@pytest.fixture
def agente(client, crear_usuario, iniciar_sesion):
    usuario = crear_usuario(email="agente@mambo.com.ar", roles=("staff",))
    iniciar_sesion(email="agente@mambo.com.ar")
    return usuario


def _prop(db, ciudad="Yerba Buena", precio=100000, **campos):
    campos.setdefault("tipo_propiedad", "depto")
    campos.setdefault("moneda", "ARS")
    campos.setdefault("dormitorios", 2)
    prop = crear_propiedad(db, operacion=TipoOperacion.alquiler, **campos)
    # `crear_propiedad` fija el precio en 100000: se pisa después.
    prop.precio = precio
    if ciudad:
        db.add(PropiedadUbicacion(propiedad_id=prop.id, ciudad=ciudad))
    db.commit()
    db.refresh(prop)
    return prop


def _busqueda(**campos) -> Busqueda:
    base = {
        "tipo_operacion": "alquiler",
        "tipo_propiedad": "depto",
        "ciudad": "yerba buena",
        "moneda": "ARS",
        "precio_min": None,
        "precio_max": 150000,
        "dormitorios_min": 2,
        "activa": True,
    }
    return Busqueda(person_id=1, **{**base, **campos})


# ---------------------------------------------------------------------------
# Regla de coincidencia
# ---------------------------------------------------------------------------


def test_coincide_cuando_cumple_todo(db):
    assert coincide(_busqueda(), _prop(db))


@pytest.mark.parametrize(
    "prop_campos, busqueda_campos",
    [
        ({"estado": EstadoComercial.reservada}, {}),
        ({"eliminado_en": datetime.now(UTC)}, {}),
        ({"tipo_propiedad": "casa"}, {}),
        ({"ciudad": "Tafí Viejo"}, {}),
        ({"ciudad": None}, {}),
        ({"precio": 200000}, {}),
        ({"moneda": "USD"}, {}),
        ({"precio": None}, {}),
        ({"dormitorios": 1}, {}),
        ({"dormitorios": None}, {}),
        ({}, {"precio_min": 120000}),
    ],
)
def test_no_coincide(db, prop_campos, busqueda_campos):
    assert not coincide(_busqueda(**busqueda_campos), _prop(db, **prop_campos))


def test_criterios_vacios_no_filtran(db):
    vacia = _busqueda(
        tipo_operacion=None,
        tipo_propiedad=None,
        ciudad=None,
        moneda=None,
        precio_max=None,
        dormitorios_min=None,
    )
    assert coincide(vacia, _prop(db, ciudad=None, precio=None, dormitorios=None))


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------


def _crear(client, person_id, **campos):
    datos = {
        "person_id": person_id,
        "tipo_operacion": "alquiler",
        "ciudad": " Yerba Buena ",
        "moneda": "ars",
        "precio_max": "150000",
        **campos,
    }
    return client.post(API, json=datos)


def test_alta_normaliza_y_cuenta_coincidencias(client, db, agente):
    persona = crear_persona(db)
    _prop(db)
    _prop(db, precio=900000)

    r = _crear(client, persona.id)

    assert r.status_code == 201
    cuerpo = r.json()
    assert cuerpo["ciudad"] == "Yerba Buena"
    assert cuerpo["moneda"] == "ARS"
    assert cuerpo["person"]["full_name"] == "Ana Pérez"
    assert cuerpo["coincidencias"] == 1
    assert db.get(Busqueda, cuerpo["id"]).created_by_user_id == agente.id


@pytest.mark.parametrize(
    "campos, detalle",
    [
        ({"moneda": None}, "necesita la moneda"),
        ({"precio_min": "200000"}, "no puede superar"),
    ],
)
def test_alta_valida_el_rango(client, db, agente, campos, detalle):
    persona = crear_persona(db)
    r = _crear(client, persona.id, **campos)
    assert r.status_code == 422
    assert detalle in r.text


def test_alta_con_persona_inexistente_404(client, db, agente):
    assert _crear(client, 9999).status_code == 404


def test_lista_coincidencias_de_una_busqueda(client, db, agente):
    persona = crear_persona(db)
    sirve = _prop(db, titulo="Depto que sirve")
    _prop(db, titulo="En otra ciudad", ciudad="Tafí Viejo")
    bid = _crear(client, persona.id).json()["id"]

    r = client.get(f"{API}/{bid}/coincidencias")

    assert r.status_code == 200
    assert [p["id"] for p in r.json()["propiedades"]] == [sirve.id]


def test_filtra_por_persona_y_pausar_deja_en_cero(client, db, agente):
    ana, juan = crear_persona(db), crear_persona(db, first_name="Juan")
    _prop(db)
    bid = _crear(client, ana.id).json()["id"]
    _crear(client, juan.id)

    lista = client.get(API, params={"person_id": ana.id}).json()
    assert [b["id"] for b in lista] == [bid]

    r = client.patch(f"{API}/{bid}", json={"activa": False})
    assert r.status_code == 200
    assert r.json()["activa"] is False
    assert r.json()["coincidencias"] == 0


def test_patch_que_deja_rango_sin_moneda_422(client, db, agente):
    bid = _crear(client, crear_persona(db).id).json()["id"]
    r = client.patch(f"{API}/{bid}", json={"moneda": None})
    assert r.status_code == 422


def test_borrar(client, db, agente):
    bid = _crear(client, crear_persona(db).id).json()["id"]
    assert client.delete(f"{API}/{bid}").status_code == 204
    assert db.get(Busqueda, bid) is None


def test_interesados_de_una_propiedad(client, db, agente):
    ana, juan = crear_persona(db), crear_persona(db, first_name="Juan")
    _crear(client, ana.id)
    _crear(client, juan.id, tipo_operacion="venta")
    prop = _prop(db)

    r = client.get(f"{API}/interesados/{prop.id}")

    assert r.status_code == 200
    assert [b["person"]["id"] for b in r.json()] == [ana.id]


def test_anonimo_no_accede(client, db):
    assert client.get(API).status_code == 401


# ---------------------------------------------------------------------------
# Tareas automáticas
# ---------------------------------------------------------------------------


def test_propiedad_nueva_que_sirve_crea_una_tarea_para_el_agente(client, db, agente):
    persona = crear_persona(db)
    _crear(client, persona.id)

    r = client.post(
        PROPIEDADES,
        json={
            "titulo": "Depto nuevo",
            "tipo_operacion": "alquiler",
            "moneda": "ARS",
            "precio": "120000",
            "ubicacion": {"ciudad": "Yerba Buena"},
        },
    )

    assert r.status_code == 201
    tarea = db.query(Activity).one()
    assert tarea.activity_type == "tarea"
    assert tarea.title == "Ofrecer «Depto nuevo» a Ana Pérez"
    assert tarea.person_id == persona.id
    assert tarea.property_id == r.json()["id"]
    assert tarea.assigned_to_user_id == agente.id


def test_editar_no_repite_el_aviso_pero_avisa_si_empieza_a_servir(client, db, agente):
    persona = crear_persona(db)
    _crear(client, persona.id)
    cara = client.post(
        PROPIEDADES,
        json={
            "titulo": "Depto caro",
            "tipo_operacion": "alquiler",
            "moneda": "ARS",
            "precio": "300000",
            "ubicacion": {"ciudad": "Yerba Buena"},
        },
    ).json()
    assert db.query(Activity).count() == 0

    # Baja el precio: ahora sirve y se avisa una vez.
    client.put(f"{PROPIEDADES}/{cara['id']}", json={"precio": "140000"})
    assert db.query(Activity).count() == 1

    # Otra edición cualquiera no repite la tarea.
    client.put(f"{PROPIEDADES}/{cara['id']}", json={"descripcion": "Con balcón"})
    assert db.query(Activity).count() == 1


def test_busquedas_pausadas_o_de_personas_borradas_no_generan_tareas(client, db, agente):
    pausada = crear_persona(db)
    borrada = crear_persona(db, first_name="Juan")
    bid = _crear(client, pausada.id).json()["id"]
    client.patch(f"{API}/{bid}", json={"activa": False})
    _crear(client, borrada.id)
    borrada.deleted_at = datetime.now(UTC)
    db.commit()

    client.post(
        PROPIEDADES,
        json={
            "titulo": "Depto",
            "tipo_operacion": "alquiler",
            "moneda": "ARS",
            "precio": "100000",
            "ubicacion": {"ciudad": "Yerba Buena"},
        },
    )

    assert db.query(Activity).count() == 0
