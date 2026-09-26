"""Bloque 5a: actividades y agenda — CRUD, vínculos opcionales y cambios de estado."""

import pytest

from app.platform.activities.models import Activity
from tests.helpers_crm import crear_deal, crear_persona, crear_propiedad


@pytest.fixture
def sesion(client, crear_usuario, iniciar_sesion):
    usuario = crear_usuario()
    iniciar_sesion()
    return usuario


def test_modelo_activity_se_persiste_con_deal_id(client, db, sesion):
    deal_id = crear_deal(client, db)
    actividad = Activity(
        title="Llamar por seña",
        activity_type="llamada",
        deal_id=deal_id,
        created_by_user_id=sesion.id,
    )
    db.add(actividad)
    db.commit()
    db.refresh(actividad)

    assert actividad.id is not None
    assert actividad.deal_id == deal_id
    assert actividad.deal.id == deal_id
    assert actividad.status == "pendiente"


API = "/api/v1/activities"


def test_crear_con_person_id_inexistente_404(client, db, sesion):
    r = client.post(API, json={"title": "Llamar", "activity_type": "llamada", "person_id": 9999})
    assert r.status_code == 404
    assert r.json()["detail"] == "Persona no encontrada"


def test_crear_con_property_id_inexistente_404(client, db, sesion):
    r = client.post(API, json={"title": "Visitar", "activity_type": "visita", "property_id": 9999})
    assert r.status_code == 404
    assert r.json()["detail"] == "Propiedad no encontrada"


def test_crear_con_deal_id_inexistente_404(client, db, sesion):
    r = client.post(API, json={"title": "Seguimiento", "activity_type": "tarea", "deal_id": 9999})
    assert r.status_code == 404
    assert r.json()["detail"] == "Deal no encontrado"


def test_editar_con_deal_id_inexistente_404(client, db, sesion):
    r = client.post(API, json={"title": "Tarea", "activity_type": "tarea"})
    activity_id = r.json()["id"]
    r = client.patch(f"{API}/{activity_id}", json={"deal_id": 9999})
    assert r.status_code == 404
    assert r.json()["detail"] == "Deal no encontrado"


def test_crear_con_deal_id_valido_lo_persiste_y_lo_expone(client, db, sesion):
    deal_id = crear_deal(client, db)
    r = client.post(API, json={"title": "Firma", "activity_type": "tarea", "deal_id": deal_id})
    assert r.status_code == 201, r.text
    cuerpo = r.json()
    assert cuerpo["deal"] == {"id": deal_id, "title": "Op"}


def test_listar_filtra_por_deal_id(client, db, sesion):
    deal_a = crear_deal(client, db)
    deal_b = crear_deal(client, db)
    client.post(API, json={"title": "A", "activity_type": "tarea", "deal_id": deal_a})
    client.post(API, json={"title": "B", "activity_type": "tarea", "deal_id": deal_b})

    r = client.get(f"{API}?deal_id={deal_a}")
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["title"] == "A"


def test_activity_out_expone_asignado_con_nombre_y_propiedad_con_titulo(client, db, sesion):
    prop = crear_propiedad(db, titulo="Casa en Villa Elisa")
    r = client.post(
        API,
        json={
            "title": "Mostrar casa",
            "activity_type": "visita",
            "property_id": prop.id,
            "assigned_to_user_id": sesion.id,
        },
    )
    assert r.status_code == 201, r.text
    cuerpo = r.json()
    assert cuerpo["assigned_to"] == {"id": sesion.id, "name": sesion.name, "email": sesion.email}
    assert cuerpo["propiedad"]["id"] == prop.id
    assert cuerpo["propiedad"]["titulo"] == "Casa en Villa Elisa"


# ---------------------------------------------------------------------------
# CRUD base
# ---------------------------------------------------------------------------


def test_crear_actividad_minima(client, db, sesion):
    r = client.post(API, json={"title": "Llamar a Fernández", "activity_type": "llamada"})
    assert r.status_code == 201, r.text
    cuerpo = r.json()
    assert cuerpo["status"] == "pendiente"
    assert cuerpo["person"] is None
    assert cuerpo["propiedad"] is None
    assert cuerpo["deal"] is None
    assert cuerpo["created_by"]["id"] == sesion.id


def test_crear_actividad_con_persona(client, db, sesion):
    persona = crear_persona(db, first_name="Fernanda", last_name="Gómez")
    r = client.post(
        API, json={"title": "Llamar", "activity_type": "llamada", "person_id": persona.id}
    )
    assert r.status_code == 201, r.text
    assert r.json()["person"] == {"id": persona.id, "full_name": "Fernanda Gómez"}


def test_obtener_actividad(client, db, sesion):
    creada = client.post(API, json={"title": "Tarea", "activity_type": "tarea"}).json()
    r = client.get(f"{API}/{creada['id']}")
    assert r.status_code == 200
    assert r.json()["id"] == creada["id"]


def test_obtener_actividad_inexistente_404(client, db, sesion):
    r = client.get(f"{API}/9999")
    assert r.status_code == 404
    assert r.json()["detail"] == "Actividad no encontrada"


def test_editar_actividad(client, db, sesion):
    creada = client.post(API, json={"title": "Tarea", "activity_type": "tarea"}).json()
    r = client.patch(f"{API}/{creada['id']}", json={"title": "Tarea actualizada"})
    assert r.status_code == 200
    assert r.json()["title"] == "Tarea actualizada"


def test_editar_actividad_hecha_409(client, db, sesion):
    creada = client.post(API, json={"title": "Tarea", "activity_type": "tarea"}).json()
    client.patch(f"{API}/{creada['id']}/done")
    r = client.patch(f"{API}/{creada['id']}", json={"title": "Otra cosa"})
    assert r.status_code == 409
    assert r.json()["detail"] == "No se puede editar una actividad ya completada"


