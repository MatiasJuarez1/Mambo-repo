"""Reordenar fotos: persiste `orden` y la primera pasa a ser la principal."""

import pytest
from sqlalchemy.orm import Session as DBSession

from app.modules.propiedades.models import Propiedad, PropiedadMedio


@pytest.fixture
def staff(crear_usuario, iniciar_sesion):
    crear_usuario(email="staff.fotos@mambo.com.ar", roles=("staff",))
    iniciar_sesion(email="staff.fotos@mambo.com.ar")


def _propiedad_con_fotos(db: DBSession, titulo: str, cantidad: int) -> tuple[Propiedad, list[int]]:
    prop = Propiedad(titulo=titulo)
    db.add(prop)
    db.flush()
    medios = [
        PropiedadMedio(
            propiedad_id=prop.id,
            url=f"http://ejemplo.test/{titulo}-{i}.jpg",
            orden=i,
            es_principal=i == 0,
        )
        for i in range(cantidad)
    ]
    db.add_all(medios)
    db.commit()
    return prop, [m.id for m in medios]


def _ruta(propiedad_id: int) -> str:
    return f"/api/v1/propiedades/{propiedad_id}/medios/orden"


def test_reordenar_devuelve_el_nuevo_orden_y_la_primera_es_principal(client, db, staff):
    prop, (a, b, c) = _propiedad_con_fotos(db, "casa", 3)

    respuesta = client.put(_ruta(prop.id), json={"orden": [c, a, b]})

    assert respuesta.status_code == 200, respuesta.text
    cuerpo = respuesta.json()
    assert [m["id"] for m in cuerpo] == [c, a, b]
    assert [m["orden"] for m in cuerpo] == [0, 1, 2]
    assert [m["es_principal"] for m in cuerpo] == [True, False, False]


def test_el_orden_queda_persistido(client, db, staff):
    prop, (a, b, c) = _propiedad_con_fotos(db, "casa", 3)

    client.put(_ruta(prop.id), json={"orden": [b, c, a]})

    medios = client.get(f"/api/v1/propiedades/{prop.id}").json()["medios"]
    assert [m["id"] for m in medios] == [b, c, a]
    principal = [m["id"] for m in medios if m["es_principal"]]
    assert principal == [b]


def test_un_id_de_otra_propiedad_da_400(client, db, staff):
    prop, (a, b) = _propiedad_con_fotos(db, "casa", 2)
    _, (ajena,) = _propiedad_con_fotos(db, "otra", 1)

    respuesta = client.put(_ruta(prop.id), json={"orden": [a, b, ajena]})

    assert respuesta.status_code == 400


def test_si_falta_un_id_da_400_y_no_cambia_nada(client, db, staff):
    prop, (a, b, c) = _propiedad_con_fotos(db, "casa", 3)

    respuesta = client.put(_ruta(prop.id), json={"orden": [c, a]})

    assert respuesta.status_code == 400
    medios = client.get(f"/api/v1/propiedades/{prop.id}").json()["medios"]
    assert [m["id"] for m in medios] == [a, b, c]


def test_ids_duplicados_dan_400(client, db, staff):
    prop, (a, b) = _propiedad_con_fotos(db, "casa", 2)

    respuesta = client.put(_ruta(prop.id), json={"orden": [a, a, b]})

    assert respuesta.status_code == 400


def test_propiedad_inexistente_da_404(client, staff):
    assert client.put(_ruta(999999), json={"orden": []}).status_code == 404
