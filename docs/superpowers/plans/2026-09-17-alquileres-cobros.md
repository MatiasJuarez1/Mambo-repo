# Alquileres 2b — Cobros, recibos y liquidaciones · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada contrato administrado tenga sus cobros esperados de antemano, que cada pago emita un recibo PDF numerado enviable por email/WhatsApp, y que cada mes se liquide al propietario con comprobante PDF.

**Architecture:** Se extiende el módulo `src/app/platform/alquileres/` (2a) con submódulos `cobros.py`, `gastos.py`, `liquidaciones.py`, `recibos.py`; dos módulos compartidos nuevos `app/pdf.py` (fpdf2) y `app/email.py` (SMTP stdlib); migración `0006`. Frontend: bloques nuevos en la ficha del contrato, lista transversal de cobros, tiles en el dashboard. Spec: [2026-09-17-alquileres-cobros-design.md](../specs/2026-09-17-alquileres-cobros-design.md).

**Tech Stack:** FastAPI + SQLAlchemy 2.0 + Alembic + fpdf2 + smtplib; React + Vite + vitest.

## Global Constraints

- **No hacer `git commit` ni `git push`.** Todo queda en el working tree; Matías commitea. Cada tarea termina con verificación, no con commit.
- Código, comentarios, docstrings y mensajes de API en **castellano**.
- Backend: `ruff` con line-length 100, reglas E/F/I/B/UP. Tests con SQLite en memoria (`src/tests/conftest.py`).
- Frontend: tests con `npm test` (ya lleva `--pool=threads`); `npx tsc --noEmit` limpio.
- Todos los endpoints nuevos bajo `/api/v1/alquileres` con `SOLO_STAFF` (el proxy de Vercel solo reenvía `/api/*` y `/auth/*`).
- Las funciones de service reciben `Session` primero y hacen su propio commit.
- Numeración de recibos y liquidaciones: correlativa global, sin reuso, formato `0001-00000047`.
- Comandos backend desde `src/` con el venv activado; frontend desde `client/`.

---

## Mapa de archivos

**Backend — nuevos**
- `src/app/email.py` — `enviar_email`, `Adjunto`, `EmailNoEnviado`, `email_configurado`.
- `src/app/formato.py` — `formato_moneda`, `monto_en_letras`, `nombre_periodo`.
- `src/app/pdf.py` — `DocumentoMambo(FPDF)`.
- `src/app/assets/fonts/DejaVuSans.ttf`, `DejaVuSans-Bold.ttf`.
- `src/app/platform/alquileres/cobros.py` — generación de cobros, punitorio, pagos, listados y resumen.
- `src/app/platform/alquileres/recibos.py` — textos, PDF del recibo, WhatsApp, envío en background.
- `src/app/platform/alquileres/gastos.py` — CRUD de gastos y comprobante.
- `src/app/platform/alquileres/liquidaciones.py` — cálculo, emisión, pago, PDF, listado.
- `src/alembic/versions/0006_alquileres_cobros.py`.
- Tests: `test_email.py`, `test_pdf.py`, `test_alquileres_cobros.py`, `test_alquileres_pagos.py`, `test_alquileres_gastos.py`, `test_alquileres_liquidaciones.py`, `test_alquileres_envio.py`, `test_alquileres_listados.py`.

**Backend — modificados**
- `src/app/config.py` (SMTP), `src/app/storage.py` (`guardar_archivo`), `src/pyproject.toml` (fpdf2, package-data).
- `src/app/platform/alquileres/models.py`, `schemas.py`, `service.py`, `router.py`.
- `src/app/platform/inmobiliaria/models.py`, `schemas.py`, `router.py`.
- `src/tests/conftest.py` (fixtures `media_tmp`, `smtp_configurado`, `emails_enviados`), `src/tests/helpers_crm.py` (`crear_contrato_de_prueba`), `src/tests/test_config.py`, `src/tests/test_inmobiliaria.py`.
- `docs/despliegue.md`, `.env.example`.

**Frontend — nuevos**
- `client/src/components/crm/TablaCobros/`, `ModalRegistrarPago/`, `TablaGastos/`, `FormularioGasto/`, `BloqueLiquidaciones/`, `ModalLiquidar/`.
- `client/src/pages/admin/alquileres/Cobros.tsx` (+ test).

**Frontend — modificados**
- `client/src/types/alquileres.ts`, `client/src/api/alquileres.ts`, `client/src/lib/alquileres.ts` (+ test).
- `client/src/types/inmobiliaria.ts`, `client/src/pages/admin/configuracion/Configuracion.tsx` (+ test).
- `client/src/pages/admin/alquileres/Ficha.tsx` (+ test), `client/src/components/crm/FormularioContrato/FormularioContrato.tsx`.
- `client/src/pages/admin/Dashboard.tsx` (+ test), `client/src/layouts/AdminLayout.tsx`, `client/src/App.tsx`.

---

## Task 1: Configuración SMTP y `app/email.py`

**Files:**
- Modify: `src/app/config.py` (bloque de campos después de `r2_public_base_url`; validador `_validar_combinaciones`)
- Create: `src/app/email.py`
- Modify: `src/tests/test_config.py`
- Create: `src/tests/test_email.py`
- Modify: `.env.example`

**Interfaces:**
- Produces: `Settings.smtp_host/smtp_port/smtp_user/smtp_password/email_from`, propiedad `Settings.email_configurado: bool`; `app.email.enviar_email(destinatario: str, asunto: str, cuerpo: str, adjuntos: Sequence[Adjunto] = ()) -> None`, `Adjunto(nombre, contenido, mime)`, `EmailNoEnviado`, `email_configurado() -> bool`.

- [ ] **Step 1: Tests de configuración**

Agregar al final de `src/tests/test_config.py`:

```python
def test_smtp_a_medias_no_arranca(monkeypatch):
    """SMTP_HOST sin EMAIL_FROM mandaría emails sin remitente: mejor no arrancar."""
    monkeypatch.setenv("JWT_SECRET", "cualquiera")
    monkeypatch.setenv("SMTP_HOST", "smtp.gmail.com")
    for var in ("SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM"):
        monkeypatch.delenv(var, raising=False)

    with pytest.raises(ValidationError, match="SMTP"):
        _settings_sin_env()


def test_smtp_completo_marca_email_configurado(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "cualquiera")
    monkeypatch.setenv("SMTP_HOST", "smtp.gmail.com")
    monkeypatch.setenv("SMTP_USER", "mambo@gmail.com")
    monkeypatch.setenv("SMTP_PASSWORD", "app-password")
    monkeypatch.setenv("EMAIL_FROM", "Mambo <mambo@gmail.com>")

    s = _settings_sin_env()
    assert s.email_configurado is True
    assert s.smtp_port == 587


def test_sin_smtp_email_no_configurado(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "cualquiera")
    for var in ("SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM"):
        monkeypatch.delenv(var, raising=False)

    assert _settings_sin_env().email_configurado is False
```

- [ ] **Step 2: Test del envío** — crear `src/tests/test_email.py`:

```python
"""`app.email`: arma el mensaje y lo entrega por SMTP. Se prueba con un SMTP falso."""

import smtplib

import pytest

from app import email as modulo_email
from app.config import get_settings


class _SmtpFalso:
    """Registra lo que haría `smtplib.SMTP`, sin abrir sockets."""

    instancias: list["_SmtpFalso"] = []

    def __init__(self, host, port, timeout=None):
        self.host, self.port = host, port
        self.tls = False
        self.login_con = None
        self.enviados = []
        _SmtpFalso.instancias.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self):
        self.tls = True

    def login(self, user, password):
        self.login_con = (user, password)

    def send_message(self, msg):
        self.enviados.append(msg)


@pytest.fixture
def smtp_falso(monkeypatch):
    _SmtpFalso.instancias.clear()
    monkeypatch.setattr(smtplib, "SMTP", _SmtpFalso)
    s = get_settings()
    monkeypatch.setattr(s, "smtp_host", "smtp.ejemplo.com")
    monkeypatch.setattr(s, "smtp_port", 587)
    monkeypatch.setattr(s, "smtp_user", "mambo")
    monkeypatch.setattr(s, "smtp_password", "clave")
    monkeypatch.setattr(s, "email_from", "Mambo <no-reply@mambo.com.ar>")
    return _SmtpFalso


def test_enviar_email_con_adjunto(smtp_falso):
    modulo_email.enviar_email(
        "ana@ejemplo.com",
        "Recibo N° 0001-00000001",
        "Hola Ana,\nAdjuntamos el recibo.",
        [modulo_email.Adjunto("recibo.pdf", b"%PDF-1.4 fake", "application/pdf")],
    )

    smtp = smtp_falso.instancias[0]
    assert (smtp.host, smtp.port) == ("smtp.ejemplo.com", 587)
    assert smtp.tls is True
    assert smtp.login_con == ("mambo", "clave")
    msg = smtp.enviados[0]
    assert msg["To"] == "ana@ejemplo.com"
    assert msg["From"] == "Mambo <no-reply@mambo.com.ar>"
    assert msg["Subject"] == "Recibo N° 0001-00000001"
    adjuntos = [p for p in msg.iter_attachments()]
    assert adjuntos[0].get_filename() == "recibo.pdf"
    assert adjuntos[0].get_content_type() == "application/pdf"


def test_sin_configuracion_lanza(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "smtp_host", None)
    monkeypatch.setattr(s, "email_from", None)
    with pytest.raises(modulo_email.EmailNoEnviado):
        modulo_email.enviar_email("a@b.com", "x", "y")


def test_error_de_smtp_se_envuelve(smtp_falso, monkeypatch):
    def _explota(self, msg):
        raise smtplib.SMTPServerDisconnected("se cortó")

    monkeypatch.setattr(smtp_falso, "send_message", _explota)
    with pytest.raises(modulo_email.EmailNoEnviado, match="se cortó"):
        modulo_email.enviar_email("a@b.com", "x", "y")
```

- [ ] **Step 3: Correr y ver fallar**

Run: `cd src && python -m pytest tests/test_config.py tests/test_email.py -q`
Expected: FAIL (`ModuleNotFoundError: app.email`, `AttributeError: email_configurado`).

- [ ] **Step 4: Campos en `Settings`** — en `src/app/config.py`, después de `r2_public_base_url`:

```python
    # ── Email (SMTP) ──
    # Opcional: sin estas variables el panel funciona igual, con los botones de
    # "Enviar por email" deshabilitados. Si se define alguna hay que definirlas
    # todas (ver `_validar_combinaciones`). `SMTP_PORT` 465 usa SSL directo;
    # cualquier otro puerto arranca en claro y hace STARTTLS.
    smtp_host: str | None = Field(default=None, validation_alias="SMTP_HOST")
    smtp_port: int = Field(default=587, validation_alias="SMTP_PORT")
    smtp_user: str | None = Field(default=None, validation_alias="SMTP_USER")
    smtp_password: str | None = Field(default=None, validation_alias="SMTP_PASSWORD")
    email_from: str | None = Field(default=None, validation_alias="EMAIL_FROM")

    @property
    def email_configurado(self) -> bool:
        return bool(self.smtp_host and self.email_from)
```

Y al final de `_validar_combinaciones`, antes del `return self`:

```python
        # SMTP a medias: un host sin remitente, o un usuario sin contraseña, falla
        # recién al mandar el primer recibo. Mejor que falle al arrancar.
        smtp = {
            "SMTP_HOST": self.smtp_host,
            "SMTP_USER": self.smtp_user,
            "SMTP_PASSWORD": self.smtp_password,
            "EMAIL_FROM": self.email_from,
        }
        definidas = [k for k, v in smtp.items() if v]
        if definidas and len(definidas) != len(smtp):
            faltan = [k for k, v in smtp.items() if not v]
            raise ValueError(f"SMTP a medias: definidas {definidas}, faltan {faltan}.")
```

- [ ] **Step 5: `src/app/email.py`**

```python
"""Envío de emails por SMTP con la biblioteca estándar.

Sin proveedor ni dependencia: cinco variables (`SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`) y sirve con Gmail (contraseña de
aplicación), Brevo, Resend o lo que tenga la inmobiliaria. Texto plano, sin
HTML: llega a cualquier cliente y no hay nada que maquetar.

Quien llama decide si va en un `BackgroundTask`; acá se envía en el hilo actual.
"""

from __future__ import annotations

import logging
import smtplib
from collections.abc import Sequence
from email.message import EmailMessage
from typing import NamedTuple

from app.config import get_settings

logger = logging.getLogger(__name__)


class Adjunto(NamedTuple):
    nombre: str
    contenido: bytes
    mime: str
    """Tipo MIME completo, p. ej. `application/pdf`."""


class EmailNoEnviado(Exception):
    """Cualquier falla de SMTP, envuelta para que el resto del código no importe smtplib."""


def email_configurado() -> bool:
    return get_settings().email_configurado


def enviar_email(
    destinatario: str, asunto: str, cuerpo: str, adjuntos: Sequence[Adjunto] = ()
) -> None:
    s = get_settings()
    if not s.email_configurado:
        raise EmailNoEnviado("Email no configurado (SMTP_HOST / EMAIL_FROM)")

    msg = EmailMessage()
    msg["From"] = s.email_from
    msg["To"] = destinatario
    msg["Subject"] = asunto
    msg.set_content(cuerpo)
    for adjunto in adjuntos:
        tipo, subtipo = adjunto.mime.split("/", 1)
        msg.add_attachment(
            adjunto.contenido, maintype=tipo, subtype=subtipo, filename=adjunto.nombre
        )

    try:
        if s.smtp_port == 465:
            with smtplib.SMTP_SSL(s.smtp_host, s.smtp_port, timeout=20) as smtp:
                if s.smtp_user:
                    smtp.login(s.smtp_user, s.smtp_password or "")
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=20) as smtp:
                smtp.starttls()
                if s.smtp_user:
                    smtp.login(s.smtp_user, s.smtp_password or "")
                smtp.send_message(msg)
    except (smtplib.SMTPException, OSError) as exc:
        logger.warning("No se pudo enviar el email a %s: %s", destinatario, exc)
        raise EmailNoEnviado(str(exc)) from exc
```

- [ ] **Step 6: `.env.example`** — agregar al final:

```
# Email (opcional). Si se define una, hay que definir las cuatro; SMTP_PORT default 587.
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=inmobiliaria@gmail.com
# SMTP_PASSWORD=contraseña-de-aplicación
# EMAIL_FROM=Inmobiliaria <inmobiliaria@gmail.com>
```

- [ ] **Step 7: Correr**

Run: `cd src && python -m pytest tests/test_config.py tests/test_email.py -q && ruff check app tests`
Expected: todos PASS, ruff limpio.

---

## Task 2: `app/formato.py`, `app/pdf.py` y fuentes

**Files:**
- Modify: `src/pyproject.toml` (dependencia `fpdf2`, `package-data`)
- Create: `src/app/assets/__init__.py` (vacío), `src/app/assets/fonts/DejaVuSans.ttf`, `src/app/assets/fonts/DejaVuSans-Bold.ttf`
- Create: `src/app/formato.py`, `src/app/pdf.py`
- Create: `src/tests/test_formato.py`, `src/tests/test_pdf.py`

**Interfaces:**
- Produces: `formato_moneda(monto: Decimal, moneda: str) -> str`; `monto_en_letras(monto: Decimal) -> str`; `nombre_periodo(periodo: date) -> str` ("Octubre 2026"); `DocumentoMambo()` con métodos `encabezado(nombre, lineas: list[str], logo: bytes | None)`, `titulo(texto, numero, fecha)`, `parrafo(texto)`, `tabla(encabezados, filas, derecha=())`, `total(etiqueta, valor, destacado=True)`, `pie()`, `bytes() -> bytes`.

- [ ] **Step 1: Dependencia y fuentes**

En `src/pyproject.toml`, dentro de `dependencies`, después de `boto3`:

```toml
  "fpdf2>=2.7",            # recibos y liquidaciones en PDF; pura Python, sin binarios
```

Y después de `[tool.setuptools.packages.find]`:

```toml
[tool.setuptools.package-data]
app = ["assets/fonts/*.ttf"]
```

Descargar DejaVu (licencia Bitstream Vera, redistribuible) y copiar las dos fuentes:

```bash
cd src && pip install -e ".[dev]"
mkdir -p app/assets/fonts && touch app/assets/__init__.py
curl -L -o /tmp/dejavu.zip https://github.com/dejavu-fonts/dejavu-fonts/releases/download/version_2_37/dejavu-fonts-ttf-2.37.zip
unzip -j /tmp/dejavu.zip "dejavu-fonts-ttf-2.37/ttf/DejaVuSans.ttf" "dejavu-fonts-ttf-2.37/ttf/DejaVuSans-Bold.ttf" -d app/assets/fonts/
ls app/assets/fonts   # DejaVuSans-Bold.ttf  DejaVuSans.ttf
```

- [ ] **Step 2: Tests** — `src/tests/test_formato.py`:

```python
from datetime import date
from decimal import Decimal

import pytest

from app.formato import formato_moneda, monto_en_letras, nombre_periodo


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
```

`src/tests/test_pdf.py`:

```python
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
```

- [ ] **Step 3: Ver fallar**

Run: `cd src && python -m pytest tests/test_formato.py tests/test_pdf.py -q`
Expected: FAIL con `ModuleNotFoundError`.

- [ ] **Step 4: `src/app/formato.py`**

```python
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
_DECENAS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"]  # noqa: E501
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
```

- [ ] **Step 5: `src/app/pdf.py`**

```python
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

    def titulo(self, texto: str, numero: str, fecha: date) -> None:
        self.set_font("DejaVu", "B", 14)
        self.cell(120, 8, f"{texto} N° {numero}")
        self.set_font("DejaVu", "", 10)
        self.cell(0, 8, f"Fecha: {fecha.strftime('%d/%m/%Y')}", align="R", new_x="LMARGIN", new_y="NEXT")
        self.ln(4)

    def parrafo(self, texto: str) -> None:
        self.set_font("DejaVu", "", 10)
        self.multi_cell(0, 6, texto)
        self.ln(2)

    def tabla(
        self, encabezados: Sequence[str], filas: Sequence[Sequence[str]], derecha: Sequence[int] = ()
    ) -> None:
        """Tabla simple a ancho completo; `derecha` son los índices de columna alineados a la derecha."""
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
```

- [ ] **Step 6: Correr**

Run: `cd src && python -m pytest tests/test_formato.py tests/test_pdf.py -q && ruff check app tests`
Expected: PASS, ruff limpio. Si ruff protesta por las listas con `# fmt: skip`, correr `ruff format app/formato.py` y ajustar.

---

## Task 3: Modelos, migración `0006`, campos de inmobiliaria y `storage.guardar_archivo`

**Files:**
- Modify: `src/app/platform/alquileres/models.py`
- Modify: `src/app/platform/inmobiliaria/models.py`, `schemas.py`, `router.py`
- Modify: `src/app/storage.py`
- Create: `src/alembic/versions/0006_alquileres_cobros.py`
- Modify: `src/tests/test_inmobiliaria.py`, `src/tests/conftest.py`, `src/tests/helpers_crm.py`
- Create: `src/tests/test_alquileres_modelos.py`

**Interfaces:**
- Produces: enums `EstadoCobro`, `MedioPago`, `TipoGasto`, `EstadoLiquidacion`; modelos `Cobro`, `Pago`, `Gasto`, `Liquidacion`; `Contrato.cobros/gastos/liquidaciones`, `Contrato.punitorio_diario_pct`, `Contrato.monto_vigente_a(fecha) -> Decimal`; `Cobro.pagado/saldo/dias_atraso/vencido/tiene_pagos`; `Inmobiliaria.punitorio_diario_pct/dias_gracia/ultimo_recibo/ultima_liquidacion`; `storage.guardar_archivo(contenido: bytes, clave: str) -> ArchivoGuardado`; fixture `media_tmp`; helper `crear_contrato_de_prueba(db, user_id, **campos) -> Contrato`.

- [ ] **Step 1: Test de modelos** — `src/tests/test_alquileres_modelos.py`:

