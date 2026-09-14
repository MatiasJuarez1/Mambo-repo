"""Tabla de transiciones del estado de la propiedad ante reservas y deals (spec 4.5)."""

import pytest
from fastapi import HTTPException

from app.modules.propiedades.models import EstadoComercial as E
from app.modules.propiedades.service import EventoOperacion as Ev
from app.modules.propiedades.service import aplicar_evento_de_operacion
from app.platform.deals.models import Deal
from app.platform.reservations.models import Reservation
from tests.helpers_crm import crear_persona, crear_propiedad, etapa, pipeline_por_nombre


@pytest.mark.parametrize(
    ("antes", "evento", "despues"),
    [
        (E.disponible, Ev.reserva_creada, E.reservada),
        (E.reservada, Ev.reserva_creada, E.reservada),  # reserva "de palabra" cargada a mano
        (E.reservada, Ev.reserva_liberada, E.disponible),
        (E.cerrada, Ev.reserva_liberada, E.cerrada),  # sin cambio
        (E.disponible, Ev.deal_ganado, E.cerrada),
        (E.reservada, Ev.deal_ganado, E.cerrada),
        (E.reservada, Ev.deal_perdido, E.disponible),
        (E.disponible, Ev.deal_perdido, E.disponible),  # sin cambio
        (E.cerrada, Ev.deal_reabierto, E.disponible),
        (E.baja, Ev.deal_reabierto, E.baja),  # sin cambio
    ],
)
def test_transiciones(db, antes, evento, despues):
    prop = crear_propiedad(db, estado=antes)

    aplicar_evento_de_operacion(db, prop.id, evento)
    db.commit()

    assert prop.estado_comercial == despues


@pytest.mark.parametrize(
    ("antes", "evento", "fragmento"),
    [
        (E.cerrada, Ev.reserva_creada, "no está disponible"),
        (E.baja, Ev.reserva_creada, "no está disponible"),
        (E.baja, Ev.deal_ganado, "dada de baja"),
    ],
)
def test_eventos_rechazados(db, antes, evento, fragmento):
    prop = crear_propiedad(db, estado=antes)

    with pytest.raises(HTTPException) as exc:
        aplicar_evento_de_operacion(db, prop.id, evento)

    assert exc.value.status_code == 409
    assert fragmento in exc.value.detail


def test_propiedad_inexistente_404(db):
    with pytest.raises(HTTPException) as exc:
        aplicar_evento_de_operacion(db, 9999, Ev.reserva_creada)
    assert exc.value.status_code == 404


def test_no_se_libera_a_mano_con_reserva_activa(client, db, crear_usuario, iniciar_sesion):
    usuario = crear_usuario()
    iniciar_sesion()
    persona = crear_persona(db)
    prop = crear_propiedad(db, estado=E.reservada)
    reserva = Reservation(
        person_id=persona.id, property_id=prop.id, created_by_user_id=usuario.id, status="activa"
    )
    db.add(reserva)
    db.commit()

    r = client.put(f"/api/v1/propiedades/{prop.id}", json={"estado_comercial": "disponible"})

    assert r.status_code == 409
    assert f"reserva {reserva.id} activa" in r.json()["detail"]
    db.refresh(prop)
    assert prop.estado_comercial == E.reservada


def test_no_se_libera_a_mano_con_deal_ganado(client, db, crear_usuario, iniciar_sesion):
    usuario = crear_usuario()
    iniciar_sesion()
    prop = crear_propiedad(db, estado=E.cerrada)
    venta = pipeline_por_nombre(db, "Venta")
    deal = Deal(
        title="x",
        pipeline_id=venta.id,
        stage_id=etapa(venta, "Ganada").id,
        created_by_user_id=usuario.id,
        property_id=prop.id,
        is_won=True,
    )
    db.add(deal)
    db.commit()

    r = client.put(f"/api/v1/propiedades/{prop.id}", json={"estado_comercial": "disponible"})

    assert r.status_code == 409
    assert f"operación {deal.id} ganada" in r.json()["detail"]


def test_se_libera_a_mano_sin_operaciones(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    prop = crear_propiedad(db, estado=E.cerrada)

    r = client.put(f"/api/v1/propiedades/{prop.id}", json={"estado_comercial": "disponible"})

    assert r.status_code == 200
    assert r.json()["estado_comercial"] == "disponible"
