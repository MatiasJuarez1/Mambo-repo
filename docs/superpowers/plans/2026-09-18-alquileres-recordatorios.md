# Alquileres 2c — Recordatorios · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una bandeja unificada de "qué hay que atender en los próximos N días" (cobros vencidos y por vencer, ajustes, contratos que terminan) en el panel, y el mismo contenido por email diario al staff disparado por un cron externo.

**Architecture:** Submódulo `recordatorios.py` dentro de `src/app/platform/alquileres/` que calcula la bandeja al vuelo sobre las consultas del 2a/2b (nada se persiste) y arma el email en texto plano. Dos endpoints bajo `/api/v1/alquileres/recordatorios`: `GET` para el panel (cookie de staff) y `POST /enviar` para el cron (token propio en header). Frontend: componente `BandejaRecordatorios` reutilizado en el dashboard y en una página propia. Spec: [2026-09-18-alquileres-recordatorios-design.md](../specs/2026-09-18-alquileres-recordatorios-design.md).

**Tech Stack:** FastAPI + SQLAlchemy 2.0 + Alembic + smtplib (vía `app/email.py`); React + Vite + vitest; GitHub Actions `schedule`.

## Global Constraints

- **No hacer `git commit` ni `git push`.** Todo queda en el working tree; Matías commitea. Cada tarea termina con verificación, no con commit.
- Código, comentarios, docstrings y mensajes de API en **castellano**.
- Backend: `ruff` con line-length 100, reglas E/F/I/B/UP. Tests con SQLite en memoria (`src/tests/conftest.py`); comandos desde `src/` con el venv activado.
- Frontend: `npm test` (ya lleva `--pool=threads`); `npx tsc --noEmit` limpio; comandos desde `client/`.
- Endpoints nuevos bajo `/api/v1/alquileres` (el proxy de Vercel solo reenvía `/api/*` y `/auth/*`). El `GET` con `SOLO_STAFF`; el `POST /enviar` con `X-Recordatorios-Token`.
- Las funciones de service reciben `Session` primero.
- Los recordatorios **no se persisten**: se calculan en cada request.
- El email de recordatorios se envía **sincrónico** (no `BackgroundTask`): el cron necesita el resultado.

---

## Mapa de archivos

**Backend — nuevos**
- `src/app/platform/alquileres/recordatorios.py` — `listar`, `destinatarios_staff`, `asunto_email`, `texto_email`, `enviar`.
- `src/alembic/versions/0007_recordatorios.py` — `inmobiliaria.dias_aviso_recordatorios`.
- `src/tests/test_alquileres_recordatorios.py`.
- `.github/workflows/recordatorios.yml`.

**Backend — modificados**
- `src/app/config.py` (token y propiedad), `.env.example`.
- `src/app/platform/auth/dependencies.py` (`require_token_recordatorios`).
- `src/app/platform/alquileres/schemas.py` (`TipoRecordatorio`, `Recordatorio`, `Recordatorios`, `EnvioRecordatorios`), `router.py` (dos endpoints).
- `src/app/platform/inmobiliaria/models.py`, `schemas.py`.
- `src/tests/test_config.py`, `src/tests/test_inmobiliaria.py`.
- `docs/despliegue.md`, `docs/superpowers/specs/2026-09-11-mapa-de-funcionalidades.md`.

**Frontend — nuevos**
- `client/src/components/crm/BandejaRecordatorios/BandejaRecordatorios.tsx`, `.css`, `.test.tsx`.
- `client/src/pages/admin/alquileres/Recordatorios.tsx`, `Recordatorios.test.tsx`.

**Frontend — modificados**
- `client/src/types/alquileres.ts`, `client/src/api/alquileres.ts`, `client/src/lib/alquileres.ts` (+ `.test.ts`).
- `client/src/types/inmobiliaria.ts`, `client/src/pages/admin/configuracion/Configuracion.tsx` (+ `.test.tsx`).
- `client/src/pages/admin/Dashboard.tsx` (+ `.test.tsx`), `client/src/layouts/AdminLayout.tsx`, `client/src/App.tsx`.
- `client/src/components/crm/TablaCobros/TablaCobros.tsx` (solo un `id` en la fila).

---

## Task 1: Configuración — token, `dias_aviso_recordatorios` y migración `0007`

**Files:**
- Modify: `src/app/config.py` (después del bloque SMTP)
- Modify: `src/app/platform/inmobiliaria/models.py`, `src/app/platform/inmobiliaria/schemas.py`
- Create: `src/alembic/versions/0007_recordatorios.py`
- Modify: `src/tests/test_config.py`, `src/tests/test_inmobiliaria.py`, `.env.example`

**Interfaces:**
- Produces: `Settings.recordatorios_token: str | None`, `Settings.recordatorios_configurado: bool`; `Inmobiliaria.dias_aviso_recordatorios: int`; `InmobiliariaUpdate.dias_aviso_recordatorios: int | None`; `InmobiliariaOut.dias_aviso_recordatorios: int`, `InmobiliariaOut.recordatorios_configurado: bool`.

- [ ] **Step 1: Tests de configuración** — al final de `src/tests/test_config.py`:

```python
def test_recordatorios_configurado_exige_token_y_smtp(monkeypatch):
    """El token solo sirve si además hay SMTP: sin eso el endpoint responde 409."""
    monkeypatch.setenv("JWT_SECRET", "cualquiera")
    for var in ("SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("RECORDATORIOS_TOKEN", "abc")
    assert _settings_sin_env().recordatorios_configurado is False

    monkeypatch.setenv("SMTP_HOST", "smtp.gmail.com")
    monkeypatch.setenv("SMTP_USER", "mambo@gmail.com")
    monkeypatch.setenv("SMTP_PASSWORD", "app-password")
    monkeypatch.setenv("EMAIL_FROM", "Mambo <mambo@gmail.com>")
    assert _settings_sin_env().recordatorios_configurado is True


def test_sin_token_recordatorios_no_configurado(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "cualquiera")
    monkeypatch.delenv("RECORDATORIOS_TOKEN", raising=False)
    s = _settings_sin_env()
    assert s.recordatorios_token is None
    assert s.recordatorios_configurado is False
```

- [ ] **Step 2: Test de inmobiliaria** — al final de `src/tests/test_inmobiliaria.py`:

```python
def test_dias_aviso_recordatorios_y_recordatorios_configurado(
    client, crear_usuario, iniciar_sesion, monkeypatch
):
    from app.config import get_settings

    crear_usuario()
    iniciar_sesion()
    s = get_settings()
    monkeypatch.setattr(s, "recordatorios_token", None)

    r = client.get("/api/v1/inmobiliaria")
    assert r.json()["dias_aviso_recordatorios"] == 30
    assert r.json()["recordatorios_configurado"] is False

    r = client.put("/api/v1/inmobiliaria", json={"dias_aviso_recordatorios": 60})
    assert r.status_code == 200, r.text
    assert r.json()["dias_aviso_recordatorios"] == 60
    assert client.put("/api/v1/inmobiliaria", json={"dias_aviso_recordatorios": 0}).status_code == 422
    assert client.put("/api/v1/inmobiliaria", json={"dias_aviso_recordatorios": 181}).status_code == 422

    monkeypatch.setattr(s, "recordatorios_token", "secreto")
    monkeypatch.setattr(s, "smtp_host", "smtp.ejemplo.com")
    monkeypatch.setattr(s, "email_from", "Mambo <no-reply@mambo.com.ar>")
    assert client.get("/api/v1/inmobiliaria").json()["recordatorios_configurado"] is True
```

- [ ] **Step 3: Ver fallar**

Run: `cd src && python -m pytest tests/test_config.py tests/test_inmobiliaria.py -q`
Expected: FAIL (`AttributeError: recordatorios_configurado`, `KeyError: 'dias_aviso_recordatorios'`).

- [ ] **Step 4: `Settings`** — en `src/app/config.py`, después de la propiedad `email_configurado`:

```python
    # ── Recordatorios diarios ──
    # Token propio para que un cron externo (GitHub Actions) dispare
    # `POST /api/v1/alquileres/recordatorios/enviar`. Sin la variable el endpoint
    # responde 404: no existe superficie que atacar. Generarlo con
    # `python -c "import secrets; print(secrets.token_urlsafe(32))"`.
    recordatorios_token: str | None = Field(default=None, validation_alias="RECORDATORIOS_TOKEN")

    @property
    def recordatorios_configurado(self) -> bool:
        """El email diario sale solo si hay token **y** SMTP."""
        return bool(self.recordatorios_token) and self.email_configurado
```

- [ ] **Step 5: Modelo y schemas de inmobiliaria**

En `src/app/platform/inmobiliaria/models.py`, después de `dias_gracia`:

```python
    # Ventana por defecto de la bandeja de recordatorios y del email diario (2c).
    dias_aviso_recordatorios: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
```

En `src/app/platform/inmobiliaria/schemas.py`, `InmobiliariaUpdate` suma después de `dias_gracia`:

```python
    dias_aviso_recordatorios: int | None = Field(default=None, ge=1, le=180)
```

`InmobiliariaOut` suma después de `dias_gracia: int`:

```python
    dias_aviso_recordatorios: int
```

y después de `email_configurado: bool = False`:

```python
    recordatorios_configurado: bool = False
```

y en `desde()`, después de `out.email_configurado = ...`:

```python
        out.recordatorios_configurado = get_settings().recordatorios_configurado
```

- [ ] **Step 6: Migración** — `src/alembic/versions/0007_recordatorios.py`:

```python
"""Bloque 2c: ventana de aviso de los recordatorios

Una columna en `inmobiliaria`. Los recordatorios en sí no se persisten.

Revision ID: 0007_recordatorios
Revises: 0006_alquileres_cobros
Create Date: 2026-09-18

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0007_recordatorios"
down_revision: str | None = "0006_alquileres_cobros"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "inmobiliaria",
        sa.Column("dias_aviso_recordatorios", sa.Integer(), nullable=False, server_default="30"),
    )


def downgrade() -> None:
    op.drop_column("inmobiliaria", "dias_aviso_recordatorios")
```

- [ ] **Step 7: `.env.example`** — al final:

```
# Recordatorios diarios (opcional). Token que manda el cron externo en el header
# X-Recordatorios-Token. Sin él, POST /api/v1/alquileres/recordatorios/enviar responde 404.
# Generar con: python -c "import secrets; print(secrets.token_urlsafe(32))"
# RECORDATORIOS_TOKEN=
```

- [ ] **Step 8: Correr**

Run: `cd src && python -m pytest tests/test_config.py tests/test_inmobiliaria.py -q && ruff check app tests`
Expected: PASS, ruff limpio.

---

## Task 2: `recordatorios.listar` y sus schemas

**Files:**
- Modify: `src/app/platform/alquileres/schemas.py` (al final)
- Create: `src/app/platform/alquileres/recordatorios.py`
- Create: `src/tests/test_alquileres_recordatorios.py`

**Interfaces:**
- Consumes: `cobros.cobros_vencidos(db, hoy)`, `Contrato.monto_vigente`, `Contrato.renovacion`, `PropiedadBrief`, `ParteOut`, `recibos.partes_con_rol`.
- Produces: `TipoRecordatorio` (StrEnum), `Recordatorio`, `Recordatorios`, `EnvioRecordatorios` (pydantic); `recordatorios.listar(db: Session, hoy: date, dias: int) -> Recordatorios`; `recordatorios.ETIQUETA_INDICE: dict[IndiceAjuste, str]`.

- [ ] **Step 1: Tests** — `src/tests/test_alquileres_recordatorios.py`:

```python
"""Bandeja de recordatorios: se calcula sobre cobros, ajustes y contratos, no se guarda."""

from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.platform.alquileres import recordatorios
from app.platform.alquileres.models import (
    Ajuste,
    Contrato,
    EstadoAjuste,
    EstadoCobro,
    EstadoContrato,
)
from tests.helpers_crm import crear_contrato_de_prueba

HOY = date.today()


@pytest.fixture
def usuario(crear_usuario):
    return crear_usuario()


def _con_fechas(db, user_id: int, **campos) -> Contrato:
    """Contrato administrado que arranca hace ~3 meses. Los cobros se acomodan a mano
    para que el test no dependa del día del mes en que corre."""
    inicio = (HOY - timedelta(days=95)).replace(day=1)
    base = {"fecha_inicio": inicio, "fecha_fin": HOY + timedelta(days=25)}
    base.update(campos)
    return crear_contrato_de_prueba(db, user_id, **base)


def _fijar_cobros(contrato: Contrato, vencimientos: list[date]) -> None:
    """Los primeros N cobros vencen en las fechas dadas; el resto se anula."""
    for cobro, fecha in zip(contrato.cobros, vencimientos, strict=False):
        cobro.fecha_vencimiento = fecha
    for cobro in contrato.cobros[len(vencimientos) :]:
        cobro.estado = EstadoCobro.anulado


@pytest.fixture
def escenario(db, usuario):
    """Un contrato ICL con: cobro vencido hace 5 días, cobro a 10 días, cobro a 50 días,
    ajuste atrasado 3 días, ajuste a 20 días, ajuste ya aplicado, y fin a 25 días."""
    contrato = _con_fechas(db, usuario.id, indice="icl", frecuencia_meses=3)
    assert len(contrato.cobros) >= 3
    _fijar_cobros(
        contrato,
        [HOY - timedelta(days=5), HOY + timedelta(days=10), HOY + timedelta(days=50)],
    )
    contrato.ajustes.clear()
    contrato.ajustes.extend(
        [
            Ajuste(fecha_prevista=HOY - timedelta(days=3), estado=EstadoAjuste.pendiente),
            Ajuste(fecha_prevista=HOY + timedelta(days=20), estado=EstadoAjuste.pendiente),
            Ajuste(
                fecha_prevista=HOY - timedelta(days=60),
                estado=EstadoAjuste.aplicado,
                monto_anterior=Decimal("100000.00"),
                monto_nuevo=Decimal("120000.00"),
            ),
        ]
    )
    db.commit()
    return contrato


def test_listar_junta_los_cuatro_tipos_en_orden_de_fecha(db, escenario):
    r = recordatorios.listar(db, HOY, dias=30)

    assert r.hoy == HOY and r.dias == 30 and r.total == 5
    assert [(i.tipo, i.dias) for i in r.items] == [
        ("cobro_vencido", -5),
        ("ajuste", -3),
        ("cobro_por_vencer", 10),
        ("ajuste", 20),
        ("fin_contrato", 25),
    ]
    assert r.por_tipo == {
        "cobro_vencido": 1,
        "cobro_por_vencer": 1,
        "ajuste": 2,
        "fin_contrato": 1,
    }

    vencido = r.items[0]
    assert vencido.contrato_id == escenario.id
    assert vencido.referencia_id == escenario.cobros[0].id
    assert vencido.propiedad.titulo == "Depto en La Plata"
    assert [p.full_name for p in vencido.inquilinos] == ["Ana Pérez"]
    # Snapshot del período al crear el contrato (100.000): el ajuste aplicado se
    # agregó después y no toca cobros ya generados.
    assert vencido.monto == Decimal("100000.00")
    assert vencido.moneda == "ARS"

    ajuste = r.items[1]
    assert ajuste.detalle == "Ajuste ICL"
    assert ajuste.monto == Decimal("120000.00")  # monto vigente: el del ajuste aplicado
    assert ajuste.referencia_id == escenario.ajustes[0].id

    fin = r.items[4]
    assert fin.detalle == "Termina el contrato"
    assert fin.referencia_id == escenario.id
    assert fin.fecha == escenario.fecha_fin


def test_la_ventana_acota_lo_futuro_pero_no_lo_atrasado(db, escenario):
    r = recordatorios.listar(db, HOY, dias=7)
    assert [(i.tipo, i.dias) for i in r.items] == [("cobro_vencido", -5), ("ajuste", -3)]

    r = recordatorios.listar(db, HOY, dias=60)
    assert r.total == 6
    assert r.items[-1].tipo == "cobro_por_vencer" and r.items[-1].dias == 50


def test_no_aparecen_contratos_no_vigentes_ni_cobros_anulados_ni_ajustes_resueltos(
    db, usuario, escenario
):
    escenario.estado = EstadoContrato.finalizado
    db.commit()
    assert recordatorios.listar(db, HOY, dias=60).total == 0

    otro = _con_fechas(db, usuario.id, indice="sin_ajuste", fecha_fin=HOY + timedelta(days=400))
    _fijar_cobros(otro, [HOY - timedelta(days=5)])
    otro.cobros[0].estado = EstadoCobro.anulado
    otro.ajustes.append(Ajuste(fecha_prevista=HOY + timedelta(days=2), estado=EstadoAjuste.omitido))
    db.commit()
    assert recordatorios.listar(db, HOY, dias=60).total == 0


def test_fin_de_contrato_ya_renovado_lo_dice(db, usuario, escenario):
    _fijar_cobros(escenario, [])  # sin cobros con saldo, para aislar el fin
    escenario.ajustes.clear()
    # No administrado: si generara cobros, el primero vencería dentro de la ventana.
    nuevo = crear_contrato_de_prueba(
        db,
        usuario.id,
        fecha_inicio=escenario.fecha_fin + timedelta(days=1),
        fecha_fin=escenario.fecha_fin + timedelta(days=365),
        administrado=False,
    )
    nuevo.contrato_anterior_id = escenario.id
    db.commit()
    db.expire_all()

    r = recordatorios.listar(db, HOY, dias=30)
    assert [i.tipo for i in r.items] == ["fin_contrato"]
    assert r.items[0].detalle == "Termina el contrato · renovado"
```

- [ ] **Step 2: Ver fallar**

Run: `cd src && python -m pytest tests/test_alquileres_recordatorios.py -q`
Expected: FAIL con `ImportError: cannot import name 'recordatorios'`.

- [ ] **Step 3: Schemas** — al final de `src/app/platform/alquileres/schemas.py`:

```python
# ---------------------------------------------------------------------------
# Recordatorios (2c)
# ---------------------------------------------------------------------------


class TipoRecordatorio(StrEnum):
    cobro_vencido = "cobro_vencido"
    cobro_por_vencer = "cobro_por_vencer"
    ajuste = "ajuste"
    fin_contrato = "fin_contrato"


class Recordatorio(BaseModel):
    """Un ítem de la bandeja. `dias` negativo = atrasado."""

    tipo: TipoRecordatorio
    fecha: date
    dias: int
    contrato_id: int
    # cobro_id / ajuste_id / contrato_id según el tipo, para linkear o resaltar.
    referencia_id: int
    propiedad: PropiedadBrief
    inquilinos: list[ParteOut]
    moneda: str
    # Saldo del cobro; monto vigente en ajuste y fin_contrato.
    monto: Decimal | None
    detalle: str


class Recordatorios(BaseModel):
    hoy: date
    dias: int
    total: int
    # Siempre las cuatro claves, aunque valgan 0.
    por_tipo: dict[TipoRecordatorio, int]
    items: list[Recordatorio]


class EnvioRecordatorios(BaseModel):
    enviado_a: list[str]
    items: int
```

Y agregar `from enum import StrEnum` a los imports del archivo (junto a `from decimal import Decimal`).

- [ ] **Step 4: `recordatorios.py`** — `src/app/platform/alquileres/recordatorios.py`:

```python
"""Recordatorios: qué hay que atender en los próximos N días.

Nada se persiste. La bandeja se arma en cada request sobre las consultas del
2a/2b: cobros con saldo (vencidos y por vencer), ajustes pendientes y contratos
que terminan. Lo atrasado entra siempre; `dias` acota solo lo futuro.

`enviar` manda la misma bandeja por email al staff, sincrónico: quien llama es
un cron que necesita saber si salió.
"""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import and_
from sqlalchemy.orm import Session, selectinload

from app.formato import nombre_periodo
from app.platform.alquileres import cobros as cobros_service
from app.platform.alquileres.models import (
    Ajuste,
    Cobro,
    Contrato,
    ContratoParte,
    EstadoAjuste,
    EstadoContrato,
    IndiceAjuste,
    RolParteContrato,
)
from app.platform.alquileres.schemas import (
    ParteOut,
    Recordatorio,
    Recordatorios,
    TipoRecordatorio,
)

ETIQUETA_INDICE: dict[IndiceAjuste, str] = {
    IndiceAjuste.icl: "ICL",
    IndiceAjuste.ipc: "IPC",
    IndiceAjuste.uva: "UVA",
    IndiceAjuste.casa_propia: "Casa Propia",
    IndiceAjuste.porcentaje_fijo: "Porcentaje fijo",
    IndiceAjuste.sin_ajuste: "Sin ajuste",
}

# Cargar propiedad y partes de cada contrato en la misma consulta: la bandeja
# muestra las dos cosas en cada fila.
_CON_CONTRATO = (
    selectinload(Cobro.contrato).joinedload(Contrato.propiedad),
    selectinload(Cobro.contrato).selectinload(Contrato.partes).joinedload(ContratoParte.person),
)


def _inquilinos(contrato: Contrato) -> list[ParteOut]:
    return [
        ParteOut.model_validate(p) for p in contrato.partes if p.rol == RolParteContrato.inquilino
    ]


def _item(
    tipo: TipoRecordatorio,
    fecha: date,
    hoy: date,
    contrato: Contrato,
    referencia_id: int,
    monto,
    detalle: str,
) -> Recordatorio:
    return Recordatorio(
        tipo=tipo,
        fecha=fecha,
        dias=(fecha - hoy).days,
        contrato_id=contrato.id,
        referencia_id=referencia_id,
        propiedad=contrato.propiedad,
        inquilinos=_inquilinos(contrato),
        moneda=contrato.moneda,
        monto=monto,
        detalle=detalle,
    )


def _cobros_por_vencer(db: Session, hoy: date, dias: int) -> list[Cobro]:
    return (
        db.query(Cobro)
        .join(Cobro.contrato)
        .filter(
            Contrato.estado == EstadoContrato.vigente,
            Cobro.estado.in_(cobros_service._CON_SALDO),
            Cobro.fecha_vencimiento.between(hoy, hoy + timedelta(days=dias)),
        )
        .options(selectinload(Cobro.pagos), *_CON_CONTRATO)
        .all()
    )


def _ajustes_pendientes(db: Session, hoy: date, dias: int) -> list[Ajuste]:
    return (
        db.query(Ajuste)
        .join(Ajuste.contrato)
        .filter(
            Contrato.estado == EstadoContrato.vigente,
            Ajuste.estado == EstadoAjuste.pendiente,
            Ajuste.fecha_prevista <= hoy + timedelta(days=dias),
        )
        .options(
            selectinload(Ajuste.contrato).joinedload(Contrato.propiedad),
            selectinload(Ajuste.contrato).selectinload(Contrato.partes).joinedload(ContratoParte.person),
            selectinload(Ajuste.contrato).selectinload(Contrato.ajustes),
        )
        .all()
    )


def _contratos_que_terminan(db: Session, hoy: date, dias: int) -> list[Contrato]:
    return (
        db.query(Contrato)
        .filter(
            and_(
                Contrato.estado == EstadoContrato.vigente,
                Contrato.fecha_fin <= hoy + timedelta(days=dias),
            )
        )
        .options(
            selectinload(Contrato.propiedad),
            selectinload(Contrato.partes).joinedload(ContratoParte.person),
            selectinload(Contrato.ajustes),
            selectinload(Contrato.renovacion),
        )
        .all()
    )


def listar(db: Session, hoy: date, dias: int) -> Recordatorios:
    """La bandeja completa, ordenada por fecha. Solo contratos vigentes."""
    items: list[Recordatorio] = []

    for cobro in cobros_service.cobros_vencidos(db, hoy):
        # `cobros_vencidos` no carga el contrato: se accede lazy (pocas filas).
        items.append(
            _item(
                TipoRecordatorio.cobro_vencido,
                cobro.fecha_vencimiento,
                hoy,
                cobro.contrato,
                cobro.id,
                cobro.saldo,
                nombre_periodo(cobro.periodo),
            )
        )
    for cobro in _cobros_por_vencer(db, hoy, dias):
        items.append(
            _item(
                TipoRecordatorio.cobro_por_vencer,
                cobro.fecha_vencimiento,
                hoy,
                cobro.contrato,
                cobro.id,
                cobro.saldo,
                nombre_periodo(cobro.periodo),
            )
        )
    for ajuste in _ajustes_pendientes(db, hoy, dias):
        contrato = ajuste.contrato
        items.append(
            _item(
                TipoRecordatorio.ajuste,
                ajuste.fecha_prevista,
                hoy,
                contrato,
                ajuste.id,
                contrato.monto_vigente,
                f"Ajuste {ETIQUETA_INDICE[contrato.indice]}",
            )
        )
    for contrato in _contratos_que_terminan(db, hoy, dias):
        detalle = "Termina el contrato"
        if contrato.renovacion is not None:
            detalle += " · renovado"
        items.append(
            _item(
                TipoRecordatorio.fin_contrato,
                contrato.fecha_fin,
                hoy,
                contrato,
                contrato.id,
                contrato.monto_vigente,
                detalle,
            )
        )

    items.sort(key=lambda i: (i.fecha, i.tipo, i.contrato_id))
    por_tipo = {tipo: 0 for tipo in TipoRecordatorio}
    for item in items:
        por_tipo[item.tipo] += 1
    return Recordatorios(hoy=hoy, dias=dias, total=len(items), por_tipo=por_tipo, items=items)
```

- [ ] **Step 5: Correr**

Run: `cd src && python -m pytest tests/test_alquileres_recordatorios.py -q && ruff check app tests`
Expected: 4 PASS, ruff limpio. Si `ruff` marca `_CON_SALDO` como acceso a privado (no lo hace por defecto), exponer `CON_SALDO = _CON_SALDO` en `cobros.py` y usar ese.

---

## Task 3: `GET /api/v1/alquileres/recordatorios`

**Files:**
- Modify: `src/app/platform/alquileres/router.py` (después de `listar_liquidaciones`/`resumen`, antes de `/contratos/{contrato_id}`)
- Modify: `src/tests/test_alquileres_recordatorios.py`

**Interfaces:**
- Consumes: `recordatorios.listar`, `inmobiliaria_service.obtener(db).dias_aviso_recordatorios`.
- Produces: `GET /api/v1/alquileres/recordatorios?dias=` → `Recordatorios`.

- [ ] **Step 1: Tests** — al final de `src/tests/test_alquileres_recordatorios.py`:

```python
# ---------------------------------------------------------------------------
# GET /recordatorios
# ---------------------------------------------------------------------------


def test_get_usa_la_ventana_de_la_inmobiliaria_y_acepta_dias(client, iniciar_sesion, escenario):
    iniciar_sesion()
    r = client.get("/api/v1/alquileres/recordatorios")
    assert r.status_code == 200, r.text
    assert r.json()["dias"] == 30 and r.json()["total"] == 5
    assert r.json()["items"][0]["tipo"] == "cobro_vencido"
    assert r.json()["items"][0]["propiedad"]["titulo"] == "Depto en La Plata"

    assert client.put("/api/v1/inmobiliaria", json={"dias_aviso_recordatorios": 60}).status_code == 200
    assert client.get("/api/v1/alquileres/recordatorios").json()["total"] == 6

    assert client.get("/api/v1/alquileres/recordatorios?dias=7").json()["total"] == 2
    assert client.get("/api/v1/alquileres/recordatorios?dias=0").status_code == 422


def test_get_exige_sesion(client):
    assert client.get("/api/v1/alquileres/recordatorios").status_code == 401
```

- [ ] **Step 2: Ver fallar**

Run: `cd src && python -m pytest tests/test_alquileres_recordatorios.py -q -k get`
Expected: FAIL con 404 (la ruta no existe todavía; ojo que 404 ≠ 401 en el segundo test).

- [ ] **Step 3: Endpoint** — en `src/app/platform/alquileres/router.py`, importar `recordatorios` en la línea `from app.platform.alquileres import cobros, gastos, liquidaciones, service` → `from app.platform.alquileres import cobros, gastos, liquidaciones, recordatorios, service`, sumar `Recordatorios` al import de schemas, y agregar después del endpoint `/resumen`:

```python
@router.get("/recordatorios", response_model=Recordatorios, dependencies=SOLO_STAFF)
def listar_recordatorios(
    dias: int | None = Query(default=None, ge=1, le=365),
    db: Session = Depends(get_db),
) -> Recordatorios:
    """Qué hay que atender en los próximos `dias` (default: el de la inmobiliaria)."""
    if dias is None:
        dias = inmobiliaria_service.obtener(db).dias_aviso_recordatorios
    return recordatorios.listar(db, date.today(), dias)
```

- [ ] **Step 4: Correr**

Run: `cd src && python -m pytest tests/test_alquileres_recordatorios.py -q && ruff check app tests`
Expected: 6 PASS.

---

## Task 4: Email diario — token, destinatarios, texto y `POST /enviar`

**Files:**
- Modify: `src/app/platform/auth/dependencies.py`
- Modify: `src/app/platform/alquileres/recordatorios.py` (agregar funciones)
- Modify: `src/app/platform/alquileres/router.py`
- Modify: `src/tests/test_alquileres_recordatorios.py`

**Interfaces:**
- Consumes: `app.email.enviar_email(destinatario, asunto, cuerpo, adjuntos=())`, `app.email.EmailNoEnviado`, `cobros.email_configurado_o_409()`, `recibos.firma(inmobiliaria)`, `app.formato.formato_moneda`.
- Produces: `require_token_recordatorios` (dependencia FastAPI); `recordatorios.destinatarios_staff(db) -> list[str]`, `recordatorios.asunto_email(r, inmobiliaria) -> str`, `recordatorios.texto_email(r, inmobiliaria) -> str`, `recordatorios.enviar(db) -> EnvioRecordatorios`; `POST /api/v1/alquileres/recordatorios/enviar`.

- [ ] **Step 1: Tests** — al final de `src/tests/test_alquileres_recordatorios.py`:

```python
# ---------------------------------------------------------------------------
# POST /recordatorios/enviar
# ---------------------------------------------------------------------------

from app import email as modulo_email  # noqa: E402
from app.config import get_settings  # noqa: E402

URL_ENVIAR = "/api/v1/alquileres/recordatorios/enviar"


@pytest.fixture
def smtp_configurado(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "smtp_host", "smtp.ejemplo.com")
    monkeypatch.setattr(s, "smtp_user", "mambo")
    monkeypatch.setattr(s, "smtp_password", "clave")
    monkeypatch.setattr(s, "email_from", "Mambo <no-reply@mambo.com.ar>")


@pytest.fixture
def token(monkeypatch):
    monkeypatch.setattr(get_settings(), "recordatorios_token", "secreto")
    return {"X-Recordatorios-Token": "secreto"}


@pytest.fixture
def emails_enviados(monkeypatch):
    capturados: list[tuple] = []

    def _falso(destinatario, asunto, cuerpo, adjuntos=()):
        capturados.append((destinatario, asunto, cuerpo, list(adjuntos)))

    monkeypatch.setattr(modulo_email, "enviar_email", _falso)
    monkeypatch.setattr(recordatorios, "enviar_email", _falso)
    return capturados


def test_sin_token_configurado_es_404(client, monkeypatch, smtp_configurado):
    monkeypatch.setattr(get_settings(), "recordatorios_token", None)
    r = client.post(URL_ENVIAR, headers={"X-Recordatorios-Token": "lo-que-sea"})
    assert r.status_code == 404


def test_token_incorrecto_o_ausente_es_401(client, token, smtp_configurado):
    assert client.post(URL_ENVIAR).status_code == 401
    assert client.post(URL_ENVIAR, headers={"X-Recordatorios-Token": "otro"}).status_code == 401


def test_destinatarios_son_staff_y_admin_activos(db, crear_usuario):
    from datetime import UTC, datetime

    crear_usuario(email="admin@mambo.com.ar", roles=("admin",))
    crear_usuario(email="staff@mambo.com.ar", roles=("staff",))
    crear_usuario(email="ambos@mambo.com.ar", roles=("staff", "admin"))
    crear_usuario(email="inactivo@mambo.com.ar", roles=("staff",), is_active=False)
    crear_usuario(email="sinrol@mambo.com.ar", roles=())
    borrado = crear_usuario(email="borrado@mambo.com.ar", roles=("staff",))
    borrado.deleted_at = datetime.now(UTC)
    db.commit()

    assert recordatorios.destinatarios_staff(db) == [
        "admin@mambo.com.ar",
        "ambos@mambo.com.ar",
        "staff@mambo.com.ar",
    ]


def test_enviar_manda_la_bandeja_al_staff(
    client, db, crear_usuario, escenario, token, smtp_configurado, emails_enviados
):
    crear_usuario(email="staff@mambo.com.ar", roles=("staff",))

    r = client.post(URL_ENVIAR, headers=token)

    assert r.status_code == 200, r.text
    assert r.json() == {"enviado_a": ["admin@mambo.com.ar", "staff@mambo.com.ar"], "items": 5}
    assert len(emails_enviados) == 1
    destinatario, asunto, cuerpo, adjuntos = emails_enviados[0]
    assert destinatario == "admin@mambo.com.ar, staff@mambo.com.ar"
    assert asunto.startswith("Recordatorios Mambo Groups · ")
    assert asunto.endswith(" · 5 pendientes")
    assert adjuntos == []
    # Los cuatro grupos, en orden, y el atraso en días.
    posiciones = [
        cuerpo.index("COBROS VENCIDOS (1)"),
        cuerpo.index("COBROS POR VENCER (1)"),
        cuerpo.index("AJUSTES (2)"),
        cuerpo.index("CONTRATOS QUE TERMINAN (1)"),
    ]
    assert posiciones == sorted(posiciones)
    assert "Depto en La Plata · Ana Pérez" in cuerpo
    assert "vencido hace 5 días" in cuerpo
    assert "Ajuste ICL · previsto" in cuerpo and "atrasado 3 días" in cuerpo
    assert "vence en 10 días" in cuerpo
    assert "termina" in cuerpo and "en 25 días" in cuerpo
    assert "saldo $ 100.000,00" in cuerpo
    assert "monto actual $ 120.000,00" in cuerpo


def test_bandeja_vacia_no_manda_nada(client, crear_usuario, token, smtp_configurado, emails_enviados):
    crear_usuario()
    r = client.post(URL_ENVIAR, headers=token)
    assert r.status_code == 200
    assert r.json() == {"enviado_a": [], "items": 0}
    assert emails_enviados == []


def test_sin_smtp_es_409(client, escenario, token, monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "smtp_host", None)
    monkeypatch.setattr(s, "email_from", None)
    r = client.post(URL_ENVIAR, headers=token)
    assert r.status_code == 409
    assert "Email no configurado" in r.json()["detail"]


def test_sin_staff_es_409(client, db, escenario, token, smtp_configurado, emails_enviados):
    # El único usuario es el admin que creó el escenario: se lo desactiva.
    for u in db.query(recordatorios.User).all():
        u.is_active = False
    db.commit()
    r = client.post(URL_ENVIAR, headers=token)
    assert r.status_code == 409
    assert "staff" in r.json()["detail"]


def test_fallo_de_smtp_es_502(client, escenario, token, smtp_configurado, monkeypatch):
    def _explota(*args, **kwargs):
        raise modulo_email.EmailNoEnviado("se cortó")

    monkeypatch.setattr(recordatorios, "enviar_email", _explota)
    r = client.post(URL_ENVIAR, headers=token)
    assert r.status_code == 502
    assert "se cortó" in r.json()["detail"]
```

- [ ] **Step 2: Ver fallar**

Run: `cd src && python -m pytest tests/test_alquileres_recordatorios.py -q -k "enviar or token or destinatarios or 409 or 502 or vacia"`
Expected: FAIL (404 en la ruta, `AttributeError: destinatarios_staff`).

- [ ] **Step 3: Dependencia del token** — en `src/app/platform/auth/dependencies.py`, agregar `import hmac` arriba, `Header` al import de fastapi (`from fastapi import Cookie, Depends, Header, HTTPException, status`), `from app.config import get_settings`, y al final:

```python
def require_token_recordatorios(
    token: str | None = Header(default=None, alias="X-Recordatorios-Token"),
) -> None:
    """Autentica al cron que dispara el email diario de recordatorios.

    No usa la cookie de sesión porque quien llama no es una persona. Sin
    `RECORDATORIOS_TOKEN` en el servidor el endpoint responde 404, no 401: así
    no se anuncia que existe algo que abrir.
    """
    esperado = get_settings().recordatorios_token
    if not esperado:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")
    if not token or not hmac.compare_digest(token.encode(), esperado.encode()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
```

- [ ] **Step 4: Envío** — en `src/app/platform/alquileres/recordatorios.py`, sumar a los imports:

```python
from fastapi import HTTPException, status

from app.config import get_settings
from app.email import EmailNoEnviado, enviar_email
from app.formato import formato_moneda
from app.platform.alquileres import recibos
from app.platform.alquileres.schemas import EnvioRecordatorios
from app.platform.auth.models import Role, User, UserRole
from app.platform.inmobiliaria.models import Inmobiliaria
from app.platform.inmobiliaria.service import obtener as obtener_inmobiliaria
```

(fusionar con el import de `schemas` existente) y al final del archivo:

```python
# ---------------------------------------------------------------------------
# Email diario
# ---------------------------------------------------------------------------

ROLES_STAFF = ("staff", "admin")

_TITULO_GRUPO = {
    TipoRecordatorio.cobro_vencido: "COBROS VENCIDOS",
    TipoRecordatorio.cobro_por_vencer: "COBROS POR VENCER",
    TipoRecordatorio.ajuste: "AJUSTES",
    TipoRecordatorio.fin_contrato: "CONTRATOS QUE TERMINAN",
}


def destinatarios_staff(db: Session) -> list[str]:
    """Emails de los usuarios activos, no eliminados, con rol staff o admin."""
    filas = (
        db.query(User.email)
        .join(User.user_roles)
        .join(UserRole.role)
        .filter(
            User.is_active.is_(True),
            User.deleted_at.is_(None),
            Role.name.in_(ROLES_STAFF),
        )
        .distinct()
        .order_by(User.email)
        .all()
    )
    return [f[0] for f in filas]


def _en_dias(dias: int, futuro: str = "en", pasado: str = "hace") -> str:
    if dias == 0:
        return "hoy"
    if dias == 1:
        return "mañana"
    if dias < 0:
        return f"{pasado} {-dias} día{'' if dias == -1 else 's'}"
    return f"{futuro} {dias} días"


def _nombres(item: Recordatorio) -> str:
    return " y ".join(p.full_name for p in item.inquilinos)


def _linea(item: Recordatorio) -> str:
    fecha = item.fecha.strftime("%d/%m")
    monto = formato_moneda(item.monto, item.moneda) if item.monto is not None else ""
    if item.tipo == TipoRecordatorio.cobro_vencido:
        return (
            f"- {item.propiedad.titulo} · {_nombres(item)} · {item.detalle} · saldo {monto}"
            f" · vencido {_en_dias(item.dias)}"
        )
    if item.tipo == TipoRecordatorio.cobro_por_vencer:
        return (
            f"- {item.propiedad.titulo} · {_nombres(item)} · {item.detalle} · {monto}"
            f" · vence {_en_dias(item.dias)} ({fecha})"
        )
    if item.tipo == TipoRecordatorio.ajuste:
        return (
            f"- {item.propiedad.titulo} · {item.detalle} · previsto {fecha}"
            f" ({_en_dias(item.dias, pasado='atrasado')}) · monto actual {monto}"
        )
    return (
        f"- {item.propiedad.titulo} · {_nombres(item)} · termina {fecha} ({_en_dias(item.dias)})"
    )


def asunto_email(r: Recordatorios, inmobiliaria: Inmobiliaria) -> str:
    return (
        f"Recordatorios {inmobiliaria.nombre} · {r.hoy.strftime('%d/%m/%Y')}"
        f" · {r.total} pendientes"
    )


def texto_email(r: Recordatorios, inmobiliaria: Inmobiliaria) -> str:
    lineas = [
        "Hola,",
        f"Esto es lo que hay que atender en los próximos {r.dias} días ({r.total} ítems).",
        "",
    ]
    for tipo in TipoRecordatorio:
        del_tipo = [i for i in r.items if i.tipo == tipo]
        if not del_tipo:
            continue
        lineas.append(f"{_TITULO_GRUPO[tipo]} ({len(del_tipo)})")
        lineas.extend(_linea(i) for i in del_tipo)
        lineas.append("")
    origenes = get_settings().cors_origins_lista
    if origenes:
        lineas.append(f"Panel: {origenes[0]}/admin/alquileres/recordatorios")
    lineas.append(recibos.firma(inmobiliaria))
    return "\n".join(lineas)


def enviar(db: Session) -> EnvioRecordatorios:
    """Manda la bandeja al staff. Sincrónico: el cron necesita saber si salió.

    Bandeja vacía → no se manda nada: un email diario que dice "nada" se deja de
    leer a la semana.
    """
    cobros_service.email_configurado_o_409()
    inmobiliaria = obtener_inmobiliaria(db)
    bandeja = listar(db, date.today(), inmobiliaria.dias_aviso_recordatorios)
    if bandeja.total == 0:
        return EnvioRecordatorios(enviado_a=[], items=0)

    destinatarios = destinatarios_staff(db)
    if not destinatarios:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="No hay usuarios staff con email"
        )
    try:
        enviar_email(
            ", ".join(destinatarios),
            asunto_email(bandeja, inmobiliaria),
            texto_email(bandeja, inmobiliaria),
        )
    except EmailNoEnviado as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"No se pudo enviar el email: {exc}",
        ) from exc
    return EnvioRecordatorios(enviado_a=destinatarios, items=bandeja.total)
```

