"""Documentos PDF de la inmobiliaria (recibos, liquidaciones) con fpdf2.

fpdf2 es pura Python: corre en Render free sin instalar nada del sistema. La
fuente va embebida (DejaVu Sans) porque la Helvetica interna no es Unicode y
las tildes y la eñe saldrían mal.
"""

from __future__ import annotations

import io
from collections.abc import Sequence
from datetime import date
from pathlib import Path

from fpdf import FPDF

_FUENTES = Path(__file__).parent / "assets" / "fonts"
LEYENDA_PIE = "Documento no válido como factura"


class DocumentoMambo(FPDF):
    def __init__(self) -> None:
        super().__init__(orientation="P", unit="mm", format="A4")
        self.add_font("DejaVu", "", str(_FUENTES / "DejaVuSans.ttf"))
        self.add_font("DejaVu", "B", str(_FUENTES / "DejaVuSans-Bold.ttf"))
        self.set_auto_page_break(auto=True, margin=20)
        self.set_margins(15, 15, 15)
        self.add_page()
        self.set_font("DejaVu", "", 10)

    # --- bloques ---

    def encabezado(self, nombre: str, lineas: Sequence[str], logo: bytes | None) -> None:
        """Logo a la izquierda (si hay y se puede leer) y datos de la inmobiliaria."""
        x_texto = 15
        if logo:
            try:
                self.image(io.BytesIO(logo), x=15, y=15, h=18)
                x_texto = 40
            except Exception:  # noqa: BLE001 — un logo corrupto no debe impedir el recibo
                pass
        self.set_xy(x_texto, 15)
        self.set_font("DejaVu", "B", 13)
        self.cell(0, 7, nombre, new_x="LMARGIN", new_y="NEXT")
        self.set_font("DejaVu", "", 9)
        for linea in lineas:
            self.set_x(x_texto)
            self.cell(0, 5, linea, new_x="LMARGIN", new_y="NEXT")
        self.set_y(max(self.get_y(), 36))
        self.line(15, self.get_y(), 195, self.get_y())
        self.ln(6)

    def titulo(self, texto: str, numero: str | None, fecha: date) -> None:
        """`numero` en None es un borrador: el documento todavía no tiene número
        asignado, así que se imprime solo el título."""
        self.set_font("DejaVu", "B", 14)
        self.cell(120, 8, f"{texto} N° {numero}" if numero else texto)
        self.set_font("DejaVu", "", 10)
        self.cell(
            0, 8, f"Fecha: {fecha.strftime('%d/%m/%Y')}", align="R", new_x="LMARGIN", new_y="NEXT"
        )
        self.ln(4)

    def parrafo(self, texto: str) -> None:
        self.set_font("DejaVu", "", 10)
        self.multi_cell(0, 6, texto)
        self.ln(2)

    def tabla(
        self,
        encabezados: Sequence[str],
        filas: Sequence[Sequence[str]],
        derecha: Sequence[int] = (),
    ) -> None:
        """Tabla simple a ancho completo; `derecha` son los índices de columna a la derecha."""
        ancho = 180 / len(encabezados)
        self.set_font("DejaVu", "B", 9)
        self.set_fill_color(235, 235, 235)
        for i, enc in enumerate(encabezados):
            self.cell(ancho, 7, enc, border=1, fill=True, align="R" if i in derecha else "L")
        self.ln()
        self.set_font("DejaVu", "", 9)
        for fila in filas:
            for i, celda in enumerate(fila):
                self.cell(ancho, 7, celda, border=1, align="R" if i in derecha else "L")
            self.ln()
        self.ln(3)

    def total(self, etiqueta: str, valor: str, destacado: bool = True) -> None:
        self.set_font("DejaVu", "B" if destacado else "", 11 if destacado else 10)
        self.cell(120, 8, etiqueta, align="R")
        self.cell(60, 8, valor, align="R", new_x="LMARGIN", new_y="NEXT")

    def pie(self) -> None:
        self.set_y(-25)
        self.set_font("DejaVu", "", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 5, LEYENDA_PIE, align="C")
        self.set_text_color(0, 0, 0)

    def bytes(self) -> bytes:
        return bytes(self.output())
