"""Liquidación mensual al propietario: preview, emisión con snapshot, pago."""

from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.platform.alquileres.models import Gasto, Liquidacion, Pago
from app.platform.inmobiliaria.service import obtener as obtener_inmobiliaria
from tests.helpers_crm import crear_contrato_de_prueba

HOY = date.today()
MES_PASADO = (HOY.replace(day=1) - timedelta(days=1)).replace(day=1)
PERIODO = MES_PASADO.strftime("%Y-%m")


@pytest.fixture
def sesion(client, crear_usuario, iniciar_sesion, media_tmp):
    usuario = crear_usuario()
    iniciar_sesion()
    return usuario


@pytest.fixture
def contrato(db, sesion, client):
    """Contrato con dos pagos el mes pasado (uno con punitorio), un pago este mes y
    dos gastos (uno atrasado). honorarios 10 %."""
    inicio = (MES_PASADO - timedelta(days=200)).replace(day=1)
    c = crear_contrato_de_prueba(
        db, sesion.id, fecha_inicio=inicio, fecha_fin=inicio + timedelta(days=700)
    )
    url = f"/api/v1/alquileres/contratos/{c.id}/cobros"
    cobros = {x.periodo: x for x in c.cobros}
    c1 = cobros[(MES_PASADO - timedelta(days=60)).replace(day=1)]
    c2 = cobros[(MES_PASADO - timedelta(days=30)).replace(day=1)]
    c3 = cobros[MES_PASADO]
    c1_id, c2_id, c3_id = c1.id, c2.id, c3.id
    client.post(
        f"{url}/{c1_id}/pagos",
        json={
            "fecha_pago": str(MES_PASADO + timedelta(days=3)),
            "monto": "100000",
            "punitorio": "1500",
            "medio": "efectivo",
        },
    )
    client.post(
        f"{url}/{c2_id}/pagos",
        json={
            "fecha_pago": str(MES_PASADO + timedelta(days=10)),
            "monto": "100000",
            "punitorio": "0",
            "medio": "transferencia",
        },
    )
    client.post(
        f"{url}/{c3_id}/pagos",
        json={"fecha_pago": str(HOY), "monto": "100000", "punitorio": "0", "medio": "efectivo"},
    )
    gastos_url = f"/api/v1/alquileres/contratos/{c.id}/gastos"
    client.post(
        gastos_url,
        json={
            "fecha": str(MES_PASADO - timedelta(days=40)),
            "tipo": "expensas",
            "concepto": "Expensas atrasadas",
            "monto": "20000",
        },
    )
    client.post(
        gastos_url,
        json={
            "fecha": str(MES_PASADO + timedelta(days=5)),
            "tipo": "reparacion",
            "concepto": "Plomero",
            "monto": "5000",
        },
    )
    client.post(
        gastos_url,
        json={"fecha": str(HOY), "tipo": "otro", "concepto": "Este mes", "monto": "1"},
    )
    db.expire_all()
    return db.get(type(c), c.id)


def _base(contrato) -> str:
    return f"/api/v1/alquileres/contratos/{contrato.id}/liquidaciones"


def test_preview_solo_incluye_lo_del_mes_y_los_gastos_atrasados(client, contrato):
    r = client.get(f"{_base(contrato)}/preview", params={"periodo": PERIODO})
    assert r.status_code == 200, r.text
    p = r.json()
    assert len(p["pagos"]) == 2
    assert len(p["gastos"]) == 2
    assert Decimal(p["total_cobrado"]) == Decimal("200000")
    assert Decimal(p["total_punitorios"]) == Decimal("1500")
    assert Decimal(p["honorarios_monto"]) == Decimal("20000")
    assert Decimal(p["total_gastos"]) == Decimal("25000")
    assert Decimal(p["total_a_transferir"]) == Decimal("156500")