```python
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
    c.ajustes = [
        Ajuste(fecha_prevista=date(2026, 7, 1), estado=EstadoAjuste.aplicado, monto_nuevo=Decimal("120000.00")),
        Ajuste(fecha_prevista=date(2027, 1, 1), estado=EstadoAjuste.aplicado, monto_nuevo=Decimal("150000.00")),
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
        Pago(fecha_pago=hoy, monto=Decimal("40000.00"), medio=MedioPago.transferencia, recibo_numero=1),
        Pago(fecha_pago=hoy, monto=Decimal("10000.00"), medio=MedioPago.efectivo, recibo_numero=2, anulado_at=hoy),
    ]  # fmt: skip
    assert cobro.pagado == Decimal("40000.00")
    assert cobro.saldo == Decimal("60000.00")
    assert cobro.tiene_pagos is True
    assert cobro.vencido is True
    assert cobro.dias_atraso == 5


def test_cobro_pagado_no_esta_vencido():
    hoy = date.today()
    cobro = Cobro(periodo=hoy.replace(day=1), fecha_vencimiento=hoy - timedelta(days=30), monto=Decimal("100"))
    cobro.pagos = [Pago(fecha_pago=hoy, monto=Decimal("100"), medio=MedioPago.efectivo, recibo_numero=1)]
    assert cobro.saldo == 0
    assert cobro.vencido is False
    assert cobro.dias_atraso == 0
```

- [ ] **Step 2: Ver fallar**

Run: `cd src && python -m pytest tests/test_alquileres_modelos.py -q`
Expected: FAIL con `ImportError: cannot import name 'Cobro'`.

- [ ] **Step 3: Modelos** — en `src/app/platform/alquileres/models.py`:

Enums nuevos, después de `EstadoAjuste`:

```python
class EstadoCobro(StrEnum):
    """Solo refleja pagos. "Vencido" se deriva de la fecha en la consulta, nunca se guarda."""

    pendiente = "pendiente"
    parcial = "parcial"
    pagado = "pagado"
    anulado = "anulado"


class MedioPago(StrEnum):
    efectivo = "efectivo"
    transferencia = "transferencia"
    otro = "otro"


class TipoGasto(StrEnum):
    expensas = "expensas"
    reparacion = "reparacion"
    impuesto = "impuesto"
    otro = "otro"


class EstadoLiquidacion(StrEnum):
    emitida = "emitida"
    pagada = "pagada"
```

En `Contrato`, después de `honorarios_pct`:

```python
    # Override del punitorio diario de la inmobiliaria; null = usa el de ella.
    punitorio_diario_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 3), nullable=True)
```

Relaciones nuevas en `Contrato`, después de `renovacion`:

```python
    cobros: Mapped[list[Cobro]] = relationship(
        back_populates="contrato", cascade="all, delete-orphan", order_by="Cobro.periodo"
    )
    gastos: Mapped[list[Gasto]] = relationship(
        back_populates="contrato", cascade="all, delete-orphan", order_by="Gasto.fecha"
    )
    liquidaciones: Mapped[list[Liquidacion]] = relationship(
        back_populates="contrato", order_by="Liquidacion.periodo.desc()"
    )
```

Método en `Contrato`, después de `proximo_ajuste`:

```python
    def monto_vigente_a(self, fecha: date) -> Decimal:
        """Monto que regía en `fecha`: el último ajuste aplicado con `fecha_prevista <= fecha`."""
        aplicados = [
            a for a in self.ajustes
            if a.estado == EstadoAjuste.aplicado and a.fecha_prevista <= fecha
        ]  # fmt: skip
        if not aplicados:
            return self.monto_inicial
        return max(aplicados, key=lambda a: a.fecha_prevista).monto_nuevo
```

Cuatro clases nuevas al final del archivo:

```python
class Cobro(Base):
    """Un período esperado (un mes) de un contrato administrado."""

    __tablename__ = "alquileres_cobros"
    __table_args__ = (
        UniqueConstraint("contrato_id", "periodo", name="uq_alquileres_cobro_periodo"),
        Index("ix_alquileres_cobros_estado_vencimiento", "estado", "fecha_vencimiento"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    contrato_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("alquileres_contratos.id", ondelete="CASCADE"), nullable=False
    )
    # Primer día del mes que se cobra.
    periodo: Mapped[date] = mapped_column(Date, nullable=False)
    fecha_vencimiento: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    monto: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    estado: Mapped[EstadoCobro] = mapped_column(
        SAEnum(EstadoCobro, name="estado_cobro"), nullable=False, default=EstadoCobro.pendiente
    )
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_ahora, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_ahora, onupdate=_ahora, nullable=False
    )

    contrato: Mapped[Contrato] = relationship(back_populates="cobros")
    pagos: Mapped[list[Pago]] = relationship(
        back_populates="cobro", cascade="all, delete-orphan", order_by="(Pago.fecha_pago, Pago.id)"
    )

    @property
    def pagos_validos(self) -> list[Pago]:
        return [p for p in self.pagos if p.anulado_at is None]

    @property
    def tiene_pagos(self) -> bool:
        return bool(self.pagos_validos)

    @property
    def pagado(self) -> Decimal:
        return sum((p.monto for p in self.pagos_validos), Decimal("0"))

    @property
    def saldo(self) -> Decimal:
        return self.monto - self.pagado

    @property
    def vencido(self) -> bool:
        return (
            self.estado != EstadoCobro.anulado
            and self.saldo > 0
            and self.fecha_vencimiento < date.today()
        )

    @property
    def dias_atraso(self) -> int:
        if not self.vencido:
            return 0
        return (date.today() - self.fecha_vencimiento).days


class Pago(Base):
    """Un pago contra un cobro. Un pago = un recibo numerado."""

    __tablename__ = "alquileres_pagos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cobro_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("alquileres_cobros.id", ondelete="CASCADE"), nullable=False, index=True
    )
    fecha_pago: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    # Solo alquiler; el punitorio va aparte para que la liquidación los distinga.
    monto: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    punitorio: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    medio: Mapped[MedioPago] = mapped_column(SAEnum(MedioPago, name="medio_pago"), nullable=False)
    referencia: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Correlativo global; no se reusa aunque el pago se anule.
    recibo_numero: Mapped[int] = mapped_column(Integer, nullable=False, unique=True)
    recibo_pdf_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    recibo_pdf_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    enviado_email_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    anulado_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    motivo_anulacion: Mapped[str | None] = mapped_column(Text, nullable=True)
    liquidacion_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("alquileres_liquidaciones.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    registrado_por_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_ahora, nullable=False
    )

    cobro: Mapped[Cobro] = relationship(back_populates="pagos")
    liquidacion: Mapped[Liquidacion | None] = relationship(back_populates="pagos")
    registrado_por: Mapped[object | None] = relationship("User", foreign_keys=[registrado_por_user_id])

    @property
    def anulado(self) -> bool:
        return self.anulado_at is not None

    @property
    def total(self) -> Decimal:
        return self.monto + self.punitorio

    @property
    def recibo_numero_formateado(self) -> str:
        # Se importa acá para que models no dependa de recibos (que importa models).
        from app.platform.alquileres.recibos import numero_formateado

        return numero_formateado(self.recibo_numero)

    @property
    def whatsapp_url(self) -> str | None:
        from app.platform.alquileres.recibos import whatsapp_url_recibo

        return whatsapp_url_recibo(self)


class Gasto(Base):
    """Gasto que se le descuenta al propietario en la liquidación."""

    __tablename__ = "alquileres_gastos"
    __table_args__ = (Index("ix_alquileres_gastos_contrato_fecha", "contrato_id", "fecha"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    contrato_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("alquileres_contratos.id", ondelete="CASCADE"), nullable=False
    )
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    tipo: Mapped[TipoGasto] = mapped_column(SAEnum(TipoGasto, name="tipo_gasto"), nullable=False)
    concepto: Mapped[str] = mapped_column(String(150), nullable=False)
    monto: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    comprobante_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    comprobante_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    liquidacion_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("alquileres_liquidaciones.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_by_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_ahora, nullable=False
    )

    contrato: Mapped[Contrato] = relationship(back_populates="gastos")
    liquidacion: Mapped[Liquidacion | None] = relationship(back_populates="gastos")


class Liquidacion(Base):
    """Rendición mensual al propietario. Los totales son snapshot: no se recalculan."""

    __tablename__ = "alquileres_liquidaciones"
    __table_args__ = (
        UniqueConstraint("contrato_id", "periodo", name="uq_alquileres_liquidacion_periodo"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    contrato_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("alquileres_contratos.id", ondelete="RESTRICT"), nullable=False
    )
    periodo: Mapped[date] = mapped_column(Date, nullable=False)
    numero: Mapped[int] = mapped_column(Integer, nullable=False, unique=True)
    total_cobrado: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    total_punitorios: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    honorarios_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    honorarios_monto: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    total_gastos: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    total_a_transferir: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    estado: Mapped[EstadoLiquidacion] = mapped_column(
        SAEnum(EstadoLiquidacion, name="estado_liquidacion"),
        nullable=False,
        default=EstadoLiquidacion.emitida,
    )
    fecha_pago: Mapped[date | None] = mapped_column(Date, nullable=True)
    comprobante_pdf_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    comprobante_pdf_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    enviado_email_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_ahora, nullable=False
    )

    contrato: Mapped[Contrato] = relationship(back_populates="liquidaciones")
    pagos: Mapped[list[Pago]] = relationship(back_populates="liquidacion", order_by="Pago.fecha_pago")
    gastos: Mapped[list[Gasto]] = relationship(back_populates="liquidacion", order_by="Gasto.fecha")

    @property
    def numero_formateado(self) -> str:
        from app.platform.alquileres.recibos import numero_formateado

        return numero_formateado(self.numero)

    @property
    def whatsapp_url(self) -> str | None:
        from app.platform.alquileres.recibos import whatsapp_url_liquidacion

        return whatsapp_url_liquidacion(self)
```

> Las propiedades `recibo_numero_formateado` / `whatsapp_url` importan `recibos` de forma perezosa; ese módulo se crea en la Task 5. Hasta entonces los tests no las tocan.

- [ ] **Step 4: Inmobiliaria** — en `src/app/platform/inmobiliaria/models.py`, después de `honorarios_alquiler_pct`:

```python
    # Punitorio por día de atraso (0.100 = 0,1 % diario) y días de gracia antes de contarlo.
    punitorio_diario_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 3), nullable=True)
    dias_gracia: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Contadores de numeración correlativa. Se incrementan con UPDATE ... RETURNING
    # dentro de la transacción del pago / liquidación (ver cobros._siguiente_numero).
    ultimo_recibo: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ultima_liquidacion: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
```

(Agregar `Integer` al import de `sqlalchemy` si falta.)

En `schemas.py`, `InmobiliariaUpdate` suma:

```python
    punitorio_diario_pct: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=3)
    dias_gracia: int | None = Field(default=None, ge=0, le=60)
```

`InmobiliariaOut` suma:

```python
    punitorio_diario_pct: Decimal | None
    dias_gracia: int
    email_configurado: bool = False

    @classmethod
    def desde(cls, fila) -> InmobiliariaOut:
        """`email_configurado` sale de `Settings`, no de la fila."""
        from app.config import get_settings

        out = cls.model_validate(fila)
        out.email_configurado = get_settings().email_configurado
        return out
```

En `router.py`, los tres endpoints devuelven `InmobiliariaOut.desde(...)` en vez de la fila:

```python
@router.get("", response_model=InmobiliariaOut)
def obtener(db: Session = Depends(get_db), _: object = Depends(get_current_user)):
    return InmobiliariaOut.desde(service.obtener(db))


@router.put("", response_model=InmobiliariaOut, dependencies=SOLO_ADMIN)
def actualizar(data: InmobiliariaUpdate, db: Session = Depends(get_db)):
    return InmobiliariaOut.desde(service.actualizar(db, data))


@router.post("/logo", response_model=InmobiliariaOut, dependencies=SOLO_ADMIN)
def subir_logo(archivo: UploadFile = File(...), db: Session = Depends(get_db)):
    return InmobiliariaOut.desde(service.subir_logo(db, archivo))
```

Test en `src/tests/test_inmobiliaria.py` (al final):

```python
def test_put_punitorio_y_gracia_y_get_email_configurado(client, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    r = client.put("/api/v1/inmobiliaria", json={"punitorio_diario_pct": "0.100", "dias_gracia": 5})
    assert r.status_code == 200, r.text
    assert float(r.json()["punitorio_diario_pct"]) == 0.1
    assert r.json()["dias_gracia"] == 5
    assert r.json()["email_configurado"] is False
```

- [ ] **Step 5: Storage** — en `src/app/storage.py` reemplazar `guardar_pdf_contrato` por:

```python
def guardar_archivo(contenido: bytes, clave: str) -> ArchivoGuardado:
    """Guarda bytes bajo una clave elegida por quien llama (recibos, liquidaciones,
    comprobantes de gastos). La extensión de la clave decide el `ContentType` en R2."""
    return ArchivoGuardado(url=_guardar(contenido, clave), clave=clave)


def guardar_pdf_contrato(contenido: bytes) -> ArchivoGuardado:
    """El PDF firmado de un contrato de alquiler: un solo archivo, sin variantes.

    La extensión es siempre `.pdf`: en R2 el `ContentType` se deduce de ella
    (ver `_subir_r2`), así el navegador lo abre en vez de ofrecerlo como descarga.
    """
    return guardar_archivo(contenido, f"{CARPETA_CONTRATOS}/{uuid.uuid4().hex}.pdf")
```

- [ ] **Step 6: Migración** — `src/alembic/versions/0006_alquileres_cobros.py`:

```python
"""Bloque 2b: cobros, pagos, gastos y liquidaciones de alquileres administrados

Cuatro tablas y cuatro enums nuevos; columnas nuevas en `inmobiliaria`
(punitorio, gracia, contadores) y `alquileres_contratos` (punitorio override).

Revision ID: 0006_alquileres_cobros
Revises: 0005_alquileres_contratos
Create Date: 2026-09-17

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0006_alquileres_cobros"
down_revision: str | None = "0005_alquileres_contratos"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

estado_cobro = sa.Enum("pendiente", "parcial", "pagado", "anulado", name="estado_cobro")
medio_pago = sa.Enum("efectivo", "transferencia", "otro", name="medio_pago")
tipo_gasto = sa.Enum("expensas", "reparacion", "impuesto", "otro", name="tipo_gasto")
estado_liquidacion = sa.Enum("emitida", "pagada", name="estado_liquidacion")


def upgrade() -> None:
    op.add_column("inmobiliaria", sa.Column("punitorio_diario_pct", sa.Numeric(5, 3), nullable=True))
    op.add_column(
        "inmobiliaria", sa.Column("dias_gracia", sa.Integer(), nullable=False, server_default="0")
    )
    op.add_column(
        "inmobiliaria", sa.Column("ultimo_recibo", sa.Integer(), nullable=False, server_default="0")
    )
    op.add_column(
        "inmobiliaria",
        sa.Column("ultima_liquidacion", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "alquileres_contratos", sa.Column("punitorio_diario_pct", sa.Numeric(5, 3), nullable=True)
    )

    op.create_table(
        "alquileres_cobros",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "contrato_id",
            sa.Integer(),
            sa.ForeignKey("alquileres_contratos.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("periodo", sa.Date(), nullable=False),
        sa.Column("fecha_vencimiento", sa.Date(), nullable=False),
        sa.Column("monto", sa.Numeric(14, 2), nullable=False),
        sa.Column("estado", estado_cobro, nullable=False, server_default="pendiente"),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("contrato_id", "periodo", name="uq_alquileres_cobro_periodo"),
    )
    op.create_index(
        "ix_alquileres_cobros_fecha_vencimiento", "alquileres_cobros", ["fecha_vencimiento"]
    )
    op.create_index(
        "ix_alquileres_cobros_estado_vencimiento",
        "alquileres_cobros",
        ["estado", "fecha_vencimiento"],
    )

    op.create_table(
        "alquileres_liquidaciones",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "contrato_id",
            sa.Integer(),
            sa.ForeignKey("alquileres_contratos.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("periodo", sa.Date(), nullable=False),
        sa.Column("numero", sa.Integer(), nullable=False, unique=True),
        sa.Column("total_cobrado", sa.Numeric(14, 2), nullable=False),
        sa.Column("total_punitorios", sa.Numeric(14, 2), nullable=False),
        sa.Column("honorarios_pct", sa.Numeric(5, 2), nullable=False),
        sa.Column("honorarios_monto", sa.Numeric(14, 2), nullable=False),
        sa.Column("total_gastos", sa.Numeric(14, 2), nullable=False),
        sa.Column("total_a_transferir", sa.Numeric(14, 2), nullable=False),
        sa.Column("estado", estado_liquidacion, nullable=False, server_default="emitida"),
        sa.Column("fecha_pago", sa.Date(), nullable=True),
        sa.Column("comprobante_pdf_url", sa.String(1024), nullable=True),
        sa.Column("comprobante_pdf_key", sa.String(512), nullable=True),
        sa.Column("enviado_email_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column(
            "created_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("contrato_id", "periodo", name="uq_alquileres_liquidacion_periodo"),
    )

    op.create_table(
        "alquileres_pagos",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "cobro_id",
            sa.Integer(),
            sa.ForeignKey("alquileres_cobros.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("fecha_pago", sa.Date(), nullable=False),
        sa.Column("monto", sa.Numeric(14, 2), nullable=False),
        sa.Column("punitorio", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("medio", medio_pago, nullable=False),
        sa.Column("referencia", sa.String(100), nullable=True),
        sa.Column("recibo_numero", sa.Integer(), nullable=False, unique=True),
        sa.Column("recibo_pdf_url", sa.String(1024), nullable=True),
        sa.Column("recibo_pdf_key", sa.String(512), nullable=True),
        sa.Column("enviado_email_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("anulado_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("motivo_anulacion", sa.Text(), nullable=True),
        sa.Column(
            "liquidacion_id",
            sa.Integer(),
            sa.ForeignKey("alquileres_liquidaciones.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column(
            "registrado_por_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_alquileres_pagos_cobro_id", "alquileres_pagos", ["cobro_id"])
    op.create_index("ix_alquileres_pagos_fecha_pago", "alquileres_pagos", ["fecha_pago"])
    op.create_index("ix_alquileres_pagos_liquidacion_id", "alquileres_pagos", ["liquidacion_id"])

    op.create_table(
        "alquileres_gastos",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "contrato_id",
            sa.Integer(),
            sa.ForeignKey("alquileres_contratos.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("fecha", sa.Date(), nullable=False),
        sa.Column("tipo", tipo_gasto, nullable=False),
        sa.Column("concepto", sa.String(150), nullable=False),
        sa.Column("monto", sa.Numeric(14, 2), nullable=False),
        sa.Column("comprobante_url", sa.String(1024), nullable=True),
        sa.Column("comprobante_key", sa.String(512), nullable=True),
        sa.Column(
            "liquidacion_id",
            sa.Integer(),
            sa.ForeignKey("alquileres_liquidaciones.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_alquileres_gastos_contrato_fecha", "alquileres_gastos", ["contrato_id", "fecha"]
    )
    op.create_index("ix_alquileres_gastos_liquidacion_id", "alquileres_gastos", ["liquidacion_id"])


def downgrade() -> None:
    op.drop_table("alquileres_gastos")
    op.drop_table("alquileres_pagos")
    op.drop_table("alquileres_liquidaciones")
    op.drop_table("alquileres_cobros")
    op.drop_column("alquileres_contratos", "punitorio_diario_pct")
    for col in ("ultima_liquidacion", "ultimo_recibo", "dias_gracia", "punitorio_diario_pct"):
        op.drop_column("inmobiliaria", col)
    bind = op.get_bind()
    for tipo in (estado_liquidacion, tipo_gasto, medio_pago, estado_cobro):
        tipo.drop(bind, checkfirst=True)
```

- [ ] **Step 7: Fixtures y helper de tests**

En `src/tests/conftest.py`, al final:

