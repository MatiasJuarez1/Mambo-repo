"""Los cinco campos de superficie: todos opcionales, se guardan y se devuelven tal cual."""

from decimal import Decimal

import pytest

CAMPOS_NUEVOS = ("m2_terreno", "m2_construidos", "m2_propios")


@pytest.fixture
def staff(crear_usuario, iniciar_sesion):
    crear_usuario(email="staff.medidas@mambo.com.ar", roles=("staff",))
    iniciar_sesion(email="staff.medidas@mambo.com.ar")


def test_crear_con_las_cinco_superficies_las_devuelve(client, staff):
    respuesta = client.post(
        "/api/v1/propiedades",
        json={
            "titulo": "Casa con terreno",
            "m2_terreno": 600,
            "m2_construidos": 250,
            "m2_cubiertos": 220,
            "m2_propios": 240,
            "m2_totales": 600,
        },
    )

    assert respuesta.status_code == 201, respuesta.text
    cuerpo = respuesta.json()
    assert Decimal(cuerpo["m2_terreno"]) == 600
    assert Decimal(cuerpo["m2_construidos"]) == 250
    assert Decimal(cuerpo["m2_cubiertos"]) == 220
    assert Decimal(cuerpo["m2_propios"]) == 240
    assert Decimal(cuerpo["m2_totales"]) == 600


def test_ninguna_superficie_es_obligatoria(client, staff):
    respuesta = client.post("/api/v1/propiedades", json={"titulo": "Depto sin medidas"})

    assert respuesta.status_code == 201, respuesta.text
    for campo in CAMPOS_NUEVOS:
        assert respuesta.json()[campo] is None


def test_editar_una_superficie_no_toca_las_demas(client, staff):
    creada = client.post(
        "/api/v1/propiedades",
        json={"titulo": "Casa", "m2_terreno": 500, "m2_propios": 180},
    ).json()

    respuesta = client.put(f"/api/v1/propiedades/{creada['id']}", json={"m2_construidos": 200})

    assert respuesta.status_code == 200, respuesta.text
    cuerpo = respuesta.json()
    assert Decimal(cuerpo["m2_construidos"]) == 200
    assert Decimal(cuerpo["m2_terreno"]) == 500
    assert Decimal(cuerpo["m2_propios"]) == 180


def test_el_listado_trae_las_superficies_nuevas(client, staff):
    client.post("/api/v1/propiedades", json={"titulo": "Casa", "m2_terreno": 450})

    items = client.get("/api/v1/propiedades").json()

    assert Decimal(items[0]["m2_terreno"]) == 450
    assert items[0]["m2_construidos"] is None
    assert items[0]["m2_propios"] is None
