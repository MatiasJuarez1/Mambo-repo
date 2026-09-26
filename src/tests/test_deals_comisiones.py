"""Comisión de la operación ganada: alta por defecto, reapertura, edición (Bloque 4)."""

from decimal import Decimal

import pytest

from app.platform.deals.models import Comision
from app.platform.inmobiliaria.service import obtener as obtener_inmobiliaria
from tests.helpers_crm import crear_persona, crear_propiedad, etapa, pipeline_por_nombre


@pytest.fixture
def sesion(db, crear_usuario, iniciar_sesion):
    usuario = crear_usuario()
    iniciar_sesion()
    inmo = obtener_inmobiliaria(db)
    inmo.honorarios_venta_pct = Decimal("3")
    inmo.honorarios_alquiler_pct = Decimal("5")
    db.commit()
    return usuario


def _deal(client, db, pipeline="Venta", etapa_nombre="Consulta", con_propiedad=True, **extra):
    p = pipeline_por_nombre(db, pipeline)
    body = {
        "title": "Op",
        "pipeline_id": p.id,
        "stage_id": etapa(p, etapa_nombre).id,
        "amount": 1000000,
        "parties": [{"person_id": crear_persona(db).id, "role": "comprador"}],
    }
    if con_propiedad:
        body["property_id"] = crear_propiedad(db).id
    body.update(extra)
    r = client.post("/api/v1/deals", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def _mover(client, db, deal_id, etapa_nombre, pipeline="Venta"):
    p = pipeline_por_nombre(db, pipeline)
    return client.patch(
        f"/api/v1/deals/{deal_id}/stage", json={"stage_id": etapa(p, etapa_nombre).id}
    )


def _comision(db, deal_id) -> Comision | None:
    db.expire_all()
    return db.query(Comision).filter(Comision.deal_id == deal_id).first()


def test_ganar_venta_crea_comision_con_el_pct_de_la_inmobiliaria(client, db, sesion):
    deal = _deal(client, db, assigned_to_user_id=sesion.id)
    assert _mover(client, db, deal["id"], "Ganada").status_code == 200

    c = _comision(db, deal["id"])
    assert c is not None
    assert c.monto_operacion == Decimal("1000000")
    assert c.moneda == "ARS"
    assert c.pct == Decimal("3")
    assert c.monto == Decimal("30000.00")
    assert c.cobrada is False
    assert [(r.user_id, r.pct) for r in c.reparto] == [(sesion.id, Decimal("100"))]


def test_ganar_alquiler_usa_el_otro_pct_y_sin_asignado_no_reparte(client, db, sesion):
    deal = _deal(client, db, pipeline="Alquiler", amount=200000)
    assert _mover(client, db, deal["id"], "Contrato firmado", "Alquiler").status_code == 200

    c = _comision(db, deal["id"])
    assert c.pct == Decimal("5")
    assert c.monto == Decimal("10000.00")
    assert c.reparto == []


def test_ganar_sin_monto_deja_cero(client, db, sesion):
    deal = _deal(client, db, amount=None)
    _mover(client, db, deal["id"], "Ganada")
    c = _comision(db, deal["id"])
    assert c.monto_operacion == 0 and c.monto == 0 and c.sin_monto


def test_ganar_sin_propiedad_tambien_crea(client, db, sesion):
    deal = _deal(client, db, con_propiedad=False)
    assert _mover(client, db, deal["id"], "Ganada").status_code == 200
    assert _comision(db, deal["id"]) is not None


def test_crear_directo_en_ganada_crea(client, db, sesion):
    deal = _deal(client, db, etapa_nombre="Ganada")
    assert _comision(db, deal["id"]) is not None


def test_pipeline_sin_default_deja_pct_none(client, db, sesion):
    r = client.post(
        "/api/v1/pipelines",
        json={
            "name": "Tasación",
            "stages": [
                {"name": "Inicio", "position": 1},
                {"name": "Hecha", "position": 2, "is_won": True},
            ],
        },
    )
    assert r.status_code == 201, r.text
    pipeline = r.json()
    hecha = next(s for s in pipeline["stages"] if s["is_won"])
    deal = client.post(
        "/api/v1/deals",
        json={"title": "T", "pipeline_id": pipeline["id"], "stage_id": hecha["id"], "amount": 500},
    ).json()
    c = _comision(db, deal["id"])
    assert c.pct is None and c.monto == 0 and c.monto_operacion == Decimal("500")


def test_reabrir_sin_cobrar_borra_la_comision(client, db, sesion):
    deal = _deal(client, db)
    _mover(client, db, deal["id"], "Ganada")
    assert _mover(client, db, deal["id"], "Oferta").status_code == 200
    assert _comision(db, deal["id"]) is None


def test_ganar_de_nuevo_no_duplica(client, db, sesion):
    deal = _deal(client, db)
    _mover(client, db, deal["id"], "Ganada")
    _mover(client, db, deal["id"], "Oferta")
    _mover(client, db, deal["id"], "Ganada")
    assert db.query(Comision).filter(Comision.deal_id == deal["id"]).count() == 1


def test_reabrir_cobrada_409_y_sigue_ganada(client, db, sesion):
    deal = _deal(client, db)
    _mover(client, db, deal["id"], "Ganada")
    c = _comision(db, deal["id"])
    c.cobrada = True
    db.commit()

    r = _mover(client, db, deal["id"], "Oferta")
    assert r.status_code == 409
    assert (
        r.json()["detail"] == "La comisión ya fue cobrada; desmarcala antes de reabrir la operación"
    )
    assert client.get(f"/api/v1/deals/{deal['id']}").json()["is_won"] is True
    assert _comision(db, deal["id"]) is not None


def test_perder_desde_ganada_cobrada_tambien_409(client, db, sesion):
    deal = _deal(client, db)
    _mover(client, db, deal["id"], "Ganada")
    c = _comision(db, deal["id"])
    c.cobrada = True
    db.commit()
    assert _mover(client, db, deal["id"], "Perdida").status_code == 409


def _ganada(client, db, sesion, **extra):
    deal = _deal(client, db, assigned_to_user_id=sesion.id, **extra)
    _mover(client, db, deal["id"], "Ganada")
    return deal


def test_get_devuelve_la_comision_con_reparto(client, db, sesion):
    deal = _ganada(client, db, sesion)
    r = client.get(f"/api/v1/deals/{deal['id']}/comision")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["monto"] == "30000.00"
    assert body["sin_monto"] is False
    assert body["reparto"] == [
        {"user_id": sesion.id, "nombre": sesion.name, "pct": "100.00", "monto": "30000.00"}
    ]


def test_get_sin_comision_404(client, db, sesion):
    deal = _deal(client, db)
    r = client.get(f"/api/v1/deals/{deal['id']}/comision")
    assert r.status_code == 404
    assert r.json()["detail"] == "La operación no tiene comisión cargada"


def test_put_en_no_ganada_409(client, db, sesion):
    deal = _deal(client, db)
    r = client.put(
        f"/api/v1/deals/{deal['id']}/comision",
        json={"monto_operacion": "1000000", "pct": "3"},
    )
    assert r.status_code == 409
    assert r.json()["detail"] == "La operación no está ganada"


def test_put_con_pct_calcula_monto_y_reemplaza_reparto(client, db, sesion, crear_usuario):
    otro = crear_usuario(email="otro@mambo.com.ar", roles=("staff",))
    deal = _ganada(client, db, sesion)
    r = client.put(
        f"/api/v1/deals/{deal['id']}/comision",
        json={
            "monto_operacion": "2000000",
            "pct": "4",
            "reparto": [{"user_id": sesion.id, "pct": "60"}, {"user_id": otro.id, "pct": "40"}],
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["monto"] == "80000.00"
    assert [(x["user_id"], x["monto"]) for x in body["reparto"]] == [
        (sesion.id, "48000.00"),
        (otro.id, "32000.00"),
    ]
    # Un segundo PUT con el mismo agente no choca con el unique del reparto.
    r = client.put(
        f"/api/v1/deals/{deal['id']}/comision",
        json={
            "monto_operacion": "2000000",
            "pct": "4",
            "reparto": [{"user_id": sesion.id, "pct": "100"}],
        },
    )
    assert r.status_code == 200, r.text
    assert len(r.json()["reparto"]) == 1


def test_put_con_monto_lo_respeta(client, db, sesion):
    deal = _ganada(client, db, sesion)
    r = client.put(
        f"/api/v1/deals/{deal['id']}/comision",
        json={"monto_operacion": "1000000", "pct": "3", "monto": "25000"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["monto"] == "25000.00"
    assert r.json()["pct"] == "3.00"


def test_put_crea_si_no_existia(client, db, sesion):
    deal = _ganada(client, db, sesion)
    db.delete(_comision(db, deal["id"]))
    db.commit()
    r = client.put(
        f"/api/v1/deals/{deal['id']}/comision", json={"monto_operacion": "100", "monto": "10"}
    )
    assert r.status_code == 200, r.text
    assert r.json()["pct"] is None


@pytest.mark.parametrize(
    ("body", "fragmento"),
    [
        ({"monto_operacion": "1"}, "porcentaje o monto"),
        (
            {
                "monto_operacion": "1",
                "pct": "1",
                "reparto": [{"user_id": 1, "pct": "70"}, {"user_id": 2, "pct": "40"}],
            },
            "supera el 100",
        ),
        (
            {
                "monto_operacion": "1",
                "pct": "1",
                "reparto": [{"user_id": 1, "pct": "50"}, {"user_id": 1, "pct": "10"}],
            },
            "dos veces",
        ),
        ({"monto_operacion": "1", "pct": "1", "fecha_cobro": "2026-09-01"}, "requiere marcar"),
    ],
)
def test_put_validaciones_422(client, db, sesion, body, fragmento):
    deal = _ganada(client, db, sesion)
    r = client.put(f"/api/v1/deals/{deal['id']}/comision", json=body)
    assert r.status_code == 422
    assert fragmento in r.text


def test_put_usuario_inexistente_404(client, db, sesion):
    deal = _ganada(client, db, sesion)
    r = client.put(
        f"/api/v1/deals/{deal['id']}/comision",
        json={"monto_operacion": "1", "pct": "1", "reparto": [{"user_id": 999, "pct": "10"}]},
    )
    assert r.status_code == 404
    assert r.json()["detail"] == "Usuario 999 no encontrado"


def test_put_cobrada_sin_fecha_pone_hoy_y_descobrar_la_borra(client, db, sesion):
    from datetime import date

    deal = _ganada(client, db, sesion)
    url = f"/api/v1/deals/{deal['id']}/comision"
    r = client.put(url, json={"monto_operacion": "1", "pct": "1", "cobrada": True})
    assert r.json()["fecha_cobro"] == date.today().isoformat()
    r = client.put(url, json={"monto_operacion": "1", "pct": "1", "cobrada": False})
    assert r.json()["fecha_cobro"] is None


def test_comision_requiere_staff(client, db):
    r = client.get("/api/v1/deals/1/comision")
    assert r.status_code == 401
