from datetime import date
from decimal import Decimal

import pytest

from app.formato import formato_moneda, monto_en_letras, nombre_periodo, redondear


@pytest.mark.parametrize(
    ("monto", "moneda", "esperado"),
    [
        (Decimal("1234567.89"), "ARS", "$ 1.234.567,89"),
        (Decimal("1500"), "USD", "US$ 1.500,00"),
        (Decimal("0"), "ARS", "$ 0,00"),
        (Decimal("-250.5"), "ARS", "$ -250,50"),
    ],
)
def test_formato_moneda(monto, moneda, esperado):
    assert formato_moneda(monto, moneda) == esperado


@pytest.mark.parametrize(
    ("monto", "esperado"),
    [
        (Decimal("0"), "cero con 00/100"),
        (Decimal("1"), "uno con 00/100"),
        (Decimal("21"), "veintiuno con 00/100"),
        (Decimal("100"), "cien con 00/100"),
        (Decimal("101"), "ciento uno con 00/100"),
        (Decimal("1000"), "mil con 00/100"),
        (Decimal("21000"), "veintiún mil con 00/100"),
        (Decimal("1000000"), "un millón con 00/100"),
        (
            Decimal("1234567.89"),
            "un millón doscientos treinta y cuatro mil quinientos sesenta y siete con 89/100",
        ),
    ],
)
def test_monto_en_letras(monto, esperado):
    assert monto_en_letras(monto) == esperado


def test_nombre_periodo():
    assert nombre_periodo(date(2026, 10, 1)) == "Octubre 2026"


def test_redondear_a_dos_decimales_half_up():
    assert redondear(Decimal("1.005")) == Decimal("1.01")
    assert redondear(Decimal("1.004")) == Decimal("1.00")
    assert str(redondear(Decimal("7"))) == "7.00"
