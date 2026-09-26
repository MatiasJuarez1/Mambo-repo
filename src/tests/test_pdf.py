from datetime import date

from app.pdf import DocumentoMambo


def _documento(logo: bytes | None) -> bytes:
    doc = DocumentoMambo()
    doc.encabezado("Inmobiliaria Ñandú", ["CUIT 30-12345678-9", "Calle 50 N° 123, La Plata"], logo)
    doc.titulo("RECIBO", "0001-00000047", date(2026, 10, 5))
    doc.parrafo("Recibí de Ana Pérez la suma de $ 150.000,00 (ciento cincuenta mil con 00/100).")
    doc.tabla(["Concepto", "Monto"], [["Alquiler Octubre 2026", "$ 150.000,00"]], derecha=(1,))
    doc.total("Total", "$ 150.000,00")
    doc.pie()
    return doc.bytes()


def test_genera_pdf_con_tildes_y_sin_logo():
    pdf = _documento(None)
    assert pdf.startswith(b"%PDF")
    assert len(pdf) > 2000


def test_logo_invalido_no_rompe_el_documento():
    pdf = _documento(b"esto no es una imagen")
    assert pdf.startswith(b"%PDF")
