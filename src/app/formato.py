"""Formato de montos y fechas para documentos (recibos, liquidaciones, emails).

Convención argentina: miles con punto, decimales con coma. `monto_en_letras`
es propio, sin dependencia: los recibos lo piden y el rango que necesitamos
(hasta miles de millones) entra en cincuenta líneas.
"""

from __future__ import annotations

from datetime import date
from decimal import ROUND_HALF_UP, Decimal

NOMBRES_MES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]  # fmt: skip


def nombre_periodo(periodo: date) -> str:
    return f"{NOMBRES_MES[periodo.month - 1]} {periodo.year}"


def redondear(monto: Decimal) -> Decimal:
    """Dos decimales, mitad hacia arriba: el criterio de cobros y liquidaciones."""
    return monto.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def formato_moneda(monto: Decimal, moneda: str) -> str:
    simbolo = "US$" if moneda == "USD" else "$"
    entero, _, decimales = f"{monto:,.2f}".partition(".")
    return f"{simbolo} {entero.replace(',', '.')},{decimales}"


_UNIDADES = [
    "", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez",
    "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho",
    "diecinueve", "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro",
    "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve",
]  # fmt: skip
_DECENAS = [
    "", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa",
]  # fmt: skip
_CENTENAS = [
    "", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos",
    "seiscientos", "setecientos", "ochocientos", "novecientos",
]  # fmt: skip


def _menor_que_mil(n: int) -> str:
    if n == 100:
        return "cien"
    centenas, resto = divmod(n, 100)
    partes = [_CENTENAS[centenas]] if centenas else []
    if resto < 30:
        if resto:
            partes.append(_UNIDADES[resto])
    else:
        decenas, unidades = divmod(resto, 10)
        partes.append(_DECENAS[decenas] + (f" y {_UNIDADES[unidades]}" if unidades else ""))
    return " ".join(partes)


def _apocope(texto: str) -> str:
    """'veintiuno mil' → 'veintiún mil'; 'uno millones' no ocurre (se trata aparte)."""
    if texto.endswith("uno"):
        return texto[:-3] + "ún" if texto.endswith("veintiuno") else texto[:-1]
    return texto


def _entero_en_letras(n: int) -> str:
    if n == 0:
        return "cero"
    millones, resto = divmod(n, 1_000_000)
    miles, unidades = divmod(resto, 1000)
    partes: list[str] = []
    if millones == 1:
        partes.append("un millón")
    elif millones:
        partes.append(f"{_apocope(_entero_en_letras(millones))} millones")
    if miles == 1:
        partes.append("mil")
    elif miles:
        partes.append(f"{_apocope(_menor_que_mil(miles))} mil")
    if unidades:
        partes.append(_menor_que_mil(unidades))
    return " ".join(partes)


def monto_en_letras(monto: Decimal) -> str:
    """'1234567.89' → 'un millón doscientos ... sesenta y siete con 89/100'."""
    monto = monto.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    entero = int(monto)
    centavos = int((monto - entero) * 100)
    return f"{_entero_en_letras(entero)} con {centavos:02d}/100"
