"""Crear, cancelar, vencer y convertir una reserva mueven (o no) el estado de la propiedad."""

from app.modules.propiedades.models import EstadoComercial as E
from app.platform.reservations.models import Reservation
from tests.helpers_crm import crear_persona, crear_propiedad


def _reservar(client, prop_id, persona_id):
    return client.post(
        "/api/v1/reservations",
        json={"person_id": persona_id, "property_id": prop_id, "amount": 1000},
    )


def test_reservar_deja_la_propiedad_reservada(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    prop = crear_propiedad(db)
    persona = crear_persona(db)

    r = _reservar(client, prop.id, persona.id)

    assert r.status_code == 201, r.text
    assert r.json()["propiedad"] == {"id": prop.id, "titulo": prop.titulo, "estado_comercial": "reservada"}
    db.refresh(prop)
    assert prop.estado_comercial == E.reservada


def test_reservar_una_cerrada_da_409_y_no_crea_la_fila(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    prop = crear_propiedad(db, estado=E.cerrada)
    persona = crear_persona(db)

    r = _reservar(client, prop.id, persona.id)

    assert r.status_code == 409
    assert "no está disponible" in r.json()["detail"]
    assert db.query(Reservation).count() == 0


def test_reservar_una_propiedad_inexistente_da_404(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    persona = crear_persona(db)

    assert _reservar(client, 9999, persona.id).status_code == 404


def test_cancelar_y_vencer_liberan(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    persona = crear_persona(db)
    for accion in ("cancel", "expire"):
        prop = crear_propiedad(db)
        reserva_id = _reservar(client, prop.id, persona.id).json()["id"]

        r = client.patch(f"/api/v1/reservations/{reserva_id}/{accion}")

        assert r.status_code == 200, r.text
        db.refresh(prop)
        assert prop.estado_comercial == E.disponible


def test_convertir_no_toca_la_propiedad(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    prop = crear_propiedad(db)
    persona = crear_persona(db)
    reserva_id = _reservar(client, prop.id, persona.id).json()["id"]

    r = client.patch(f"/api/v1/reservations/{reserva_id}/convert")

    assert r.status_code == 200
    db.refresh(prop)
    assert prop.estado_comercial == E.reservada
