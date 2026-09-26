"""Lista transversal de cobros, lista de liquidaciones y resumen del dashboard."""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from dateutil.relativedelta import relativedelta

from tests.helpers_crm import crear_contrato_de_prueba

HOY = date.today()
API = "/api/v1/alquileres"


def _mes(delta: int) -> date:
    """Primer día del mes actual desplazado `delta` meses."""
    return HOY.replace(day=1) + relativedelta(months=delta)


def _ym(fecha: date) -> str:
    return fecha.strftime("%Y-%m")


@pytest.fixture
def sesion(client, crear_usuario, iniciar_sesion, media_tmp):
    usuario = crear_usuario()
    iniciar_sesion()
    return usuario


def _pagar(client, contrato, cobro, monto: str, fecha: date = HOY) -> None:
    r = client.post(
        f"{API}/contratos/{contrato.id}/cobros/{cobro.id}/pagos",
        json={"fecha_pago": str(fecha), "monto": monto, "punitorio": "0", "medio": "efectivo"},
    )
    assert r.status_code == 201, r.text


@pytest.fixture
def escenario(db, client, sesion):
    """Cinco contratos con vencimiento el día 1, así "vencido" no depende del día de hoy.

    - A: meses M-3..M-1. M-3 pagado el 15 de M-1; M-1 pagado a medias hoy → 2 vencidos (moroso).
    - B: empieza en 3 días → su primer cobro vence en 3 días; nada vencido.
    - C: solo M-3, sin pagar → 1 vencido de más de 30 días (moroso).
    - D: solo M-1, con el vencimiento corrido a hace 5 días → 1 vencido reciente (no moroso).
    - F: como C pero finalizado → no cuenta en nada salvo con `contrato_id`.
    """
    a = crear_contrato_de_prueba(
        db,
        sesion.id,
        titulo="Depto A",
        fecha_inicio=_mes(-3),
        fecha_fin=_mes(0) - timedelta(days=1),
        dia_vencimiento=1,
    )
    b = crear_contrato_de_prueba(
        db,
        sesion.id,
        titulo="Depto B",
        fecha_inicio=HOY + timedelta(days=3),
        fecha_fin=HOY + timedelta(days=400),
        dia_vencimiento=1,
    )
    c = crear_contrato_de_prueba(
        db,
        sesion.id,
        titulo="Depto C",
        fecha_inicio=_mes(-3),
        fecha_fin=_mes(-2) - timedelta(days=1),
        dia_vencimiento=1,
    )
    d = crear_contrato_de_prueba(
        db,
        sesion.id,
        titulo="Depto D",
        fecha_inicio=_mes(-1),
        fecha_fin=_mes(0) - timedelta(days=1),
        dia_vencimiento=1,
    )
    f = crear_contrato_de_prueba(
        db,
        sesion.id,
        titulo="Depto F",
        fecha_inicio=_mes(-3),
        fecha_fin=_mes(-2) - timedelta(days=1),
        dia_vencimiento=1,
    )

    _pagar(client, a, a.cobros[0], "100000", _mes(-1) + timedelta(days=14))
    _pagar(client, a, a.cobros[2], "40000")
    r = client.patch(
        f"{API}/contratos/{d.id}/cobros/{d.cobros[0].id}",
        json={"fecha_vencimiento": str(HOY - timedelta(days=5))},
    )
    assert r.status_code == 200, r.text
    assert client.post(f"{API}/contratos/{f.id}/finalizar").status_code == 200
    db.expire_all()
    return {"a": a, "b": b, "c": c, "d": d, "f": f}


# --- /cobros ---


def test_vencidos_solo_de_vigentes_ordenados_por_vencimiento(client, escenario):
    r = client.get(f"{API}/cobros", params={"estado": "vencido"})
    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert cuerpo["total"] == 4
    titulos = [x["propiedad"]["titulo"] for x in cuerpo["items"]]
    assert titulos == ["Depto C", "Depto A", "Depto A", "Depto D"]
    ultimo = cuerpo["items"][-1]
    assert ultimo["dias_atraso"] == 5
    assert ultimo["vencido"] is True
    assert ultimo["inquilinos"][0]["full_name"] == "Ana Pérez"
    assert ultimo["moneda"] == "ARS"
    parcial = cuerpo["items"][2]
    assert parcial["estado"] == "parcial"
    assert Decimal(parcial["saldo"]) == Decimal("60000")


def test_filtros_por_estado_real(client, escenario):
    b = escenario["b"]
    assert client.get(f"{API}/cobros", params={"estado": "parcial"}).json()["total"] == 1
    assert client.get(f"{API}/cobros", params={"estado": "pagado"}).json()["total"] == 1
    assert client.get(f"{API}/cobros", params={"estado": "anulado"}).json()["total"] == 0
    pendientes = client.get(f"{API}/cobros", params={"estado": "pendiente"}).json()["total"]
    assert pendientes == 3 + len(b.cobros)  # A(M-2), C, D y todos los de B
    assert client.get(f"{API}/cobros", params={"estado": "otro"}).status_code == 422


def test_vence_en_dias(client, escenario):
    r = client.get(f"{API}/cobros", params={"vence_en_dias": 3})
    assert r.json()["total"] == 1
    assert r.json()["items"][0]["propiedad"]["titulo"] == "Depto B"
    assert client.get(f"{API}/cobros", params={"vence_en_dias": 2}).json()["total"] == 0


