"""Reportes de solo lectura del Bloque 4: operaciones, comisiones, embudo, alquileres."""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest

from app.platform.deals.models import Comision, Deal
from app.platform.inmobiliaria.service import obtener as obtener_inmobiliaria
from app.platform.reportes.service import meses_del_rango
from tests.helpers_crm import crear_persona, crear_propiedad, etapa, pipeline_por_nombre

HOY = date.today()
MES_ACTUAL = HOY.replace(day=1)
MES_PASADO = (MES_ACTUAL - timedelta(days=1)).replace(day=1)
YM = "%Y-%m"


@pytest.fixture
def sesion(db, crear_usuario, iniciar_sesion):
    usuario = crear_usuario()
    iniciar_sesion()
    inmo = obtener_inmobiliaria(db)
    inmo.honorarios_venta_pct = Decimal("3")
    db.commit()
    return usuario


def _deal(client, db, pipeline="Venta", asignado=None, **extra):
    p = pipeline_por_nombre(db, pipeline)
    body = {
        "title": "Op",
        "pipeline_id": p.id,
        "stage_id": etapa(p, "Consulta").id,
        "property_id": crear_propiedad(db).id,
        "amount": 1000000,
        "currency": "ARS",
        "assigned_to_user_id": asignado,
        "parties": [{"person_id": crear_persona(db).id, "role": "comprador"}],
    }
    body.update(extra)
    r = client.post("/api/v1/deals", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def _mover(client, db, deal_id, etapa_nombre, pipeline="Venta"):
    p = pipeline_por_nombre(db, pipeline)
    r = client.patch(f"/api/v1/deals/{deal_id}/stage", json={"stage_id": etapa(p, etapa_nombre).id})
    assert r.status_code == 200, r.text


def _cerrar_en(db, deal_id, dia: date):
    """Los tests cierran hoy; esto mueve `closed_at` al mes que se quiere."""
    deal = db.get(Deal, deal_id)
    deal.closed_at = datetime.combine(dia, datetime.min.time(), tzinfo=UTC).replace(hour=12)
    db.commit()


@pytest.fixture
def escenario(client, db, sesion, crear_usuario):
    """Mes pasado: venta ganada 1.000.000 ARS (comisión 30.000, cobrada, 60/40 con `otro`)
    y venta perdida. Este mes: venta ganada en USD 100.000 sin comisión cargada
    (se borra) y alquiler ganado 200.000 ARS sin asignado (comisión con pct None → 0)."""
    otro = crear_usuario(email="otro@mambo.com.ar", roles=("staff",))
    g1 = _deal(client, db, asignado=sesion.id)
    _mover(client, db, g1["id"], "Ganada")
    _cerrar_en(db, g1["id"], MES_PASADO + timedelta(days=5))
    r = client.put(
        f"/api/v1/deals/{g1['id']}/comision",
        json={
            "monto_operacion": "1000000",
            "pct": "3",
            "cobrada": True,
            "reparto": [{"user_id": sesion.id, "pct": "60"}, {"user_id": otro.id, "pct": "40"}],
        },
    )
    assert r.status_code == 200, r.text
    p1 = _deal(client, db, asignado=sesion.id)
    _mover(client, db, p1["id"], "Perdida")
    _cerrar_en(db, p1["id"], MES_PASADO + timedelta(days=6))

    g2 = _deal(client, db, asignado=otro.id, amount=100000, currency="USD")
    _mover(client, db, g2["id"], "Ganada")
    # Vía ORM para que el cascade borre el reparto también en SQLite (sin FK activas).
    db.delete(db.query(Comision).filter(Comision.deal_id == g2["id"]).one())
    db.commit()

    g3 = _deal(client, db, pipeline="Alquiler", asignado=None, amount=200000)
    _mover(client, db, g3["id"], "Contrato firmado", "Alquiler")
    return {"otro": otro, "g1": g1, "p1": p1, "g2": g2, "g3": g3}


def test_meses_del_rango_inclusive():
    assert meses_del_rango(date(2026, 11, 15), date(2027, 1, 3)) == [
        "2026-11",
        "2026-12",
        "2027-01",
    ]


def test_operaciones_agrupa_por_mes_y_moneda_con_ceros(client, escenario):
    r = client.get(f"/api/v1/reportes/operaciones?desde={MES_PASADO}&hasta={HOY}")
    assert r.status_code == 200, r.text
    body = r.json()
    filas = {(f["mes"], f["moneda"]): f for f in body["filas"]}
    meses = (MES_PASADO.strftime(YM), MES_ACTUAL.strftime(YM))
    assert set(filas) == {(m, mo) for m in meses for mo in ("ARS", "USD")}
    pasado = filas[(MES_PASADO.strftime(YM), "ARS")]
    assert (pasado["ganadas"], pasado["perdidas"]) == (1, 1)
    assert pasado["monto_ganado"] == "1000000.00"
    assert pasado["comisiones"] == "30000.00"
    assert pasado["comisiones_cobradas"] == "30000.00"
    actual_usd = filas[(MES_ACTUAL.strftime(YM), "USD")]
    assert actual_usd["ganadas"] == 1 and actual_usd["comisiones"] == "0.00"
    assert filas[(MES_PASADO.strftime(YM), "USD")]["ganadas"] == 0
    totales = {t["moneda"]: t for t in body["totales"]}
    assert totales["ARS"]["mes"] == "total"
    assert totales["ARS"]["ganadas"] == 2  # la venta y el alquiler
    assert totales["USD"]["monto_ganado"] == "100000.00"


def test_operaciones_filtra_por_pipeline_y_agente(client, db, escenario):
    alquiler = pipeline_por_nombre(db, "Alquiler")
    r = client.get(f"/api/v1/reportes/operaciones?pipeline_id={alquiler.id}")
    assert sum(f["ganadas"] for f in r.json()["filas"]) == 1
    r = client.get(f"/api/v1/reportes/operaciones?agente_id={escenario['otro'].id}")
    assert sum(f["ganadas"] for f in r.json()["filas"]) == 1
    assert sum(f["perdidas"] for f in r.json()["filas"]) == 0


def test_operaciones_default_son_doce_meses(client, sesion):
    body = client.get("/api/v1/reportes/operaciones").json()
    assert len(body["filas"]) == 12  # sin datos: solo ARS
    assert body["hasta"] == HOY.isoformat()


def test_periodo_invertido_422(client, sesion):
    r = client.get("/api/v1/reportes/operaciones?desde=2026-05-01&hasta=2026-04-01")
    assert r.status_code == 422
    assert r.json()["detail"] == "El período termina antes de empezar"


def test_comisiones_detalle_y_por_agente(client, sesion, escenario):
    r = client.get(f"/api/v1/reportes/comisiones?desde={MES_PASADO}&hasta={HOY}")
    assert r.status_code == 200, r.text
    body = r.json()
    # g1 (cobrada, con reparto) y g3 (alquiler, monto 0); g2 no tiene comisión.
    assert [f["deal_id"] for f in body["filas"]] == [escenario["g3"]["id"], escenario["g1"]["id"]]
    g1 = body["filas"][1]
    assert g1["cobrada"] is True and g1["pipeline"] == "Venta"
    assert [(x["nombre"], x["monto"]) for x in g1["reparto"]] == [
        (sesion.name, "18000.00"),
        ("otro", "12000.00"),
    ]
    agentes = {(a["user_id"], a["moneda"]): a for a in body["por_agente"]}
    assert agentes[(sesion.id, "ARS")]["comision"] == "18000.00"
    assert agentes[(sesion.id, "ARS")]["cobrada"] == "18000.00"
    assert agentes[(escenario["otro"].id, "ARS")]["operaciones"] == 1
    assert (None, "ARS") not in agentes  # el 100 % está repartido y g3 vale 0


def test_comisiones_no_repartida_va_a_sin_asignar(client, sesion, escenario):
    client.put(
        f"/api/v1/deals/{escenario['g1']['id']}/comision",
        json={
            "monto_operacion": "1000000",
            "pct": "3",
            "reparto": [{"user_id": sesion.id, "pct": "50"}],
        },
    )
    body = client.get(f"/api/v1/reportes/comisiones?desde={MES_PASADO}").json()
    resto = next(a for a in body["por_agente"] if a["user_id"] is None)
    assert resto["nombre"] == "Sin asignar" and resto["comision"] == "15000.00"


def test_comisiones_filtra_cobrada_y_agente(client, sesion, escenario):
    body = client.get(f"/api/v1/reportes/comisiones?desde={MES_PASADO}&cobrada=false").json()
    assert [f["deal_id"] for f in body["filas"]] == [escenario["g3"]["id"]]
    otro = escenario["otro"].id
    body = client.get(f"/api/v1/reportes/comisiones?desde={MES_PASADO}&agente_id={otro}").json()
    assert [f["deal_id"] for f in body["filas"]] == [escenario["g1"]["id"]]


def test_csv_operaciones(client, escenario):
    r = client.get(f"/api/v1/reportes/operaciones?desde={MES_PASADO}&hasta={HOY}&formato=csv")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    esperado = f'attachment; filename="operaciones_{MES_PASADO}_{HOY}.csv"'
    assert r.headers["content-disposition"] == esperado
    assert r.content.startswith("﻿".encode())
    lineas = r.content.decode("utf-8-sig").splitlines()
    assert lineas[0] == "mes;moneda;ganadas;perdidas;monto_ganado;comisiones;comisiones_cobradas"
    assert f"{MES_PASADO.strftime(YM)};ARS;1;1;1000000,00;30000,00;30000,00" in lineas


def test_csv_comisiones_aplana_el_reparto(client, sesion, escenario):
    r = client.get(f"/api/v1/reportes/comisiones?desde={MES_PASADO}&formato=csv")
    texto = r.content.decode("utf-8-sig")
    assert f"{sesion.name} 60,00 % · otro 40,00 %" in texto
    assert ";Sí;" in texto


def test_reportes_requieren_staff(client):
    assert client.get("/api/v1/reportes/operaciones").status_code == 401


def test_embudo_conversion_y_dias(client, db, sesion):
    from app.platform.deals.models import DealStageHistory

    venta = pipeline_por_nombre(db, "Venta")
    a = _deal(client, db)  # Consulta → Visita → Ganada
    _mover(client, db, a["id"], "Visita")
    _mover(client, db, a["id"], "Ganada")
    b = _deal(client, db)  # Consulta → Perdida
    _mover(client, db, b["id"], "Perdida")
    _deal(client, db)  # queda en Consulta

    # Estadía cerrada de `a` en Consulta: 4 días (fabricado para el promedio).
    consulta = etapa(venta, "Consulta")
    est = (
        db.query(DealStageHistory)
        .filter(DealStageHistory.deal_id == a["id"], DealStageHistory.stage_id == consulta.id)
        .one()
    )
    est.entered_at = est.left_at - timedelta(days=4)
    db.commit()

    desde = HOY - timedelta(days=30)
    r = client.get(f"/api/v1/reportes/embudo?pipeline_id={venta.id}&desde={desde}")
    assert r.status_code == 200, r.text
    body = r.json()
    etapas = {e["nombre"]: e for e in body["etapas"]}
    assert [e["nombre"] for e in body["etapas"]] == [
        "Consulta",
        "Visita",
        "Oferta",
        "Ganada",
        "Perdida",
    ]
    assert etapas["Consulta"]["ingresaron"] == 3
    assert etapas["Consulta"]["actuales"] == 1
    # De 3 que entraron a Consulta, solo `a` avanzó (b se perdió, c sigue ahí).
    assert etapas["Consulta"]["conversion_pct"] == "33.33"
    assert etapas["Visita"]["ingresaron"] == 1 and etapas["Visita"]["conversion_pct"] == "100.00"
    assert etapas["Oferta"]["ingresaron"] == 0 and etapas["Oferta"]["conversion_pct"] is None
    assert etapas["Ganada"]["conversion_pct"] is None
    assert Decimal(etapas["Consulta"]["dias_promedio"]) == Decimal("2.00")  # (4 + 0) / 2 cerradas
    assert body["ganadas"] == 1 and body["perdidas"] == 1 and body["tasa_cierre_pct"] == "50.00"
    assert body["dias_promedio_cierre"] is not None


def test_embudo_pipeline_inexistente_404_y_requerido_422(client, sesion):
    r = client.get("/api/v1/reportes/embudo?pipeline_id=999")
    assert r.status_code == 404 and r.json()["detail"] == "Pipeline no encontrado"
    assert client.get("/api/v1/reportes/embudo").status_code == 422


def test_embudo_csv(client, db, sesion):
    venta = pipeline_por_nombre(db, "Venta")
    r = client.get(f"/api/v1/reportes/embudo?pipeline_id={venta.id}&formato=csv")
    assert r.headers["content-type"].startswith("text/csv")
    primera = r.content.decode("utf-8-sig").splitlines()[0]
    assert primera == "etapa;ingresaron;actuales;dias_promedio;conversion_pct"


def test_alquileres_por_mes(client, db, sesion):
    from tests.helpers_crm import crear_contrato_de_prueba

    inicio = (MES_PASADO - timedelta(days=70)).replace(day=1)
    c = crear_contrato_de_prueba(
        db, sesion.id, fecha_inicio=inicio, fecha_fin=inicio + timedelta(days=700)
    )
    cobro = next(x for x in c.cobros if x.periodo == MES_PASADO)
    r = client.post(
        f"/api/v1/alquileres/contratos/{c.id}/cobros/{cobro.id}/pagos",
        json={
            "fecha_pago": str(MES_PASADO + timedelta(days=3)),
            "monto": "40000",
            "punitorio": "0",
            "medio": "efectivo",
        },
    )
    assert r.status_code == 201, r.text

    r = client.get(f"/api/v1/reportes/alquileres?desde={MES_PASADO}&hasta={HOY}")
    assert r.status_code == 200, r.text
    body = r.json()
    filas = {f["mes"]: f for f in body["filas"]}
    assert set(filas) == {MES_PASADO.strftime(YM), MES_ACTUAL.strftime(YM)}
    pasado = filas[MES_PASADO.strftime(YM)]
    assert pasado["moneda"] == "ARS"
    assert pasado["esperado"] == "100000.00"
    assert pasado["cobrado"] == "40000.00"
    assert pasado["pendiente"] == "60000.00"
    assert pasado["contratos_vigentes"] == 1
    assert pasado["honorarios"] == "0.00"  # sin liquidación emitida
    assert body["totales"][0]["esperado"] == "200000.00"


def test_alquileres_sin_datos_devuelve_ceros_en_ars(client, sesion):
    body = client.get(f"/api/v1/reportes/alquileres?desde={MES_ACTUAL}&hasta={HOY}").json()
    assert body["filas"] == [
        {
            "mes": MES_ACTUAL.strftime(YM),
            "moneda": "ARS",
            "esperado": "0.00",
            "cobrado": "0.00",
            "pendiente": "0.00",
            "honorarios": "0.00",
            "contratos_vigentes": 0,
        }
    ]