- [ ] **Step 5: Endpoint** — en `router.py`, importar `require_token_recordatorios` junto a `get_current_user, require_role`, sumar `EnvioRecordatorios` al import de schemas, y después de `listar_recordatorios`:

```python
@router.post(
    "/recordatorios/enviar",
    response_model=EnvioRecordatorios,
    dependencies=[Depends(require_token_recordatorios)],
)
def enviar_recordatorios(db: Session = Depends(get_db)) -> EnvioRecordatorios:
    """Lo dispara el cron externo (GitHub Actions) una vez al día."""
    return recordatorios.enviar(db)
```

- [ ] **Step 6: Correr**

Run: `cd src && python -m pytest tests/test_alquileres_recordatorios.py tests/test_alquileres_envio.py -q && ruff check app tests`
Expected: todos PASS (el archivo de envío del 2b sigue verde: los fixtures son locales a cada archivo).

---

## Task 5: Workflow de GitHub Actions, `docs/despliegue.md` y verificación del backend

**Files:**
- Create: `.github/workflows/recordatorios.yml`
- Modify: `docs/despliegue.md`

- [ ] **Step 1: Workflow** — `.github/workflows/recordatorios.yml`:

```yaml
# Dispara el email diario de recordatorios de alquileres. Render free no tiene
# cron, así que el "reloj" vive acá. Secrets del repo: RECORDATORIOS_URL (la URL
# de la API en Render, sin barra final) y RECORDATORIOS_TOKEN (el mismo valor
# que la variable de entorno del servicio).
name: Recordatorios diarios

on:
  schedule:
    - cron: '0 11 * * *'   # 08:00 en Argentina (UTC-3)
  workflow_dispatch: {}

jobs:
  enviar:
    runs-on: ubuntu-latest
    steps:
      - name: POST /api/v1/alquileres/recordatorios/enviar
        run: |
          curl --fail-with-body -sS -X POST \
            --max-time 120 \
            -H "X-Recordatorios-Token: ${{ secrets.RECORDATORIOS_TOKEN }}" \
            "${{ secrets.RECORDATORIOS_URL }}/api/v1/alquileres/recordatorios/enviar"
```

- [ ] **Step 2: `docs/despliegue.md` — migración `0007`** — después de la sección "Cobros, recibos y liquidaciones (migración `0006`)", antes del `---` que la cierra:

```markdown
### Recordatorios (migración `0007`)

La revisión **`0007_recordatorios`** agrega `inmobiliaria.dias_aviso_recordatorios`
(default 30). Los recordatorios no se guardan: se calculan en cada request.
`alembic upgrade head` contra Supabase alcanza; después, push de la API y del
frontend.

**El email diario lo dispara GitHub Actions**, no Render (el plan free no tiene
cron). Tres pasos, una sola vez:

1. Generar un token: `python -c "import secrets; print(secrets.token_urlsafe(32))"`.
2. En Render, pestaña *Environment* del servicio: `RECORDATORIOS_TOKEN=<token>`.
   Sin esta variable el endpoint `POST /api/v1/alquileres/recordatorios/enviar`
   responde 404. Requiere además las `SMTP_*` (sin ellas responde 409).
3. En GitHub, *Settings → Secrets and variables → Actions*: `RECORDATORIOS_TOKEN`
   (el mismo valor) y `RECORDATORIOS_URL` (`https://<servicio>.onrender.com`,
   sin barra final).

El workflow [`.github/workflows/recordatorios.yml`](../.github/workflows/recordatorios.yml)
corre a las 08:00 de Argentina. Para probarlo: *Actions → Recordatorios diarios →
Run workflow*; el job queda verde si la API respondió 200 (con `items: 0` si no
había nada, en cuyo caso no se manda email) y rojo con el `detail` en el log si
no. Render free duerme el servicio: el primer request puede tardar ~30 s, el
`--max-time 120` lo cubre.
```

- [ ] **Step 3: Suite completa, lint, formato y migración**

Run: `cd src && python -m pytest tests/ -q && ruff check app tests && ruff format --check app tests`
Expected: todos PASS, ruff sin avisos. Si `ruff format --check` marca archivos nuevos, `ruff format app tests` y volver a correr.

Con `DATABASE_URL` apuntando a la base local en `head` (= `0006`):

```bash
cd src
alembic upgrade head          # aplica 0007_recordatorios
alembic check                 # "No new upgrade operations detected."
alembic downgrade 0006_alquileres_cobros
alembic upgrade head
```

Expected: las cuatro sin error.

---

## Task 6: Frontend — tipos, cliente de API y helpers

**Files:**
- Modify: `client/src/types/alquileres.ts` (al final)
- Modify: `client/src/api/alquileres.ts`
- Modify: `client/src/lib/alquileres.ts` (al final), `client/src/lib/alquileres.test.ts`
- Modify: `client/src/types/inmobiliaria.ts`

**Interfaces:**
- Produces: `TipoRecordatorio`, `Recordatorio`, `Recordatorios` (types); `alquileresApi.recordatorios(dias?: number): Promise<Recordatorios>`; `ORDEN_TIPOS_RECORDATORIO: TipoRecordatorio[]`, `etiquetaTipoRecordatorio(tipo): string`, `chipRecordatorio(item: Pick<Recordatorio, 'dias'>): ChipCobro`; `Inmobiliaria.dias_aviso_recordatorios: number`, `Inmobiliaria.recordatorios_configurado: boolean`.

- [ ] **Step 1: Tests de helpers** — en `client/src/lib/alquileres.test.ts`, sumar `chipRecordatorio, etiquetaTipoRecordatorio` al import y al final:

```ts
describe('chipRecordatorio', () => {
  it('atrasado en rojo, hoy/mañana/≤7 en naranja, lejos en gris', () => {
    expect(chipRecordatorio({ dias: -3 })).toEqual({ texto: 'Hace 3 días', color: 'baja' })
    expect(chipRecordatorio({ dias: -1 })).toEqual({ texto: 'Hace 1 día', color: 'baja' })
    expect(chipRecordatorio({ dias: 0 })).toEqual({ texto: 'Hoy', color: 'espera' })
    expect(chipRecordatorio({ dias: 1 })).toEqual({ texto: 'Mañana', color: 'espera' })
    expect(chipRecordatorio({ dias: 5 })).toEqual({ texto: 'En 5 días', color: 'espera' })
    expect(chipRecordatorio({ dias: 20 })).toEqual({ texto: 'En 20 días', color: 'neutro' })
  })
})

describe('etiquetaTipoRecordatorio', () => {
  it('traduce los cuatro tipos', () => {
    expect(etiquetaTipoRecordatorio('cobro_vencido')).toBe('Cobros vencidos')
    expect(etiquetaTipoRecordatorio('cobro_por_vencer')).toBe('Cobros por vencer')
    expect(etiquetaTipoRecordatorio('ajuste')).toBe('Ajustes')
    expect(etiquetaTipoRecordatorio('fin_contrato')).toBe('Contratos que terminan')
  })
})
```

- [ ] **Step 2: Ver fallar**

Run: `cd client && npx vitest run --pool=threads src/lib/alquileres.test.ts`
Expected: FAIL (`chipRecordatorio is not a function` / error de tipos).

- [ ] **Step 3: Tipos** — al final de `client/src/types/alquileres.ts`:

```ts
// ---------------------------------------------------------------------------
// Recordatorios (2c)
// ---------------------------------------------------------------------------

export type TipoRecordatorio = 'cobro_vencido' | 'cobro_por_vencer' | 'ajuste' | 'fin_contrato'

export interface Recordatorio {
  tipo: TipoRecordatorio
  fecha: string
  /** Negativo = atrasado. */
  dias: number
  contrato_id: number
  /** cobro_id / ajuste_id / contrato_id según el tipo. */
  referencia_id: number
  propiedad: PropiedadBrief
  inquilinos: ParteContrato[]
  moneda: string
  /** Saldo del cobro; monto vigente en ajuste y fin_contrato. */
  monto: string | null
  detalle: string
}

export interface Recordatorios {
  hoy: string
  dias: number
  total: number
  por_tipo: Record<TipoRecordatorio, number>
  items: Recordatorio[]
}
```

En `client/src/types/inmobiliaria.ts`, después de `dias_gracia: number`:

```ts
  /** Ventana por defecto de la bandeja de recordatorios y del email diario. */
  dias_aviso_recordatorios: number
```

y después de `email_configurado: boolean`:

```ts
  /** Solo lectura: si el servidor tiene `RECORDATORIOS_TOKEN` y `SMTP_*` para el email diario. */
  recordatorios_configurado: boolean
```

y en `InmobiliariaUpdatePayload` sumar `'recordatorios_configurado'` al `Omit`.

- [ ] **Step 4: API** — en `client/src/api/alquileres.ts`, sumar `Recordatorios` al import de tipos y, después de `resumen:`:

```ts
  recordatorios:       (dias?: number)                                => api.get<Recordatorios>(`${RAIZ}/recordatorios${construirQuery({ dias })}`),