```python
@pytest.fixture
def media_tmp(tmp_path, monkeypatch):
    """Storage local apuntando a un directorio temporal: los PDF y comprobantes
    que generan los tests quedan ahí y se borran solos. Fuerza `local` por si el
    `.env` de quien corre los tests tiene `STORAGE_BACKEND=r2`."""
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "storage_backend", "local")
    monkeypatch.setattr(get_settings(), "media_root", tmp_path)
    return tmp_path


@pytest.fixture
def smtp_configurado(monkeypatch):
    """`Settings` con SMTP completo, sin tocar variables de entorno."""
    from app.config import get_settings

    s = get_settings()
    monkeypatch.setattr(s, "smtp_host", "smtp.ejemplo.com")
    monkeypatch.setattr(s, "smtp_user", "mambo")
    monkeypatch.setattr(s, "smtp_password", "clave")
    monkeypatch.setattr(s, "email_from", "Mambo <no-reply@mambo.com.ar>")


@pytest.fixture
def emails_enviados(monkeypatch):
    """Captura lo que `app.email.enviar_email` hubiera mandado: (destinatario, asunto, cuerpo, adjuntos)."""
    from app import email as modulo_email

    capturados: list[tuple] = []

    def _falso(destinatario, asunto, cuerpo, adjuntos=()):
        capturados.append((destinatario, asunto, cuerpo, list(adjuntos)))

    monkeypatch.setattr(modulo_email, "enviar_email", _falso)
    # Los submódulos importan la función por nombre: parchear también ahí.
    from app.platform.alquileres import recibos

    monkeypatch.setattr(recibos, "enviar_email", _falso, raising=False)
    return capturados
```

En `src/tests/helpers_crm.py`, al final:

```python
def crear_contrato_de_prueba(db, user_id: int, **campos):
    """Contrato administrado de 12 meses (por defecto) con inquilino y propietario nuevos.

    `campos` sobreescribe cualquier campo de `ContratoCrear`. Devuelve el `Contrato`.
    """
    from datetime import date

    from app.platform.alquileres.schemas import ContratoCrear
    from app.platform.alquileres.service import crear_contrato

    prop = crear_propiedad(db, titulo=campos.pop("titulo", "Depto en La Plata"), operacion=TipoOperacion.alquiler)
    inquilino = crear_persona(db, "Ana", "Pérez")
    propietario = crear_persona(db, "Juan", "López")
    base = {
        "property_id": prop.id,
        "partes": [
            {"person_id": inquilino.id, "rol": "inquilino"},
            {"person_id": propietario.id, "rol": "propietario"},
        ],
        "fecha_inicio": date(2026, 1, 1),
        "fecha_fin": date(2026, 12, 31),
        "dia_vencimiento": 10,
        "monto_inicial": 100000,
        "moneda": "ARS",
        "indice": "sin_ajuste",
        "administrado": True,
        "honorarios_pct": 10,
    }
    base.update(campos)
    return crear_contrato(db, ContratoCrear.model_validate(base), user_id)
```

- [ ] **Step 8: Correr**

Run: `cd src && python -m pytest tests/test_alquileres_modelos.py tests/test_inmobiliaria.py -q && ruff check app tests`
Expected: PASS. Después: `alembic upgrade head` contra la base local y `alembic check` → "No new upgrade operations detected."

---

## Task 4: Generación de cobros y enganches en el ciclo del contrato

**Files:**
- Create: `src/app/platform/alquileres/cobros.py` (primera parte)
- Modify: `src/app/platform/alquileres/service.py` (`crear_contrato`, `actualizar_contrato`, `_terminar`, `finalizar_contrato`, `rescindir_contrato`, `renovar_contrato`, `_base_de_renovacion`, `aplicar_ajuste`)
- Modify: `src/app/platform/alquileres/schemas.py` (`punitorio_diario_pct` en Crear/Actualizar/Renovar/Detalle; `cobros_no_actualizados`)
- Create: `src/tests/test_alquileres_cobros.py`

**Interfaces:**
- Produces: `cobros.periodos(fecha_inicio, fecha_fin) -> list[date]`; `cobros.generar_cobros(contrato) -> list[Cobro]`; `cobros.sincronizar_cobros(db, contrato, cambios: set[str], era_administrado: bool) -> None`; `cobros.reflejar_ajuste(contrato, ajuste) -> int`; `cobros.anular_posteriores(contrato, corte: date, nota: str) -> None`; `cobros.conflicto(detalle) -> HTTPException`.
- `ContratoDetalle.cobros_no_actualizados: int | None` (solo en la respuesta de aplicar ajuste).

- [ ] **Step 1: Tests** — `src/tests/test_alquileres_cobros.py`:

```python
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
    return Pago(fecha_pago=fecha, monto=Decimal(monto), medio=MedioPago.efectivo, recibo_numero=numero)


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
    contrato = actualizar_contrato(db, contrato.id, ContratoActualizar(administrado=False), admin.id)
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
    assert [c.periodo for c in contrato.cobros] == cobros.periodos(date(2026, 1, 1), date(2026, 6, 30))
    contrato = actualizar_contrato(db, contrato.id, ContratoActualizar(dia_vencimiento=20), admin.id)
    assert contrato.cobros[1].fecha_vencimiento == date(2026, 2, 20)


def test_patch_fecha_fin_que_deja_afuera_pagos_409(db, admin):
    contrato = crear_contrato_de_prueba(db, admin.id)
    contrato.cobros[-1].pagos.append(_pago(date(2026, 12, 5)))
    db.commit()
    with pytest.raises(HTTPException) as exc:
        actualizar_contrato(db, contrato.id, ContratoActualizar(fecha_fin=date(2026, 6, 30)), admin.id)
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
```

- [ ] **Step 2: Ver fallar**

Run: `cd src && python -m pytest tests/test_alquileres_cobros.py -q`
Expected: FAIL (`ModuleNotFoundError: app.platform.alquileres.cobros`).

- [ ] **Step 3: `cobros.py` (primera parte)**

```python
"""Cobros esperados y pagos de contratos administrados.

Los cobros se **materializan** al crear el contrato (una fila por mes), igual
que los ajustes: no hay cron en Render free, y así "vencidos" y "vencen esta
semana" son SQL directo y cada período es editable. `estado` solo refleja
pagos; el atraso se deriva de `fecha_vencimiento` en la consulta.
"""

from __future__ import annotations

from datetime import date

from dateutil.relativedelta import relativedelta
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.platform.alquileres.models import Ajuste, Cobro, Contrato, EstadoCobro


def conflicto(detalle: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detalle)


# ---------------------------------------------------------------------------
# Generación
# ---------------------------------------------------------------------------


def periodos(fecha_inicio: date, fecha_fin: date) -> list[date]:
    """Primer día de cada mes entre inicio y fin, ambos incluidos."""
    periodo = fecha_inicio.replace(day=1)
    salida: list[date] = []
    while periodo <= fecha_fin:
        salida.append(periodo)
        periodo += relativedelta(months=1)
    return salida


def _vencimiento(periodo: date, dia: int, fecha_inicio: date) -> date:
    """Día `dia` del mes; en el primer mes, nunca antes del inicio del contrato."""
    return max(periodo.replace(day=dia), fecha_inicio)


def generar_cobros(contrato: Contrato) -> list[Cobro]:
    """Un cobro `pendiente` por mes con el monto vigente a ese período. Pura."""
    if not contrato.administrado:
        return []
    return [
        Cobro(
            periodo=p,
            fecha_vencimiento=_vencimiento(p, contrato.dia_vencimiento, contrato.fecha_inicio),
            monto=contrato.monto_vigente_a(p),
        )
        for p in periodos(contrato.fecha_inicio, contrato.fecha_fin)
    ]


def _regenerable(cobro: Cobro) -> bool:
    """Se puede borrar y rehacer: pendiente y sin ningún pago (ni siquiera anulado,
    porque borrarlo se llevaría el recibo)."""
    return cobro.estado == EstadoCobro.pendiente and not cobro.pagos


_CAMPOS_COBROS = {"fecha_inicio", "fecha_fin", "dia_vencimiento"}


def sincronizar_cobros(
    db: Session, contrato: Contrato, cambios: set[str], era_administrado: bool
) -> None:
    """Después de un PATCH: genera, borra o regenera los cobros según qué cambió.

    No commitea: corre dentro de `actualizar_contrato`. Las validaciones (409)
    van antes de tocar nada, así el rollback del caller no tiene nada que deshacer.
    """
    if not contrato.administrado:
        if era_administrado:
            if any(c.tiene_pagos for c in contrato.cobros):
                raise conflicto(
                    "El contrato tiene cobros registrados; no puede dejar de ser administrado"
                )
            for cobro in list(contrato.cobros):
                db.delete(cobro)
        return

    if not era_administrado:
        contrato.cobros = generar_cobros(contrato)
        return

    if not cambios & _CAMPOS_COBROS:
        return

    ultimo_periodo = contrato.fecha_fin.replace(day=1)
    if any(c.tiene_pagos and c.periodo > ultimo_periodo for c in contrato.cobros):
        raise conflicto("Hay períodos con pagos fuera del nuevo plazo del contrato")

    for cobro in list(contrato.cobros):
        if _regenerable(cobro):
            db.delete(cobro)
    db.flush()
    db.expire(contrato, ["cobros"])
    existentes = {c.periodo for c in contrato.cobros}
    contrato.cobros.extend(c for c in generar_cobros(contrato) if c.periodo not in existentes)


def reflejar_ajuste(contrato: Contrato, ajuste: Ajuste) -> int:
    """Pone `monto_nuevo` en los cobros desde el período del ajuste que no tengan
    pagos. Devuelve cuántos quedaron sin tocar (para avisar en el panel)."""
    sin_tocar = 0
    for cobro in contrato.cobros:
        if cobro.periodo < ajuste.fecha_prevista or cobro.estado == EstadoCobro.anulado:
            continue
        if cobro.pagos:
            sin_tocar += 1
            continue
        cobro.monto = ajuste.monto_nuevo
    return sin_tocar


def anular_posteriores(contrato: Contrato, corte: date, nota: str) -> None:
    """Al terminar el contrato: los meses posteriores al de corte, sin pagos, se anulan.
    El mes de corte queda pendiente por si hay que prorratearlo a mano."""
    mes_corte = corte.replace(day=1)
    for cobro in contrato.cobros:
        if cobro.periodo > mes_corte and _regenerable(cobro):
            cobro.estado = EstadoCobro.anulado
            cobro.notas = nota
```

- [ ] **Step 4: Enganches en `service.py`**

Import arriba: `from app.platform.alquileres import cobros as cobros_service`.

En `crear_contrato`, después de `contrato.ajustes = generar_ajustes(contrato)`:

```python
    contrato.cobros = cobros_service.generar_cobros(contrato)
```

En `actualizar_contrato`, justo antes de `propiedad_anterior_id = contrato.property_id`:

```python
    era_administrado = contrato.administrado
```

y después del bloque `if cambios.keys() & _CAMPOS_CALENDARIO: _regenerar_pendientes(db, contrato)`:

```python
    cobros_service.sincronizar_cobros(db, contrato, set(cambios), era_administrado)
```

`_terminar` recibe `corte: date` y anula los posteriores. Firma y cuerpo nuevos:

```python
def _terminar(
    db: Session,
    contrato: Contrato,
    estado: EstadoContrato,
    nota: str,
    corte: date,
    liberar_propiedad: bool = True,
) -> None:
    """Cierra el contrato en `estado`, omite los ajustes pendientes y anula los cobros
    posteriores al mes de `corte` (fecha de fin o de rescisión).

    No hace commit: lo usa también la renovación dentro de su propia transacción.
    Con `liberar_propiedad` aplica `contrato_terminado`, que solo suelta la propiedad
    si sigue `cerrada` (si el staff ya la movió a mano, se respeta).
    """
    contrato.estado = estado
    for ajuste in contrato.ajustes:
        if ajuste.estado == EstadoAjuste.pendiente:
            ajuste.estado = EstadoAjuste.omitido
            ajuste.notas = nota
    cobros_service.anular_posteriores(contrato, corte, nota)
    db.flush()
    if liberar_propiedad:
        _mover_propiedad(db, contrato.property_id, EventoOperacion.contrato_terminado)
```

Llamadas:
- `finalizar_contrato`: `_terminar(db, contrato, EstadoContrato.finalizado, "Contrato finalizado", contrato.fecha_fin)`
- `rescindir_contrato`: `_terminar(db, contrato, EstadoContrato.rescindido, "Contrato rescindido", datos.fecha_rescision)`
- `renovar_contrato`: `_terminar(db, anterior, EstadoContrato.finalizado, "Renovado", anterior.fecha_fin, liberar_propiedad=False)`

`_base_de_renovacion` suma `"punitorio_diario_pct": anterior.punitorio_diario_pct,`.

En `aplicar_ajuste`, después de `ajuste.notas = datos.notas`:

```python
    # Atributo transitorio (no mapeado): `ContratoDetalle` lo lee si está presente.
    contrato.cobros_no_actualizados = cobros_service.reflejar_ajuste(contrato, ajuste)
```

`db.refresh(contrato)` no borra atributos no mapeados, así que el valor llega al schema.

- [ ] **Step 5: Schemas** — en `schemas.py`:

`ContratoCrear`, `ContratoActualizar` y `ContratoRenovar` suman:

```python
    punitorio_diario_pct: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=3)
```

`ContratoDetalle` suma:

```python
    punitorio_diario_pct: Decimal | None
    # Solo lo trae la respuesta de aplicar un ajuste: períodos con pagos que no se actualizaron.
    cobros_no_actualizados: int | None = None
```

- [ ] **Step 6: Correr**

Run: `cd src && python -m pytest tests/ -q && ruff check app tests`
Expected: PASS toda la suite.

---

## Task 5: Pagos, punitorio, numeración y recibo PDF

**Files:**
- Create: `src/app/platform/alquileres/recibos.py`
- Modify: `src/app/platform/alquileres/cobros.py` (segunda parte: punitorio, pagos)
- Modify: `src/app/platform/alquileres/schemas.py` (schemas de cobros y pagos; `ContratoDetalle.cobros`)
- Modify: `src/app/platform/alquileres/router.py`
- Create: `src/tests/test_alquileres_pagos.py`

**Interfaces:**
- Consumes: `formato.formato_moneda/monto_en_letras/nombre_periodo`, `pdf.DocumentoMambo`, `storage.guardar_archivo/leer_archivo`, `inmobiliaria.service.obtener`, modelos de Task 3.
- Produces: `recibos.numero_formateado(n) -> str`; `recibos.cargar_logo(inmobiliaria) -> bytes | None`; `recibos.email_de(person) -> str | None`; `recibos.telefono_whatsapp(person) -> str | None`; `recibos.armar_whatsapp_url(telefono, texto) -> str`; `recibos.asunto_recibo(pago)`, `recibos.texto_recibo(pago, para_whatsapp=False)`; `recibos.generar_recibo_pdf(pago) -> bytes`; `recibos.whatsapp_url_recibo(pago)`; `cobros.calcular_punitorio(cobro, fecha_pago, inmobiliaria) -> PunitorioSugerido`; `cobros.siguiente_numero(db, columna) -> int`; `cobros.obtener_cobro(db, contrato_id, cobro_id) -> Cobro`; `cobros.registrar_pago(db, contrato_id, cobro_id, datos: PagoCrear, user_id) -> Cobro`; `cobros.anular_pago(db, contrato_id, cobro_id, pago_id, datos: AnularIn) -> Cobro`; `cobros.actualizar_cobro(db, contrato_id, cobro_id, datos: CobroActualizar) -> Cobro`; `cobros.anular_cobro(db, contrato_id, cobro_id, datos: AnularIn) -> Cobro`.
- Schemas: `PagoCrear`, `AnularIn`, `CobroActualizar`, `PunitorioSugerido`, `PagoOut`, `CobroDetalle`, `ContratoDetalle.cobros: list[CobroDetalle]`.
- Endpoints: `GET/PATCH /contratos/{id}/cobros/{cobro_id}`, `POST .../anular`, `GET .../punitorio?fecha_pago=`, `POST .../pagos`, `POST .../pagos/{pago_id}/anular`.

- [ ] **Step 1: Tests** — `src/tests/test_alquileres_pagos.py`:

```python
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
        json={"fecha_pago": str(HOY), "monto": "100000", "punitorio": "0", "medio": "transferencia", "referencia": "TRF-1"},
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
    r1 = client.post(f"{_url(contrato, cobro)}/pagos", json={"fecha_pago": str(HOY), "monto": "40000", "punitorio": "0", "medio": "efectivo"})
    assert r1.json()["estado"] == "parcial"
    assert Decimal(r1.json()["saldo"]) == Decimal("60000")
    r2 = client.post(f"{_url(contrato, cobro)}/pagos", json={"fecha_pago": str(HOY), "monto": "60000", "punitorio": "0", "medio": "efectivo"})
    assert r2.json()["estado"] == "pagado"
    assert [p["recibo_numero"] for p in r2.json()["pagos"]] == [1, 2]


def test_monto_mayor_al_saldo_422(client, db, sesion):
    contrato = _contrato_vencido(db, sesion.id)
    r = client.post(f"{_url(contrato, contrato.cobros[0])}/pagos", json={"fecha_pago": str(HOY), "monto": "100001", "medio": "efectivo"})
    assert r.status_code == 422


def test_pagar_cobro_pagado_o_anulado_409(client, db, sesion):
    contrato = _contrato_vencido(db, sesion.id)
    cobro = contrato.cobros[0]
    client.post(f"{_url(contrato, cobro)}/pagos", json={"fecha_pago": str(HOY), "monto": "100000", "punitorio": "0", "medio": "efectivo"})
    r = client.post(f"{_url(contrato, cobro)}/pagos", json={"fecha_pago": str(HOY), "monto": "1", "medio": "efectivo"})
    assert r.status_code == 409
    otro = contrato.cobros[1]
    client.post(f"{_url(contrato, otro)}/anular", json={"motivo": "Mes bonificado"})
    r = client.post(f"{_url(contrato, otro)}/pagos", json={"fecha_pago": str(HOY), "monto": "1", "medio": "efectivo"})
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

    r = client.post(f"{_url(contrato, cobro)}/pagos", json={"fecha_pago": str(fecha_pago), "monto": "100000", "medio": "efectivo"})
    assert Decimal(r.json()["pagos"][0]["punitorio"]) == Decimal("1000.00")

    # Con punitorio explícito, se respeta.
    otro = contrato.cobros[1]
    r = client.post(f"{_url(contrato, otro)}/pagos", json={"fecha_pago": str(fecha_pago), "monto": "100000", "punitorio": "0", "medio": "efectivo"})
    assert Decimal(r.json()["pagos"][0]["punitorio"]) == 0


def test_anular_pago_conserva_el_numero_y_no_lo_reusa(client, db, sesion):
    contrato = _contrato_vencido(db, sesion.id)
    cobro = contrato.cobros[0]
    r = client.post(f"{_url(contrato, cobro)}/pagos", json={"fecha_pago": str(HOY), "monto": "100000", "punitorio": "0", "medio": "efectivo"})
    pago_id = r.json()["pagos"][0]["id"]

    r = client.post(f"{_url(contrato, cobro)}/pagos/{pago_id}/anular", json={"motivo": "Transferencia rebotó"})
    assert r.status_code == 200, r.text
    assert r.json()["estado"] == "pendiente"
    assert r.json()["pagos"][0]["anulado_at"] is not None
    assert r.json()["pagos"][0]["recibo_pdf_url"]

    r = client.post(f"{_url(contrato, cobro)}/pagos", json={"fecha_pago": str(HOY), "monto": "100000", "punitorio": "0", "medio": "efectivo"})
    assert r.json()["pagos"][1]["recibo_numero"] == 2

    r = client.post(f"{_url(contrato, cobro)}/pagos/{pago_id}/anular", json={"motivo": "otra vez"})
    assert r.status_code == 409


def test_si_falla_la_subida_del_pdf_no_queda_pago(client, db, sesion, monkeypatch):
    contrato = _contrato_vencido(db, sesion.id)
    cobro = contrato.cobros[0]

    def _explota(contenido, clave):
        raise OSError("R2 caído")

    monkeypatch.setattr(cobros, "guardar_archivo", _explota)
    r = client.post(f"{_url(contrato, cobro)}/pagos", json={"fecha_pago": str(HOY), "monto": "100000", "punitorio": "0", "medio": "efectivo"})
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

    client.post(f"{_url(contrato, cobro)}/pagos", json={"fecha_pago": str(HOY), "monto": "1", "punitorio": "0", "medio": "efectivo"})
    assert client.patch(_url(contrato, cobro), json={"monto": "1"}).status_code == 409
    assert client.post(f"{_url(contrato, cobro)}/anular", json={"motivo": "x"}).status_code == 409

    libre = contrato.cobros[3]
    r = client.post(f"{_url(contrato, libre)}/anular", json={"motivo": "Bonificado"})
    assert r.json()["estado"] == "anulado"


def test_whatsapp_url_con_y_sin_telefono(client, db, sesion):
    contrato = _contrato_vencido(db, sesion.id)
    cobro = contrato.cobros[0]
    r = client.post(f"{_url(contrato, cobro)}/pagos", json={"fecha_pago": str(HOY), "monto": "100000", "punitorio": "0", "medio": "efectivo"})
    assert r.json()["pagos"][0]["whatsapp_url"] is None

    inquilino = next(p for p in contrato.partes if p.rol == "inquilino").person
    inquilino.contacts.append(PersonContact(type="whatsapp", value="221 555-1234", is_primary=True))
    db.commit()
    r = client.get(_url(contrato, cobro))
    url = r.json()["pagos"][0]["whatsapp_url"]
    assert url.startswith("https://wa.me/542215551234?text=")
    assert "0001-00000001" in recibos.texto_recibo(db.get(Cobro, cobro.id).pagos[0], para_whatsapp=True)


def test_telefono_whatsapp_normaliza():
    assert recibos.normalizar_telefono("+54 9 221 555-1234") == "5492215551234"
    assert recibos.normalizar_telefono("2215551234") == "542215551234"
```