def test_emitir_marca_pagos_y_gastos_y_genera_pdf(client, db, contrato, media_tmp):
    r = client.post(_base(contrato), json={"periodo": PERIODO, "notas": "Transferir al Galicia"})
    assert r.status_code == 201, r.text
    liq = r.json()
    assert liq["numero"] == 1
    assert liq["numero_formateado"] == "0001-00000001"
    assert liq["estado"] == "emitida"
    assert Decimal(liq["total_a_transferir"]) == Decimal("156500")
    assert (media_tmp / f"liquidaciones/{contrato.id}/1.pdf").read_bytes().startswith(b"%PDF")

    db.expire_all()
    pagos = db.query(Pago).filter(Pago.liquidacion_id == liq["id"]).count()
    gastos = db.query(Gasto).filter(Gasto.liquidacion_id == liq["id"]).count()
    assert (pagos, gastos) == (2, 2)

    # Los pagos ya liquidados no vuelven a entrar en el mes siguiente.
    r = client.get(f"{_base(contrato)}/preview", params={"periodo": HOY.strftime("%Y-%m")})
    assert len(r.json()["pagos"]) == 1
    assert len(r.json()["gastos"]) == 1


def test_periodo_duplicado_y_vacio_409(client, db, sesion, contrato):
    assert client.post(_base(contrato), json={"periodo": PERIODO}).status_code == 201
    assert client.post(_base(contrato), json={"periodo": PERIODO}).status_code == 409
    vacio = crear_contrato_de_prueba(db, sesion.id, titulo="Otro")
    assert client.post(_base(vacio), json={"periodo": PERIODO}).status_code == 409


def test_total_negativo_se_emite(client, db, sesion):
    c = crear_contrato_de_prueba(
        db,
        sesion.id,
        fecha_inicio=MES_PASADO - timedelta(days=100),
        fecha_fin=HOY + timedelta(days=300),
    )
    client.post(
        f"/api/v1/alquileres/contratos/{c.id}/gastos",
        json={
            "fecha": str(MES_PASADO),
            "tipo": "reparacion",
            "concepto": "Techo",
            "monto": "300000",
        },
    )
    r = client.post(_base(c), json={"periodo": PERIODO})
    assert r.status_code == 201, r.text
    assert Decimal(r.json()["total_a_transferir"]) == Decimal("-300000")


def test_honorarios_son_snapshot(client, db, contrato):
    liq_id = client.post(_base(contrato), json={"periodo": PERIODO}).json()["id"]
    contrato.honorarios_pct = Decimal("50")
    db.commit()
    liq = db.get(Liquidacion, liq_id)
    assert liq.honorarios_pct == Decimal("10")
    assert liq.honorarios_monto == Decimal("20000")


def test_pagar_y_pagar_de_nuevo_409(client, contrato):
    liq_id = client.post(_base(contrato), json={"periodo": PERIODO}).json()["id"]
    r = client.post(f"{_base(contrato)}/{liq_id}/pagar", json={"fecha_pago": str(HOY)})
    assert r.status_code == 200, r.text
    assert r.json()["estado"] == "pagada"
    r = client.post(f"{_base(contrato)}/{liq_id}/pagar", json={"fecha_pago": str(HOY)})
    assert r.status_code == 409


def test_numeracion_propia_y_listado(client, db, sesion, contrato):
    client.post(_base(contrato), json={"periodo": PERIODO})
    assert obtener_inmobiliaria(db).ultima_liquidacion == 1
    assert obtener_inmobiliaria(db).ultimo_recibo == 3
    r = client.get(_base(contrato))
    assert [x["numero"] for x in r.json()] == [1]


# --- Borrador en PDF ---