```

- [ ] **Step 5: Helpers** — al final de `client/src/lib/alquileres.ts`, sumar `Recordatorio, TipoRecordatorio` al import de tipos y:

```ts
// ---------------------------------------------------------------------------
// Recordatorios (2c)
// ---------------------------------------------------------------------------

/** Mismo orden que el email diario. */
export const ORDEN_TIPOS_RECORDATORIO: TipoRecordatorio[] = [
  'cobro_vencido', 'cobro_por_vencer', 'ajuste', 'fin_contrato',
]

const LABEL_TIPO_RECORDATORIO: Record<TipoRecordatorio, string> = {
  cobro_vencido:    'Cobros vencidos',
  cobro_por_vencer: 'Cobros por vencer',
  ajuste:           'Ajustes',
  fin_contrato:     'Contratos que terminan',
}

export function etiquetaTipoRecordatorio(tipo: TipoRecordatorio): string {
  return LABEL_TIPO_RECORDATORIO[tipo]
}

/** Chip temporal de un recordatorio: rojo si ya pasó, naranja si es inminente, gris si falta. */
export function chipRecordatorio(item: Pick<Recordatorio, 'dias'>): ChipCobro {
  const d = item.dias
  if (d < 0)  return { texto: `Hace ${-d} día${d === -1 ? '' : 's'}`, color: 'baja' }
  if (d === 0) return { texto: 'Hoy', color: 'espera' }
  if (d === 1) return { texto: 'Mañana', color: 'espera' }
  return { texto: `En ${d} días`, color: d <= DIAS_AVISO_VENCIMIENTO ? 'espera' : 'neutro' }
}
```

- [ ] **Step 6: Correr**

Run: `cd client && npx vitest run --pool=threads src/lib/alquileres.test.ts && npx tsc --noEmit`
Expected: PASS; `tsc` puede marcar `Configuracion.test.tsx` porque `INMO` no tiene los campos nuevos — se arregla en la Task 10; si molesta ahora, agregar `dias_aviso_recordatorios: 30, recordatorios_configurado: false` al objeto `INMO` de ese test.

---

## Task 7: `BandejaRecordatorios` y ancla en la fila de cobros

**Files:**
- Create: `client/src/components/crm/BandejaRecordatorios/BandejaRecordatorios.tsx`, `BandejaRecordatorios.css`, `BandejaRecordatorios.test.tsx`
- Modify: `client/src/components/crm/TablaCobros/TablaCobros.tsx` (función `FilaCobro`, primer `<tr>`)

**Interfaces:**
- Consumes: `Recordatorios`, `ORDEN_TIPOS_RECORDATORIO`, `etiquetaTipoRecordatorio`, `chipRecordatorio`, `formatearFecha`, `formatearMonto`, `Badge`.
- Produces: `<BandejaRecordatorios datos={Recordatorios} compacto?: boolean />`. Links: `/admin/alquileres/{contrato_id}` y, para `cobro_*`, `/admin/alquileres/{contrato_id}#cobro-{referencia_id}`.

- [ ] **Step 1: Test** — `BandejaRecordatorios.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import BandejaRecordatorios from './BandejaRecordatorios'
import type { Recordatorio, Recordatorios } from '../../../types/alquileres'

const base = {
  contrato_id: 3, propiedad: { id: 7, titulo: 'Depto en La Plata', estado_comercial: 'cerrada' as const },
  inquilinos: [{ person_id: 1, full_name: 'Ana Pérez', rol: 'inquilino' as const }], moneda: 'ARS',
}

const ITEMS: Recordatorio[] = [
  { ...base, tipo: 'cobro_vencido',    fecha: '2026-09-13', dias: -5, referencia_id: 101, monto: '120000.00', detalle: 'Agosto 2026' },
  { ...base, tipo: 'ajuste',           fecha: '2026-09-15', dias: -3, referencia_id: 55,  monto: '120000.00', detalle: 'Ajuste ICL' },
  { ...base, tipo: 'cobro_por_vencer', fecha: '2026-09-28', dias: 10, referencia_id: 102, monto: '120000.00', detalle: 'Septiembre 2026' },
  { ...base, tipo: 'fin_contrato',     fecha: '2026-10-13', dias: 25, referencia_id: 3,   monto: '120000.00', detalle: 'Termina el contrato' },
]

function datos(items: Recordatorio[], dias = 30): Recordatorios {
  const por_tipo = { cobro_vencido: 0, cobro_por_vencer: 0, ajuste: 0, fin_contrato: 0 }
  items.forEach(i => { por_tipo[i.tipo] += 1 })
  return { hoy: '2026-09-18', dias, total: items.length, por_tipo, items }
}

const renderBandeja = (d: Recordatorios, compacto = false) =>
  render(<MemoryRouter><BandejaRecordatorios datos={d} compacto={compacto} /></MemoryRouter>)

it('agrupa por tipo en el orden del email, con chip y link a la ficha', () => {
  renderBandeja(datos(ITEMS))
  const titulos = screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)
  expect(titulos).toEqual(['Cobros vencidos (1)', 'Cobros por vencer (1)', 'Ajustes (1)', 'Contratos que terminan (1)'])

  const vencidos = screen.getByRole('region', { name: 'Cobros vencidos (1)' })
  expect(within(vencidos).getByRole('link', { name: 'Depto en La Plata' }))
    .toHaveAttribute('href', '/admin/alquileres/3#cobro-101')
  expect(within(vencidos).getByText('Hace 5 días')).toBeInTheDocument()
  expect(within(vencidos).getByText('ARS 120.000')).toBeInTheDocument()
  expect(within(vencidos).getByText('Agosto 2026')).toBeInTheDocument()

  const fin = screen.getByRole('region', { name: 'Contratos que terminan (1)' })
  expect(within(fin).getByRole('link', { name: 'Depto en La Plata' })).toHaveAttribute('href', '/admin/alquileres/3')
  expect(within(fin).getByText('En 25 días')).toBeInTheDocument()
})

it('vacía: lo dice con la ventana', () => {
  renderBandeja(datos([], 60))
  expect(screen.getByText('Nada pendiente en los próximos 60 días.')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { level: 3 })).toBeNull()
})

it('compacta: corta a 8 y ofrece ver todos', () => {
  const muchos = Array.from({ length: 11 }, (_, i) => ({ ...ITEMS[0], referencia_id: 200 + i, fecha: `2026-09-0${(i % 9) + 1}` }))
  renderBandeja(datos(muchos), true)
  expect(screen.getAllByRole('listitem')).toHaveLength(8)
  expect(screen.getByRole('link', { name: 'Ver los 11' })).toHaveAttribute('href', '/admin/alquileres/recordatorios')
})
```

- [ ] **Step 2: Ver fallar**

Run: `cd client && npx vitest run --pool=threads src/components/crm/BandejaRecordatorios`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Componente** — `BandejaRecordatorios.tsx`:

```tsx
import { Link } from 'react-router-dom'
import type { Recordatorio, Recordatorios } from '../../../types/alquileres'
import Badge from '../../Badge'
import { formatearFecha, formatearMonto } from '../../../lib/formato'
import { ORDEN_TIPOS_RECORDATORIO, chipRecordatorio, etiquetaTipoRecordatorio } from '../../../lib/alquileres'
import './BandejaRecordatorios.css'

// En el dashboard se muestran los primeros N; el resto queda detrás de "Ver los X".
const MAXIMO_COMPACTO = 8

interface Props {
  datos: Recordatorios
  /** Dashboard: recorta a `MAXIMO_COMPACTO` ítems y linkea a la página completa. */
  compacto?: boolean
}

function hrefDe(item: Recordatorio): string {
  const ficha = `/admin/alquileres/${item.contrato_id}`
  // La ficha renderiza cada período con `id="cobro-{id}"`: el ancla lleva a la fila.
  return item.tipo === 'cobro_vencido' || item.tipo === 'cobro_por_vencer'
    ? `${ficha}#cobro-${item.referencia_id}`
    : ficha
}

/**
 * La bandeja de "qué hay que atender": cobros vencidos y por vencer, ajustes
 * pendientes y contratos que terminan, agrupados en el mismo orden que el
 * email diario. Cada fila lleva a la ficha del contrato.
 */