- [ ] **Step 2: Ver fallar**

Run: `cd src && python -m pytest tests/test_alquileres_pagos.py -q`
Expected: FAIL (`ModuleNotFoundError: app.platform.alquileres.recibos`).

- [ ] **Step 3: `recibos.py`**

```python
"""Recibos: numeración, textos, PDF, WhatsApp y envío en segundo plano.

Sin lógica de base: recibe objetos ya cargados y devuelve bytes o strings.
Lo único que toca I/O es `cargar_logo` (lee del storage) y `enviar_y_marcar`
(el `BackgroundTask`, con su propia sesión).
"""

from __future__ import annotations

import logging
import re
from datetime import UTC, datetime
from urllib.parse import quote

from app.database import SessionLocal
from app.email import Adjunto, enviar_email
from app.formato import formato_moneda, monto_en_letras, nombre_periodo
from app.pdf import DocumentoMambo
from app.platform.alquileres.models import Contrato, Pago, RolParteContrato
from app.platform.inmobiliaria.models import Inmobiliaria
from app.platform.people.models import Person
from app.storage import leer_archivo

logger = logging.getLogger(__name__)

# Punto de venta fijo: hoy no significa nada, pero si algún día entra ARCA el
# número ya tiene la forma que pide y no hay que renumerar.
PUNTO_DE_VENTA = "0001"


def numero_formateado(numero: int) -> str:
    return f"{PUNTO_DE_VENTA}-{numero:08d}"


# ---------------------------------------------------------------------------
# Datos de las partes
# ---------------------------------------------------------------------------


def partes_con_rol(contrato: Contrato, rol: RolParteContrato) -> list[Person]:
    return [p.person for p in contrato.partes if p.rol == rol]


def nombres(personas: list[Person]) -> str:
    return " y ".join(p.full_name for p in personas)


def _contacto(person: Person, tipos: tuple[str, ...]) -> str | None:
    """El contacto primario del tipo pedido; si no hay primario, el primero."""
    candidatos = [c for c in person.contacts if c.type in tipos]
    if not candidatos:
        return None
    primarios = [c for c in candidatos if c.is_primary]
    return (primarios or candidatos)[0].value


def email_de(person: Person) -> str | None:
    return _contacto(person, ("email",))


def normalizar_telefono(valor: str) -> str:
    """Solo dígitos, con prefijo 54 si no lo trae (wa.me exige código de país)."""
    digitos = re.sub(r"\D", "", valor)
    return digitos if digitos.startswith("54") else f"54{digitos}"


def telefono_whatsapp(person: Person) -> str | None:
    valor = _contacto(person, ("whatsapp", "phone"))
    return normalizar_telefono(valor) if valor else None


def armar_whatsapp_url(telefono: str, texto: str) -> str:
    return f"https://wa.me/{telefono}?text={quote(texto)}"


def cargar_logo(inmobiliaria: Inmobiliaria) -> bytes | None:
    if not inmobiliaria.logo_storage_key:
        return None
    try:
        return leer_archivo(inmobiliaria.logo_storage_key)
    except Exception:  # noqa: BLE001 — sin logo el recibo sale igual
        logger.warning("No se pudo leer el logo %s", inmobiliaria.logo_storage_key)
        return None


def lineas_inmobiliaria(inmobiliaria: Inmobiliaria) -> list[str]:
    lineas = []
    if inmobiliaria.cuit:
        lineas.append(f"CUIT {inmobiliaria.cuit}")
    if inmobiliaria.direccion:
        lineas.append(inmobiliaria.direccion)
    contacto = " · ".join(x for x in (inmobiliaria.telefono, inmobiliaria.email) if x)
    if contacto:
        lineas.append(contacto)
    return lineas


def firma(inmobiliaria: Inmobiliaria) -> str:
    return " · ".join(
        x for x in (inmobiliaria.nombre, inmobiliaria.telefono, inmobiliaria.email) if x
    )


def _propiedad_texto(contrato: Contrato) -> str:
    prop = contrato.propiedad
    partes = [prop.titulo]
    if getattr(prop, "direccion", None):
        partes.append(prop.direccion)
    if getattr(prop, "ciudad", None):
        partes.append(prop.ciudad)
    return ", ".join(partes)


# ---------------------------------------------------------------------------
# Recibo
# ---------------------------------------------------------------------------


def asunto_recibo(pago: Pago) -> str:
    contrato = pago.cobro.contrato
    return (
        f"Recibo N° {numero_formateado(pago.recibo_numero)} · "
        f"{contrato.propiedad.titulo} · {nombre_periodo(pago.cobro.periodo)}"
    )


def texto_recibo(pago: Pago, inmobiliaria: Inmobiliaria | None = None, para_whatsapp: bool = False) -> str:
    cobro = pago.cobro
    contrato = cobro.contrato
    inquilinos = partes_con_rol(contrato, RolParteContrato.inquilino)
    total = formato_moneda(pago.total, contrato.moneda)
    lineas = [
        f"Hola {inquilinos[0].first_name if inquilinos else ''},".replace(" ,", ","),
        f"Te enviamos el recibo N° {numero_formateado(pago.recibo_numero)} por el alquiler de "
        f"{contrato.propiedad.titulo}, período {nombre_periodo(cobro.periodo)}: {total}.",
    ]
    if cobro.saldo > 0:
        lineas.append(f"Queda un saldo pendiente de {formato_moneda(cobro.saldo, contrato.moneda)}.")
    if para_whatsapp:
        lineas.append(f"Recibo en PDF: {pago.recibo_pdf_url}")
    else:
        lineas.append("Adjuntamos el recibo en PDF.")
    if inmobiliaria is not None:
        lineas.append(firma(inmobiliaria))
    return "\n".join(lineas)


def whatsapp_url_recibo(pago: Pago) -> str | None:
    inquilinos = partes_con_rol(pago.cobro.contrato, RolParteContrato.inquilino)
    telefono = next((t for p in inquilinos if (t := telefono_whatsapp(p))), None)
    if telefono is None:
        return None
    return armar_whatsapp_url(telefono, texto_recibo(pago, para_whatsapp=True))


def generar_recibo_pdf(pago: Pago, inmobiliaria: Inmobiliaria, registrado_por: str) -> bytes:
    cobro = pago.cobro
    contrato = cobro.contrato
    moneda = contrato.moneda
    periodo = nombre_periodo(cobro.periodo)

    doc = DocumentoMambo()
    doc.encabezado(inmobiliaria.nombre, lineas_inmobiliaria(inmobiliaria), cargar_logo(inmobiliaria))
    doc.titulo("RECIBO", numero_formateado(pago.recibo_numero), pago.fecha_pago)

    inquilinos = partes_con_rol(contrato, RolParteContrato.inquilino)
    documentos = ", ".join(
        f"{p.document_type or 'DNI'} {p.document_number}" for p in inquilinos if p.document_number
    )
    doc.parrafo(
        f"Recibí de {nombres(inquilinos)}"
        + (f" ({documentos})" if documentos else "")
        + f" la suma de {formato_moneda(pago.total, moneda)} "
        f"({monto_en_letras(pago.total)}) en concepto de:"
    )
    doc.parrafo(f"Propiedad: {_propiedad_texto(contrato)}")

    filas = [[f"Alquiler período {periodo}", formato_moneda(pago.monto, moneda)]]
    if pago.punitorio > 0:
        dias = max(0, (pago.fecha_pago - cobro.fecha_vencimiento).days)
        filas.append([f"Punitorio por {dias} días de atraso", formato_moneda(pago.punitorio, moneda)])
    doc.tabla(["Concepto", "Monto"], filas, derecha=(1,))
    doc.total("Total", formato_moneda(pago.total, moneda))

    medio = {"efectivo": "Efectivo", "transferencia": "Transferencia", "otro": "Otro"}[pago.medio]
    detalle = f"Medio de pago: {medio}" + (f" · Ref. {pago.referencia}" if pago.referencia else "")
    doc.parrafo(detalle)
    if cobro.saldo > 0:
        doc.parrafo(f"Saldo pendiente del período: {formato_moneda(cobro.saldo, moneda)}")
    doc.parrafo(f"Registrado por {registrado_por}")
    doc.pie()
    return doc.bytes()


# ---------------------------------------------------------------------------
# Envío en segundo plano
# ---------------------------------------------------------------------------


def enviar_y_marcar(
    modelo: type, fila_id: int, destinatario: str, asunto: str, cuerpo: str, pdf_key: str, nombre_pdf: str
) -> None:
    """Cuerpo del `BackgroundTask`: sesión propia (la de la request ya se cerró).

    Si falla, queda en el log y `enviado_email_at` no se marca: el botón del panel
    vuelve a estar disponible para reintentar.
    """
    try:
        contenido = leer_archivo(pdf_key)
        enviar_email(destinatario, asunto, cuerpo, [Adjunto(nombre_pdf, contenido, "application/pdf")])
    except Exception:  # noqa: BLE001
        logger.exception("No se pudo enviar %s #%s a %s", modelo.__name__, fila_id, destinatario)
        return
    with SessionLocal() as db:
        fila = db.get(modelo, fila_id)
        if fila is not None:
            fila.enviado_email_at = datetime.now(UTC)
            db.commit()
```

> `Pago.medio` es `StrEnum`, por eso el diccionario indexa con el valor. `_propiedad_texto` usa `getattr` porque `Propiedad` es un modelo legacy con `Column` clásico.

- [ ] **Step 4: `cobros.py` (segunda parte)** — agregar imports y funciones:

Imports nuevos arriba:

```python
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import update

from app.platform.alquileres import recibos
from app.platform.alquileres.models import EstadoContrato, MedioPago, Pago
from app.platform.alquileres.schemas import AnularIn, CobroActualizar, PagoCrear, PunitorioSugerido
from app.platform.auth.models import User
from app.platform.inmobiliaria.models import Inmobiliaria
from app.platform.inmobiliaria.service import ID_UNICO
from app.platform.inmobiliaria.service import obtener as obtener_inmobiliaria
from app.storage import guardar_archivo
```

Funciones (al final del archivo):

```python
# ---------------------------------------------------------------------------
# Cobros: lectura y edición
# ---------------------------------------------------------------------------


def obtener_cobro(db: Session, contrato_id: int, cobro_id: int) -> Cobro:
    cobro = db.get(Cobro, cobro_id)
    if cobro is None or cobro.contrato_id != contrato_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cobro no encontrado")
    return cobro


def actualizar_cobro(db: Session, contrato_id: int, cobro_id: int, datos: CobroActualizar) -> Cobro:
    cobro = obtener_cobro(db, contrato_id, cobro_id)
    if cobro.estado == EstadoCobro.anulado:
        raise conflicto("El cobro está anulado")
    cambios = datos.model_dump(exclude_unset=True)
    if cambios.keys() & {"monto", "fecha_vencimiento"} and cobro.tiene_pagos:
        raise conflicto("El cobro tiene pagos; no se puede cambiar el monto ni el vencimiento")
    for campo, valor in cambios.items():
        setattr(cobro, campo, valor)
    db.commit()
    db.refresh(cobro)
    return cobro


def anular_cobro(db: Session, contrato_id: int, cobro_id: int, datos: AnularIn) -> Cobro:
    """Un mes que no se cobra (bonificado, etc.). No se des-anula en esta versión."""
    cobro = obtener_cobro(db, contrato_id, cobro_id)
    if cobro.estado == EstadoCobro.anulado:
        raise conflicto("El cobro ya está anulado")
    if cobro.tiene_pagos:
        raise conflicto("El cobro tiene pagos; anulalos primero")
    cobro.estado = EstadoCobro.anulado
    cobro.notas = datos.motivo
    db.commit()
    db.refresh(cobro)
    return cobro


# ---------------------------------------------------------------------------
# Punitorio
# ---------------------------------------------------------------------------


def calcular_punitorio(cobro: Cobro, fecha_pago: date, inmobiliaria: Inmobiliaria) -> PunitorioSugerido:
    """`saldo × pct/100 × días de atraso` (descontando la gracia). Es una sugerencia:
    el staff puede cambiarla al registrar."""
    pct = cobro.contrato.punitorio_diario_pct
    if pct is None:
        pct = inmobiliaria.punitorio_diario_pct or Decimal("0")
    dias = max(0, (fecha_pago - cobro.fecha_vencimiento).days - inmobiliaria.dias_gracia)
    monto = (cobro.saldo * pct / Decimal(100) * dias).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    return PunitorioSugerido(monto=monto, dias_atraso=dias, pct=pct)


# ---------------------------------------------------------------------------
# Numeración
# ---------------------------------------------------------------------------


def siguiente_numero(db: Session, columna) -> int:
    """`UPDATE inmobiliaria SET col = col + 1 RETURNING col`, dentro de la transacción
    actual. Postgres serializa los updates sobre la misma fila: dos pagos simultáneos
    reciben números distintos y consecutivos. Si la transacción hace rollback, el
    contador vuelve atrás y el número no se pierde."""
    stmt = (
        update(Inmobiliaria)
        .where(Inmobiliaria.id == ID_UNICO)
        .values({columna.key: columna + 1})
        .returning(columna)
    )
    numero = db.execute(stmt).scalar_one()
    db.expire(db.get(Inmobiliaria, ID_UNICO), [columna.key])
    return numero


# ---------------------------------------------------------------------------
# Pagos
# ---------------------------------------------------------------------------


def _recalcular_estado(cobro: Cobro) -> None:
    if cobro.estado == EstadoCobro.anulado:
        return
    if cobro.saldo <= 0:
        cobro.estado = EstadoCobro.pagado
    elif cobro.tiene_pagos:
        cobro.estado = EstadoCobro.parcial
    else:
        cobro.estado = EstadoCobro.pendiente


def registrar_pago(
    db: Session, contrato_id: int, cobro_id: int, datos: PagoCrear, user_id: int
) -> Cobro:
    """Pago total o parcial con su recibo. Pago, número y PDF van en una transacción:
    si la subida falla, no queda pago ni se consume el número."""
    inmobiliaria = obtener_inmobiliaria(db)  # crea la fila si falta; commitea antes de empezar
    cobro = obtener_cobro(db, contrato_id, cobro_id)
    if cobro.contrato.estado != EstadoContrato.vigente:
        raise conflicto("El contrato no está vigente")
    if cobro.estado in (EstadoCobro.pagado, EstadoCobro.anulado):
        raise conflicto("El cobro ya está pagado o anulado")
    if datos.monto > cobro.saldo:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El monto supera el saldo del período",
        )

    punitorio = datos.punitorio
    if punitorio is None:
        punitorio = calcular_punitorio(cobro, datos.fecha_pago, inmobiliaria).monto

    pago = Pago(
        fecha_pago=datos.fecha_pago,
        monto=datos.monto,
        punitorio=punitorio,
        medio=datos.medio,
        referencia=datos.referencia,
        notas=datos.notas,
        registrado_por_user_id=user_id,
        recibo_numero=siguiente_numero(db, Inmobiliaria.ultimo_recibo),
    )
    cobro.pagos.append(pago)
    _recalcular_estado(cobro)
    db.flush()

    usuario = db.get(User, user_id)
    try:
        contenido = recibos.generar_recibo_pdf(pago, inmobiliaria, usuario.name if usuario else "")
        guardado = guardar_archivo(contenido, f"recibos/{contrato_id}/{pago.recibo_numero}.pdf")
    except Exception as exc:  # noqa: BLE001 — cualquier falla deshace el pago entero
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo generar el recibo; el pago no se registró",
        ) from exc
    pago.recibo_pdf_url = guardado.url
    pago.recibo_pdf_key = guardado.clave
    db.commit()
    db.refresh(cobro)
    return cobro


def anular_pago(db: Session, contrato_id: int, cobro_id: int, pago_id: int, datos: AnularIn) -> Cobro:
    cobro = obtener_cobro(db, contrato_id, cobro_id)
    pago = next((p for p in cobro.pagos if p.id == pago_id), None)
    if pago is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pago no encontrado")
    if pago.anulado:
        raise conflicto("El pago ya está anulado")
    if pago.liquidacion_id is not None:
        raise conflicto(
            f"El pago está en la liquidación N° {pago.liquidacion.numero_formateado}"
        )
    pago.anulado_at = datetime.now(UTC)
    pago.motivo_anulacion = datos.motivo
    _recalcular_estado(cobro)
    db.commit()
    db.refresh(cobro)
    return cobro
```

- [ ] **Step 5: Schemas** — en `schemas.py`, después de `OmitirAjusteIn`:

```python
# ---------------------------------------------------------------------------
# Cobros y pagos
# ---------------------------------------------------------------------------


class PagoCrear(BaseModel):
    fecha_pago: date
    monto: Decimal = Field(gt=0, decimal_places=2)
    # Ausente → se usa el sugerido por el backend; 0 → sin punitorio.
    punitorio: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    medio: MedioPago
    referencia: str | None = Field(default=None, max_length=100)
    notas: str | None = None

    @model_validator(mode="after")
    def _no_futura(self) -> PagoCrear:
        if self.fecha_pago > date.today():
            raise ValueError("La fecha de pago no puede ser futura")
        return self


class AnularIn(BaseModel):
    motivo: str = Field(min_length=1)


class CobroActualizar(BaseModel):
    monto: Decimal | None = Field(default=None, gt=0, decimal_places=2)
    fecha_vencimiento: date | None = None
    notas: str | None = None


class PunitorioSugerido(BaseModel):
    monto: Decimal
    dias_atraso: int
    pct: Decimal


class UsuarioRef(BaseModel):
    id: int
    name: str

    model_config = ConfigDict(from_attributes=True)


class PagoOut(BaseModel):
    id: int
    fecha_pago: date
    monto: Decimal
    punitorio: Decimal
    total: Decimal
    medio: MedioPago
    referencia: str | None
    recibo_numero: int
    recibo_numero_formateado: str
    recibo_pdf_url: str | None
    enviado_email_at: datetime | None
    anulado_at: datetime | None
    motivo_anulacion: str | None
    liquidacion_id: int | None
    notas: str | None
    registrado_por: UsuarioRef | None
    whatsapp_url: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CobroDetalle(BaseModel):
    id: int
    contrato_id: int
    periodo: date
    fecha_vencimiento: date
    monto: Decimal
    estado: EstadoCobro
    pagado: Decimal
    saldo: Decimal
    dias_atraso: int
    vencido: bool
    notas: str | None
    pagos: list[PagoOut]

    model_config = ConfigDict(from_attributes=True)
```