def test_borrador_pdf_no_numera_ni_guarda_nada(client, db, contrato, media_tmp):
    r = client.get(f"{_base(contrato)}/preview.pdf", params={"periodo": PERIODO})
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/pdf"
    assert "inline" in r.headers["content-disposition"]
    assert r.content.startswith(b"%PDF")

    # No consume numeración ni deja archivos: se puede pedir las veces que haga falta.
    assert obtener_inmobiliaria(db).ultima_liquidacion == 0
    assert db.query(Liquidacion).count() == 0
    assert not (media_tmp / "liquidaciones").exists()
    assert (
        client.get(f"{_base(contrato)}/preview.pdf", params={"periodo": PERIODO}).status_code == 200
    )


def test_borrador_pdf_de_un_periodo_vacio_409(client, db, sesion):
    vacio = crear_contrato_de_prueba(db, sesion.id, titulo="Sin movimientos")
    r = client.get(f"{_base(vacio)}/preview.pdf", params={"periodo": PERIODO})
    assert r.status_code == 409


# --- Anulación ---


def test_anular_libera_pagos_gastos_y_periodo(client, db, contrato):
    liq_id = client.post(_base(contrato), json={"periodo": PERIODO}).json()["id"]

    r = client.post(f"{_base(contrato)}/{liq_id}/anular", json={"motivo": "Faltaba un gasto"})
    assert r.status_code == 200, r.text
    assert r.json()["anulada"] is True
    assert r.json()["motivo_anulacion"] == "Faltaba un gasto"

    db.expire_all()
    assert db.query(Pago).filter(Pago.liquidacion_id == liq_id).count() == 0
    assert db.query(Gasto).filter(Gasto.liquidacion_id == liq_id).count() == 0

    # El período vuelve a estar disponible y el preview recupera todo.
    p = client.get(f"{_base(contrato)}/preview", params={"periodo": PERIODO}).json()
    assert (len(p["pagos"]), len(p["gastos"])) == (2, 2)
    r = client.post(_base(contrato), json={"periodo": PERIODO})
    assert r.status_code == 201, r.text
    # La anulada quemó el número 1: la nueva es la 2.
    assert r.json()["numero"] == 2


def test_anular_dos_veces_409(client, contrato):
    liq_id = client.post(_base(contrato), json={"periodo": PERIODO}).json()["id"]
    assert (
        client.post(f"{_base(contrato)}/{liq_id}/anular", json={"motivo": "x"}).status_code == 200
    )
    assert (
        client.post(f"{_base(contrato)}/{liq_id}/anular", json={"motivo": "x"}).status_code == 409
    )


def test_una_liquidacion_pagada_no_se_anula(client, contrato):
    liq_id = client.post(_base(contrato), json={"periodo": PERIODO}).json()["id"]
    client.post(f"{_base(contrato)}/{liq_id}/pagar", json={"fecha_pago": str(HOY)})
    r = client.post(f"{_base(contrato)}/{liq_id}/anular", json={"motivo": "Me equivoqué"})
    assert r.status_code == 409
    assert "pagada" in r.json()["detail"]


def test_sobre_una_anulada_no_se_paga_ni_se_envia(client, contrato):
    liq_id = client.post(_base(contrato), json={"periodo": PERIODO}).json()["id"]
    client.post(f"{_base(contrato)}/{liq_id}/anular", json={"motivo": "x"})
    r = client.post(f"{_base(contrato)}/{liq_id}/pagar", json={"fecha_pago": str(HOY)})
    assert r.status_code == 409


def test_anulada_en_el_listado_transversal(client, contrato):
    liq_id = client.post(_base(contrato), json={"periodo": PERIODO}).json()["id"]
    client.post(f"{_base(contrato)}/{liq_id}/anular", json={"motivo": "x"})
    api = "/api/v1/alquileres/liquidaciones"
    # Sin filtro sale como historial; con `emitida` no, aunque conserve ese estado.
    assert client.get(api).json()["total"] == 1
    assert client.get(api, params={"estado": "emitida"}).json()["total"] == 0
    assert client.get(api, params={"estado": "anulada"}).json()["total"] == 1