export default function BandejaRecordatorios({ datos, compacto = false }: Props) {
  if (datos.total === 0) {
    return <p className="lista-estado">Nada pendiente en los próximos {datos.dias} días.</p>
  }
  const visibles = compacto ? datos.items.slice(0, MAXIMO_COMPACTO) : datos.items

  return (
    <div className="bandeja">
      {ORDEN_TIPOS_RECORDATORIO.map(tipo => {
        const items = visibles.filter(i => i.tipo === tipo)
        if (items.length === 0) return null
        const titulo = `${etiquetaTipoRecordatorio(tipo)} (${datos.por_tipo[tipo]})`
        return (
          <section key={tipo} className="bandeja-grupo" aria-labelledby={`bandeja-${tipo}`}>
            <h3 id={`bandeja-${tipo}`} className="bandeja-titulo">{titulo}</h3>
            <ul className="bandeja-lista">
              {items.map(item => {
                const chip = chipRecordatorio(item)
                return (
                  <li key={`${item.tipo}-${item.referencia_id}`} className="bandeja-item">
                    <div className="bandeja-item-principal">
                      <Link to={hrefDe(item)} className="tabla-titulo">{item.propiedad.titulo}</Link>
                      {item.inquilinos.length > 0 && (
                        <span className="bandeja-inquilinos">{item.inquilinos.map(p => p.full_name).join(' y ')}</span>
                      )}
                    </div>
                    <div className="bandeja-item-detalle">
                      <span>{item.detalle}</span>
                      <span>{formatearFecha(item.fecha)}</span>
                      {item.monto !== null && <span>{formatearMonto(item.monto, item.moneda)}</span>}
                      <Badge value={item.tipo} color={chip.color} label={chip.texto} />
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
      {compacto && datos.total > MAXIMO_COMPACTO && (
        <Link to="/admin/alquileres/recordatorios" className="btn btn-outline bandeja-ver-todos">
          Ver los {datos.total}
        </Link>
      )}
    </div>
  )
}
```

> Si `screen.getByRole('region', { name })` no encuentra la sección, es porque `<section>` solo tiene rol `region` con nombre accesible: el `aria-labelledby` de arriba lo garantiza.

`BandejaRecordatorios.css`:

```css
.bandeja { display: flex; flex-direction: column; gap: 1rem; }
.bandeja-titulo { margin: 0 0 0.4rem; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); }
.bandeja-lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
.bandeja-item {
  display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 2fr); gap: 0.5rem 1rem; align-items: center;
  padding: 0.5rem 0.75rem; border: 1px solid var(--border); border-radius: 8px; background: var(--surface);
}
.bandeja-item-principal { display: flex; flex-direction: column; min-width: 0; }
.bandeja-inquilinos { color: var(--text-muted); font-size: 0.85rem; }
.bandeja-item-detalle { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; align-items: center; justify-content: flex-end; font-size: 0.9rem; }
.bandeja-ver-todos { align-self: flex-start; }

@media (max-width: 400px) {
  .bandeja-item { grid-template-columns: 1fr; }
  .bandeja-item-detalle { justify-content: flex-start; }
}
```

(Usar los nombres de variables CSS que ya use `TablaCobros.css`; si `--border`/`--surface` no existen, copiar los de ahí.)

- [ ] **Step 4: Ancla en `TablaCobros`** — en `client/src/components/crm/TablaCobros/TablaCobros.tsx`, función `FilaCobro`, el primer `<tr>`:

```tsx
      <tr id={`cobro-${c.id}`} className={c.estado === 'anulado' ? 'cobro-anulado' : undefined}>
```

- [ ] **Step 5: Correr**

Run: `cd client && npx vitest run --pool=threads src/components/crm/BandejaRecordatorios src/components/crm/TablaCobros && npx tsc --noEmit`
Expected: PASS.

---

## Task 8: Página `/admin/alquileres/recordatorios`, ruta y menú

**Files:**
- Create: `client/src/pages/admin/alquileres/Recordatorios.tsx`, `Recordatorios.test.tsx`
- Modify: `client/src/App.tsx` (bloque `<Route path="alquileres">`), `client/src/layouts/AdminLayout.tsx` (grupo CRM)

**Interfaces:**
- Consumes: `alquileresApi.recordatorios`, `BandejaRecordatorios`, `etiquetaTipoRecordatorio`, `ORDEN_TIPOS_RECORDATORIO`.

- [ ] **Step 1: Test** — `Recordatorios.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import RecordatoriosPagina from './Recordatorios'
import { alquileresApi } from '../../../api/alquileres'
import type { Recordatorios } from '../../../types/alquileres'

vi.mock('../../../api/alquileres', () => ({ alquileresApi: { recordatorios: vi.fn() } }))

const DATOS: Recordatorios = {
  hoy: '2026-09-18', dias: 30, total: 1,
  por_tipo: { cobro_vencido: 1, cobro_por_vencer: 0, ajuste: 0, fin_contrato: 0 },
  items: [{
    tipo: 'cobro_vencido', fecha: '2026-09-13', dias: -5, contrato_id: 3, referencia_id: 101,
    propiedad: { id: 7, titulo: 'Depto en La Plata', estado_comercial: 'cerrada' },
    inquilinos: [{ person_id: 1, full_name: 'Ana Pérez', rol: 'inquilino' }],
    moneda: 'ARS', monto: '120000.00', detalle: 'Agosto 2026',
  }],
}

beforeEach(() => {
  vi.mocked(alquileresApi.recordatorios).mockImplementation(async dias => ({ ...DATOS, dias: dias ?? 30 }))
})

const renderPagina = (url = '/admin/alquileres/recordatorios') => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes><Route path="/admin/alquileres/recordatorios" element={<RecordatoriosPagina />} /></Routes>
  </MemoryRouter>,
)

it('sin dias en la URL pide el default y muestra la bandeja con los conteos', async () => {
  renderPagina()
  expect(await screen.findByRole('link', { name: 'Depto en La Plata' })).toBeInTheDocument()
  expect(alquileresApi.recordatorios).toHaveBeenCalledWith(undefined)
  expect(screen.getByText('Cobros vencidos: 1')).toBeInTheDocument()
  expect(screen.getByText('Ajustes: 0')).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Próximos 30 días')
})

it('lee dias de la URL y el selector lo cambia', async () => {
  const usuario = userEvent.setup()
  renderPagina('/admin/alquileres/recordatorios?dias=7')
  await screen.findByRole('link', { name: 'Depto en La Plata' })
  expect(alquileresApi.recordatorios).toHaveBeenCalledWith(7)

  await usuario.selectOptions(screen.getByLabelText('Ventana'), '90')
  await waitFor(() => expect(alquileresApi.recordatorios).toHaveBeenCalledWith(90))
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Próximos 90 días')
})

it('muestra el error de carga', async () => {
  vi.mocked(alquileresApi.recordatorios).mockRejectedValue(new Error('Sin conexión'))
  renderPagina()
  expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión')
})
```

- [ ] **Step 2: Ver fallar**

Run: `cd client && npx vitest run --pool=threads src/pages/admin/alquileres/Recordatorios.test.tsx`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Página** — `Recordatorios.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { alquileresApi } from '../../../api/alquileres'
import type { Recordatorios } from '../../../types/alquileres'
import BandejaRecordatorios from '../../../components/crm/BandejaRecordatorios/BandejaRecordatorios'
import { ORDEN_TIPOS_RECORDATORIO, etiquetaTipoRecordatorio } from '../../../lib/alquileres'

const VENTANAS = [7, 30, 60, 90]

/**
 * La bandeja completa. `dias` vive en la query string para poder linkearla;
 * sin él se usa la ventana configurada en la inmobiliaria (la manda el backend).
 */
export default function RecordatoriosPagina() {
  const [params, setParams] = useSearchParams()
  const diasParam = params.get('dias')
  const dias = diasParam ? Number(diasParam) : undefined

  const [datos, setDatos]     = useState<Recordatorios | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    alquileresApi.recordatorios(dias)
      .then(setDatos)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [dias])

  const cambiarVentana = (valor: string) => {
    const nuevos = new URLSearchParams(params)
    nuevos.set('dias', valor)
    setParams(nuevos, { replace: true })
  }

  // El selector marca la ventana efectiva aunque no esté en la URL.
  const ventana = dias ?? datos?.dias ?? 30
  const opciones = VENTANAS.includes(ventana) ? VENTANAS : [...VENTANAS, ventana].sort((a, b) => a - b)

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <span className="section-label">Alquileres</span>
          <h1>Recordatorios · Próximos {ventana} días</h1>
        </div>
        <Link to="/admin/alquileres/cobros" className="btn btn-outline">Ver cobros</Link>
      </div>

      <div className="admin-card filtros-bar">
        <label className="filtros-label">
          Ventana
          <select value={String(ventana)} onChange={e => cambiarVentana(e.target.value)}>
            {opciones.map(v => <option key={v} value={v}>{v} días</option>)}
          </select>
        </label>
        {datos && (
          <div className="filtros-resumen">
            {ORDEN_TIPOS_RECORDATORIO.map(tipo => (
              <span key={tipo} className="badge badge-neutro">
                {etiquetaTipoRecordatorio(tipo)}: {datos.por_tipo[tipo]}
              </span>
            ))}
          </div>
        )}
      </div>

      {loading && <p className="lista-estado">Cargando...</p>}
      {error   && <p className="lista-estado lista-error" role="alert">{error}</p>}
      {!loading && !error && datos && (
        <div className="admin-card">
          <BandejaRecordatorios datos={datos} />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Ruta y menú**

En `client/src/App.tsx`, importar junto a las otras páginas de alquileres:

```tsx
import RecordatoriosPagina  from './pages/admin/alquileres/Recordatorios'
```

y dentro de `<Route path="alquileres">`, después de `cobros`:

```tsx
                <Route path="recordatorios" element={<RecordatoriosPagina />} />
```

En `client/src/layouts/AdminLayout.tsx`, grupo CRM, antes de la entrada `Cobros`:

```tsx
      { to: '/admin/alquileres/recordatorios', label: 'Recordatorios', end: false },
```

- [ ] **Step 5: Correr**

Run: `cd client && npx vitest run --pool=threads src/pages/admin/alquileres src/layouts && npx tsc --noEmit`
Expected: PASS.

---

## Task 9: Dashboard — tile y bandeja compacta

**Files:**
- Modify: `client/src/pages/admin/Dashboard.tsx`, `client/src/pages/admin/Dashboard.test.tsx`

- [ ] **Step 1: Test** — en `Dashboard.test.tsx`, sumar `recordatorios: vi.fn()` al mock de `alquileresApi`, en `beforeEach`:

```ts
  vi.mocked(alquileresApi.recordatorios).mockResolvedValue({
    hoy: '2026-09-18', dias: 30, total: 2,
    por_tipo: { cobro_vencido: 1, cobro_por_vencer: 0, ajuste: 1, fin_contrato: 0 },
    items: [
      { tipo: 'cobro_vencido', fecha: '2026-09-13', dias: -5, contrato_id: 3, referencia_id: 101,
        propiedad: { id: 7, titulo: 'Depto en La Plata', estado_comercial: 'cerrada' },
        inquilinos: [{ person_id: 1, full_name: 'Ana Pérez', rol: 'inquilino' }],
        moneda: 'ARS', monto: '120000.00', detalle: 'Agosto 2026' },
      { tipo: 'ajuste', fecha: '2026-09-15', dias: -3, contrato_id: 3, referencia_id: 55,
        propiedad: { id: 7, titulo: 'Depto en La Plata', estado_comercial: 'cerrada' },
        inquilinos: [{ person_id: 1, full_name: 'Ana Pérez', rol: 'inquilino' }],
        moneda: 'ARS', monto: '120000.00', detalle: 'Ajuste ICL' },
    ],
  })
```

y al final:

```ts
it('el tile de recordatorios cuenta la bandeja y el bloque la muestra compacta', async () => {
  render(<MemoryRouter><Dashboard /></MemoryRouter>)
  const tile = await screen.findByRole('link', { name: /^Recordatorios/ })
  expect(tile).toHaveTextContent('2')
  expect(tile).toHaveAttribute('href', '/admin/alquileres/recordatorios')
  expect(screen.getByRole('heading', { level: 2, name: 'Próximos 30 días' })).toBeInTheDocument()
  expect(screen.getByText('Cobros vencidos (1)')).toBeInTheDocument()
  expect(screen.getByText('Ajuste ICL')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Ver todos' })).toHaveAttribute('href', '/admin/alquileres/recordatorios')
})
```

- [ ] **Step 2: Ver fallar**

Run: `cd client && npx vitest run --pool=threads src/pages/admin/Dashboard.test.tsx`
Expected: el test nuevo FAIL (no hay tile "Recordatorios").

- [ ] **Step 3: Dashboard** — en `Dashboard.tsx`:

Imports:

```tsx
import { Link } from 'react-router-dom'
import type { Recordatorios, ResumenAlquileres } from '../../types/alquileres'
import BandejaRecordatorios from '../../components/crm/BandejaRecordatorios/BandejaRecordatorios'
```

Estado, después de `resumen`:

```tsx
  const [recordatorios, setRecordatorios]             = useState<Recordatorios | null>(null)
```

En el `useEffect`, después de `alquileresApi.resumen()...`:

```tsx
    // Sin `dias`: la ventana es la configurada en la inmobiliaria.
    alquileresApi.recordatorios().then(setRecordatorios).catch(() => setRecordatorios(null))
```

Tile, después del de "Liquidaciones sin emitir":

```tsx
        <StatTile
          label="Recordatorios"
          valor={recordatorios?.total ?? 0}
          tono={recordatorios && recordatorios.total > 0 ? 'espera' : 'ok'}
          to="/admin/alquileres/recordatorios"
        />
```

Reemplazar el card "Bienvenido…" por:

```tsx
      <div className="admin-card" style={{ marginTop: '1.25rem' }}>
        <div className="admin-page-header" style={{ marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0 }}>Próximos {recordatorios?.dias ?? 30} días</h2>
          <Link to="/admin/alquileres/recordatorios" className="btn btn-outline">Ver todos</Link>
        </div>
        {recordatorios
          ? <BandejaRecordatorios datos={recordatorios} compacto />
          : <p className="lista-estado">Cargando...</p>}
      </div>
```

- [ ] **Step 4: Correr**

Run: `cd client && npx vitest run --pool=threads src/pages/admin/Dashboard.test.tsx && npx tsc --noEmit`
Expected: PASS (los tests viejos también: el tile "Recordatorios" no colisiona con `/Cobros vencidos/`).

---

## Task 10: Configuración — campo e indicador

**Files:**
- Modify: `client/src/pages/admin/configuracion/Configuracion.tsx`, `Configuracion.test.tsx`

- [ ] **Step 1: Test** — en `Configuracion.test.tsx`, sumar al objeto `INMO`: `dias_aviso_recordatorios: 30, recordatorios_configurado: false,` y al final:

```tsx
it('guarda los días de aviso y muestra si el email diario está configurado', async () => {
  const usuario = userEvent.setup()
  vi.mocked(inmobiliariaApi.obtener).mockResolvedValue({ ...INMO, recordatorios_configurado: true })
  vi.mocked(inmobiliariaApi.actualizar).mockResolvedValue({ ...INMO, dias_aviso_recordatorios: 60 })
  render(<Configuracion />)

  await screen.findByDisplayValue('Mambo Groups')
  expect(screen.getByTestId('estado-recordatorios')).toHaveTextContent('Email diario de recordatorios: configurado')
  await usuario.clear(screen.getByLabelText('Días de aviso de recordatorios'))
  await usuario.type(screen.getByLabelText('Días de aviso de recordatorios'), '60')
  await usuario.click(screen.getByRole('button', { name: 'Guardar' }))

  await waitFor(() =>
    expect(inmobiliariaApi.actualizar).toHaveBeenCalledWith(expect.objectContaining({ dias_aviso_recordatorios: 60 })),
  )
})

it('sin token avisa que el email diario no está configurado', async () => {
  vi.mocked(inmobiliariaApi.obtener).mockResolvedValue(INMO)
  render(<Configuracion />)
  await screen.findByDisplayValue('Mambo Groups')
  expect(screen.getByTestId('estado-recordatorios'))
    .toHaveTextContent('no configurado (definir RECORDATORIOS_TOKEN y SMTP_* en el servidor)')
})
```

- [ ] **Step 2: Ver fallar**

Run: `cd client && npx vitest run --pool=threads src/pages/admin/configuracion`
Expected: los dos nuevos FAIL.

- [ ] **Step 3: Configuración** — en `Configuracion.tsx`:

`Campo` suma `| 'dias_aviso_recordatorios'`. `CAMPOS` suma, después de `dias_gracia`:

```tsx
  { campo: 'dias_aviso_recordatorios', label: 'Días de aviso de recordatorios', tipo: 'number', step: '1' },
```

`VACIO` suma `dias_aviso_recordatorios: '30'`. En el `setForm` del `useEffect`, después de `dias_gracia:`:

```tsx
          dias_aviso_recordatorios: String(i.dias_aviso_recordatorios),
```

En `guardar`, después de `dias_gracia:`:

```tsx
        dias_aviso_recordatorios: form.dias_aviso_recordatorios ? Number(form.dias_aviso_recordatorios) : 30,
```

El `min` del input: cambiar `min={tipo === 'number' ? 0 : undefined}` por `min={tipo === 'number' ? (campo === 'dias_aviso_recordatorios' ? 1 : 0) : undefined}`.

Debajo del `<p data-testid="estado-email">`:

```tsx
        <p className="form-hint" data-testid="estado-recordatorios">
          {datos?.recordatorios_configurado
            ? 'Email diario de recordatorios: configurado. Sale cada mañana a todo el staff con lo que vence en los próximos días de aviso.'
            : 'Email diario de recordatorios: no configurado (definir RECORDATORIOS_TOKEN y SMTP_* en el servidor).'}
        </p>
```

Y al `form-hint` del punitorio sumarle una oración: `Los días de aviso son la ventana de la bandeja de recordatorios del dashboard y del email diario.`

- [ ] **Step 4: Correr**

Run: `cd client && npx vitest run --pool=threads src/pages/admin/configuracion && npx tsc --noEmit`
Expected: PASS.

---

## Task 11: Verificación final, mapa y reporte

**Files:**
- Modify: `docs/superpowers/specs/2026-09-11-mapa-de-funcionalidades.md`
- Verify: todo lo anterior

- [ ] **Step 1: Suites completas**

Run: `cd src && python -m pytest tests/ -q && ruff check app tests && ruff format --check app tests && alembic check`
Expected: PASS, limpio, "No new upgrade operations detected."

Run: `cd client && npm test && npx tsc --noEmit && npm run build`
Expected: PASS, sin errores de tipos, build OK.

- [ ] **Step 2: Pasada a mano**

API (`uvicorn app.main:app --reload --port 8000`, `STORAGE_BACKEND=local`) y panel (`npm run dev`) levantados, logueado como admin:

1. Crear un contrato administrado con `fecha_inicio` hace 3 meses, `fecha_fin` en 20 días, índice ICL, frecuencia 3, `dia_vencimiento` 10. Ir al dashboard: el tile "Recordatorios" cuenta > 0 y el bloque "Próximos 30 días" muestra los cobros vencidos, el próximo por vencer, el ajuste pendiente y "Termina el contrato".
2. `/admin/alquileres/recordatorios?dias=7`: lo que está a más de 7 días desaparece; lo atrasado sigue. Cambiar el selector a 90 y ver la URL actualizada.
3. Click en un cobro vencido: la ficha del contrato abre y el navegador se posiciona en la fila del período (`#cobro-{id}`).
4. Configuración: cambiar "Días de aviso de recordatorios" a 60 y guardar; el dashboard pasa a "Próximos 60 días".
5. En el `.env` de la raíz: `RECORDATORIOS_TOKEN=prueba` y las cinco `SMTP_*` de una cuenta de Gmail de prueba. Reiniciar la API. Configuración muestra "Email diario de recordatorios: configurado".
   - `curl -i -X POST localhost:8000/api/v1/alquileres/recordatorios/enviar` → 401.
   - `curl -i -X POST -H "X-Recordatorios-Token: prueba" localhost:8000/api/v1/alquileres/recordatorios/enviar` → 200 `{"enviado_a": [...], "items": N}` y el email llega con los grupos en mayúsculas y la firma.
   - Comentar `RECORDATORIOS_TOKEN`, reiniciar, repetir → 404.
   - **Sacar las `SMTP_*` del `.env`** al terminar.
6. Panel a 400 px: bandeja en una columna, selector usable.

- [ ] **Step 3: Mapa** — en `docs/superpowers/specs/2026-09-11-mapa-de-funcionalidades.md`:

Reemplazar las líneas de estado del encabezado:

```markdown
**Bloque 2 terminado** (2a, 2b y 2c): [Contratos y ajustes](2026-09-16-alquileres-contratos-design.md), [Cobros, recibos y liquidaciones](2026-09-17-alquileres-cobros-design.md), [Recordatorios](2026-09-18-alquileres-recordatorios-design.md).
**Siguiente:** Bloque 4 — Comisiones y estadísticas (spec pendiente).
**Orden de lo que sigue (decidido el 18/09/2026):** 4 → 3 → 5.
```

y el título `### Bloque 2 — Administración de alquileres  ← en curso (2c)` pasa a `### Bloque 2 — Administración de alquileres  ← terminado`.

- [ ] **Step 4: Reporte**

Sin commit ni push. Avisar a Matías:

- que las suites, `ruff`, `tsc`, `build` y `alembic check` pasaron (salida resumida);
- los archivos nuevos y modificados (`git status --short`);
- que la migración `0007` está aplicada en la base local y **no** en Supabase;
- que para activar el email diario hay que: cargar `RECORDATORIOS_TOKEN` en Render, los dos secrets en GitHub, y que sin las `SMTP_*` el endpoint responde 409 (ver `docs/despliegue.md`);
- que las `SMTP_*` y `RECORDATORIOS_TOKEN` quedaron fuera del `.env` local;
- que el siguiente bloque es el 4 (comisiones y estadísticas) y arranca con su spec.
