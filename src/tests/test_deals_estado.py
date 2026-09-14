"""Ganar, perder y reabrir un deal mueven la propiedad y su reserva (spec 4.5)."""

from app.modules.propiedades.models import EstadoComercial as E
from app.platform.reservations.models import Reservation
from tests.helpers_crm import crear_persona, crear_propiedad, etapa, pipeline_por_nombre


def _deal(client, db, prop_id, persona_id, etapa_nombre="Consulta", pipeline="Venta"):
    p = pipeline_por_nombre(db, pipeline)
    r = client.post(
        "/api/v1/deals",
        json={
            "title": "Op",
            "pipeline_id": p.id,
            "stage_id": etapa(p, etapa_nombre).id,
            "property_id": prop_id,
            "amount": 100000,
            "parties": [{"person_id": persona_id, "role": "comprador"}],
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def _mover(client, db, deal_id, etapa_nombre, pipeline="Venta"):
    p = pipeline_por_nombre(db, pipeline)
    return client.patch(
        f"/api/v1/deals/{deal_id}/stage", json={"stage_id": etapa(p, etapa_nombre).id}
    )


def test_ganar_cierra_la_propiedad_y_convierte_la_reserva(
    client, db, crear_usuario, iniciar_sesion
):
    usuario = crear_usuario()
    iniciar_sesion()
    prop = crear_propiedad(db, estado=E.reservada)
    persona = crear_persona(db)
    reserva = Reservation(
        person_id=persona.id, property_id=prop.id, created_by_user_id=usuario.id, status="activa"
    )
    db.add(reserva)
    db.commit()
    deal = _deal(client, db, prop.id, persona.id)

    r = _mover(client, db, deal["id"], "Ganada")

    assert r.status_code == 200, r.text
    assert r.json()["propiedad"]["estado_comercial"] == "cerrada"
    db.refresh(prop)
    db.refresh(reserva)
    assert prop.estado_comercial == E.cerrada
    assert reserva.status == "convertida"


def test_perder_cancela_la_reserva_y_libera(client, db, crear_usuario, iniciar_sesion):
    usuario = crear_usuario()
    iniciar_sesion()
    prop = crear_propiedad(db, estado=E.reservada)
    persona = crear_persona(db)
    reserva = Reservation(
        person_id=persona.id, property_id=prop.id, created_by_user_id=usuario.id, status="activa"
    )
    db.add(reserva)
    db.commit()
    deal = _deal(client, db, prop.id, persona.id)

    assert _mover(client, db, deal["id"], "Perdida").status_code == 200
    db.refresh(prop)
    db.refresh(reserva)
    assert prop.estado_comercial == E.disponible
    assert reserva.status == "cancelada"


def test_reabrir_devuelve_a_disponible(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    prop = crear_propiedad(db)
    persona = crear_persona(db)
    deal = _deal(client, db, prop.id, persona.id)
    _mover(client, db, deal["id"], "Ganada")

    assert _mover(client, db, deal["id"], "Oferta").status_code == 200
    db.refresh(prop)
    assert prop.estado_comercial == E.disponible


def test_ganar_una_dada_de_baja_da_409_y_no_mueve(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    prop = crear_propiedad(db)
    persona = crear_persona(db)
    deal = _deal(client, db, prop.id, persona.id)
    prop.estado_comercial = E.baja
    db.commit()

    r = _mover(client, db, deal["id"], "Ganada")

    assert r.status_code == 409
    assert "dada de baja" in r.json()["detail"]
    assert client.get(f"/api/v1/deals/{deal['id']}").json()["is_won"] is False


def test_deal_sin_propiedad_no_toca_nada(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    crear_persona(db)
    p = pipeline_por_nombre(db, "Venta")
    r = client.post(
        "/api/v1/deals",
        json={
            "title": "Compró por afuera",
            "pipeline_id": p.id,
            "stage_id": etapa(p, "Consulta").id,
        },
    )
    deal_id = r.json()["id"]

    r = _mover(client, db, deal_id, "Ganada")

    assert r.status_code == 200
    assert r.json()["propiedad"] is None
    assert r.json()["is_won"] is True


def test_partes_traen_a_la_persona_y_admiten_inquilino(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    prop = crear_propiedad(db)
    persona = crear_persona(db)
    deal = _deal(client, db, prop.id, persona.id)

    r = client.post(
        f"/api/v1/deals/{deal['id']}/parties", json={"person_id": persona.id, "role": "inquilino"}
    )

    assert r.status_code == 201, r.text
    assert r.json()["person"] == {"id": persona.id, "full_name": "Ana Pérez"}
    detalle = client.get(f"/api/v1/deals/{deal['id']}").json()
    assert {p["role"] for p in detalle["parties"]} == {"comprador", "inquilino"}
    assert detalle["dias_en_etapa"] == 0
