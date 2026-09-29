"""Registro de auditoría: se escribe solo en cada flush y se consulta por API (solo admin)."""

import pytest

from app.modules.propiedades.models import Propiedad
from app.platform.audit.models import AuditLog
from app.platform.people.models import Person
from tests.helpers_crm import crear_propiedad

API = "/api/v1/audit-log"
PROPIEDADES = "/api/v1/propiedades"


@pytest.fixture
def admin(client, crear_usuario, iniciar_sesion):
    usuario = crear_usuario(roles=("admin",))
    iniciar_sesion()
    return usuario


def _logs(db, entidad="propiedad"):
    return db.query(AuditLog).filter(AuditLog.entidad == entidad).order_by(AuditLog.id).all()


def test_alta_por_api_queda_a_nombre_del_usuario(client, db, admin):
    r = client.post(PROPIEDADES, json={"titulo": "Casa nueva", "precio": "100000"})
    assert r.status_code == 201

    (log,) = _logs(db)
    assert log.accion == "crear"
    assert log.entidad_id == r.json()["id"]
    assert log.user_id == admin.id
    assert log.cambios["titulo"] == "Casa nueva"
    assert log.cambios["precio"] == "100000"
    assert log.cambios["estado_comercial"] == "disponible"


def test_edicion_guarda_solo_lo_que_cambio_con_antes_y_despues(client, db, admin):
    pid = client.post(PROPIEDADES, json={"titulo": "Casa", "precio": "100000"}).json()["id"]

    client.put(f"{PROPIEDADES}/{pid}", json={"precio": "120000", "titulo": "Casa"})

    log = _logs(db)[-1]
    assert log.accion == "editar"
    assert log.cambios == {"precio": ["100000", "120000"]}
    assert log.user_id == admin.id


def test_baja_logica_se_registra_como_baja(client, db, admin):
    pid = client.post(PROPIEDADES, json={"titulo": "Casa"}).json()["id"]

    assert client.delete(f"{PROPIEDADES}/{pid}").status_code == 204

    log = _logs(db)[-1]
    assert log.accion == "baja"
    assert log.cambios["eliminado_en"][0] is None


def test_cambio_sin_sesion_queda_sin_usuario(db):
    prop = crear_propiedad(db)
    prop.precio = 5
    db.commit()

    assert [(log.accion, log.user_id) for log in _logs(db)] == [("crear", None), ("editar", None)]


def test_guardar_sin_cambios_reales_no_registra_nada(db):
    prop = crear_propiedad(db, titulo="Igual")
    prop.titulo = "Igual"
    db.commit()

    assert [log.accion for log in _logs(db)] == ["crear"]


def test_entidades_no_auditadas_no_generan_filas(db):
    db.add(Person(first_name="Ana", last_name="Pérez"))
    db.commit()

    assert db.query(AuditLog).count() == 0


def test_rollback_descarta_lo_anotado(db):
    prop = crear_propiedad(db)
    prop.precio = 999
    db.flush()
    db.rollback()
    db.add(Person(first_name="Ana", last_name="Pérez"))
    db.commit()

    assert [log.accion for log in _logs(db)] == ["crear"]
    assert db.get(Propiedad, prop.id).precio != 999


def test_borrado_fisico_guarda_los_valores_que_tenia(db):
    prop = crear_propiedad(db, titulo="Para borrar")
    db.delete(prop)
    db.commit()

    log = _logs(db)[-1]
    assert log.accion == "borrar"
    assert log.cambios["titulo"] == "Para borrar"


def test_api_lista_lo_mas_nuevo_primero_y_filtra_por_entidad(client, db, admin):
    pid = client.post(PROPIEDADES, json={"titulo": "Casa", "precio": "1"}).json()["id"]
    client.put(f"{PROPIEDADES}/{pid}", json={"precio": "2"})
    crear_propiedad(db, titulo="Otra")

    r = client.get(API, params={"entidad": "propiedad", "entidad_id": pid})

    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["total"] == 2
    assert [i["accion"] for i in cuerpo["items"]] == ["editar", "crear"]
    assert cuerpo["items"][0]["usuario"]["id"] == admin.id


def test_api_es_solo_para_admin(client, db, crear_usuario, iniciar_sesion):
    assert client.get(API).status_code == 401
    crear_usuario(email="staff@mambo.com.ar", roles=("staff",))
    iniciar_sesion(email="staff@mambo.com.ar")
    assert client.get(API).status_code == 403