Importar `EstadoCobro, MedioPago` desde `models`. `ContratoDetalle` suma `cobros: list[CobroDetalle]`.

- [ ] **Step 6: Router** — en `router.py`, imports de `cobros` y schemas nuevos, y endpoints (antes de la sección PDF):

```python
# --- Cobros y pagos ---

_COBRO = "/contratos/{contrato_id}/cobros/{cobro_id}"


@router.get(_COBRO, response_model=CobroDetalle, dependencies=SOLO_STAFF)
def obtener_cobro(contrato_id: int, cobro_id: int, db: Session = Depends(get_db)) -> CobroDetalle:
    return CobroDetalle.model_validate(cobros.obtener_cobro(db, contrato_id, cobro_id))


@router.patch(_COBRO, response_model=CobroDetalle, dependencies=SOLO_STAFF)
def actualizar_cobro(
    contrato_id: int, cobro_id: int, datos: CobroActualizar, db: Session = Depends(get_db)
) -> CobroDetalle:
    return CobroDetalle.model_validate(cobros.actualizar_cobro(db, contrato_id, cobro_id, datos))


@router.post(f"{_COBRO}/anular", response_model=CobroDetalle, dependencies=SOLO_STAFF)
def anular_cobro(
    contrato_id: int, cobro_id: int, datos: AnularIn, db: Session = Depends(get_db)
) -> CobroDetalle:
    return CobroDetalle.model_validate(cobros.anular_cobro(db, contrato_id, cobro_id, datos))


@router.get(f"{_COBRO}/punitorio", response_model=PunitorioSugerido, dependencies=SOLO_STAFF)
def punitorio_sugerido(
    contrato_id: int, cobro_id: int, fecha_pago: date = Query(...), db: Session = Depends(get_db)
) -> PunitorioSugerido:
    cobro = cobros.obtener_cobro(db, contrato_id, cobro_id)
    return cobros.calcular_punitorio(cobro, fecha_pago, inmobiliaria_service.obtener(db))


@router.post(
    f"{_COBRO}/pagos",
    response_model=CobroDetalle,
    status_code=status.HTTP_201_CREATED,
    dependencies=SOLO_STAFF,
)
def registrar_pago(
    contrato_id: int,
    cobro_id: int,
    datos: PagoCrear,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_current_user),
) -> CobroDetalle:
    return CobroDetalle.model_validate(
        cobros.registrar_pago(db, contrato_id, cobro_id, datos, user_id=usuario.id)
    )


@router.post(f"{_COBRO}/pagos/{{pago_id}}/anular", response_model=CobroDetalle, dependencies=SOLO_STAFF)
def anular_pago(
    contrato_id: int, cobro_id: int, pago_id: int, datos: AnularIn, db: Session = Depends(get_db)
) -> CobroDetalle:
    return CobroDetalle.model_validate(
        cobros.anular_pago(db, contrato_id, cobro_id, pago_id, datos)
    )
```

Imports: `from datetime import date`, `from app.platform.alquileres import cobros`, `from app.platform.inmobiliaria import service as inmobiliaria_service`, y los schemas `AnularIn, CobroActualizar, CobroDetalle, PagoCrear, PunitorioSugerido`.

- [ ] **Step 7: Correr**

Run: `cd src && python -m pytest tests/test_alquileres_pagos.py tests/ -q && ruff check app tests`
Expected: PASS. Si `test_si_falla_la_subida_del_pdf_no_queda_pago` falla porque el `TestClient` re-lanza la excepción, verificar que `registrar_pago` convierte a `HTTPException(500)` antes de salir.

---

## Task 6: Gastos del contrato

**Files:**
- Create: `src/app/platform/alquileres/gastos.py`
- Modify: `src/app/platform/alquileres/schemas.py` (`GastoCrear`, `GastoActualizar`, `GastoOut`; `ContratoDetalle.gastos`)
- Modify: `src/app/platform/alquileres/router.py`
- Create: `src/tests/test_alquileres_gastos.py`

**Interfaces:**
- Produces: `gastos.listar(db, contrato_id) -> list[Gasto]`; `gastos.crear(db, contrato_id, datos, user_id) -> Gasto`; `gastos.actualizar(db, contrato_id, gasto_id, datos) -> Gasto`; `gastos.borrar(db, contrato_id, gasto_id) -> None`; `gastos.subir_comprobante(db, contrato_id, gasto_id, archivo: UploadFile) -> Gasto`; `gastos.quitar_comprobante(db, contrato_id, gasto_id) -> Gasto`.
- Endpoints: `GET/POST /contratos/{id}/gastos`, `PATCH/DELETE .../gastos/{gasto_id}`, `PUT/DELETE .../gastos/{gasto_id}/comprobante`.

- [ ] **Step 1: Tests** — `src/tests/test_alquileres_gastos.py`:

```python
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
    r = client.post(_base(contrato), json={"fecha": "2026-03-05", "tipo": "expensas", "concepto": "Expensas marzo", "monto": "25000"})
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
    gasto_id = client.post(_base(contrato), json={"fecha": "2026-03-05", "tipo": "reparacion", "concepto": "Plomero", "monto": "1"}).json()["id"]
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
    gasto_id = client.post(_base(contrato), json={"fecha": "2026-03-05", "tipo": "otro", "concepto": "x", "monto": "1"}).json()["id"]
    url = f"{_base(contrato)}/{gasto_id}/comprobante"
    assert client.put(url, files={"archivo": ("a.txt", b"hola", "text/plain")}).status_code == 422
    grande = b"%PDF" + b"0" * (10 * 1024 * 1024 + 1)
    assert client.put(url, files={"archivo": ("a.pdf", grande, "application/pdf")}).status_code == 413


def test_gasto_liquidado_no_se_edita_ni_borra(client, db, sesion):
    contrato = crear_contrato_de_prueba(db, sesion.id)
    gasto_id = client.post(_base(contrato), json={"fecha": "2026-03-05", "tipo": "otro", "concepto": "x", "monto": "1"}).json()["id"]
    liq = Liquidacion(
        contrato_id=contrato.id, periodo=date(2026, 3, 1), numero=1, total_cobrado=0, total_punitorios=0,
        honorarios_pct=0, honorarios_monto=0, total_gastos=1, total_a_transferir=-1, created_by_user_id=sesion.id,
    )
    db.add(liq)
    db.flush()
    db.get(Gasto, gasto_id).liquidacion_id = liq.id
    db.commit()

    assert client.patch(f"{_base(contrato)}/{gasto_id}", json={"monto": "2"}).status_code == 409
    assert client.delete(f"{_base(contrato)}/{gasto_id}").status_code == 409
    r = client.put(f"{_base(contrato)}/{gasto_id}/comprobante", files={"archivo": ("a.pdf", b"%PDF-1.4", "application/pdf")})
    assert r.status_code == 409
```

- [ ] **Step 2: Ver fallar**

Run: `cd src && python -m pytest tests/test_alquileres_gastos.py -q`
Expected: FAIL (404 en los endpoints / ImportError).

- [ ] **Step 3: `gastos.py`**

```python
"""Gastos por contrato (expensas, reparaciones, impuestos) que la liquidación
le descuenta al propietario. Editables hasta que entran en una liquidación."""

from __future__ import annotations

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.platform.alquileres.cobros import conflicto
from app.platform.alquileres.models import Gasto
from app.platform.alquileres.schemas import GastoActualizar, GastoCrear
from app.platform.alquileres.service import obtener_contrato
from app.storage import borrar_imagen, guardar_archivo

MAX_BYTES_COMPROBANTE = 10 * 1024 * 1024
# Extensión por tipo declarado. HEIC entra porque las fotos de iPhone llegan así.
EXTENSIONES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/heic": ".heic",
    "image/heif": ".heif",
}


def obtener_gasto(db: Session, contrato_id: int, gasto_id: int) -> Gasto:
    gasto = db.get(Gasto, gasto_id)
    if gasto is None or gasto.contrato_id != contrato_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gasto no encontrado")
    return gasto


def _editable_o_409(gasto: Gasto) -> None:
    if gasto.liquidacion_id is not None:
        raise conflicto(f"El gasto ya fue liquidado en la N° {gasto.liquidacion.numero_formateado}")


def listar(db: Session, contrato_id: int) -> list[Gasto]:
    return obtener_contrato(db, contrato_id).gastos


def crear(db: Session, contrato_id: int, datos: GastoCrear, user_id: int) -> Gasto:
    """Sin restricción por estado del contrato: la última expensa puede llegar
    después de finalizado."""
    contrato = obtener_contrato(db, contrato_id)
    gasto = Gasto(**datos.model_dump(), created_by_user_id=user_id)
    contrato.gastos.append(gasto)
    db.commit()
    db.refresh(gasto)
    return gasto


def actualizar(db: Session, contrato_id: int, gasto_id: int, datos: GastoActualizar) -> Gasto:
    gasto = obtener_gasto(db, contrato_id, gasto_id)
    _editable_o_409(gasto)
    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(gasto, campo, valor)
    db.commit()
    db.refresh(gasto)
    return gasto


def borrar(db: Session, contrato_id: int, gasto_id: int) -> None:
    gasto = obtener_gasto(db, contrato_id, gasto_id)
    _editable_o_409(gasto)
    if gasto.comprobante_key:
        borrar_imagen(gasto.comprobante_url, gasto.comprobante_key)
    db.delete(gasto)
    db.commit()


def subir_comprobante(db: Session, contrato_id: int, gasto_id: int, archivo: UploadFile) -> Gasto:
    gasto = obtener_gasto(db, contrato_id, gasto_id)
    _editable_o_409(gasto)
    extension = EXTENSIONES.get(archivo.content_type or "")
    if extension is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El comprobante debe ser PDF o imagen (JPG, PNG, HEIC)",
        )
    contenido = archivo.file.read()
    if len(contenido) > MAX_BYTES_COMPROBANTE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="El comprobante supera los 10 MB",
        )
    guardado = guardar_archivo(contenido, f"gastos/{contrato_id}/{gasto_id}{extension}")
    if gasto.comprobante_key and gasto.comprobante_key != guardado.clave:
        borrar_imagen(gasto.comprobante_url, gasto.comprobante_key)
    gasto.comprobante_url = guardado.url
    gasto.comprobante_key = guardado.clave
    db.commit()
    db.refresh(gasto)
    return gasto


def quitar_comprobante(db: Session, contrato_id: int, gasto_id: int) -> Gasto:
    gasto = obtener_gasto(db, contrato_id, gasto_id)
    _editable_o_409(gasto)
    if gasto.comprobante_key:
        borrar_imagen(gasto.comprobante_url, gasto.comprobante_key)
    gasto.comprobante_url = None
    gasto.comprobante_key = None
    db.commit()
    db.refresh(gasto)
    return gasto
```

- [ ] **Step 4: Schemas** — en `schemas.py`, después de `CobroDetalle`:

```python
# ---------------------------------------------------------------------------
# Gastos
# ---------------------------------------------------------------------------


class GastoCrear(BaseModel):
    fecha: date
    tipo: TipoGasto
    concepto: str = Field(min_length=1, max_length=150)
    monto: Decimal = Field(gt=0, decimal_places=2)


class GastoActualizar(BaseModel):
    fecha: date | None = None
    tipo: TipoGasto | None = None
    concepto: str | None = Field(default=None, min_length=1, max_length=150)
    monto: Decimal | None = Field(default=None, gt=0, decimal_places=2)


class GastoOut(BaseModel):
    id: int
    contrato_id: int
    fecha: date
    tipo: TipoGasto
    concepto: str
    monto: Decimal
    comprobante_url: str | None
    liquidacion_id: int | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
```

Importar `TipoGasto`. `ContratoDetalle` suma `gastos: list[GastoOut]`.

- [ ] **Step 5: Router** — después de los endpoints de cobros:

```python
# --- Gastos ---

_GASTOS = "/contratos/{contrato_id}/gastos"


@router.get(_GASTOS, response_model=list[GastoOut], dependencies=SOLO_STAFF)
def listar_gastos(contrato_id: int, db: Session = Depends(get_db)) -> list[GastoOut]:
    return [GastoOut.model_validate(g) for g in gastos.listar(db, contrato_id)]


@router.post(_GASTOS, response_model=GastoOut, status_code=status.HTTP_201_CREATED, dependencies=SOLO_STAFF)
def crear_gasto(
    contrato_id: int,
    datos: GastoCrear,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_current_user),
) -> GastoOut:
    return GastoOut.model_validate(gastos.crear(db, contrato_id, datos, user_id=usuario.id))


@router.patch(f"{_GASTOS}/{{gasto_id}}", response_model=GastoOut, dependencies=SOLO_STAFF)
def actualizar_gasto(
    contrato_id: int, gasto_id: int, datos: GastoActualizar, db: Session = Depends(get_db)
) -> GastoOut:
    return GastoOut.model_validate(gastos.actualizar(db, contrato_id, gasto_id, datos))


@router.delete(f"{_GASTOS}/{{gasto_id}}", status_code=status.HTTP_204_NO_CONTENT, dependencies=SOLO_STAFF)
def borrar_gasto(contrato_id: int, gasto_id: int, db: Session = Depends(get_db)) -> None:
    gastos.borrar(db, contrato_id, gasto_id)


@router.put(f"{_GASTOS}/{{gasto_id}}/comprobante", response_model=GastoOut, dependencies=SOLO_STAFF)
def subir_comprobante(
    contrato_id: int, gasto_id: int, archivo: UploadFile = File(...), db: Session = Depends(get_db)
) -> GastoOut:
    return GastoOut.model_validate(gastos.subir_comprobante(db, contrato_id, gasto_id, archivo))


@router.delete(f"{_GASTOS}/{{gasto_id}}/comprobante", response_model=GastoOut, dependencies=SOLO_STAFF)
def quitar_comprobante(contrato_id: int, gasto_id: int, db: Session = Depends(get_db)) -> GastoOut:
    return GastoOut.model_validate(gastos.quitar_comprobante(db, contrato_id, gasto_id))
```

Import `from app.platform.alquileres import gastos` y los schemas `GastoActualizar, GastoCrear, GastoOut`.

- [ ] **Step 6: Correr**

Run: `cd src && python -m pytest tests/test_alquileres_gastos.py tests/ -q && ruff check app tests`
Expected: PASS.

---

## Task 7: Liquidaciones

**Files:**
- Create: `src/app/platform/alquileres/liquidaciones.py`
- Modify: `src/app/platform/alquileres/schemas.py` (`LiquidacionEmitir`, `PagarLiquidacionIn`, `LiquidacionPreview`, `LiquidacionEnLista`, `LiquidacionDetalle`; `ContratoDetalle.liquidaciones`)
- Modify: `src/app/platform/alquileres/recibos.py` (textos y PDF de la liquidación, `whatsapp_url_liquidacion`)
- Modify: `src/app/platform/alquileres/router.py`
- Create: `src/tests/test_alquileres_liquidaciones.py`

**Interfaces:**
- Produces: `liquidaciones.calcular(db, contrato, periodo: date) -> LiquidacionPreview`; `liquidaciones.emitir(db, contrato_id, datos, user_id) -> Liquidacion`; `liquidaciones.pagar(db, contrato_id, liq_id, datos) -> Liquidacion`; `liquidaciones.obtener(db, contrato_id, liq_id) -> Liquidacion`; `liquidaciones.listar_de_contrato(db, contrato_id) -> list[Liquidacion]`; `liquidaciones.periodo_desde(texto: str) -> date` (`"2026-10"` → `date(2026,10,1)`); `recibos.asunto_liquidacion(liq)`, `recibos.texto_liquidacion(liq, inmobiliaria=None, para_whatsapp=False)`, `recibos.generar_liquidacion_pdf(liq, inmobiliaria) -> bytes`, `recibos.whatsapp_url_liquidacion(liq)`.
- Endpoints: `GET /contratos/{id}/liquidaciones`, `GET .../preview?periodo=YYYY-MM`, `POST .../liquidaciones`, `POST .../{liq_id}/pagar`.

- [ ] **Step 1: Tests** — `src/tests/test_alquileres_liquidaciones.py`:

```python
"""Liquidación mensual al propietario: preview, emisión con snapshot, pago."""

from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.platform.alquileres.models import Gasto, Liquidacion, Pago
from app.platform.inmobiliaria.service import obtener as obtener_inmobiliaria
from tests.helpers_crm import crear_contrato_de_prueba

HOY = date.today()
MES_PASADO = (HOY.replace(day=1) - timedelta(days=1)).replace(day=1)
PERIODO = MES_PASADO.strftime("%Y-%m")


@pytest.fixture
def sesion(client, crear_usuario, iniciar_sesion, media_tmp):
    usuario = crear_usuario()
    iniciar_sesion()
    return usuario


@pytest.fixture
def contrato(db, sesion, client):
    """Contrato con dos pagos el mes pasado (uno con punitorio), un pago este mes y
    dos gastos (uno atrasado). honorarios 10 %."""
    inicio = (MES_PASADO - timedelta(days=200)).replace(day=1)
    c = crear_contrato_de_prueba(db, sesion.id, fecha_inicio=inicio, fecha_fin=inicio + timedelta(days=700))
    url = f"/api/v1/alquileres/contratos/{c.id}/cobros"
    cobros = {x.periodo: x for x in c.cobros}
    c1, c2, c3 = cobros[MES_PASADO - timedelta(days=60)], cobros[MES_PASADO - timedelta(days=30)], cobros[MES_PASADO]
    c1_id, c2_id, c3_id = c1.id, c2.id, c3.id
    client.post(f"{url}/{c1_id}/pagos", json={"fecha_pago": str(MES_PASADO + timedelta(days=3)), "monto": "100000", "punitorio": "1500", "medio": "efectivo"})
    client.post(f"{url}/{c2_id}/pagos", json={"fecha_pago": str(MES_PASADO + timedelta(days=10)), "monto": "100000", "punitorio": "0", "medio": "transferencia"})
    client.post(f"{url}/{c3_id}/pagos", json={"fecha_pago": str(HOY), "monto": "100000", "punitorio": "0", "medio": "efectivo"})
    gastos_url = f"/api/v1/alquileres/contratos/{c.id}/gastos"
    client.post(gastos_url, json={"fecha": str(MES_PASADO - timedelta(days=40)), "tipo": "expensas", "concepto": "Expensas atrasadas", "monto": "20000"})
    client.post(gastos_url, json={"fecha": str(MES_PASADO + timedelta(days=5)), "tipo": "reparacion", "concepto": "Plomero", "monto": "5000"})
    client.post(gastos_url, json={"fecha": str(HOY), "tipo": "otro", "concepto": "Este mes", "monto": "1"})
    db.expire_all()
    return db.get(type(c), c.id)


def _base(contrato) -> str:
    return f"/api/v1/alquileres/contratos/{contrato.id}/liquidaciones"


def test_preview_solo_incluye_lo_del_mes_y_los_gastos_atrasados(client, contrato):
    r = client.get(f"{_base(contrato)}/preview", params={"periodo": PERIODO})
    assert r.status_code == 200, r.text
    p = r.json()
    assert len(p["pagos"]) == 2
    assert len(p["gastos"]) == 2
    assert Decimal(p["total_cobrado"]) == Decimal("200000")
    assert Decimal(p["total_punitorios"]) == Decimal("1500")
    assert Decimal(p["honorarios_monto"]) == Decimal("20000")
    assert Decimal(p["total_gastos"]) == Decimal("25000")
    assert Decimal(p["total_a_transferir"]) == Decimal("156500")


def test_emitir_marca_pagos_y_gastos_y_genera_pdf(client, db, contrato, media_tmp):
    r = client.post(_base(contrato), json={"periodo": PERIODO, "notas": "Transferir al Galicia"})
    assert r.status_code == 201, r.text
    liq = r.json()
    assert liq["numero"] == 1
    assert liq["numero_formateado"] == "0001-00000001"
    assert liq["estado"] == "emitida"
    assert Decimal(liq["total_a_transferir"]) == Decimal("156500")
    assert (media_tmp / f"liquidaciones/{contrato.id}/1.pdf").read_bytes().startswith(b"%PDF")

    db.expire_all()
    pagos = db.query(Pago).filter(Pago.liquidacion_id == liq["id"]).count()
    gastos = db.query(Gasto).filter(Gasto.liquidacion_id == liq["id"]).count()
    assert (pagos, gastos) == (2, 2)

    # Los pagos ya liquidados no vuelven a entrar en el mes siguiente.
    r = client.get(f"{_base(contrato)}/preview", params={"periodo": HOY.strftime("%Y-%m")})
    assert len(r.json()["pagos"]) == 1
    assert len(r.json()["gastos"]) == 1


def test_periodo_duplicado_y_vacio_409(client, db, sesion, contrato):
    assert client.post(_base(contrato), json={"periodo": PERIODO}).status_code == 201
    assert client.post(_base(contrato), json={"periodo": PERIODO}).status_code == 409
    vacio = crear_contrato_de_prueba(db, sesion.id, titulo="Otro")
    assert client.post(_base(vacio), json={"periodo": PERIODO}).status_code == 409


def test_total_negativo_se_emite(client, db, sesion):
    c = crear_contrato_de_prueba(db, sesion.id, fecha_inicio=MES_PASADO - timedelta(days=100), fecha_fin=HOY + timedelta(days=300))
    client.post(f"/api/v1/alquileres/contratos/{c.id}/gastos", json={"fecha": str(MES_PASADO), "tipo": "reparacion", "concepto": "Techo", "monto": "300000"})
    r = client.post(_base(c), json={"periodo": PERIODO})
    assert r.status_code == 201, r.text
    assert Decimal(r.json()["total_a_transferir"]) == Decimal("-300000")


def test_honorarios_son_snapshot(client, db, contrato):
    liq_id = client.post(_base(contrato), json={"periodo": PERIODO}).json()["id"]
    contrato.honorarios_pct = Decimal("50")
    db.commit()
    liq = db.get(Liquidacion, liq_id)
    assert liq.honorarios_pct == Decimal("10")
    assert liq.honorarios_monto == Decimal("20000")


def test_pagar_y_pagar_de_nuevo_409(client, contrato):
    liq_id = client.post(_base(contrato), json={"periodo": PERIODO}).json()["id"]
    r = client.post(f"{_base(contrato)}/{liq_id}/pagar", json={"fecha_pago": str(HOY)})
    assert r.status_code == 200, r.text
    assert r.json()["estado"] == "pagada"
    assert client.post(f"{_base(contrato)}/{liq_id}/pagar", json={"fecha_pago": str(HOY)}).status_code == 409


def test_numeracion_propia_y_listado(client, db, sesion, contrato):
    client.post(_base(contrato), json={"periodo": PERIODO})
    assert obtener_inmobiliaria(db).ultima_liquidacion == 1
    assert obtener_inmobiliaria(db).ultimo_recibo == 3
    r = client.get(_base(contrato))
    assert [x["numero"] for x in r.json()] == [1]
```

