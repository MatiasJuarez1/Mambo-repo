"""Registrar y anular pagos: saldo, estado, punitorio, numeración y recibo PDF."""

from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.platform.alquileres import cobros, recibos
from app.platform.alquileres.models import Cobro
from app.platform.inmobiliaria.service import obtener as obtener_inmobiliaria
from app.platform.people.models import PersonContact
from tests.helpers_crm import crear_contrato_de_prueba

HOY = date.today()


@pytest.fixture
def sesion(client, crear_usuario, iniciar_sesion, media_tmp):
    usuario = crear_usuario()
    iniciar_sesion()
    return usuario


def _contrato_vencido(db, user_id, **campos):
    """Contrato que empezó hace 3 meses: los primeros cobros ya están vencidos."""
    inicio = (HOY - timedelta(days=95)).replace(day=1)
    return crear_contrato_de_prueba(
        db, user_id, fecha_inicio=inicio, fecha_fin=inicio + timedelta(days=365), **campos
    )


def _url(contrato, cobro) -> str:
    return f"/api/v1/alquileres/contratos/{contrato.id}/cobros/{cobro.id}"


def test_pago_total_deja_el_cobro_pagado_con_recibo(client, db, sesion, media_tmp):
    contrato = _contrato_vencido(db, sesion.id)
    cobro = contrato.cobros[0]
    r = client.post(
        f"{_url(contrato, cobro)}/pagos",
        json={
            "fecha_pago": str(HOY),
            "monto": "100000",
            "punitorio": "0",
            "medio": "transferencia",
            "referencia": "TRF-1",
        },
    )
    assert r.status_code == 201, r.text
    cuerpo = r.json()
    assert cuerpo["estado"] == "pagado"
    assert Decimal(cuerpo["saldo"]) == 0
    pago = cuerpo["pagos"][0]
    assert pago["recibo_numero"] == 1
    assert pago["recibo_numero_formateado"] == "0001-00000001"
    assert pago["registrado_por"]["id"] == sesion.id
    assert pago["recibo_pdf_url"]
    archivo = media_tmp / f"recibos/{contrato.id}/1.pdf"
    assert archivo.read_bytes().startswith(b"%PDF")


def test_pago_parcial_y_luego_el_resto(client, db, sesion):
    contrato = _contrato_vencido(db, sesion.id)
    cobro = contrato.cobros[0]
    r1 = client.post(
        f"{_url(contrato, cobro)}/pagos",
        json={"fecha_pago": str(HOY), "monto": "40000", "punitorio": "0", "medio": "efectivo"},
    )
    assert r1.json()["estado"] == "parcial"
    assert Decimal(r1.json()["saldo"]) == Decimal("60000")
    r2 = client.post(
        f"{_url(contrato, cobro)}/pagos",
        json={"fecha_pago": str(HOY), "monto": "60000", "punitorio": "0", "medio": "efectivo"},
    )
    assert r2.json()["estado"] == "pagado"
    assert [p["recibo_numero"] for p in r2.json()["pagos"]] == [1, 2]


def test_monto_mayor_al_saldo_422(client, db, sesion):
    contrato = _contrato_vencido(db, sesion.id)
    r = client.post(
        f"{_url(contrato, contrato.cobros[0])}/pagos",
        json={"fecha_pago": str(HOY), "monto": "100001", "medio": "efectivo"},
    )
    assert r.status_code == 422


def test_pagar_cobro_pagado_o_anulado_409(client, db, sesion):
    contrato = _contrato_vencido(db, sesion.id)
    cobro = contrato.cobros[0]
    client.post(
        f"{_url(contrato, cobro)}/pagos",
        json={"fecha_pago": str(HOY), "monto": "100000", "punitorio": "0", "medio": "efectivo"},
    )
    r = client.post(
        f"{_url(contrato, cobro)}/pagos",
        json={"fecha_pago": str(HOY), "monto": "1", "medio": "efectivo"},
    )
    assert r.status_code == 409
    otro = contrato.cobros[1]
    client.post(f"{_url(contrato, otro)}/anular", json={"motivo": "Mes bonificado"})
    r = client.post(
        f"{_url(contrato, otro)}/pagos",
        json={"fecha_pago": str(HOY), "monto": "1", "medio": "efectivo"},
    )
    assert r.status_code == 409


def test_punitorio_sugerido(db, sesion):
    contrato = _contrato_vencido(db, sesion.id)
    inmo = obtener_inmobiliaria(db)
    inmo.punitorio_diario_pct = Decimal("0.100")
    inmo.dias_gracia = 5
    db.commit()
    cobro = contrato.cobros[0]
    fecha_pago = cobro.fecha_vencimiento + timedelta(days=15)

    sugerido = cobros.calcular_punitorio(cobro, fecha_pago, inmo)
    assert sugerido.dias_atraso == 10
    assert sugerido.pct == Decimal("0.100")
    assert sugerido.monto == Decimal("1000.00")  # 100000 × 0.1% × 10

    contrato.punitorio_diario_pct = Decimal("0.500")
    assert cobros.calcular_punitorio(cobro, fecha_pago, inmo).monto == Decimal("5000.00")

    contrato.punitorio_diario_pct = None
    inmo.punitorio_diario_pct = None
    assert cobros.calcular_punitorio(cobro, fecha_pago, inmo).monto == 0
    assert cobros.calcular_punitorio(cobro, cobro.fecha_vencimiento, inmo).dias_atraso == 0