def test_contrato_id_incluye_finalizados_y_property_id_filtra(client, escenario):
    a, f = escenario["a"], escenario["f"]
    assert client.get(f"{API}/cobros", params={"contrato_id": f.id}).json()["total"] == 1
    r = client.get(f"{API}/cobros", params={"property_id": a.property_id})
    assert r.json()["total"] == 3
    assert {x["estado"] for x in r.json()["items"]} == {"pagado", "pendiente", "parcial"}


def test_q_busca_por_propiedad_e_inquilino(client, escenario):
    todos = client.get(f"{API}/cobros").json()["total"]
    assert client.get(f"{API}/cobros", params={"q": "depto c"}).json()["total"] == 1
    assert client.get(f"{API}/cobros", params={"q": "pérez"}).json()["total"] == todos
    assert client.get(f"{API}/cobros", params={"q": "nadie"}).json()["total"] == 0


def test_paginado(client, escenario):
    r = client.get(f"{API}/cobros", params={"estado": "vencido", "limit": 2, "skip": 2})
    assert r.json()["total"] == 4
    assert [x["propiedad"]["titulo"] for x in r.json()["items"]] == ["Depto A", "Depto D"]


# --- /liquidaciones ---


def test_lista_de_liquidaciones(client, escenario):
    a, c = escenario["a"], escenario["c"]
    r = client.post(f"{API}/contratos/{a.id}/liquidaciones", json={"periodo": _ym(_mes(-1))})
    assert r.status_code == 201, r.text

    r = client.get(f"{API}/liquidaciones")
    assert r.status_code == 200, r.text
    assert r.json()["total"] == 1
    assert r.json()["items"][0]["propiedad"]["titulo"] == "Depto A"
    assert r.json()["items"][0]["numero_formateado"] == "0001-00000001"
    # La moneda sale del contrato: la lista transversal la necesita para formatear.
    assert r.json()["items"][0]["moneda"] == "ARS"
    assert client.get(f"{API}/liquidaciones", params={"estado": "pagada"}).json()["total"] == 0
    assert (
        client.get(f"{API}/liquidaciones", params={"periodo": _ym(_mes(-1))}).json()["total"] == 1
    )
    assert (
        client.get(f"{API}/liquidaciones", params={"periodo": _ym(_mes(-2))}).json()["total"] == 0
    )
    assert client.get(f"{API}/liquidaciones", params={"contrato_id": c.id}).json()["total"] == 0
    assert client.get(f"{API}/liquidaciones", params={"periodo": "2026-1"}).status_code == 422


# --- /resumen ---


def test_resumen_del_mes_actual(client, escenario):
    r = client.get(f"{API}/resumen")
    assert r.status_code == 200, r.text
    cuerpo = r.json()
    assert cuerpo["periodo"] == str(_mes(0))
    assert cuerpo["vencidos_cantidad"] == 4
    assert Decimal(cuerpo["vencido_monto"]) == Decimal("360000")  # 100000 + 60000 + 100000 + 100000
    assert cuerpo["morosos"] == 2  # A por dos vencidos, C por más de 30 días
    assert cuerpo["liquidaciones_sin_emitir"] == 1  # A tiene un pago del mes pasado
    assert Decimal(cuerpo["cobrado"]) == Decimal("40000")  # lo pagado hoy


def test_resumen_de_un_periodo_anterior(client, escenario):
    r = client.get(f"{API}/resumen", params={"periodo": _ym(_mes(-1))})
    cuerpo = r.json()
    assert Decimal(cuerpo["esperado"]) == Decimal("200000")  # A(M-1) + D(M-1)
    assert Decimal(cuerpo["cobrado"]) == Decimal("100000")  # el pago del 15 de M-1
    assert client.get(f"{API}/resumen", params={"periodo": "2026-13"}).status_code == 422


def test_liquidar_baja_el_contador_de_sin_emitir(client, escenario):
    a = escenario["a"]
    client.post(f"{API}/contratos/{a.id}/liquidaciones", json={"periodo": _ym(_mes(-1))})
    assert client.get(f"{API}/resumen").json()["liquidaciones_sin_emitir"] == 0


# --- Contratos: filtro sin_liquidar, columna vencidos y resumen_cobros ---


def test_contratos_sin_liquidar_y_columna_vencidos(client, escenario):
    a = escenario["a"]
    r = client.get(f"{API}/contratos", params={"sin_liquidar": 1})
    assert [x["id"] for x in r.json()["items"]] == [a.id]
    assert r.json()["items"][0]["vencidos"] == 2
    assert client.get(f"{API}/contratos").json()["total"] == 5


def test_resumen_cobros_en_la_ficha(client, db, sesion, escenario):
    a, b = escenario["a"], escenario["b"]
    resumen = client.get(f"{API}/contratos/{a.id}").json()["resumen_cobros"]
    assert resumen["vencidos"] == 2
    assert Decimal(resumen["saldo_vencido"]) == Decimal("160000")
    assert resumen["proximo_vencimiento"] is None

    resumen = client.get(f"{API}/contratos/{b.id}").json()["resumen_cobros"]
    assert resumen["vencidos"] == 0
    assert resumen["proximo_vencimiento"] == str(HOY + timedelta(days=3))

    sin_admin = crear_contrato_de_prueba(
        db, sesion.id, titulo="No administrado", administrado=False
    )
    assert client.get(f"{API}/contratos/{sin_admin.id}").json()["resumen_cobros"] is None
