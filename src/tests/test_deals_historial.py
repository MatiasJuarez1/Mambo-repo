"""Cada deal deja una estadía por etapa; el embudo del Bloque 4 se calcula de ahí."""

from app.platform.deals.models import DealStageHistory
from tests.helpers_crm import crear_persona, crear_propiedad, etapa, pipeline_por_nombre


def _deal(client, db, etapa_nombre="Consulta"):
    p = pipeline_por_nombre(db, "Venta")
    prop = crear_propiedad(db)
    persona = crear_persona(db)
    r = client.post(
        "/api/v1/deals",
        json={
            "title": "Op",
            "pipeline_id": p.id,
            "stage_id": etapa(p, etapa_nombre).id,
            "property_id": prop.id,
            "amount": 100000,
            "parties": [{"person_id": persona.id, "role": "comprador"}],
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def _mover(client, db, deal_id, etapa_nombre):
    p = pipeline_por_nombre(db, "Venta")
    return client.patch(
        f"/api/v1/deals/{deal_id}/stage", json={"stage_id": etapa(p, etapa_nombre).id}
    )


def _estadias(db, deal_id):
    return (
        db.query(DealStageHistory)
        .filter(DealStageHistory.deal_id == deal_id)
        .order_by(DealStageHistory.entered_at, DealStageHistory.id)
        .all()
    )


def test_crear_abre_una_estadia(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    deal = _deal(client, db)

    estadias = _estadias(db, deal["id"])
    assert len(estadias) == 1
    assert estadias[0].stage_id == deal["stage_id"]
    assert estadias[0].left_at is None


def test_mover_cierra_la_anterior_y_abre_otra(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    deal = _deal(client, db)
    assert _mover(client, db, deal["id"], "Visita").status_code == 200
    assert _mover(client, db, deal["id"], "Oferta").status_code == 200

    estadias = _estadias(db, deal["id"])
    assert [e.left_at is None for e in estadias] == [False, False, True]
    p = pipeline_por_nombre(db, "Venta")
    assert estadias[-1].stage_id == etapa(p, "Oferta").id
    assert estadias[0].left_at == estadias[1].entered_at


def test_mover_a_la_misma_etapa_no_agrega(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    deal = _deal(client, db)
    assert _mover(client, db, deal["id"], "Consulta").status_code == 200
    assert len(_estadias(db, deal["id"])) == 1


def test_eliminar_no_toca_el_historial(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    deal = _deal(client, db)
    assert client.delete(f"/api/v1/deals/{deal['id']}").status_code == 204
    assert len(_estadias(db, deal["id"])) == 1