def test_endpoint_punitorio_y_pago_sin_punitorio_usa_el_sugerido(client, db, sesion):
    contrato = _contrato_vencido(db, sesion.id)
    inmo = obtener_inmobiliaria(db)
    inmo.punitorio_diario_pct = Decimal("0.100")
    db.commit()
    cobro = contrato.cobros[0]
    fecha_pago = cobro.fecha_vencimiento + timedelta(days=10)

    r = client.get(f"{_url(contrato, cobro)}/punitorio", params={"fecha_pago": str(fecha_pago)})
    assert r.status_code == 200
    assert Decimal(r.json()["monto"]) == Decimal("1000.00")

    r = client.post(
        f"{_url(contrato, cobro)}/pagos",
        json={"fecha_pago": str(fecha_pago), "monto": "100000", "medio": "efectivo"},
    )
    assert Decimal(r.json()["pagos"][0]["punitorio"]) == Decimal("1000.00")

    # Con punitorio explícito, se respeta.
    otro = contrato.cobros[1]
    r = client.post(
        f"{_url(contrato, otro)}/pagos",
        json={
            "fecha_pago": str(fecha_pago),
            "monto": "100000",
            "punitorio": "0",
            "medio": "efectivo",
        },
    )
    assert Decimal(r.json()["pagos"][0]["punitorio"]) == 0


def test_anular_pago_conserva_el_numero_y_no_lo_reusa(client, db, sesion):
    contrato = _contrato_vencido(db, sesion.id)
    cobro = contrato.cobros[0]
    r = client.post(
        f"{_url(contrato, cobro)}/pagos",
        json={"fecha_pago": str(HOY), "monto": "100000", "punitorio": "0", "medio": "efectivo"},
    )
    pago_id = r.json()["pagos"][0]["id"]

    r = client.post(
        f"{_url(contrato, cobro)}/pagos/{pago_id}/anular", json={"motivo": "Transferencia rebotó"}
    )
    assert r.status_code == 200, r.text
    assert r.json()["estado"] == "pendiente"
    assert r.json()["pagos"][0]["anulado_at"] is not None
    assert r.json()["pagos"][0]["recibo_pdf_url"]

    r = client.post(
        f"{_url(contrato, cobro)}/pagos",
        json={"fecha_pago": str(HOY), "monto": "100000", "punitorio": "0", "medio": "efectivo"},
    )
    assert r.json()["pagos"][1]["recibo_numero"] == 2

    r = client.post(f"{_url(contrato, cobro)}/pagos/{pago_id}/anular", json={"motivo": "otra vez"})
    assert r.status_code == 409


def test_si_falla_la_subida_del_pdf_no_queda_pago(client, db, sesion, monkeypatch):
    contrato = _contrato_vencido(db, sesion.id)
    cobro = contrato.cobros[0]

    def _explota(contenido, clave):
        raise OSError("R2 caído")

    monkeypatch.setattr(cobros, "guardar_archivo", _explota)
    r = client.post(
        f"{_url(contrato, cobro)}/pagos",
        json={"fecha_pago": str(HOY), "monto": "100000", "punitorio": "0", "medio": "efectivo"},
    )
    assert r.status_code == 500
    db.expire_all()
    assert db.get(Cobro, cobro.id).pagos == []
    assert obtener_inmobiliaria(db).ultimo_recibo == 0


def test_editar_y_anular_cobro(client, db, sesion):
    contrato = _contrato_vencido(db, sesion.id)
    cobro = contrato.cobros[2]
    r = client.patch(_url(contrato, cobro), json={"monto": "50000", "notas": "Mitad por refacción"})
    assert r.status_code == 200, r.text
    assert Decimal(r.json()["monto"]) == Decimal("50000")

    client.post(
        f"{_url(contrato, cobro)}/pagos",
        json={"fecha_pago": str(HOY), "monto": "1", "punitorio": "0", "medio": "efectivo"},
    )
    assert client.patch(_url(contrato, cobro), json={"monto": "1"}).status_code == 409
    assert client.post(f"{_url(contrato, cobro)}/anular", json={"motivo": "x"}).status_code == 409

    libre = contrato.cobros[3]
    r = client.post(f"{_url(contrato, libre)}/anular", json={"motivo": "Bonificado"})
    assert r.json()["estado"] == "anulado"


def test_whatsapp_url_con_y_sin_telefono(client, db, sesion):
    contrato = _contrato_vencido(db, sesion.id)
    cobro = contrato.cobros[0]
    r = client.post(
        f"{_url(contrato, cobro)}/pagos",
        json={"fecha_pago": str(HOY), "monto": "100000", "punitorio": "0", "medio": "efectivo"},
    )
    assert r.json()["pagos"][0]["whatsapp_url"] is None

    inquilino = next(p for p in contrato.partes if p.rol == "inquilino").person
    inquilino.contacts.append(PersonContact(type="whatsapp", value="221 555-1234", is_primary=True))
    db.commit()
    r = client.get(_url(contrato, cobro))
    url = r.json()["pagos"][0]["whatsapp_url"]
    assert url.startswith("https://wa.me/542215551234?text=")
    assert "0001-00000001" in recibos.texto_recibo(
        db.get(Cobro, cobro.id).pagos[0], para_whatsapp=True
    )


def test_telefono_whatsapp_normaliza():
    assert recibos.normalizar_telefono("+54 9 221 555-1234") == "5492215551234"
    assert recibos.normalizar_telefono("2215551234") == "542215551234"
