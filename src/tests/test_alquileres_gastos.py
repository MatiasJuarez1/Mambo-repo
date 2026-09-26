"""Gastos que se descuentan al propietario: CRUD, comprobante y bloqueo al liquidar."""

from datetime import date
from decimal import Decimal

import pytest

from app.platform.alquileres.models import Gasto, Liquidacion
from tests.helpers_crm import crear_contrato_de_prueba


@pytest.fixture
def sesion(client, crear_usuario, iniciar_sesion, media_tmp):
    usuario = crear_usuario()
    iniciar_sesion()
    return usuario


def _png() -> bytes:
    from io import BytesIO

    from PIL import Image

    buf = BytesIO()
    Image.new("RGB", (10, 10), "white").save(buf, format="PNG")
    return buf.getvalue()


def _base(contrato) -> str:
    return f"/api/v1/alquileres/contratos/{contrato.id}/gastos"


def test_alta_edicion_borrado(client, db, sesion):
    contrato = crear_contrato_de_prueba(db, sesion.id)
    r = client.post(
        _base(contrato),
        json={
            "fecha": "2026-03-05",
            "tipo": "expensas",
            "concepto": "Expensas marzo",
            "monto": "25000",
        },
    )
    assert r.status_code == 201, r.text
    gasto_id = r.json()["id"]
    assert r.json()["liquidacion_id"] is None
    assert r.json()["comprobante_url"] is None

    r = client.patch(f"{_base(contrato)}/{gasto_id}", json={"monto": "26000"})
    assert Decimal(r.json()["monto"]) == Decimal("26000")

    assert len(client.get(_base(contrato)).json()) == 1
    assert client.delete(f"{_base(contrato)}/{gasto_id}").status_code == 204
    assert client.get(_base(contrato)).json() == []


def test_comprobante_subir_reemplazar_quitar(client, db, sesion, media_tmp):
    contrato = crear_contrato_de_prueba(db, sesion.id)
    gasto_id = client.post(
        _base(contrato),
        json={"fecha": "2026-03-05", "tipo": "reparacion", "concepto": "Plomero", "monto": "1"},
    ).json()["id"]
    url = f"{_base(contrato)}/{gasto_id}/comprobante"

    r = client.put(url, files={"archivo": ("factura.png", _png(), "image/png")})
    assert r.status_code == 200, r.text
    primera_clave = db.get(Gasto, gasto_id).comprobante_key
    assert (media_tmp / primera_clave).exists()

    r = client.put(url, files={"archivo": ("factura.pdf", b"%PDF-1.4 x", "application/pdf")})
    assert r.status_code == 200
    assert not (media_tmp / primera_clave).exists()
    assert r.json()["comprobante_url"].endswith(".pdf")

    r = client.delete(url)
    assert r.json()["comprobante_url"] is None


def test_comprobante_invalido_422(client, db, sesion):
    contrato = crear_contrato_de_prueba(db, sesion.id)
    gasto_id = client.post(
        _base(contrato),
        json={"fecha": "2026-03-05", "tipo": "otro", "concepto": "x", "monto": "1"},
    ).json()["id"]
    url = f"{_base(contrato)}/{gasto_id}/comprobante"
    assert client.put(url, files={"archivo": ("a.txt", b"hola", "text/plain")}).status_code == 422
    grande = b"%PDF" + b"0" * (10 * 1024 * 1024 + 1)
    r = client.put(url, files={"archivo": ("a.pdf", grande, "application/pdf")})
    assert r.status_code == 413


def test_gasto_liquidado_no_se_edita_ni_borra(client, db, sesion):
    contrato = crear_contrato_de_prueba(db, sesion.id)
    gasto_id = client.post(
        _base(contrato),
        json={"fecha": "2026-03-05", "tipo": "otro", "concepto": "x", "monto": "1"},
    ).json()["id"]
    liq = Liquidacion(
        contrato_id=contrato.id,
        periodo=date(2026, 3, 1),
        numero=1,
        total_cobrado=0,
        total_punitorios=0,
        honorarios_pct=0,
        honorarios_monto=0,
        total_gastos=1,
        total_a_transferir=-1,
        created_by_user_id=sesion.id,
    )
    db.add(liq)
    db.flush()
    db.get(Gasto, gasto_id).liquidacion_id = liq.id
    db.commit()

    assert client.patch(f"{_base(contrato)}/{gasto_id}", json={"monto": "2"}).status_code == 409
    assert client.delete(f"{_base(contrato)}/{gasto_id}").status_code == 409
    r = client.put(
        f"{_base(contrato)}/{gasto_id}/comprobante",
        files={"archivo": ("a.pdf", b"%PDF-1.4", "application/pdf")},
    )
    assert r.status_code == 409
