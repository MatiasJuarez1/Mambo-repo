"""Roles derivados de persona: propietario, comprador, vendedor, inquilino, interesado."""
from __future__ import annotations

from app.platform.deals.models import Deal, DealParty
from app.platform.reservations.models import Reservation
from tests.helpers_crm import crear_persona, crear_propiedad, etapa, pipeline_por_nombre

CERO = {"propietario": 0, "comprador": 0, "vendedor": 0, "inquilino": 0, "interesado": 0}


def _deal(db, usuario, pipeline, etapa_nombre, partes):
    p = pipeline_por_nombre(db, pipeline)
    e = etapa(p, etapa_nombre)
    deal = Deal(
        title="x", pipeline_id=p.id, stage_id=e.id, created_by_user_id=usuario.id,
        is_won=e.is_won, is_lost=e.is_lost,
    )
    db.add(deal)
    db.flush()
    for persona, rol in partes:
        db.add(DealParty(deal_id=deal.id, person_id=persona.id, role=rol))
    db.commit()
    return deal


def test_persona_sin_vinculos_tiene_todo_en_cero(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    persona = crear_persona(db)

    assert client.get(f"/api/v1/people/{persona.id}").json()["roles"] == CERO


def test_propietario_sale_de_las_propiedades(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    persona = crear_persona(db)
    crear_propiedad(db, propietario_persona_id=persona.id)
    crear_propiedad(db, propietario_persona_id=persona.id)

    assert client.get(f"/api/v1/people/{persona.id}").json()["roles"]["propietario"] == 2


def test_roles_de_deals_ganados_y_abiertos(client, db, crear_usuario, iniciar_sesion):
    usuario = crear_usuario()
    iniciar_sesion()
    ana, bruno = crear_persona(db), crear_persona(db, first_name="Bruno")
    _deal(db, usuario, "Venta", "Ganada", [(ana, "comprador"), (bruno, "vendedor")])
    _deal(db, usuario, "Alquiler", "Contrato firmado", [(ana, "inquilino")])
    _deal(db, usuario, "Venta", "Visita", [(bruno, "comprador")])  # abierto: interesado

    roles_ana = client.get(f"/api/v1/people/{ana.id}").json()["roles"]
    roles_bruno = client.get(f"/api/v1/people/{bruno.id}").json()["roles"]

    assert roles_ana == {**CERO, "comprador": 1, "inquilino": 1}
    assert roles_bruno == {**CERO, "vendedor": 1, "interesado": 1}


def test_reserva_activa_cuenta_como_interesado(client, db, crear_usuario, iniciar_sesion):
    usuario = crear_usuario()
    iniciar_sesion()
    persona = crear_persona(db)
    prop = crear_propiedad(db)
    db.add(Reservation(person_id=persona.id, property_id=prop.id, created_by_user_id=usuario.id))
    db.commit()

    assert client.get(f"/api/v1/people/{persona.id}").json()["roles"]["interesado"] == 1


def test_filtro_por_rol_y_roles_en_el_listado(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    ana, bruno = crear_persona(db), crear_persona(db, first_name="Bruno")
    crear_propiedad(db, propietario_persona_id=ana.id)

    r = client.get("/api/v1/people?rol=propietario")

    assert [p["id"] for p in r.json()["items"]] == [ana.id]
    assert r.json()["items"][0]["roles"]["propietario"] == 1
    assert client.get("/api/v1/people?rol=comprador").json()["total"] == 0
    assert bruno.id in [p["id"] for p in client.get("/api/v1/people").json()["items"]]
