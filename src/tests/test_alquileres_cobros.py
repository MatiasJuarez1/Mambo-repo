"""Cobros esperados: se materializan al crear el contrato y siguen su ciclo de vida."""

from datetime import date
from decimal import Decimal

import pytest
from fastapi import HTTPException

from app.platform.alquileres import cobros
from app.platform.alquileres.models import EstadoCobro, MedioPago, Pago
from app.platform.alquileres.schemas import AplicarAjusteIn, ContratoActualizar, RescindirIn
from app.platform.alquileres.service import (
    actualizar_contrato,
    aplicar_ajuste,
    rescindir_contrato,
)
from tests.helpers_crm import crear_contrato_de_prueba


@pytest.fixture
def admin(crear_usuario):
    return crear_usuario()


def _pago(fecha: date, monto: str = "1", numero: int = 1) -> Pago:
    return Pago(
        fecha_pago=fecha, monto=Decimal(monto), medio=MedioPago.efectivo, recibo_numero=numero
    )


def test_periodos_inclusive_ambos_extremos():
    assert cobros.periodos(date(2026, 1, 15), date(2026, 3, 31)) == [
        date(2026, 1, 1),
        date(2026, 2, 1),
        date(2026, 3, 1),
    ]


def test_generar_cobros_doce_meses(db, admin):
    contrato = crear_contrato_de_prueba(db, admin.id)
    assert len(contrato.cobros) == 12
    primero, ultimo = contrato.cobros[0], contrato.cobros[-1]
    assert (primero.periodo, primero.fecha_vencimiento) == (date(2026, 1, 1), date(2026, 1, 10))
    assert ultimo.periodo == date(2026, 12, 1)
    assert all(c.monto == Decimal("100000.00") for c in contrato.cobros)
    assert all(c.estado == EstadoCobro.pendiente for c in contrato.cobros)


def test_primer_mes_vence_en_la_fecha_de_inicio_si_ya_paso_el_dia(db, admin):
    contrato = crear_contrato_de_prueba(db, admin.id, fecha_inicio=date(2026, 1, 20))
    assert contrato.cobros[0].fecha_vencimiento == date(2026, 1, 20)
    assert contrato.cobros[1].fecha_vencimiento == date(2026, 2, 10)


def test_no_administrado_no_genera(db, admin):
    contrato = crear_contrato_de_prueba(db, admin.id, administrado=False)
    assert contrato.cobros == []


def test_aplicar_ajuste_actualiza_periodos_futuros_sin_pagos(db, admin):
    contrato = crear_contrato_de_prueba(db, admin.id, indice="icl", frecuencia_meses=6)
    # Un pago en julio: ese mes no se toca.
    julio = next(c for c in contrato.cobros if c.periodo == date(2026, 7, 1))
    julio.pagos.append(_pago(date(2026, 7, 5), "100000"))
    julio.estado = EstadoCobro.pagado
    db.commit()

    ajuste = contrato.ajustes[0]  # 2026-07-01
    contrato = aplicar_ajuste(
        db, contrato.id, ajuste.id, AplicarAjusteIn(porcentaje=Decimal("10")), admin.id
    )

    por_mes = {c.periodo: c.monto for c in contrato.cobros}
    assert por_mes[date(2026, 6, 1)] == Decimal("100000.00")
    assert por_mes[date(2026, 7, 1)] == Decimal("100000.00")  # tenía pago
    assert por_mes[date(2026, 8, 1)] == Decimal("110000.00")
    assert contrato.cobros_no_actualizados == 1


def test_patch_administrado_genera_y_borra(db, admin):
    contrato = crear_contrato_de_prueba(db, admin.id, administrado=False)
    contrato = actualizar_contrato(db, contrato.id, ContratoActualizar(administrado=True), admin.id)
    assert len(contrato.cobros) == 12
    contrato = actualizar_contrato(
        db, contrato.id, ContratoActualizar(administrado=False), admin.id
    )
    assert contrato.cobros == []


def test_patch_administrado_false_con_pagos_409(db, admin):
    contrato = crear_contrato_de_prueba(db, admin.id)
    contrato.cobros[0].pagos.append(_pago(date(2026, 1, 5)))
    db.commit()
    with pytest.raises(HTTPException) as exc:
        actualizar_contrato(db, contrato.id, ContratoActualizar(administrado=False), admin.id)
    assert exc.value.status_code == 409


def test_patch_fecha_fin_regenera_pendientes(db, admin):
    contrato = crear_contrato_de_prueba(db, admin.id)
    contrato = actualizar_contrato(
        db, contrato.id, ContratoActualizar(fecha_fin=date(2026, 6, 30)), admin.id
    )
    assert [c.periodo for c in contrato.cobros] == cobros.periodos(
        date(2026, 1, 1), date(2026, 6, 30)
    )
    contrato = actualizar_contrato(
        db, contrato.id, ContratoActualizar(dia_vencimiento=20), admin.id
    )
    assert contrato.cobros[1].fecha_vencimiento == date(2026, 2, 20)


def test_patch_fecha_fin_que_deja_afuera_pagos_409(db, admin):
    contrato = crear_contrato_de_prueba(db, admin.id)
    contrato.cobros[-1].pagos.append(_pago(date(2026, 12, 5)))
    db.commit()
    with pytest.raises(HTTPException) as exc:
        actualizar_contrato(
            db, contrato.id, ContratoActualizar(fecha_fin=date(2026, 6, 30)), admin.id
        )
    assert exc.value.status_code == 409


def test_rescindir_anula_los_posteriores_y_deja_el_mes_de_corte(db, admin):
    contrato = crear_contrato_de_prueba(db, admin.id)
    contrato = rescindir_contrato(
        db, contrato.id, RescindirIn(fecha_rescision=date(2026, 5, 15), motivo="Se mudó"), admin.id
    )
    estados = {c.periodo: c.estado for c in contrato.cobros}
    assert estados[date(2026, 5, 1)] == EstadoCobro.pendiente
    assert estados[date(2026, 6, 1)] == EstadoCobro.anulado
    junio = next(c for c in contrato.cobros if c.periodo == date(2026, 6, 1))
    assert junio.notas == "Contrato rescindido"