- [ ] **Step 2: Ver fallar**

Run: `cd src && python -m pytest tests/test_alquileres_liquidaciones.py -q`
Expected: FAIL (404 / ImportError).

- [ ] **Step 3: `liquidaciones.py`**

```python
"""Liquidación mensual al propietario: lo cobrado en el mes (por fecha de pago)
menos honorarios y gastos. Los totales se guardan como snapshot: el PDF y el
número no cambian aunque después se toque un gasto."""

from __future__ import annotations

from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from dateutil.relativedelta import relativedelta
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.platform.alquileres import recibos
from app.platform.alquileres.cobros import conflicto, siguiente_numero
from app.platform.alquileres.models import (
    Contrato,
    EstadoLiquidacion,
    Gasto,
    Liquidacion,
    Pago,
)
from app.platform.alquileres.schemas import (
    GastoOut,
    LiquidacionEmitir,
    LiquidacionPreview,
    PagarLiquidacionIn,
    PagoOut,
)
from app.platform.alquileres.service import obtener_contrato
from app.platform.inmobiliaria.models import Inmobiliaria
from app.platform.inmobiliaria.service import obtener as obtener_inmobiliaria
from app.storage import guardar_archivo


def periodo_desde(texto: str) -> date:
    """`"2026-10"` → `date(2026, 10, 1)`. 422 si no tiene esa forma."""
    try:
        anio, mes = texto.split("-")
        return date(int(anio), int(mes), 1)
    except (ValueError, AttributeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="periodo debe ser YYYY-MM"
        ) from exc


def _redondear(valor: Decimal) -> Decimal:
    return valor.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _pendientes(contrato: Contrato, periodo: date) -> tuple[list[Pago], list[Gasto]]:
    """Pagos del mes no anulados y sin liquidar; gastos sin liquidar hasta fin de mes."""
    fin = periodo + relativedelta(months=1)
    pagos = [
        p
        for c in contrato.cobros
        for p in c.pagos
        if not p.anulado and p.liquidacion_id is None and periodo <= p.fecha_pago < fin
    ]
    gastos = [g for g in contrato.gastos if g.liquidacion_id is None and g.fecha < fin]
    return pagos, gastos


def calcular(db: Session, contrato: Contrato, periodo: date) -> LiquidacionPreview:
    pagos, gastos = _pendientes(contrato, periodo)
    total_cobrado = sum((p.monto for p in pagos), Decimal("0"))
    total_punitorios = sum((p.punitorio for p in pagos), Decimal("0"))
    honorarios_pct = contrato.honorarios_pct or Decimal("0")
    honorarios_monto = _redondear(total_cobrado * honorarios_pct / Decimal(100))
    total_gastos = sum((g.monto for g in gastos), Decimal("0"))
    return LiquidacionPreview(
        periodo=periodo,
        pagos=[PagoOut.model_validate(p) for p in pagos],
        gastos=[GastoOut.model_validate(g) for g in gastos],
        total_cobrado=total_cobrado,
        total_punitorios=total_punitorios,
        honorarios_pct=honorarios_pct,
        honorarios_monto=honorarios_monto,
        total_gastos=total_gastos,
        # Los punitorios van íntegros al propietario (línea aparte en el PDF).
        total_a_transferir=total_cobrado + total_punitorios - honorarios_monto - total_gastos,
    )


def obtener(db: Session, contrato_id: int, liq_id: int) -> Liquidacion:
    liq = db.get(Liquidacion, liq_id)
    if liq is None or liq.contrato_id != contrato_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Liquidación no encontrada")
    return liq


def listar_de_contrato(db: Session, contrato_id: int) -> list[Liquidacion]:
    return obtener_contrato(db, contrato_id).liquidaciones


def emitir(db: Session, contrato_id: int, datos: LiquidacionEmitir, user_id: int) -> Liquidacion:
    inmobiliaria = obtener_inmobiliaria(db)
    contrato = obtener_contrato(db, contrato_id)
    periodo = periodo_desde(datos.periodo)
    if any(liq.periodo == periodo for liq in contrato.liquidaciones):
        raise conflicto("Ya existe una liquidación para ese período")
    pagos, gastos = _pendientes(contrato, periodo)
    if not pagos and not gastos:
        raise conflicto("No hay nada que liquidar en ese período")

    preview = calcular(db, contrato, periodo)
    liq = Liquidacion(
        contrato_id=contrato.id,
        periodo=periodo,
        numero=siguiente_numero(db, Inmobiliaria.ultima_liquidacion),
        total_cobrado=preview.total_cobrado,
        total_punitorios=preview.total_punitorios,
        honorarios_pct=preview.honorarios_pct,
        honorarios_monto=preview.honorarios_monto,
        total_gastos=preview.total_gastos,
        total_a_transferir=preview.total_a_transferir,
        notas=datos.notas,
        created_by_user_id=user_id,
    )
    db.add(liq)
    db.flush()
    for pago in pagos:
        pago.liquidacion_id = liq.id
    for gasto in gastos:
        gasto.liquidacion_id = liq.id
    db.flush()
    db.refresh(liq)

    try:
        contenido = recibos.generar_liquidacion_pdf(liq, inmobiliaria)
        guardado = guardar_archivo(contenido, f"liquidaciones/{contrato_id}/{liq.numero}.pdf")
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo generar el comprobante; la liquidación no se emitió",
        ) from exc
    liq.comprobante_pdf_url = guardado.url
    liq.comprobante_pdf_key = guardado.clave
    db.commit()
    db.refresh(liq)
    return liq


def pagar(db: Session, contrato_id: int, liq_id: int, datos: PagarLiquidacionIn) -> Liquidacion:
    liq = obtener(db, contrato_id, liq_id)
    if liq.estado == EstadoLiquidacion.pagada:
        raise conflicto("La liquidación ya está pagada")
    liq.estado = EstadoLiquidacion.pagada
    liq.fecha_pago = datos.fecha_pago
    db.commit()
    db.refresh(liq)
    return liq
```

- [ ] **Step 4: Recibos — liquidación** — agregar a `recibos.py`:

```python
# ---------------------------------------------------------------------------
# Liquidación
# ---------------------------------------------------------------------------


def asunto_liquidacion(liq: Liquidacion) -> str:
    return f"Liquidación {nombre_periodo(liq.periodo)} · {liq.contrato.propiedad.titulo}"


def texto_liquidacion(
    liq: Liquidacion, inmobiliaria: Inmobiliaria | None = None, para_whatsapp: bool = False
) -> str:
    contrato = liq.contrato
    propietarios = partes_con_rol(contrato, RolParteContrato.propietario)
    lineas = [
        f"Hola {propietarios[0].first_name if propietarios else ''},".replace(" ,", ","),
        f"Te enviamos la liquidación N° {numero_formateado(liq.numero)} de {contrato.propiedad.titulo}, "
        f"período {nombre_periodo(liq.periodo)}. Total a transferir: "
        f"{formato_moneda(liq.total_a_transferir, contrato.moneda)}.",
    ]
    if para_whatsapp:
        lineas.append(f"Comprobante en PDF: {liq.comprobante_pdf_url}")
    else:
        lineas.append("Adjuntamos el comprobante en PDF.")
    if inmobiliaria is not None:
        lineas.append(firma(inmobiliaria))
    return "\n".join(lineas)


def whatsapp_url_liquidacion(liq: Liquidacion) -> str | None:
    propietarios = partes_con_rol(liq.contrato, RolParteContrato.propietario)
    telefono = next((t for p in propietarios if (t := telefono_whatsapp(p))), None)
    if telefono is None:
        return None
    return armar_whatsapp_url(telefono, texto_liquidacion(liq, para_whatsapp=True))


def generar_liquidacion_pdf(liq: Liquidacion, inmobiliaria: Inmobiliaria) -> bytes:
    contrato = liq.contrato
    moneda = contrato.moneda
    m = lambda v: formato_moneda(v, moneda)  # noqa: E731

    doc = DocumentoMambo()
    doc.encabezado(inmobiliaria.nombre, lineas_inmobiliaria(inmobiliaria), cargar_logo(inmobiliaria))
    doc.titulo("LIQUIDACIÓN", numero_formateado(liq.numero), liq.created_at.date())
    doc.parrafo(f"Propietario: {nombres(partes_con_rol(contrato, RolParteContrato.propietario))}")
    doc.parrafo(f"Propiedad: {_propiedad_texto(contrato)}")
    doc.parrafo(f"Período: {nombre_periodo(liq.periodo)}")

    doc.tabla(
        ["Fecha", "Recibo", "Período", "Alquiler", "Punitorio"],
        [
            [
                p.fecha_pago.strftime("%d/%m/%Y"),
                numero_formateado(p.recibo_numero),
                nombre_periodo(p.cobro.periodo),
                m(p.monto),
                m(p.punitorio),
            ]
            for p in liq.pagos
        ],
        derecha=(3, 4),
    )
    doc.total("Cobrado", m(liq.total_cobrado + liq.total_punitorios), destacado=False)
    doc.total(f"Honorarios de administración {liq.honorarios_pct} %", m(-liq.honorarios_monto), destacado=False)

    if liq.gastos:
        tipos = {"expensas": "Expensas", "reparacion": "Reparación", "impuesto": "Impuesto", "otro": "Otro"}
        doc.tabla(
            ["Fecha", "Tipo", "Concepto", "Monto"],
            [[g.fecha.strftime("%d/%m/%Y"), tipos[g.tipo], g.concepto, m(g.monto)] for g in liq.gastos],
            derecha=(3,),
        )
        doc.total("Gastos", m(-liq.total_gastos), destacado=False)

    if liq.total_a_transferir >= 0:
        doc.total("Total a transferir", m(liq.total_a_transferir))
    else:
        doc.total("Saldo a favor de la inmobiliaria", m(-liq.total_a_transferir))
    if liq.notas:
        doc.parrafo(liq.notas)
    doc.pie()
    return doc.bytes()
```

Agregar `Liquidacion` al import de `models` en `recibos.py`.

- [ ] **Step 5: Schemas** — después de `GastoOut`:

```python
# ---------------------------------------------------------------------------
# Liquidaciones
# ---------------------------------------------------------------------------


class LiquidacionEmitir(BaseModel):
    periodo: str = Field(pattern=r"^\d{4}-\d{2}$")
    notas: str | None = None


class PagarLiquidacionIn(BaseModel):
    fecha_pago: date


class LiquidacionPreview(BaseModel):
    periodo: date
    pagos: list[PagoOut]
    gastos: list[GastoOut]
    total_cobrado: Decimal
    total_punitorios: Decimal
    honorarios_pct: Decimal
    honorarios_monto: Decimal
    total_gastos: Decimal
    total_a_transferir: Decimal


class LiquidacionEnLista(BaseModel):
    id: int
    contrato_id: int
    periodo: date
    numero: int
    numero_formateado: str
    total_cobrado: Decimal
    total_punitorios: Decimal
    honorarios_pct: Decimal
    honorarios_monto: Decimal
    total_gastos: Decimal
    total_a_transferir: Decimal
    estado: EstadoLiquidacion
    fecha_pago: date | None
    comprobante_pdf_url: str | None
    enviado_email_at: datetime | None
    notas: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LiquidacionDetalle(LiquidacionEnLista):
    pagos: list[PagoOut]
    gastos: list[GastoOut]
    whatsapp_url: str | None
```

Importar `EstadoLiquidacion`. `ContratoDetalle` suma `liquidaciones: list[LiquidacionEnLista]`.

- [ ] **Step 6: Router** — después de gastos:

```python
# --- Liquidaciones ---

_LIQ = "/contratos/{contrato_id}/liquidaciones"


@router.get(_LIQ, response_model=list[LiquidacionDetalle], dependencies=SOLO_STAFF)
def listar_liquidaciones_del_contrato(contrato_id: int, db: Session = Depends(get_db)):
    return [LiquidacionDetalle.model_validate(x) for x in liquidaciones.listar_de_contrato(db, contrato_id)]


@router.get(f"{_LIQ}/preview", response_model=LiquidacionPreview, dependencies=SOLO_STAFF)
def preview_liquidacion(
    contrato_id: int, periodo: str = Query(...), db: Session = Depends(get_db)
) -> LiquidacionPreview:
    contrato = service.obtener_contrato(db, contrato_id)
    return liquidaciones.calcular(db, contrato, liquidaciones.periodo_desde(periodo))


@router.post(_LIQ, response_model=LiquidacionDetalle, status_code=status.HTTP_201_CREATED, dependencies=SOLO_STAFF)
def emitir_liquidacion(
    contrato_id: int,
    datos: LiquidacionEmitir,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_current_user),
) -> LiquidacionDetalle:
    return LiquidacionDetalle.model_validate(
        liquidaciones.emitir(db, contrato_id, datos, user_id=usuario.id)
    )


@router.post(f"{_LIQ}/{{liq_id}}/pagar", response_model=LiquidacionDetalle, dependencies=SOLO_STAFF)
def pagar_liquidacion(
    contrato_id: int, liq_id: int, datos: PagarLiquidacionIn, db: Session = Depends(get_db)
) -> LiquidacionDetalle:
    return LiquidacionDetalle.model_validate(liquidaciones.pagar(db, contrato_id, liq_id, datos))
```

> `/preview` va **antes** que `/{liq_id}/pagar` en el archivo, pero como `preview` no es un entero no hay ambigüedad de ruta.

- [ ] **Step 7: Correr**

Run: `cd src && python -m pytest tests/test_alquileres_liquidaciones.py tests/ -q && ruff check app tests`
Expected: PASS.

---

## Task 8: Envío de recibos y liquidaciones por email

**Files:**
- Modify: `src/app/platform/alquileres/recibos.py` (`email_de_parte`)
- Modify: `src/app/platform/alquileres/cobros.py` (`_pago_de`, `email_configurado_o_409`, `enviar_recibo`)
- Modify: `src/app/platform/alquileres/liquidaciones.py` (`enviar`)
- Modify: `src/app/platform/alquileres/schemas.py` (`EnviarIn`)
- Modify: `src/app/platform/alquileres/router.py` (dos endpoints `/enviar`)
- Create: `src/tests/test_alquileres_envio.py`

**Interfaces:**
- Consumes: `recibos.enviar_y_marcar` (Task 5), `recibos.asunto_recibo/texto_recibo/asunto_liquidacion/texto_liquidacion`, `Settings.email_configurado`, fixtures `smtp_configurado` y `emails_enviados` (Task 3).
- Produces: `recibos.email_de_parte(contrato, rol) -> str | None`; `cobros.email_configurado_o_409() -> None`; `cobros.enviar_recibo(db, contrato_id, cobro_id, pago_id, email: str | None, background: BackgroundTasks) -> Pago`; `liquidaciones.enviar(db, contrato_id, liq_id, email, background) -> Liquidacion`; schema `EnviarIn`.
- Endpoints: `POST /contratos/{id}/cobros/{cobro_id}/pagos/{pago_id}/enviar` → `PagoOut` 202; `POST /contratos/{id}/liquidaciones/{liq_id}/enviar` → `LiquidacionDetalle` 202.

> El envío corre en un `BackgroundTasks` de FastAPI **después** de la respuesta: SMTP puede tardar segundos y el panel no tiene por qué esperar. Por eso la respuesta es 202 y trae `enviado_email_at` todavía en null; se marca cuando el email sale. El `TestClient` ejecuta los background tasks antes de devolver la respuesta, así que los tests pueden afirmar sobre la marca en el mismo flujo.

- [ ] **Step 1: Tests** — `src/tests/test_alquileres_envio.py`:

```python
"""Envío de recibos y liquidaciones por email: destinatario, 202 y marca `enviado_email_at`."""

from datetime import date, timedelta

import pytest
from sqlalchemy.orm import sessionmaker

from app.config import get_settings
from app.email import EmailNoEnviado
from app.platform.alquileres import recibos
from app.platform.alquileres.models import Liquidacion, Pago
from app.platform.people.models import PersonContact
from tests.helpers_crm import crear_contrato_de_prueba

HOY = date.today()


@pytest.fixture
def sesion(client, crear_usuario, iniciar_sesion, media_tmp):
    usuario = crear_usuario()
    iniciar_sesion()
    return usuario


@pytest.fixture
def sesion_background(engine, monkeypatch):
    """`enviar_y_marcar` abre su propia sesión con `app.database.SessionLocal`, que
    apunta a la base real. Acá se la redirige al motor de test: con `StaticPool` es
    la misma conexión SQLite que usa el resto del test, así que lo que commitea el
    background task lo ve la sesión `db` después de un `expire_all()`."""
    monkeypatch.setattr(recibos, "SessionLocal", sessionmaker(bind=engine))


@pytest.fixture
def smtp_sin_configurar(monkeypatch):
    """Por si el `.env` de quien corre los tests tiene SMTP cargado."""
    s = get_settings()
    monkeypatch.setattr(s, "smtp_host", None)
    monkeypatch.setattr(s, "email_from", None)


def _persona(contrato, rol: str):
    return next(p for p in contrato.partes if p.rol == rol).person


@pytest.fixture
def pago(db, client, sesion, sesion_background):
    """Contrato con un pago registrado hoy; inquilino y propietario con email primario."""
    inicio = (HOY - timedelta(days=95)).replace(day=1)
    contrato = crear_contrato_de_prueba(
        db, sesion.id, fecha_inicio=inicio, fecha_fin=inicio + timedelta(days=365)
    )
    inquilino, propietario = _persona(contrato, "inquilino"), _persona(contrato, "propietario")
    inquilino.contacts.append(PersonContact(type="email", value="viejo@ejemplo.com"))
    inquilino.contacts.append(PersonContact(type="email", value="ana@ejemplo.com", is_primary=True))
    propietario.contacts.append(PersonContact(type="email", value="juan@ejemplo.com", is_primary=True))
    db.commit()

    cobro = contrato.cobros[0]
    r = client.post(
        f"/api/v1/alquileres/contratos/{contrato.id}/cobros/{cobro.id}/pagos",
        json={"fecha_pago": str(HOY), "monto": "100000", "punitorio": "0", "medio": "transferencia"},
    )
    assert r.status_code == 201, r.text
    return db.get(Pago, r.json()["pagos"][0]["id"])


@pytest.fixture
def liquidacion(client, db, pago):
    contrato_id = pago.cobro.contrato_id
    r = client.post(
        f"/api/v1/alquileres/contratos/{contrato_id}/liquidaciones",
        json={"periodo": HOY.strftime("%Y-%m")},
    )
    assert r.status_code == 201, r.text
    return db.get(Liquidacion, r.json()["id"])


def _url_recibo(pago: Pago) -> str:
    return (
        f"/api/v1/alquileres/contratos/{pago.cobro.contrato_id}/cobros/{pago.cobro_id}"
        f"/pagos/{pago.id}/enviar"
    )


def _url_liquidacion(liq: Liquidacion) -> str:
    return f"/api/v1/alquileres/contratos/{liq.contrato_id}/liquidaciones/{liq.id}/enviar"


# --- Recibo ---


def test_envia_al_email_primario_del_inquilino_y_marca_enviado(
    client, db, pago, smtp_configurado, emails_enviados
):
    r = client.post(_url_recibo(pago), json={})
    assert r.status_code == 202, r.text
    assert r.json()["id"] == pago.id

    assert len(emails_enviados) == 1
    destinatario, asunto, cuerpo, adjuntos = emails_enviados[0]
    assert destinatario == "ana@ejemplo.com"
    assert asunto.startswith("Recibo N° 0001-00000001")
    assert "Adjuntamos el recibo en PDF." in cuerpo
    assert adjuntos[0].nombre == "recibo-0001-00000001.pdf"
    assert adjuntos[0].contenido.startswith(b"%PDF")
    assert adjuntos[0].mime == "application/pdf"

    db.expire_all()
    assert db.get(Pago, pago.id).enviado_email_at is not None


def test_email_explicito_gana_y_se_valida(client, pago, smtp_configurado, emails_enviados):
    r = client.post(_url_recibo(pago), json={"email": "contador@ejemplo.com"})
    assert r.status_code == 202, r.text
    assert emails_enviados[0][0] == "contador@ejemplo.com"
    assert client.post(_url_recibo(pago), json={"email": "no-es-un-email"}).status_code == 422


def test_sin_email_del_inquilino_409(client, db, pago, smtp_configurado, emails_enviados):
    _persona(pago.cobro.contrato, "inquilino").contacts.clear()
    db.commit()
    r = client.post(_url_recibo(pago), json={})
    assert r.status_code == 409
    assert "email" in r.json()["detail"].lower()
    assert emails_enviados == []


def test_smtp_no_configurado_409(client, pago, smtp_sin_configurar, emails_enviados):
    r = client.post(_url_recibo(pago), json={})
    assert r.status_code == 409
    assert r.json()["detail"].startswith("Email no configurado")
    assert emails_enviados == []


def test_pago_anulado_409(client, pago, smtp_configurado, emails_enviados):
    base = _url_recibo(pago).removesuffix("/enviar")
    assert client.post(f"{base}/anular", json={"motivo": "Rebotó"}).status_code == 200
    assert client.post(_url_recibo(pago), json={}).status_code == 409
    assert emails_enviados == []


def test_fallo_de_smtp_no_marca_enviado(client, db, pago, smtp_configurado, monkeypatch, caplog):
    def _explota(*args, **kwargs):
        raise EmailNoEnviado("se cortó")

    monkeypatch.setattr(recibos, "enviar_email", _explota)
    r = client.post(_url_recibo(pago), json={})
    assert r.status_code == 202  # la respuesta sale antes del envío
    db.expire_all()
    assert db.get(Pago, pago.id).enviado_email_at is None
    assert "No se pudo enviar Pago" in caplog.text


# --- Liquidación ---


def test_envia_liquidacion_al_propietario(client, db, liquidacion, smtp_configurado, emails_enviados):
    r = client.post(_url_liquidacion(liquidacion), json={})
    assert r.status_code == 202, r.text
    assert r.json()["numero_formateado"] == "0001-00000001"

    destinatario, asunto, cuerpo, adjuntos = emails_enviados[0]
    assert destinatario == "juan@ejemplo.com"
    assert asunto.startswith("Liquidación ")
    assert "Total a transferir" in cuerpo
    assert adjuntos[0].nombre == "liquidacion-0001-00000001.pdf"
    assert adjuntos[0].contenido.startswith(b"%PDF")

    db.expire_all()
    assert db.get(Liquidacion, liquidacion.id).enviado_email_at is not None


def test_liquidacion_sin_email_del_propietario_409(
    client, db, liquidacion, smtp_configurado, emails_enviados
):
    _persona(liquidacion.contrato, "propietario").contacts.clear()
    db.commit()
    assert client.post(_url_liquidacion(liquidacion), json={}).status_code == 409
    r = client.post(_url_liquidacion(liquidacion), json={"email": "juan@otro.com"})
    assert r.status_code == 202, r.text
    assert emails_enviados[0][0] == "juan@otro.com"
```

- [ ] **Step 2: Ver fallar**

Run: `cd src && python -m pytest tests/test_alquileres_envio.py -q`
Expected: FAIL con 404 en los endpoints `/enviar` (todavía no existen).

- [ ] **Step 3: `recibos.py`** — después de `email_de`:

```python
def email_de_parte(contrato: Contrato, rol: RolParteContrato) -> str | None:
    """Email de la primera persona con ese rol que tenga uno (el primario, si hay)."""
    return next((e for p in partes_con_rol(contrato, rol) if (e := email_de(p))), None)
```

- [ ] **Step 4: `cobros.py`** — imports nuevos:

```python
from fastapi import BackgroundTasks

from app.config import get_settings
from app.platform.alquileres.models import RolParteContrato
```

Reemplazar la búsqueda inline del pago en `anular_pago` (`pago = next((p for p in cobro.pagos if p.id == pago_id), None)` y su 404) por `pago = _pago_de(cobro, pago_id)`, y agregar al final del archivo:

```python
# ---------------------------------------------------------------------------
# Envío del recibo
# ---------------------------------------------------------------------------


def _pago_de(cobro: Cobro, pago_id: int) -> Pago:
    pago = next((p for p in cobro.pagos if p.id == pago_id), None)
    if pago is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pago no encontrado")
    return pago


def email_configurado_o_409() -> None:
    """El panel deshabilita el botón con `inmobiliaria.email_configurado`; esto cubre
    el caso de que lo llamen igual."""
    if not get_settings().email_configurado:
        raise conflicto("Email no configurado: definir SMTP_* en el servidor")


def enviar_recibo(
    db: Session,
    contrato_id: int,
    cobro_id: int,
    pago_id: int,
    email: str | None,
    background: BackgroundTasks,
) -> Pago:
    """Encola el envío del recibo y devuelve el pago sin esperar.

    Las validaciones (409) van acá, en la request; el envío en sí corre en
    `recibos.enviar_y_marcar` después de la respuesta, con su propia sesión.
    Si falla, queda en el log y `enviado_email_at` sigue en null para reintentar.
    """
    email_configurado_o_409()
    cobro = obtener_cobro(db, contrato_id, cobro_id)
    pago = _pago_de(cobro, pago_id)
    if pago.anulado:
        raise conflicto("El pago está anulado")
    if not pago.recibo_pdf_key:
        raise conflicto("El pago no tiene recibo generado")
    destinatario = email or recibos.email_de_parte(cobro.contrato, RolParteContrato.inquilino)
    if not destinatario:
        raise conflicto("El inquilino no tiene email cargado; indicá uno")

    inmobiliaria = obtener_inmobiliaria(db)
    background.add_task(
        recibos.enviar_y_marcar,
        Pago,
        pago.id,
        destinatario,
        recibos.asunto_recibo(pago),
        recibos.texto_recibo(pago, inmobiliaria),
        pago.recibo_pdf_key,
        f"recibo-{pago.recibo_numero_formateado}.pdf",
    )
    return pago
```

- [ ] **Step 5: `liquidaciones.py`** — imports: `from fastapi import BackgroundTasks`, sumar `email_configurado_o_409` al import de `cobros` y `RolParteContrato` al de `models`. Al final:

```python
def enviar(
    db: Session, contrato_id: int, liq_id: int, email: str | None, background: BackgroundTasks
) -> Liquidacion:
    """Igual que `cobros.enviar_recibo`, al propietario."""
    email_configurado_o_409()
    liq = obtener(db, contrato_id, liq_id)
    if not liq.comprobante_pdf_key:
        raise conflicto("La liquidación no tiene comprobante generado")
    destinatario = email or recibos.email_de_parte(liq.contrato, RolParteContrato.propietario)
    if not destinatario:
        raise conflicto("El propietario no tiene email cargado; indicá uno")

    inmobiliaria = obtener_inmobiliaria(db)
    background.add_task(
        recibos.enviar_y_marcar,
        Liquidacion,
        liq.id,
        destinatario,
        recibos.asunto_liquidacion(liq),
        recibos.texto_liquidacion(liq, inmobiliaria),
        liq.comprobante_pdf_key,
        f"liquidacion-{liq.numero_formateado}.pdf",
    )
    return liq
```

- [ ] **Step 6: Schema** — en `schemas.py`, después de `AnularIn` (import `EmailStr` de pydantic; `pydantic[email]` ya está en `pyproject.toml`):

```python
class EnviarIn(BaseModel):
    """Destinatario explícito. Sin él, el email primario del inquilino (recibo) o
    del propietario (liquidación)."""

    email: EmailStr | None = None
```

- [ ] **Step 7: Router** — import `BackgroundTasks` de fastapi y `EnviarIn`, `PagoOut` de schemas. Después de `anular_pago`:

```python
@router.post(
    f"{_COBRO}/pagos/{{pago_id}}/enviar",
    response_model=PagoOut,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=SOLO_STAFF,
)
def enviar_recibo(
    contrato_id: int,
    cobro_id: int,
    pago_id: int,
    background: BackgroundTasks,
    datos: EnviarIn | None = None,
    db: Session = Depends(get_db),
) -> PagoOut:
    """202: el email sale después de la respuesta; `enviado_email_at` se marca al salir."""
    pago = cobros.enviar_recibo(
        db, contrato_id, cobro_id, pago_id, datos.email if datos else None, background
    )
    return PagoOut.model_validate(pago)
```

Después de `pagar_liquidacion`:

```python
@router.post(
    f"{_LIQ}/{{liq_id}}/enviar",
    response_model=LiquidacionDetalle,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=SOLO_STAFF,
)
def enviar_liquidacion(
    contrato_id: int,
    liq_id: int,
    background: BackgroundTasks,
    datos: EnviarIn | None = None,
    db: Session = Depends(get_db),
) -> LiquidacionDetalle:
    liq = liquidaciones.enviar(db, contrato_id, liq_id, datos.email if datos else None, background)
    return LiquidacionDetalle.model_validate(liq)
```

- [ ] **Step 8: Correr**

Run: `cd src && python -m pytest tests/test_alquileres_envio.py tests/ -q && ruff check app tests`
Expected: PASS. Si `test_envia_al_email_primario...` falla con `enviado_email_at is None` pero `emails_enviados` tiene el email, el background task no está llegando a la base de test: verificar que `sesion_background` parchea `recibos.SessionLocal` (el nombre importado en `recibos.py`) y no `app.database.SessionLocal`.

---

## Task 9: Listados transversales, resumen del dashboard y datos de cobros en el contrato

**Files:**
- Modify: `src/app/platform/alquileres/models.py` (propiedades `Cobro.propiedad/inquilinos/moneda`, `Liquidacion.propiedad`, `Contrato.vencidos/resumen_cobros`)
- Modify: `src/app/platform/alquileres/cobros.py` (`listar_cobros`, `criterio_sin_liquidar`, `cobros_vencidos`, `resumen`)
- Modify: `src/app/platform/alquileres/liquidaciones.py` (`listar`)
- Modify: `src/app/platform/alquileres/service.py` (`listar_contratos`: filtro `sin_liquidar` y carga de cobros)
- Modify: `src/app/platform/alquileres/schemas.py` (`FiltroEstadoCobro`, `CobroEnLista`, `PaginadoCobros`, `PaginadoLiquidaciones`, `ResumenCobros`, `Resumen`; `ContratoEnLista.vencidos`, `ContratoDetalle.resumen_cobros`, `LiquidacionEnLista.propiedad`)
- Modify: `src/app/platform/alquileres/router.py` (`GET /cobros`, `GET /liquidaciones`, `GET /resumen`, `sin_liquidar` en `GET /contratos`)
- Create: `src/tests/test_alquileres_listados.py`

**Interfaces:**
- Produces: `cobros.listar_cobros(db, *, estado, vence_en_dias, contrato_id, property_id, q, skip, limit) -> tuple[int, list[Cobro]]`; `cobros.criterio_sin_liquidar(hoy) -> ColumnElement` (expresión SQL compartida por la lista de contratos y el resumen); `cobros.cobros_vencidos(db, hoy) -> list[Cobro]`; `cobros.resumen(db, periodo: date | None) -> Resumen`; `liquidaciones.listar(db, *, estado, periodo, contrato_id, skip, limit) -> tuple[int, list[Liquidacion]]`; `service.listar_contratos(..., sin_liquidar: bool)`.
- Endpoints: `GET /cobros`, `GET /liquidaciones`, `GET /resumen?periodo=YYYY-MM`, `GET /contratos?sin_liquidar=1`.

> "Vencido" no se guarda: en SQL es `estado IN (pendiente, parcial) AND fecha_vencimiento < hoy`. Es equivalente a `Cobro.vencido` (saldo > 0) porque `_recalcular_estado` deja `pagado` exactamente cuando el saldo llega a cero. Los montos de vencidos se suman en Python sobre las filas cargadas: una inmobiliaria tiene decenas o cientos de contratos, no millones, y así la definición vive en un solo lugar (`Cobro.saldo`).

- [ ] **Step 1: Tests** — `src/tests/test_alquileres_listados.py`:

```python
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
    a = crear_contrato_de_prueba(db, sesion.id, titulo="Depto A", fecha_inicio=_mes(-3), fecha_fin=_mes(0) - timedelta(days=1), dia_vencimiento=1)
    b = crear_contrato_de_prueba(db, sesion.id, titulo="Depto B", fecha_inicio=HOY + timedelta(days=3), fecha_fin=HOY + timedelta(days=400), dia_vencimiento=1)
    c = crear_contrato_de_prueba(db, sesion.id, titulo="Depto C", fecha_inicio=_mes(-3), fecha_fin=_mes(-2) - timedelta(days=1), dia_vencimiento=1)
    d = crear_contrato_de_prueba(db, sesion.id, titulo="Depto D", fecha_inicio=_mes(-1), fecha_fin=_mes(0) - timedelta(days=1), dia_vencimiento=1)
    f = crear_contrato_de_prueba(db, sesion.id, titulo="Depto F", fecha_inicio=_mes(-3), fecha_fin=_mes(-2) - timedelta(days=1), dia_vencimiento=1)

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
    assert client.get(f"{API}/liquidaciones", params={"estado": "pagada"}).json()["total"] == 0
    assert client.get(f"{API}/liquidaciones", params={"periodo": _ym(_mes(-1))}).json()["total"] == 1
    assert client.get(f"{API}/liquidaciones", params={"periodo": _ym(_mes(-2))}).json()["total"] == 0
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

    sin_admin = crear_contrato_de_prueba(db, sesion.id, titulo="No administrado", administrado=False)
    assert client.get(f"{API}/contratos/{sin_admin.id}").json()["resumen_cobros"] is None
```

- [ ] **Step 2: Ver fallar**

Run: `cd src && python -m pytest tests/test_alquileres_listados.py -q`
Expected: FAIL (404 en `/cobros`, `/liquidaciones`, `/resumen`; `KeyError: 'vencidos'`).

- [ ] **Step 3: Modelos** — en `models.py`:

En `Contrato`, después de `monto_vigente_a`:

```python
    @property
    def vencidos(self) -> int:
        return sum(1 for c in self.cobros if c.vencido)

    @property
    def resumen_cobros(self) -> dict | None:
        """Para la ficha: cuántos períodos están vencidos, cuánto suman y cuándo vence
        el próximo con saldo. None si el contrato no es administrado."""
        if not self.administrado:
            return None
        hoy = date.today()
        vencidos = [c for c in self.cobros if c.vencido]
        proximos = [
            c.fecha_vencimiento
            for c in self.cobros
            if c.estado != EstadoCobro.anulado and c.saldo > 0 and c.fecha_vencimiento >= hoy
        ]
        return {
            "vencidos": len(vencidos),
            "saldo_vencido": sum((c.saldo for c in vencidos), Decimal("0")),
            "proximo_vencimiento": min(proximos, default=None),
        }
```

En `Cobro`, después de `dias_atraso` (lo que la lista transversal muestra por fila, delegado al contrato para que `CobroEnLista` valide con `from_attributes`):

```python
    @property
    def propiedad(self):
        return self.contrato.propiedad

    @property
    def inquilinos(self) -> list[ContratoParte]:
        return [p for p in self.contrato.partes if p.rol == RolParteContrato.inquilino]

    @property
    def moneda(self) -> str:
        return self.contrato.moneda
```

En `Liquidacion`, después de `whatsapp_url`:

```python
    @property
    def propiedad(self):
        return self.contrato.propiedad
```

- [ ] **Step 4: `cobros.py`** — imports nuevos:

```python
from collections import defaultdict
from datetime import timedelta

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import contains_eager, selectinload

from app.modules.propiedades.models import Propiedad
from app.platform.alquileres.models import ContratoParte
from app.platform.alquileres.schemas import FiltroEstadoCobro, Resumen
from app.platform.people.models import Person
```

Al final del archivo:

```python
# ---------------------------------------------------------------------------
# Listado transversal y resumen
# ---------------------------------------------------------------------------

_CON_SALDO = (EstadoCobro.pendiente, EstadoCobro.parcial)


def listar_cobros(
    db: Session,
    *,
    estado: FiltroEstadoCobro | None = None,
    vence_en_dias: int | None = None,
    contrato_id: int | None = None,
    property_id: int | None = None,
    q: str | None = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[int, list[Cobro]]:
    """Cobros de contratos vigentes (o de un contrato dado, en cualquier estado),
    ordenados por vencimiento. `vencido` es virtual: pendiente/parcial y ya vencido."""
    hoy = date.today()
    consulta = db.query(Cobro).join(Cobro.contrato)

    if contrato_id is not None:
        consulta = consulta.filter(Cobro.contrato_id == contrato_id)
    else:
        consulta = consulta.filter(Contrato.estado == EstadoContrato.vigente)
    if property_id is not None:
        consulta = consulta.filter(Contrato.property_id == property_id)
    if estado == "vencido":
        consulta = consulta.filter(Cobro.estado.in_(_CON_SALDO), Cobro.fecha_vencimiento < hoy)
    elif estado is not None:
        consulta = consulta.filter(Cobro.estado == EstadoCobro(estado))
    if vence_en_dias is not None:
        consulta = consulta.filter(
            Cobro.estado.in_(_CON_SALDO),
            Cobro.fecha_vencimiento.between(hoy, hoy + timedelta(days=vence_en_dias)),
        )
    if q and q.strip():
        patron = f"%{q.strip()}%"
        nombre_completo = Person.first_name + " " + Person.last_name
        consulta = consulta.filter(
            or_(
                Contrato.propiedad.has(Propiedad.titulo.ilike(patron)),
                Contrato.partes.any(
                    and_(
                        ContratoParte.rol == RolParteContrato.inquilino,
                        ContratoParte.person.has(nombre_completo.ilike(patron)),
                    )
                ),
            )
        )

    total = consulta.count()
    items = (
        consulta.options(
            # El join ya está: se reutiliza para el contrato y de ahí se cuelga lo
            # que muestra cada fila, así una página de 50 no dispara 150 queries.
            contains_eager(Cobro.contrato).joinedload(Contrato.propiedad),
            contains_eager(Cobro.contrato)
            .selectinload(Contrato.partes)
            .joinedload(ContratoParte.person),
            selectinload(Cobro.pagos),
        )
        .order_by(Cobro.fecha_vencimiento.asc(), Cobro.id.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return total, items


def criterio_sin_liquidar(hoy: date):
    """Contrato vigente y administrado con pagos válidos, no liquidados, de meses
    anteriores al actual. Lo comparten el filtro `sin_liquidar` de la lista de
    contratos y el tile del dashboard, para que cuenten lo mismo."""
    inicio_mes = hoy.replace(day=1)
    return and_(
        Contrato.estado == EstadoContrato.vigente,
        Contrato.administrado.is_(True),
        Contrato.cobros.any(
            Cobro.pagos.any(
                and_(
                    Pago.anulado_at.is_(None),
                    Pago.liquidacion_id.is_(None),
                    Pago.fecha_pago < inicio_mes,
                )
            )
        ),
    )


def cobros_vencidos(db: Session, hoy: date) -> list[Cobro]:
    """Todos los vencidos de contratos vigentes, con sus pagos cargados para sumar saldos."""
    return (
        db.query(Cobro)
        .join(Cobro.contrato)
        .filter(
            Contrato.estado == EstadoContrato.vigente,
            Cobro.estado.in_(_CON_SALDO),
            Cobro.fecha_vencimiento < hoy,
        )
        .options(selectinload(Cobro.pagos))
        .all()
    )


def _decimal(valor) -> Decimal:
    """SQLite devuelve float en los SUM sobre Numeric; Postgres, Decimal. Unifica."""
    return Decimal(str(valor or 0)).quantize(Decimal("0.01"))


def resumen(db: Session, periodo: date | None = None) -> Resumen:
    """Los números del dashboard. `esperado` y `cobrado` son del mes pedido (default:
    el actual); vencidos, morosos y liquidaciones pendientes son del momento."""
    hoy = date.today()
    periodo = periodo or hoy.replace(day=1)
    fin = periodo + relativedelta(months=1)

    esperado = (
        db.query(func.sum(Cobro.monto))
        .filter(Cobro.periodo == periodo, Cobro.estado != EstadoCobro.anulado)
        .scalar()
    )
    cobrado = (
        db.query(func.sum(Pago.monto))
        .filter(Pago.anulado_at.is_(None), Pago.fecha_pago >= periodo, Pago.fecha_pago < fin)
        .scalar()
    )

    vencidos = cobros_vencidos(db, hoy)
    por_contrato: dict[int, list[Cobro]] = defaultdict(list)
    for cobro in vencidos:
        por_contrato[cobro.contrato_id].append(cobro)
    morosos = sum(
        1
        for lista in por_contrato.values()
        if len(lista) >= 2 or any(c.dias_atraso > 30 for c in lista)
    )
    sin_emitir = db.query(Contrato).filter(criterio_sin_liquidar(hoy)).count()

    return Resumen(
        periodo=periodo,
        esperado=_decimal(esperado),
        cobrado=_decimal(cobrado),
        vencidos_cantidad=len(vencidos),
        vencido_monto=sum((c.saldo for c in vencidos), Decimal("0")),
        morosos=morosos,
        liquidaciones_sin_emitir=sin_emitir,
    )
```

> `cobrado` suma solo `Pago.monto` (el alquiler), sin punitorios, para que sea comparable con `esperado`. `esperado` cuenta todos los cobros no anulados del mes, también los de contratos ya terminados (el mes de corte de una rescisión sigue siendo un cobro esperado).

- [ ] **Step 5: `liquidaciones.py`** — import `from sqlalchemy.orm import joinedload`. Después de `listar_de_contrato`:

```python
def listar(
    db: Session,
    *,
    estado: EstadoLiquidacion | None = None,
    periodo: date | None = None,
    contrato_id: int | None = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[int, list[Liquidacion]]:
    """Liquidaciones de todos los contratos, las más recientes primero."""
    consulta = db.query(Liquidacion)
    if estado is not None:
        consulta = consulta.filter(Liquidacion.estado == estado)
    if periodo is not None:
        consulta = consulta.filter(Liquidacion.periodo == periodo)
    if contrato_id is not None:
        consulta = consulta.filter(Liquidacion.contrato_id == contrato_id)
    total = consulta.count()
    items = (
        consulta.options(joinedload(Liquidacion.contrato).joinedload(Contrato.propiedad))
        .order_by(Liquidacion.periodo.desc(), Liquidacion.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return total, items
```

- [ ] **Step 6: `service.py`** — `listar_contratos` suma el parámetro `sin_liquidar: bool = False` y, después del bloque de `ajuste_en_dias`:

```python
    if sin_liquidar:
        consulta = consulta.filter(cobros_service.criterio_sin_liquidar(hoy))
```

Y en la query de `items`, antes de `.order_by(...)`, para que `ContratoEnLista.vencidos` no dispare una query por contrato:

```python
        .options(selectinload(Contrato.cobros).selectinload(Cobro.pagos))
```

Imports: `from sqlalchemy.orm import Session, selectinload` y `Cobro` en el import de `models`. Sumar al docstring: "`sin_liquidar` usa el mismo criterio que `resumen.liquidaciones_sin_emitir`".

- [ ] **Step 7: Schemas** — en `schemas.py`:

Después de `CobroDetalle`:

```python
# Los cuatro estados reales más el virtual `vencido` (pendiente/parcial ya vencido).
FiltroEstadoCobro = Literal["pendiente", "parcial", "pagado", "anulado", "vencido"]


class CobroEnLista(BaseModel):
    """Fila de la lista transversal: el cobro más lo mínimo del contrato para nombrarlo."""

    id: int
    contrato_id: int
    propiedad: PropiedadBrief
    inquilinos: list[ParteOut]
    moneda: str
    periodo: date
    fecha_vencimiento: date
    monto: Decimal
    estado: EstadoCobro
    pagado: Decimal
    saldo: Decimal
    dias_atraso: int
    vencido: bool

    model_config = ConfigDict(from_attributes=True)


class PaginadoCobros(BaseModel):
    total: int
    items: list[CobroEnLista]


class ResumenCobros(BaseModel):
    """Bloque de la ficha del contrato."""

    vencidos: int
    saldo_vencido: Decimal
    proximo_vencimiento: date | None


class Resumen(BaseModel):
    """Tiles del dashboard. `esperado`/`cobrado` son del `periodo`; el resto, de hoy."""

    periodo: date
    esperado: Decimal
    cobrado: Decimal
    vencidos_cantidad: int
    vencido_monto: Decimal
    morosos: int
    liquidaciones_sin_emitir: int
```

Después de `LiquidacionDetalle`:

```python
class PaginadoLiquidaciones(BaseModel):
    total: int
    items: list[LiquidacionEnLista]
```

`ContratoEnLista` suma `vencidos: int`. `ContratoDetalle` suma `resumen_cobros: ResumenCobros | None` (como `ResumenCobros` se declara después de `ContratoDetalle`, moverla arriba, junto a `ParteOut`, o dejar la referencia como string: `"ResumenCobros | None"`, que Pydantic resuelve al final del módulo). `LiquidacionEnLista` suma `propiedad: PropiedadBrief`.

- [ ] **Step 8: Router** — imports: `liquidaciones`, `EstadoLiquidacion` (models) y los schemas `CobroEnLista, FiltroEstadoCobro, LiquidacionEnLista, PaginadoCobros, PaginadoLiquidaciones, Resumen`. `listar_contratos` suma el parámetro `sin_liquidar: bool = Query(default=False)` y lo pasa al service. Antes de `obtener_contrato` (rutas fijas antes de las paramétricas, como `/contratos`):

```python
# --- Lista transversal de cobros, liquidaciones y resumen ---


@router.get("/cobros", response_model=PaginadoCobros, dependencies=SOLO_STAFF)
def listar_cobros(
    estado: FiltroEstadoCobro | None = Query(default=None),
    vence_en_dias: int | None = Query(default=None, ge=0),
    contrato_id: int | None = Query(default=None),
    property_id: int | None = Query(default=None),
    q: str | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=500),
    db: Session = Depends(get_db),
) -> PaginadoCobros:
    total, items = cobros.listar_cobros(
        db,
        estado=estado,
        vence_en_dias=vence_en_dias,
        contrato_id=contrato_id,
        property_id=property_id,
        q=q,
        skip=skip,
        limit=limit,
    )
    return PaginadoCobros(total=total, items=[CobroEnLista.model_validate(c) for c in items])


@router.get("/liquidaciones", response_model=PaginadoLiquidaciones, dependencies=SOLO_STAFF)
def listar_liquidaciones(
    estado: EstadoLiquidacion | None = Query(default=None),
    periodo: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    contrato_id: int | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=500),
    db: Session = Depends(get_db),
) -> PaginadoLiquidaciones:
    total, items = liquidaciones.listar(
        db,
        estado=estado,
        periodo=liquidaciones.periodo_desde(periodo) if periodo else None,
        contrato_id=contrato_id,
        skip=skip,
        limit=limit,
    )
    return PaginadoLiquidaciones(
        total=total, items=[LiquidacionEnLista.model_validate(x) for x in items]
    )


@router.get("/resumen", response_model=Resumen, dependencies=SOLO_STAFF)
def resumen(
    periodo: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    db: Session = Depends(get_db),
) -> Resumen:
    return cobros.resumen(db, liquidaciones.periodo_desde(periodo) if periodo else None)
```

> `periodo_desde` vive en `liquidaciones` y el router lo usa para las tres rutas; `cobros` no lo importa porque `liquidaciones` ya importa `cobros` y sería circular. `"2026-13"` pasa el patrón pero `date(2026, 13, 1)` lanza `ValueError` → 422.

- [ ] **Step 9: Correr**

Run: `cd src && python -m pytest tests/test_alquileres_listados.py tests/ -q && ruff check app tests`
Expected: PASS. Si `test_resumen_cobros_en_la_ficha` falla con un error de validación sobre `resumen_cobros`, es que la referencia string `"ResumenCobros | None"` no se resolvió: llamar `ContratoDetalle.model_rebuild()` al final de `schemas.py` o mover la clase arriba.

---

## Task 10: Verificación del backend y documentación de despliegue

Cierra la mitad backend del bloque 2b: la suite entera, la migración contra una base real (SQLite no la prueba), una pasada a mano por el flujo completo con PDFs y email de verdad, y las notas para desplegar. Las tareas del frontend (Tasks 11+) arrancan con esto en verde.

**Files:**
- Modify: `docs/despliegue.md` (nota de la migración `0006` y variables `SMTP_*` en Render)
- Verify: todo lo creado en Tasks 1–9

- [ ] **Step 1: Suite completa, lint y formato**

Run: `cd src && python -m pytest tests/ -q && ruff check app tests && ruff format --check app tests`
Expected: todos PASS, ruff sin avisos. Si `ruff format --check` marca archivos, correr `ruff format app tests` y volver a correr la suite (el formateo no cambia comportamiento, pero conviene mirar el diff de las listas con `# fmt: skip` en `formato.py`).

- [ ] **Step 2: Migración contra Postgres local**

Con `DATABASE_URL` apuntando a la base local de desarrollo (la que está en `head` = `0005`):

```bash
cd src
alembic upgrade head          # aplica 0006_alquileres_cobros
alembic check                 # "No new upgrade operations detected."
alembic downgrade 0005_alquileres_contratos
alembic upgrade head          # el round-trip prueba que downgrade() está completo
```

Expected: las cuatro corren sin error y `alembic check` no detecta diferencias entre modelos y migraciones. Si `alembic check` propone cambios, casi siempre es un índice o un `server_default` que quedó distinto entre `models.py` y `0006`: corregir la **migración** (los modelos son la fuente de verdad) y repetir el round-trip.

- [ ] **Step 3: Pasada a mano por el flujo**

Levantar la API (`uvicorn app.main:app --reload --port 8000`) con `STORAGE_BACKEND=local` y usar `http://localhost:8000/docs` (autorizar con la cookie: hacer login desde `POST /auth/login` en la misma pestaña; el navegador la guarda). En orden:

1. `PUT /api/v1/inmobiliaria` con `punitorio_diario_pct: 0.1` y `dias_gracia: 3`. Ver `email_configurado: false` en el `GET`.
2. `POST /api/v1/alquileres/contratos` administrado, con `fecha_inicio` hace tres meses y `dia_vencimiento: 10`. En la respuesta: `cobros` con un período por mes, los primeros `vencido: true`, y `resumen_cobros` con los vencidos y `proximo_vencimiento`.
3. `GET .../cobros/{id}/punitorio?fecha_pago=hoy` sobre el primer cobro: `dias_atraso` y `monto` coherentes con 0,1 % diario menos 3 días de gracia.
4. `POST .../pagos` parcial (sin `punitorio` en el body → usa el sugerido) y luego el resto. Ver `estado` parcial → pagado, `recibo_numero` 1 y 2, `recibo_numero_formateado`.
5. Abrir `http://localhost:8000/media/recibos/{contrato_id}/1.pdf`: logo (si la inmobiliaria tiene uno), tildes y eñes bien, "Recibí de …", total en número y en letras, "Saldo pendiente del período" en el parcial.
6. `POST .../gastos` (expensas) y `PUT .../comprobante` con un JPG. Abrir el comprobante desde `comprobante_url`.
7. `GET .../liquidaciones/preview?periodo=<mes actual>` → desglose; `POST .../liquidaciones` → abrir `comprobante_pdf_url`: tabla de cobros, honorarios en negativo, gastos, "Total a transferir".
8. `POST .../pagos/{pago_id}/anular` sobre un pago liquidado → 409 con el número de liquidación. `POST .../liquidaciones/{id}/pagar` → `pagada`.
9. `POST .../ajustes/{id}/aplicar` con `porcentaje: 10` → `cobros_no_actualizados` en la respuesta y los períodos futuros con el monto nuevo.
10. `GET /api/v1/alquileres/cobros?estado=vencido`, `GET /api/v1/alquileres/resumen`, `GET /api/v1/alquileres/contratos?sin_liquidar=1`: los números cierran con lo que se cargó.
11. **Email real.** En el `.env` de la raíz, definir las cinco `SMTP_*` con una cuenta de Gmail de prueba (contraseña de aplicación, puerto 587). Reiniciar la API; `GET /api/v1/inmobiliaria` → `email_configurado: true`. Cargar un contacto `email` al inquilino, `POST .../pagos/{pago_id}/enviar` → 202. Revisar la casilla: asunto `Recibo N° 0001-00000001 · …`, PDF adjunto. `GET .../cobros/{id}` → `enviado_email_at` con fecha. Lo mismo con `.../liquidaciones/{id}/enviar` al propietario. Después, **sacar las `SMTP_*` del `.env`** (o dejarlas comentadas) para no mandar emails por accidente desde desarrollo.
12. `whatsapp_url` de un pago con inquilino con contacto `whatsapp`: abrirla en el navegador → WhatsApp Web con el texto precargado y el link al PDF (en local apunta a `localhost`, es esperable).

Expected: cada paso responde como dice; los PDF se ven bien; el email llega con el adjunto. Anotar cualquier texto que suene mal en el PDF o el email: es más barato corregirlo ahora que cuando el panel ya los muestra.

- [ ] **Step 4: `docs/despliegue.md` — migración `0006`**

Agregar después de la sección "Contratos de alquiler (migración `0005`)", antes del `---` que la cierra:

```markdown
### Cobros, recibos y liquidaciones (migración `0006`)

La revisión **`0006_alquileres_cobros`** crea cuatro tablas (`alquileres_cobros`,
`alquileres_pagos`, `alquileres_gastos`, `alquileres_liquidaciones`), cuatro
enums (`estado_cobro`, `medio_pago`, `tipo_gasto`, `estado_liquidacion`) y
agrega columnas con default a `inmobiliaria` (`punitorio_diario_pct`,
`dias_gracia` y los contadores `ultimo_recibo` / `ultima_liquidacion`) y a
`alquileres_contratos` (`punitorio_diario_pct`). No hay chequeo previo:
`alembic upgrade head` contra Supabase alcanza.

- **Mismo orden que la `0005`**: `alembic upgrade head` → push de la API → push
  del frontend. La ficha del contrato y el dashboard piden `cobros` y
  `/alquileres/resumen` apenas se abren.
- **Los contratos administrados que ya existían no tienen cobros.** Los cobros
  se materializan al crear el contrato o al pasarlo a administrado, y la
  migración no los genera para atrás. Para cada uno de esos contratos, desde la
  ficha: editar → `administrado` off → guardar → `administrado` on → guardar.
  Eso genera un cobro por mes desde `fecha_inicio`; los meses que ya se cobraron
  por fuera del sistema se anulan con "Anular mes" (motivo: "Cobrado antes del
  sistema"), así no aparecen como vencidos. Son pocos contratos; si algún día
  fueran muchos, es un script de diez líneas sobre `cobros.generar_cobros`.
- **Dependencia nueva en la API:** `fpdf2` (en `pyproject.toml`), más las dos
  fuentes DejaVu en `app/assets/fonts/` (van en el repo y en el paquete vía
  `package-data`). Render las instala solas en el build.
- **Los PDF van a R2** bajo `recibos/`, `liquidaciones/` y `gastos/`, con la
  misma configuración que las fotos. Un recibo emitido con el disco local de
  Render se pierde en el próximo deploy: en producción `STORAGE_BACKEND=r2`
  sigue siendo obligatorio, ahora por dos razones.
- **La numeración de recibos y liquidaciones es correlativa global** y sale de
  los contadores de `inmobiliaria`. `alembic downgrade 0005_alquileres_contratos`
  borra las cuatro tablas **y los contadores**: si se vuelve a subir, la
  numeración arranca de 0001-00000001 otra vez. Con recibos ya entregados a
  inquilinos, no es un paso que se dé.
```

- [ ] **Step 5: `docs/despliegue.md` — variables `SMTP_*` en Render**

En la sección "3. Render (la API)", después del párrafo "El resto (`JWT_SECRET` generado, …) ya viene definido." (dentro del punto 3), agregar:

```markdown
   **Opcionales, para mandar recibos y liquidaciones por email:** `SMTP_HOST`,
   `SMTP_PORT` (default 587), `SMTP_USER`, `SMTP_PASSWORD` y `EMAIL_FROM`. Se
   cargan a mano en la pestaña *Environment* del servicio, como `DATABASE_URL`;
   no están en `render.yaml` porque el panel funciona sin ellas (los botones
   "Enviar por email" quedan deshabilitados y la configuración de la
   inmobiliaria muestra "Envío de emails: no configurado"). Si se define una,
   hay que definir las cinco: la API no arranca con SMTP a medias. Con Gmail:
   contraseña de aplicación (no la de la cuenta), puerto 587,
   `EMAIL_FROM=Inmobiliaria <cuenta@gmail.com>`. El puerto 465 usa SSL directo;
   cualquier otro, STARTTLS.
```

Y en "5. Comprobaciones finales", un punto 5:

```markdown
5. **Si se cargaron las `SMTP_*`:** desde un contrato administrado, registrar
   un pago y "Enviar por email". Si la API responde 202 pero el email no llega,
   el detalle está en los logs de Render (`No se pudo enviar Pago #…`): casi
   siempre es la contraseña de aplicación o el puerto.
```

- [ ] **Step 6: Reporte**

Sin commit ni push. Avisar a Matías:

- que la suite, `ruff` y `alembic check` pasaron (con la salida resumida);
- los archivos nuevos y modificados (`git status --short`);
- que la migración `0006` está aplicada en la base local y **no** en Supabase;
- si se corrió el Step 3.11 con una cuenta de Gmail, que las `SMTP_*` quedaron fuera del `.env`;
- que las tareas del frontend son las siguientes.

---
