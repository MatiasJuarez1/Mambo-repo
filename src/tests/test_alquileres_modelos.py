"""Propiedades calculadas de Cobro y monto vigente por fecha."""

from datetime import date, timedelta
from decimal import Decimal

from app.platform.alquileres.models import (
    Ajuste,
    Cobro,
    Contrato,
    EstadoAjuste,
    EstadoCobro,
    IndiceAjuste,
    MedioPago,
    Pago,
)


def _contrato() -> Contrato:
    c = Contrato(
        property_id=1, fecha_inicio=date(2026, 1, 1), fecha_fin=date(2027, 12, 31),
        dia_vencimiento=10, monto_inicial=Decimal("100000.00"), moneda="ARS",
        indice=IndiceAjuste.icl, frecuencia_meses=6, administrado=True, created_by_user_id=1,
    )  # fmt: skip
    aplicado = EstadoAjuste.aplicado
    c.ajustes = [
        Ajuste(fecha_prevista=date(2026, 7, 1), estado=aplicado, monto_nuevo=Decimal("120000.00")),
        Ajuste(fecha_prevista=date(2027, 1, 1), estado=aplicado, monto_nuevo=Decimal("150000.00")),
        Ajuste(fecha_prevista=date(2027, 7, 1), estado=EstadoAjuste.pendiente),
    ]  # fmt: skip
    return c


def test_monto_vigente_a_sigue_los_ajustes_aplicados_por_fecha():
    c = _contrato()
    assert c.monto_vigente_a(date(2026, 3, 1)) == Decimal("100000.00")
    assert c.monto_vigente_a(date(2026, 7, 1)) == Decimal("120000.00")
    assert c.monto_vigente_a(date(2027, 2, 1)) == Decimal("150000.00")
    assert c.monto_vigente_a(date(2027, 8, 1)) == Decimal("150000.00")  # el pendiente no cuenta


def test_cobro_saldo_y_estado_derivado():
    hoy = date.today()
    cobro = Cobro(
        periodo=hoy.replace(day=1), fecha_vencimiento=hoy - timedelta(days=5),
        monto=Decimal("100000.00"), estado=EstadoCobro.parcial,
    )  # fmt: skip
    cobro.pagos = [
        Pago(
            fecha_pago=hoy, monto=Decimal("40000.00"), medio=MedioPago.transferencia,
            recibo_numero=1,
        ),
        Pago(
            fecha_pago=hoy, monto=Decimal("10000.00"), medio=MedioPago.efectivo, recibo_numero=2,
            anulado_at=hoy,
        ),
    ]  # fmt: skip
    assert cobro.pagado == Decimal("40000.00")
    assert cobro.saldo == Decimal("60000.00")
    assert cobro.tiene_pagos is True
    assert cobro.vencido is True
    assert cobro.dias_atraso == 5


def test_cobro_pagado_no_esta_vencido():
    hoy = date.today()
    cobro = Cobro(
        periodo=hoy.replace(day=1), fecha_vencimiento=hoy - timedelta(days=30), monto=Decimal("100")
    )
    cobro.pagos = [
        Pago(fecha_pago=hoy, monto=Decimal("100"), medio=MedioPago.efectivo, recibo_numero=1)
    ]
    assert cobro.saldo == 0
    assert cobro.vencido is False
    assert cobro.dias_atraso == 0
