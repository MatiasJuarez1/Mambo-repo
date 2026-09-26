"""CSV para Excel en español: `;`, coma decimal, BOM. Se descarga con un link directo."""

from __future__ import annotations

import csv
from collections.abc import Iterable, Sequence
from datetime import date
from decimal import Decimal
from io import StringIO

from fastapi import Response


def _celda(valor: object) -> str:
    if valor is None:
        return ""
    if isinstance(valor, bool):
        return "Sí" if valor else "No"
    if isinstance(valor, Decimal):
        return f"{valor:.2f}".replace(".", ",")
    if isinstance(valor, date):
        return valor.strftime("%d/%m/%Y")
    return str(valor)


def csv_response(
    nombre: str, columnas: Sequence[str], filas: Iterable[Sequence[object]]
) -> Response:
    buffer = StringIO()
    writer = csv.writer(buffer, delimiter=";", lineterminator="\r\n")
    writer.writerow(columnas)
    for fila in filas:
        writer.writerow([_celda(v) for v in fila])
    contenido = "﻿" + buffer.getvalue()
    return Response(
        content=contenido.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{nombre}.csv"'},
    )