def test_borrar_actividad(client, db, sesion):
    creada = client.post(API, json={"title": "Tarea", "activity_type": "tarea"}).json()
    r = client.delete(f"{API}/{creada['id']}")
    assert r.status_code == 204
    assert client.get(f"{API}/{creada['id']}").status_code == 404

    r = client.delete(f"{API}/{creada['id']}")
    assert r.status_code == 404
    assert r.json()["detail"] == "Actividad no encontrada"


# ---------------------------------------------------------------------------
# Cambios de estado
# ---------------------------------------------------------------------------


def test_marcar_hecha(client, db, sesion):
    creada = client.post(API, json={"title": "Tarea", "activity_type": "tarea"}).json()
    r = client.patch(f"{API}/{creada['id']}/done")
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["status"] == "hecha"
    assert cuerpo["done_at"] is not None


def test_marcar_hecha_dos_veces_409(client, db, sesion):
    creada = client.post(API, json={"title": "Tarea", "activity_type": "tarea"}).json()
    client.patch(f"{API}/{creada['id']}/done")
    r = client.patch(f"{API}/{creada['id']}/done")
    assert r.status_code == 409
    assert r.json()["detail"] == "La actividad ya está completada"


def test_cancelar_pendiente(client, db, sesion):
    creada = client.post(API, json={"title": "Tarea", "activity_type": "tarea"}).json()
    r = client.patch(f"{API}/{creada['id']}/cancel")
    assert r.status_code == 200
    assert r.json()["status"] == "cancelada"


def test_cancelar_no_pendiente_409(client, db, sesion):
    creada = client.post(API, json={"title": "Tarea", "activity_type": "tarea"}).json()
    client.patch(f"{API}/{creada['id']}/done")
    r = client.patch(f"{API}/{creada['id']}/cancel")
    assert r.status_code == 409
    assert r.json()["detail"] == "Solo se pueden cancelar actividades pendientes"


# ---------------------------------------------------------------------------
# Listado: filtros y orden
# ---------------------------------------------------------------------------


def test_listar_filtra_por_status_type_y_assigned_to(client, db, sesion):
    a = client.post(API, json={"title": "A", "activity_type": "llamada"}).json()
    b = client.post(
        API, json={"title": "B", "activity_type": "visita", "assigned_to_user_id": sesion.id}
    ).json()
    client.patch(f"{API}/{a['id']}/cancel")

    r = client.get(f"{API}?status=cancelada")
    assert [i["title"] for i in r.json()["items"]] == ["A"]

    r = client.get(f"{API}?type=visita")
    assert [i["title"] for i in r.json()["items"]] == ["B"]

    r = client.get(f"{API}?assigned_to_user_id={sesion.id}")
    assert [i["id"] for i in r.json()["items"]] == [b["id"]]


def test_listar_con_status_o_type_invalido_422(client, db, sesion):
    """Los filtros están tipados con los enums: un valor libre lo rechaza FastAPI, no el service."""
    assert client.get(f"{API}?status=foo").status_code == 422
    assert client.get(f"{API}?type=foo").status_code == 422


def test_listar_ordena_por_vencimiento_con_nulls_al_final(client, db, sesion):
    sin_vencimiento = client.post(API, json={"title": "Sin fecha", "activity_type": "tarea"}).json()
    lejos = client.post(
        API,
        json={
            "title": "Lejos",
            "activity_type": "tarea",
            "due_at": "2026-12-01T10:00:00Z",
        },
    ).json()
    cerca = client.post(
        API,
        json={
            "title": "Cerca",
            "activity_type": "tarea",
            "due_at": "2026-09-25T10:00:00Z",
        },
    ).json()

    r = client.get(API)
    ids = [i["id"] for i in r.json()["items"]]
    assert ids == [cerca["id"], lejos["id"], sin_vencimiento["id"]]


# ---------------------------------------------------------------------------
# Permisos
# ---------------------------------------------------------------------------


def test_anonimo_401_en_lectura_y_escritura(client, db):
    assert client.get(API).status_code == 401
    assert client.get(f"{API}/1").status_code == 401
    assert client.post(API, json={"title": "X", "activity_type": "tarea"}).status_code == 401
    assert client.patch(f"{API}/1", json={"title": "Y"}).status_code == 401
    assert client.delete(f"{API}/1").status_code == 401
    assert client.patch(f"{API}/1/done").status_code == 401
    assert client.patch(f"{API}/1/cancel").status_code == 401


def test_lectura_no_exige_rol_staff(client, db, crear_usuario, iniciar_sesion):
    """A diferencia de la escritura, `GET` solo exige sesión (`get_current_user`), no rol."""
    crear_usuario(email="curioso@mambo.com.ar", roles=("cliente",))
    iniciar_sesion(email="curioso@mambo.com.ar")
    assert client.get(API).status_code == 200


def test_escritura_sin_rol_suficiente_da_403(client, db, crear_usuario, iniciar_sesion):
    crear_usuario(email="curioso@mambo.com.ar", roles=("cliente",))
    iniciar_sesion(email="curioso@mambo.com.ar")

    assert client.post(API, json={"title": "X", "activity_type": "tarea"}).status_code == 403
    assert client.patch(f"{API}/1", json={"title": "Y"}).status_code == 403
    assert client.delete(f"{API}/1").status_code == 403
    assert client.patch(f"{API}/1/done").status_code == 403
    assert client.patch(f"{API}/1/cancel").status_code == 403
