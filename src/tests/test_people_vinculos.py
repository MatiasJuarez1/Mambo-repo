from app.platform.activities.models import Activity
from app.platform.deals.models import Deal, DealParty
from app.platform.reservations.models import Reservation
from tests.helpers_crm import crear_persona, crear_propiedad, etapa, pipeline_por_nombre


def test_vinculos_trae_las_cuatro_listas(client, db, crear_usuario, iniciar_sesion):
    usuario = crear_usuario()
    iniciar_sesion()
    persona = crear_persona(db)
    propia = crear_propiedad(db, titulo="Depto propio", propietario_persona_id=persona.id)
    ajena = crear_propiedad(db, titulo="Casa ajena")
    db.add(Reservation(person_id=persona.id, property_id=ajena.id, created_by_user_id=usuario.id))
    venta = pipeline_por_nombre(db, "Venta")
    deal = Deal(
        title="Compra casa", pipeline_id=venta.id, stage_id=etapa(venta, "Visita").id,
        created_by_user_id=usuario.id, property_id=ajena.id,
    )
    db.add(deal)
    db.flush()
    db.add(DealParty(deal_id=deal.id, person_id=persona.id, role="comprador"))
    db.add(Activity(activity_type="visita", title="Visitar", created_by_user_id=usuario.id,
                    person_id=persona.id))
    db.add(Activity(activity_type="llamada", title="Hecha", status="hecha",
                    created_by_user_id=usuario.id, person_id=persona.id))
    db.commit()

    r = client.get(f"/api/v1/people/{persona.id}/vinculos")

    assert r.status_code == 200, r.text
    v = r.json()
    assert [p["titulo"] for p in v["propiedades"]] == ["Depto propio"]
    assert v["propiedades"][0]["foto_principal"] is None
    assert v["reservas"][0]["propiedad"] == {
        "id": ajena.id, "titulo": "Casa ajena", "estado_comercial": "disponible"
    }
    assert v["deals"][0]["role"] == "comprador"
    assert v["deals"][0]["stage"] == "Visita"
    assert v["deals"][0]["pipeline"] == "Venta"
    assert [a["title"] for a in v["actividades"]] == ["Visitar"]  # solo pendientes
    assert propia.id == v["propiedades"][0]["id"]


def test_vinculos_de_persona_inexistente_404(client, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    assert client.get("/api/v1/people/9999/vinculos").status_code == 404
