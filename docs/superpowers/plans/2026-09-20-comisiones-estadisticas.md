# Comisiones y estadísticas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar la comisión de cada operación ganada (monto, %, reparto entre agentes, cobrada) y exponer cuatro reportes de solo lectura (operaciones, comisiones, embudo, alquileres) con CSV, gráficos en el panel y un bloque de comisión en la ficha de la operación.

**Architecture:** Tres tablas nuevas (`comisiones`, `comisiones_reparto`, `deal_stage_history`) en el módulo `deals`, con la lógica en dos submódulos (`comisiones.py`, `historial.py`) enganchados en `create_deal`/`move_stage`. Un módulo nuevo `platform/reportes/` sin modelos que consulta filas filtradas por período y agrega en Python. Frontend: modal de comisión en la ficha, página `/admin/reportes` con pestañas y dos gráficos SVG propios.

**Tech Stack:** FastAPI, SQLAlchemy 2.0, Alembic, pytest (SQLite en memoria); React + Vite + vitest.

Spec: [2026-09-20-comisiones-estadisticas-design.md](../specs/2026-09-20-comisiones-estadisticas-design.md).

## Global Constraints

- **No hacer `git commit` ni `git push`.** Todo queda en el working tree; Matías commitea. Saltear los pasos "Commit" de las skills.
- Código, comentarios, docstrings y mensajes de API en castellano.
- Backend desde `src/`: `python -m pytest tests/ -q`, `ruff check app tests`, `ruff format <archivos tocados>` (no `--check` sobre todo: hay 36 archivos viejos sin formatear). Frontend desde `client/`: `npm test`, `npx tsc --noEmit`, `npm run build`.
- Redondeo monetario: `Decimal.quantize(Decimal("0.01"), ROUND_HALF_UP)`.
- Nada se suma entre monedas: filas por `(mes, moneda)` / `(agente, moneda)`.
- Mensajes exactos de error: `"La operación no tiene comisión cargada"` (404), `"La operación no está ganada"` (409), `"Usuario {id} no encontrado"` (404), `"La comisión ya fue cobrada; desmarcala antes de reabrir la operación"` (409), `"El período termina antes de empezar"` (422), `"Pipeline no encontrado"` (404).
- Migración única del bloque: `0008_comisiones` (revises `0007_recordatorios`). No correrla contra Supabase.
- Permisos: todos los endpoints nuevos con `require_role("staff", "admin")`.
- CSV: `;` como separador, coma decimal, BOM UTF-8, `Content-Disposition: attachment; filename="{reporte}_{desde}_{hasta}.csv"`.

---

## Contrato de interfaz

**Backend → frontend** (todos bajo `/api/v1`, staff):

| Método | Ruta | Body / query | Respuesta |
|---|---|---|---|
| GET | `/deals/{id}/comision` | — | `ComisionOut` |
| PUT | `/deals/{id}/comision` | `ComisionIn` | `ComisionOut` |
| GET | `/reportes/operaciones` | `desde, hasta, pipeline_id, agente_id, formato` | `ReporteOperaciones` |
| GET | `/reportes/comisiones` | `desde, hasta, agente_id, cobrada, formato` | `ReporteComisiones` |
| GET | `/reportes/embudo` | `desde, hasta, pipeline_id (req), formato` | `ReporteEmbudo` |
| GET | `/reportes/alquileres` | `desde, hasta, formato` | `ReporteAlquileres` |

Los DTOs están completos en el spec §4.2 y §4.4 y se transcriben en las Tasks 3 y 5.

---

### Task 1: Modelos y migración `0008_comisiones`

**Files:**
- Modify: `src/app/platform/deals/models.py`
- Modify: `src/app/formato.py` (helper `redondear`)
- Create: `src/alembic/versions/0008_comisiones.py`
- Test: `src/tests/test_formato.py` (un test), `src/tests/test_modelos_crm.py` (un test)

**Interfaces:**
- Produces: `Comision`, `ComisionReparto`, `DealStageHistory`; `Deal.comision`, `Deal.stage_history`; `app.formato.redondear(Decimal) -> Decimal`; `ComisionReparto.monto`, `ComisionReparto.nombre`, `Comision.sin_monto`.

- [x] **Step 1: Test del helper de redondeo** — al final de `src/tests/test_formato.py`:

```python
def test_redondear_a_dos_decimales_half_up():
    from decimal import Decimal

    from app.formato import redondear

    assert redondear(Decimal("1.005")) == Decimal("1.01")
    assert redondear(Decimal("1.004")) == Decimal("1.00")
    assert str(redondear(Decimal("7"))) == "7.00"
```

- [x] **Step 2: Correr** `python -m pytest tests/test_formato.py -q` → FAIL (`ImportError: redondear`).

- [x] **Step 3: Agregar a `src/app/formato.py`** (después de `nombre_periodo`):

```python
def redondear(monto: Decimal) -> Decimal:
    """Dos decimales, mitad hacia arriba: el criterio de cobros y liquidaciones."""
    return monto.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
```

- [x] **Step 4: Test de modelos** — al final de `src/tests/test_modelos_crm.py`:

```python
def test_comision_reparto_deriva_monto_y_nombre(db, crear_usuario):
    from decimal import Decimal

    from app.platform.deals.models import Comision, ComisionReparto, Deal
    from tests.helpers_crm import etapa, pipeline_por_nombre

    usuario = crear_usuario()
    venta = pipeline_por_nombre(db, "Venta")
    deal = Deal(
        title="Op", pipeline_id=venta.id, stage_id=etapa(venta, "Ganada").id,
        created_by_user_id=usuario.id, amount=Decimal("1000000"),
    )
    db.add(deal)
    db.flush()
    comision = Comision(
        deal_id=deal.id, monto_operacion=Decimal("1000000"), moneda="ARS",
        pct=Decimal("3"), monto=Decimal("30000.00"),
    )
    comision.reparto.append(ComisionReparto(user_id=usuario.id, pct=Decimal("33.33")))
    db.add(comision)
    db.commit()
    db.refresh(deal)

    assert deal.comision.reparto[0].monto == Decimal("9999.00")
    assert deal.comision.reparto[0].nombre == usuario.name
    assert deal.comision.sin_monto is False
```

- [x] **Step 5: Correr** `python -m pytest tests/test_modelos_crm.py -q` → FAIL (`ImportError: Comision`).

- [x] **Step 6: Modelos** — en `src/app/platform/deals/models.py`: sumar `Date` a los imports de `sqlalchemy`, `from datetime import UTC, date, datetime`, `from app.formato import redondear`; agregar a `Deal` (después de `contrato`):

```python
    # Bloque 4: honorarios de la operación ganada e historial de estadías por etapa.
    comision: Mapped[Comision | None] = relationship(
        "Comision", back_populates="deal", uselist=False, cascade="all, delete-orphan"
    )
    stage_history: Mapped[list[DealStageHistory]] = relationship(
        "DealStageHistory",
        back_populates="deal",
        cascade="all, delete-orphan",
        order_by="DealStageHistory.entered_at",
    )
```

y, antes de `__all__`, las tres clases:

```python
class Comision(Base):
    """Honorarios de una operación ganada. 1:1 con el deal; el reparto va aparte."""

    __tablename__ = "comisiones"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    deal_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("deals.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    monto_operacion: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    moneda: Mapped[str] = mapped_column(String(3), nullable=False, default="ARS")
    # Porcentaje de referencia; manda `monto` (puede cargarse una cifra pactada sin %).
    pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    monto: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    cobrada: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    fecha_cobro: Mapped[date | None] = mapped_column(Date, nullable=True)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    deal: Mapped[Deal] = relationship("Deal", back_populates="comision")
    reparto: Mapped[list[ComisionReparto]] = relationship(
        "ComisionReparto",
        back_populates="comision",
        cascade="all, delete-orphan",
        order_by="ComisionReparto.pct.desc()",
    )

    @property
    def sin_monto(self) -> bool:
        return self.monto_operacion == 0


class ComisionReparto(Base):
    """Parte de la comisión que le toca a un agente, como % de la comisión."""

    __tablename__ = "comisiones_reparto"
    __table_args__ = (UniqueConstraint("comision_id", "user_id", name="uq_comision_reparto"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    comision_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("comisiones.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)

    comision: Mapped[Comision] = relationship("Comision", back_populates="reparto")
    user: Mapped[object] = relationship("User")

    @property
    def monto(self) -> Decimal:
        return redondear(self.comision.monto * self.pct / Decimal(100))

    @property
    def nombre(self) -> str:
        return self.user.name


class DealStageHistory(Base):
    """Una estadía de un deal en una etapa. `left_at` null = etapa actual."""

    __tablename__ = "deal_stage_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    deal_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("deals.id", ondelete="CASCADE"), nullable=False, index=True
    )
    stage_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("pipeline_stages.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    entered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    left_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    deal: Mapped[Deal] = relationship("Deal", back_populates="stage_history")
    stage: Mapped[PipelineStage] = relationship("PipelineStage")
```

y `__all__ = ["Pipeline", "PipelineStage", "Deal", "DealParty", "Comision", "ComisionReparto", "DealStageHistory"]`.

- [x] **Step 7: Correr** `python -m pytest tests/test_modelos_crm.py tests/test_formato.py -q` → PASS.

- [x] **Step 8: Migración** `src/alembic/versions/0008_comisiones.py`:

```python
"""Bloque 4: comisiones, reparto entre agentes e historial de etapas

Tres tablas nuevas. El historial se rellena con la etapa actual de cada deal
(`entered_at = stage_changed_at`) para que el embudo arranque con lo que se sabe.

Revision ID: 0008_comisiones
Revises: 0007_recordatorios
Create Date: 2026-09-20

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0008_comisiones"
down_revision: str | None = "0007_recordatorios"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "comisiones",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "deal_id",
            sa.Integer(),
            sa.ForeignKey("deals.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("monto_operacion", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("moneda", sa.String(3), nullable=False, server_default="ARS"),
        sa.Column("pct", sa.Numeric(5, 2), nullable=True),
        sa.Column("monto", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("cobrada", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("fecha_cobro", sa.Date(), nullable=True),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "comisiones_reparto",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "comision_id",
            sa.Integer(),
            sa.ForeignKey("comisiones.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("pct", sa.Numeric(5, 2), nullable=False),
        sa.UniqueConstraint("comision_id", "user_id", name="uq_comision_reparto"),
    )
    op.create_index("ix_comisiones_reparto_comision_id", "comisiones_reparto", ["comision_id"])
    op.create_index("ix_comisiones_reparto_user_id", "comisiones_reparto", ["user_id"])

    op.create_table(
        "deal_stage_history",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "deal_id", sa.Integer(), sa.ForeignKey("deals.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "stage_id",
            sa.Integer(),
            sa.ForeignKey("pipeline_stages.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("entered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("left_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_deal_stage_history_deal_id", "deal_stage_history", ["deal_id"])
    op.create_index("ix_deal_stage_history_stage_id", "deal_stage_history", ["stage_id"])

    # Backfill: cada deal vivo arranca con una estadía abierta en su etapa actual.
    op.execute(
        "INSERT INTO deal_stage_history (deal_id, stage_id, entered_at) "
        "SELECT id, stage_id, stage_changed_at FROM deals WHERE deleted_at IS NULL"
    )


def downgrade() -> None:
    op.drop_table("deal_stage_history")
    op.drop_table("comisiones_reparto")
    op.drop_table("comisiones")
```

- [x] **Step 9: Verificar contra la base local** (el `.env` raíz apunta a `localhost`, que está en `0007`):

```bash
cd src && alembic upgrade head && alembic check && alembic downgrade 0007_recordatorios && alembic upgrade head
```
Esperado: `alembic check` → "No new upgrade operations detected". Si `check` marca diferencias de índices o server_default, ajustar el modelo o la migración hasta que coincidan (no ignorar).

- [x] **Step 10:** `ruff check app tests && ruff format app/platform/deals/models.py app/formato.py alembic/versions/0008_comisiones.py tests/test_modelos_crm.py tests/test_formato.py`.

---

### Task 2: Historial de etapas

**Files:**
- Create: `src/app/platform/deals/historial.py`
- Modify: `src/app/platform/deals/service.py` (`create_deal`, `move_stage`)
- Test: `src/tests/test_deals_historial.py`

**Interfaces:**
- Consumes: `DealStageHistory` (Task 1).
- Produces: `historial.registrar_entrada(db, deal, stage_id, ahora) -> None` (sin commit).

- [x] **Step 1: Tests** `src/tests/test_deals_historial.py`:

```python
"""Cada deal deja una estadía por etapa; el embudo del Bloque 4 se calcula de ahí."""

from app.platform.deals.models import DealStageHistory
from tests.helpers_crm import crear_persona, crear_propiedad, etapa, pipeline_por_nombre


def _deal(client, db, etapa_nombre="Consulta"):
    p = pipeline_por_nombre(db, "Venta")
    prop = crear_propiedad(db)
    persona = crear_persona(db)
    r = client.post(
        "/api/v1/deals",
        json={
            "title": "Op",
            "pipeline_id": p.id,
            "stage_id": etapa(p, etapa_nombre).id,
            "property_id": prop.id,
            "amount": 100000,
            "parties": [{"person_id": persona.id, "role": "comprador"}],
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def _mover(client, db, deal_id, etapa_nombre):
    p = pipeline_por_nombre(db, "Venta")
    return client.patch(
        f"/api/v1/deals/{deal_id}/stage", json={"stage_id": etapa(p, etapa_nombre).id}
    )


def _estadias(db, deal_id):
    return (
        db.query(DealStageHistory)
        .filter(DealStageHistory.deal_id == deal_id)
        .order_by(DealStageHistory.entered_at, DealStageHistory.id)
        .all()
    )


def test_crear_abre_una_estadia(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    deal = _deal(client, db)

    estadias = _estadias(db, deal["id"])
    assert len(estadias) == 1
    assert estadias[0].stage_id == deal["stage_id"]
    assert estadias[0].left_at is None


def test_mover_cierra_la_anterior_y_abre_otra(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    deal = _deal(client, db)
    assert _mover(client, db, deal["id"], "Visita").status_code == 200
    assert _mover(client, db, deal["id"], "Oferta").status_code == 200

    estadias = _estadias(db, deal["id"])
    assert [e.left_at is None for e in estadias] == [False, False, True]
    p = pipeline_por_nombre(db, "Venta")
    assert estadias[-1].stage_id == etapa(p, "Oferta").id
    assert estadias[0].left_at == estadias[1].entered_at


def test_mover_a_la_misma_etapa_no_agrega(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    deal = _deal(client, db)
    assert _mover(client, db, deal["id"], "Consulta").status_code == 200
    assert len(_estadias(db, deal["id"])) == 1


def test_eliminar_no_toca_el_historial(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    deal = _deal(client, db)
    assert client.delete(f"/api/v1/deals/{deal['id']}").status_code == 204
    assert len(_estadias(db, deal["id"])) == 1
```

- [x] **Step 2: Correr** `python -m pytest tests/test_deals_historial.py -q` → FAIL (0 estadías).

- [x] **Step 3: Crear** `src/app/platform/deals/historial.py`:

```python
"""Historial de etapas: una fila por estadía de un deal en una etapa (Bloque 4).

Es lo único que permite calcular tiempo promedio por etapa y conversión: el deal
solo recuerda cuándo entró a la etapa actual.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.platform.deals.models import Deal, DealStageHistory


def registrar_entrada(db: Session, deal: Deal, stage_id: int, ahora: datetime) -> None:
    """Cierra la estadía abierta del deal (si la hay) y abre una en `stage_id`. Sin commit."""
    abierta = (
        db.query(DealStageHistory)
        .filter(DealStageHistory.deal_id == deal.id, DealStageHistory.left_at.is_(None))
        .first()
    )
    if abierta is not None:
        abierta.left_at = ahora
    db.add(DealStageHistory(deal_id=deal.id, stage_id=stage_id, entered_at=ahora))
```

- [x] **Step 4: Enganchar en `service.py`.** Import: `from app.platform.deals import historial`. En `create_deal`, justo después del `db.flush()` que sigue a `db.add(deal)`:

```python
    historial.registrar_entrada(db, deal, data.stage_id, deal.stage_changed_at)
```

En `move_stage`, después de `ahora = datetime.now(UTC)` y **antes** de `deal.stage_id = data.stage_id`:

```python
    # Mover a la misma etapa no es una estadía nueva.
    if data.stage_id != deal.stage_id:
        historial.registrar_entrada(db, deal, data.stage_id, ahora)
```

- [x] **Step 5: Correr** `python -m pytest tests/test_deals_historial.py tests/test_deals_estado.py -q` → PASS.

- [x] **Step 6:** `ruff check app tests && ruff format app/platform/deals/historial.py app/platform/deals/service.py tests/test_deals_historial.py`.

---

### Task 3: Comisión por defecto al ganar y regla de reapertura

**Files:**
- Create: `src/app/platform/deals/comisiones.py`
- Modify: `src/app/platform/deals/service.py` (`_aplicar_cierre`, `_aplicar_cierre_sin_proteccion`)
- Test: `src/tests/test_deals_comisiones.py`

**Interfaces:**
- Consumes: `Comision`, `ComisionReparto`, `redondear`, `Inmobiliaria` (`honorarios_venta_pct`, `honorarios_alquiler_pct`).
- Produces: `comisiones.calcular_monto(monto_operacion, pct) -> Decimal`, `comisiones.crear_por_defecto(db, deal) -> Comision`, `comisiones.al_reabrir(db, deal) -> None` (todas sin commit).

- [x] **Step 1: Tests** `src/tests/test_deals_comisiones.py` (primera parte; la Task 4 agrega los del `PUT`):

```python
"""Comisión de la operación ganada: alta por defecto, reapertura, edición (Bloque 4)."""

from decimal import Decimal

import pytest

from app.platform.deals.models import Comision
from app.platform.inmobiliaria.service import obtener as obtener_inmobiliaria
from tests.helpers_crm import crear_persona, crear_propiedad, etapa, pipeline_por_nombre

GANADA = {"Venta": "Ganada", "Alquiler": "Contrato firmado"}


@pytest.fixture
def sesion(db, crear_usuario, iniciar_sesion):
    usuario = crear_usuario()
    iniciar_sesion()
    inmo = obtener_inmobiliaria(db)
    inmo.honorarios_venta_pct = Decimal("3")
    inmo.honorarios_alquiler_pct = Decimal("5")
    db.commit()
    return usuario


def _deal(client, db, pipeline="Venta", etapa_nombre="Consulta", con_propiedad=True, **extra):
    p = pipeline_por_nombre(db, pipeline)
    body = {
        "title": "Op",
        "pipeline_id": p.id,
        "stage_id": etapa(p, etapa_nombre).id,
        "amount": 1000000,
        "parties": [{"person_id": crear_persona(db).id, "role": "comprador"}],
    }
    if con_propiedad:
        body["property_id"] = crear_propiedad(db).id
    body.update(extra)
    r = client.post("/api/v1/deals", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def _mover(client, db, deal_id, etapa_nombre, pipeline="Venta"):
    p = pipeline_por_nombre(db, pipeline)
    return client.patch(
        f"/api/v1/deals/{deal_id}/stage", json={"stage_id": etapa(p, etapa_nombre).id}
    )


def _comision(db, deal_id) -> Comision | None:
    db.expire_all()
    return db.query(Comision).filter(Comision.deal_id == deal_id).first()


def test_ganar_venta_crea_comision_con_el_pct_de_la_inmobiliaria(client, db, sesion):
    deal = _deal(client, db, assigned_to_user_id=sesion.id)
    assert _mover(client, db, deal["id"], "Ganada").status_code == 200

    c = _comision(db, deal["id"])
    assert c is not None
    assert c.monto_operacion == Decimal("1000000")
    assert c.moneda == "ARS"
    assert c.pct == Decimal("3")
    assert c.monto == Decimal("30000.00")
    assert c.cobrada is False
    assert [(r.user_id, r.pct) for r in c.reparto] == [(sesion.id, Decimal("100"))]


def test_ganar_alquiler_usa_el_otro_pct_y_sin_asignado_no_reparte(client, db, sesion):
    deal = _deal(client, db, pipeline="Alquiler", amount=200000)
    assert _mover(client, db, deal["id"], "Contrato firmado", "Alquiler").status_code == 200

    c = _comision(db, deal["id"])
    assert c.pct == Decimal("5")
    assert c.monto == Decimal("10000.00")
    assert c.reparto == []


def test_ganar_sin_monto_deja_cero(client, db, sesion):
    deal = _deal(client, db, amount=None)
    _mover(client, db, deal["id"], "Ganada")
    c = _comision(db, deal["id"])
    assert c.monto_operacion == 0 and c.monto == 0 and c.sin_monto


def test_ganar_sin_propiedad_tambien_crea(client, db, sesion):
    deal = _deal(client, db, con_propiedad=False)
    assert _mover(client, db, deal["id"], "Ganada").status_code == 200
    assert _comision(db, deal["id"]) is not None


def test_crear_directo_en_ganada_crea(client, db, sesion):
    deal = _deal(client, db, etapa_nombre="Ganada")
    assert _comision(db, deal["id"]) is not None


def test_pipeline_sin_default_deja_pct_none(client, db, sesion):
    r = client.post(
        "/api/v1/pipelines",
        json={"name": "Tasación", "stages": [
            {"name": "Inicio", "position": 1},
            {"name": "Hecha", "position": 2, "is_won": True},
        ]},
    )
    assert r.status_code == 201, r.text
    pipeline = r.json()
    hecha = next(s for s in pipeline["stages"] if s["is_won"])
    deal = client.post(
        "/api/v1/deals",
        json={"title": "T", "pipeline_id": pipeline["id"], "stage_id": hecha["id"], "amount": 500},
    ).json()
    c = _comision(db, deal["id"])
    assert c.pct is None and c.monto == 0 and c.monto_operacion == Decimal("500")


def test_reabrir_sin_cobrar_borra_la_comision(client, db, sesion):
    deal = _deal(client, db)
    _mover(client, db, deal["id"], "Ganada")
    assert _mover(client, db, deal["id"], "Oferta").status_code == 200
    assert _comision(db, deal["id"]) is None


def test_ganar_de_nuevo_no_duplica(client, db, sesion):
    deal = _deal(client, db)
    _mover(client, db, deal["id"], "Ganada")
    _mover(client, db, deal["id"], "Oferta")
    _mover(client, db, deal["id"], "Ganada")
    assert db.query(Comision).filter(Comision.deal_id == deal["id"]).count() == 1


def test_reabrir_cobrada_409_y_sigue_ganada(client, db, sesion):
    deal = _deal(client, db)
    _mover(client, db, deal["id"], "Ganada")
    c = _comision(db, deal["id"])
    c.cobrada = True
    db.commit()

    r = _mover(client, db, deal["id"], "Oferta")
    assert r.status_code == 409
    assert r.json()["detail"] == "La comisión ya fue cobrada; desmarcala antes de reabrir la operación"
    assert client.get(f"/api/v1/deals/{deal['id']}").json()["is_won"] is True
    assert _comision(db, deal["id"]) is not None


def test_perder_desde_ganada_cobrada_tambien_409(client, db, sesion):
    deal = _deal(client, db)
    _mover(client, db, deal["id"], "Ganada")
    c = _comision(db, deal["id"])
    c.cobrada = True
    db.commit()
    assert _mover(client, db, deal["id"], "Perdida").status_code == 409
```

- [x] **Step 2: Correr** `python -m pytest tests/test_deals_comisiones.py -q` → FAIL (comisión `None`).

- [x] **Step 3: Crear** `src/app/platform/deals/comisiones.py`:

```python
"""Comisión de una operación ganada: alta por defecto al ganar, reapertura, edición completa.

Sin importar `service` (él importa este módulo): las funciones reciben el `Deal`.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.formato import redondear
from app.platform.auth.models import User
from app.platform.deals.models import Comision, ComisionReparto, Deal
from app.platform.deals.schemas import ComisionIn
from app.platform.inmobiliaria.models import Inmobiliaria
from app.platform.inmobiliaria.service import ID_UNICO

# Nombre del pipeline base → campo de la inmobiliaria con el % por defecto.
PCT_POR_PIPELINE = {"Venta": "honorarios_venta_pct", "Alquiler": "honorarios_alquiler_pct"}

CERO = Decimal("0.00")


def calcular_monto(monto_operacion: Decimal, pct: Decimal | None) -> Decimal:
    if pct is None:
        return CERO
    return redondear(monto_operacion * pct / Decimal(100))


def _pct_por_defecto(db: Session, deal: Deal) -> Decimal | None:
    campo = PCT_POR_PIPELINE.get(deal.pipeline.name)
    # `db.get` y no `obtener()`: este último commitea si la fila no existe, y acá
    # estamos en medio de la transacción del cambio de etapa.
    inmobiliaria = db.get(Inmobiliaria, ID_UNICO)
    if campo is None or inmobiliaria is None:
        return None
    return getattr(inmobiliaria, campo)


def crear_por_defecto(db: Session, deal: Deal) -> Comision:
    """Al ganar: monto del deal, % de la inmobiliaria según el pipeline, todo al
    asignado. Idempotente: si ya hay comisión no la pisa. Sin commit."""
    if deal.comision is not None:
        return deal.comision
    pct = _pct_por_defecto(db, deal)
    monto_operacion = deal.amount if deal.amount is not None else Decimal(0)
    comision = Comision(
        deal_id=deal.id,
        monto_operacion=monto_operacion,
        moneda=deal.currency,
        pct=pct,
        monto=calcular_monto(monto_operacion, pct),
    )
    if deal.assigned_to_user_id is not None:
        comision.reparto.append(ComisionReparto(user_id=deal.assigned_to_user_id, pct=Decimal(100)))
    deal.comision = comision
    db.add(comision)
    return comision


def al_reabrir(db: Session, deal: Deal) -> None:
    """El deal deja de estar ganado: la comisión se va, salvo que ya se haya cobrado. Sin commit."""
    comision = deal.comision
    if comision is None:
        return
    if comision.cobrada:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La comisión ya fue cobrada; desmarcala antes de reabrir la operación",
        )
    db.delete(comision)
    deal.comision = None
```

(`guardar` se agrega en la Task 4.) Verificar que `app.platform.inmobiliaria.service` exporta `ID_UNICO` (sí: lo usa `obtener`).

- [x] **Step 4: Reescribir el cierre en `service.py`.** Import `from app.platform.deals import comisiones, historial`. Reemplazar `_aplicar_cierre` y `_aplicar_cierre_sin_proteccion` por:

```python
def _aplicar_cierre(db: DBSession, deal: Deal, stage: PipelineStage, estaba_cerrado: bool) -> None:
    """Refleja el cambio de etapa en la propiedad, su reserva y la comisión.

    Sin commit: lo hace quien llama. Si algo rechaza el evento (409: la propiedad,
    el contrato de alquiler o una comisión cobrada), se revierte la sesión entera:
    el deal ya tiene la etapa nueva en memoria y sin rollback un lector de la misma
    sesión la vería como aplicada.
    """
    try:
        _aplicar_cierre_sin_proteccion(db, deal, stage, estaba_cerrado)
    except HTTPException:
        db.rollback()
        raise


def _aplicar_cierre_sin_proteccion(
    db: DBSession, deal: Deal, stage: PipelineStage, estaba_cerrado: bool
) -> None:
    # La comisión y el contrato no dependen de que haya propiedad; la propiedad y
    # su reserva sí.
    con_propiedad = deal.property_id is not None
    if stage.is_won:
        if con_propiedad:
            aplicar_evento_de_operacion(db, deal.property_id, EventoOperacion.deal_ganado)
            reserva = _reserva_activa(db, deal.property_id)
            if reserva:
                reserva.status = "convertida"
                reserva.updated_at = datetime.now(UTC)
        comisiones.crear_por_defecto(db, deal)
    elif stage.is_lost:
        comisiones.al_reabrir(db, deal)
        if con_propiedad:
            reserva = _reserva_activa(db, deal.property_id)
            if reserva:
                reserva.status = "cancelada"
                reserva.updated_at = datetime.now(UTC)
            aplicar_evento_de_operacion(db, deal.property_id, EventoOperacion.deal_perdido)
    elif estaba_cerrado:
        comisiones.al_reabrir(db, deal)
        if deal.contrato is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="El deal tiene un contrato de alquiler; rescindilo antes de reabrirlo",
            )
        if con_propiedad:
            aplicar_evento_de_operacion(db, deal.property_id, EventoOperacion.deal_reabierto)
```

Nota: antes `_aplicar_cierre` hacía `return` si no había propiedad; ese `return` se quita (la comisión debe crearse igual).

- [x] **Step 5: Correr** `python -m pytest tests/test_deals_comisiones.py tests/test_deals_estado.py tests/test_deals_historial.py tests/test_alquileres_listados.py -q` → PASS. Si `test_pipeline_sin_default_deja_pct_none` falla por el formato de creación de pipelines, mirar `PipelineCreate`/`PipelineStageCreate` en `deals/schemas.py` y ajustar el body del test (no el código).

- [x] **Step 6:** `ruff check app tests && ruff format app/platform/deals/comisiones.py app/platform/deals/service.py tests/test_deals_comisiones.py`.

---

### Task 4: Schemas, `guardar` y endpoints `GET/PUT /deals/{id}/comision`

**Files:**
- Modify: `src/app/platform/deals/schemas.py`
- Modify: `src/app/platform/deals/comisiones.py` (`guardar`)
- Modify: `src/app/platform/deals/router.py`
- Test: `src/tests/test_deals_comisiones.py` (segunda parte)

**Interfaces:**
- Produces: `RepartoIn`, `ComisionIn`, `RepartoOut`, `ComisionOut`; `comisiones.guardar(db, deal, data) -> Comision` (con commit); endpoints de la tabla del contrato.

- [x] **Step 1: Tests** — agregar al final de `src/tests/test_deals_comisiones.py`:

```python
def _ganada(client, db, sesion, **extra):
    deal = _deal(client, db, assigned_to_user_id=sesion.id, **extra)
    _mover(client, db, deal["id"], "Ganada")
    return deal


def test_get_devuelve_la_comision_con_reparto(client, db, sesion):
    deal = _ganada(client, db, sesion)
    r = client.get(f"/api/v1/deals/{deal['id']}/comision")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["monto"] == "30000.00"
    assert body["sin_monto"] is False
    assert body["reparto"] == [
        {"user_id": sesion.id, "nombre": sesion.name, "pct": "100.00", "monto": "30000.00"}
    ]


def test_get_sin_comision_404(client, db, sesion):
    deal = _deal(client, db)
    r = client.get(f"/api/v1/deals/{deal['id']}/comision")
    assert r.status_code == 404
    assert r.json()["detail"] == "La operación no tiene comisión cargada"


def test_put_en_no_ganada_409(client, db, sesion):
    deal = _deal(client, db)
    r = client.put(
        f"/api/v1/deals/{deal['id']}/comision",
        json={"monto_operacion": "1000000", "pct": "3"},
    )
    assert r.status_code == 409
    assert r.json()["detail"] == "La operación no está ganada"


def test_put_con_pct_calcula_monto_y_reemplaza_reparto(client, db, sesion, crear_usuario):
    otro = crear_usuario(email="otro@mambo.com.ar", roles=("staff",))
    deal = _ganada(client, db, sesion)
    r = client.put(
        f"/api/v1/deals/{deal['id']}/comision",
        json={
            "monto_operacion": "2000000",
            "pct": "4",
            "reparto": [{"user_id": sesion.id, "pct": "60"}, {"user_id": otro.id, "pct": "40"}],
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["monto"] == "80000.00"
    assert [(x["user_id"], x["monto"]) for x in body["reparto"]] == [
        (sesion.id, "48000.00"),
        (otro.id, "32000.00"),
    ]
    # Un segundo PUT con el mismo agente no choca con el unique del reparto.
    r = client.put(
        f"/api/v1/deals/{deal['id']}/comision",
        json={"monto_operacion": "2000000", "pct": "4", "reparto": [{"user_id": sesion.id, "pct": "100"}]},
    )
    assert r.status_code == 200, r.text
    assert len(r.json()["reparto"]) == 1


def test_put_con_monto_lo_respeta(client, db, sesion):
    deal = _ganada(client, db, sesion)
    r = client.put(
        f"/api/v1/deals/{deal['id']}/comision",
        json={"monto_operacion": "1000000", "pct": "3", "monto": "25000"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["monto"] == "25000.00"
    assert r.json()["pct"] == "3.00"


def test_put_crea_si_no_existia(client, db, sesion):
    deal = _ganada(client, db, sesion)
    db.delete(_comision(db, deal["id"]))
    db.commit()
    r = client.put(
        f"/api/v1/deals/{deal['id']}/comision", json={"monto_operacion": "100", "monto": "10"}
    )
    assert r.status_code == 200, r.text
    assert r.json()["pct"] is None


@pytest.mark.parametrize(
    "body, fragmento",
    [
        ({"monto_operacion": "1"}, "porcentaje o monto"),
        (
            {"monto_operacion": "1", "pct": "1", "reparto": [{"user_id": 1, "pct": "70"}, {"user_id": 2, "pct": "40"}]},
            "supera el 100",
        ),
        (
            {"monto_operacion": "1", "pct": "1", "reparto": [{"user_id": 1, "pct": "50"}, {"user_id": 1, "pct": "10"}]},
            "dos veces",
        ),
        ({"monto_operacion": "1", "pct": "1", "fecha_cobro": "2026-09-01"}, "requiere marcar"),
    ],
)
def test_put_validaciones_422(client, db, sesion, body, fragmento):
    deal = _ganada(client, db, sesion)
    r = client.put(f"/api/v1/deals/{deal['id']}/comision", json=body)
    assert r.status_code == 422
    assert fragmento in r.text


def test_put_usuario_inexistente_404(client, db, sesion):
    deal = _ganada(client, db, sesion)
    r = client.put(
        f"/api/v1/deals/{deal['id']}/comision",
        json={"monto_operacion": "1", "pct": "1", "reparto": [{"user_id": 999, "pct": "10"}]},
    )
    assert r.status_code == 404
    assert r.json()["detail"] == "Usuario 999 no encontrado"


def test_put_cobrada_sin_fecha_pone_hoy_y_descobrar_la_borra(client, db, sesion):
    from datetime import date

    deal = _ganada(client, db, sesion)
    url = f"/api/v1/deals/{deal['id']}/comision"
    r = client.put(url, json={"monto_operacion": "1", "pct": "1", "cobrada": True})
    assert r.json()["fecha_cobro"] == date.today().isoformat()
    r = client.put(url, json={"monto_operacion": "1", "pct": "1", "cobrada": False})
    assert r.json()["fecha_cobro"] is None


def test_comision_requiere_staff(client, db):
    r = client.get("/api/v1/deals/1/comision")
    assert r.status_code == 401
```

- [x] **Step 2: Correr** → FAIL (404 de ruta / ImportError).

- [x] **Step 3: Schemas** — en `src/app/platform/deals/schemas.py`: imports `from datetime import date, datetime` y `from pydantic import BaseModel, Field, model_validator`; al final del archivo:

```python
# ---------------------------------------------------------------------------
# Comisión (Bloque 4)
# ---------------------------------------------------------------------------


class RepartoIn(BaseModel):
    user_id: int
    pct: Decimal = Field(gt=0, le=100, decimal_places=2)


class ComisionIn(BaseModel):
    """Reemplaza la comisión entera, reparto incluido. Manda `monto`; sin él se calcula de `pct`."""

    monto_operacion: Decimal = Field(ge=0, decimal_places=2)
    pct: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=2)
    monto: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    cobrada: bool = False
    fecha_cobro: date | None = None
    notas: str | None = None
    reparto: list[RepartoIn] = []

    @model_validator(mode="after")
    def _coherente(self) -> ComisionIn:
        if self.pct is None and self.monto is None:
            raise ValueError("Indicá porcentaje o monto")
        if sum((r.pct for r in self.reparto), Decimal(0)) > 100:
            raise ValueError("El reparto supera el 100 %")
        ids = [r.user_id for r in self.reparto]
        if len(ids) != len(set(ids)):
            raise ValueError("Un agente aparece dos veces en el reparto")
        if self.fecha_cobro is not None and not self.cobrada:
            raise ValueError("La fecha de cobro requiere marcar la comisión como cobrada")
        return self


class RepartoOut(BaseModel):
    user_id: int
    nombre: str
    pct: Decimal
    monto: Decimal

    model_config = {"from_attributes": True}


class ComisionOut(BaseModel):
    deal_id: int
    monto_operacion: Decimal
    moneda: str
    pct: Decimal | None
    monto: Decimal
    cobrada: bool
    fecha_cobro: date | None
    notas: str | None
    reparto: list[RepartoOut]
    sin_monto: bool
    updated_at: datetime

    model_config = {"from_attributes": True}
```

- [x] **Step 4: `guardar`** — al final de `comisiones.py`:

```python
def guardar(db: Session, deal: Deal, data: ComisionIn) -> Comision:
    """Crea o reemplaza la comisión del deal, reparto incluido. Solo deals ganados. Commit."""
    if not deal.is_won:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="La operación no está ganada"
        )
    ids = [r.user_id for r in data.reparto]
    if ids:
        existentes = {
            u.id
            for u in db.query(User.id).filter(User.id.in_(ids), User.deleted_at.is_(None)).all()
        }
        for user_id in ids:
            if user_id not in existentes:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Usuario {user_id} no encontrado",
                )

    comision = deal.comision or Comision(deal_id=deal.id, moneda=deal.currency)
    comision.monto_operacion = data.monto_operacion
    comision.pct = data.pct
    comision.monto = (
        data.monto if data.monto is not None else calcular_monto(data.monto_operacion, data.pct)
    )
    comision.cobrada = data.cobrada
    comision.fecha_cobro = (data.fecha_cobro or date.today()) if data.cobrada else None
    comision.notas = data.notas
    comision.updated_at = datetime.now(UTC)
    db.add(comision)
    db.flush()

    # Borrar antes de insertar: el unit of work inserta antes de borrar y el mismo
    # agente repetido entre el reparto viejo y el nuevo chocaría con el unique.
    db.query(ComisionReparto).filter(ComisionReparto.comision_id == comision.id).delete()
    db.flush()
    for r in data.reparto:
        db.add(ComisionReparto(comision_id=comision.id, user_id=r.user_id, pct=r.pct))
    db.commit()
    db.refresh(comision)
    return comision
```

- [x] **Step 5: Endpoints** — en `router.py`: imports `from app.platform.deals import comisiones, service` y `ComisionIn, ComisionOut` en la lista de schemas. Después de `get_contrato`:

```python
@router.get("/deals/{deal_id}/comision", response_model=ComisionOut, dependencies=[_staff])
def get_comision(deal_id: int, db: DBSession = Depends(get_db)) -> ComisionOut:
    """La comisión de la operación ganada; 404 si todavía no se cargó."""
    deal = service.get_deal_or_404(db, deal_id)
    if deal.comision is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La operación no tiene comisión cargada",
        )
    return ComisionOut.model_validate(deal.comision)


@router.put("/deals/{deal_id}/comision", response_model=ComisionOut, dependencies=[_staff])
def put_comision(
    deal_id: int, body: ComisionIn, db: DBSession = Depends(get_db)
) -> ComisionOut:
    """Crea o reemplaza la comisión entera (reparto incluido). Solo deals ganados."""
    deal = service.get_deal_or_404(db, deal_id)
    return ComisionOut.model_validate(comisiones.guardar(db, deal, body))
```

- [x] **Step 6: Correr** `python -m pytest tests/test_deals_comisiones.py -q` → PASS. Si `reparto` sale vacío después del `PUT`, agregar `db.expire(comision, ["reparto"])` antes del `refresh`.

- [x] **Step 7:** `python -m pytest tests/ -q` (todo verde), `ruff check app tests`, `ruff format` de los archivos tocados.

---

### Task 5: Módulo `reportes` — schemas, período, CSV, `operaciones` y `comisiones`

**Files:**
- Create: `src/app/platform/reportes/__init__.py` (vacío), `schemas.py`, `exportar.py`, `service.py`, `router.py`
- Modify: `src/app/main.py`
- Test: `src/tests/test_reportes.py`

**Interfaces:**
- Consumes: `Deal`, `Comision`, `RepartoOut` (Task 4).
- Produces: `service.meses_del_rango(desde, hasta) -> list[str]`, `service.operaciones(db, desde, hasta, pipeline_id, agente_id) -> ReporteOperaciones`, `service.comisiones(db, desde, hasta, agente_id, cobrada) -> ReporteComisiones`, `exportar.csv_response(nombre, columnas, filas) -> Response`, dependencia `router.periodo` → `(desde, hasta)`.

- [x] **Step 1: Tests** `src/tests/test_reportes.py` (primera parte):

```python
"""Reportes de solo lectura del Bloque 4: operaciones, comisiones, embudo, alquileres."""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest

from app.platform.deals.models import Comision, Deal
from app.platform.inmobiliaria.service import obtener as obtener_inmobiliaria
from app.platform.reportes.service import meses_del_rango
from tests.helpers_crm import crear_persona, crear_propiedad, etapa, pipeline_por_nombre

HOY = date.today()
MES_ACTUAL = HOY.replace(day=1)
MES_PASADO = (MES_ACTUAL - timedelta(days=1)).replace(day=1)
YM = "%Y-%m"


@pytest.fixture
def sesion(db, crear_usuario, iniciar_sesion):
    usuario = crear_usuario()
    iniciar_sesion()
    inmo = obtener_inmobiliaria(db)
    inmo.honorarios_venta_pct = Decimal("3")
    db.commit()
    return usuario


def _deal(client, db, pipeline="Venta", asignado=None, **extra):
    p = pipeline_por_nombre(db, pipeline)
    body = {
        "title": "Op",
        "pipeline_id": p.id,
        "stage_id": etapa(p, "Consulta").id,
        "property_id": crear_propiedad(db).id,
        "amount": 1000000,
        "currency": "ARS",
        "assigned_to_user_id": asignado,
        "parties": [{"person_id": crear_persona(db).id, "role": "comprador"}],
    }
    body.update(extra)
    r = client.post("/api/v1/deals", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def _mover(client, db, deal_id, etapa_nombre, pipeline="Venta"):
    p = pipeline_por_nombre(db, pipeline)
    r = client.patch(
        f"/api/v1/deals/{deal_id}/stage", json={"stage_id": etapa(p, etapa_nombre).id}
    )
    assert r.status_code == 200, r.text


def _cerrar_en(db, deal_id, dia: date):
    """Los tests cierran hoy; esto mueve `closed_at` al mes que se quiere."""
    deal = db.get(Deal, deal_id)
    deal.closed_at = datetime.combine(dia, datetime.min.time(), tzinfo=UTC).replace(hour=12)
    db.commit()


@pytest.fixture
def escenario(client, db, sesion, crear_usuario):
    """Mes pasado: venta ganada 1.000.000 ARS (comisión 30.000, cobrada, 60/40 con `otro`)
    y venta perdida. Este mes: venta ganada en USD 100.000 sin comisión cargada
    (se borra) y alquiler ganado 200.000 ARS sin asignado (comisión con pct None → 0)."""
    otro = crear_usuario(email="otro@mambo.com.ar", roles=("staff",))
    g1 = _deal(client, db, asignado=sesion.id)
    _mover(client, db, g1["id"], "Ganada")
    _cerrar_en(db, g1["id"], MES_PASADO + timedelta(days=5))
    client.put(
        f"/api/v1/deals/{g1['id']}/comision",
        json={
            "monto_operacion": "1000000", "pct": "3", "cobrada": True,
            "reparto": [{"user_id": sesion.id, "pct": "60"}, {"user_id": otro.id, "pct": "40"}],
        },
    )
    p1 = _deal(client, db, asignado=sesion.id)
    _mover(client, db, p1["id"], "Perdida")
    _cerrar_en(db, p1["id"], MES_PASADO + timedelta(days=6))

    g2 = _deal(client, db, asignado=otro.id, amount=100000, currency="USD")
    _mover(client, db, g2["id"], "Ganada")
    db.query(Comision).filter(Comision.deal_id == g2["id"]).delete()
    db.commit()

    g3 = _deal(client, db, pipeline="Alquiler", asignado=None, amount=200000)
    _mover(client, db, g3["id"], "Contrato firmado", "Alquiler")
    return {"otro": otro, "g1": g1, "p1": p1, "g2": g2, "g3": g3}


def test_meses_del_rango_inclusive():
    assert meses_del_rango(date(2026, 11, 15), date(2027, 1, 3)) == ["2026-11", "2026-12", "2027-01"]


def test_operaciones_agrupa_por_mes_y_moneda_con_ceros(client, escenario):
    r = client.get(f"/api/v1/reportes/operaciones?desde={MES_PASADO}&hasta={HOY}")
    assert r.status_code == 200, r.text
    body = r.json()
    filas = {(f["mes"], f["moneda"]): f for f in body["filas"]}
    assert set(filas) == {(m, mo) for m in (MES_PASADO.strftime(YM), MES_ACTUAL.strftime(YM)) for mo in ("ARS", "USD")}
    pasado = filas[(MES_PASADO.strftime(YM), "ARS")]
    assert (pasado["ganadas"], pasado["perdidas"]) == (1, 1)
    assert pasado["monto_ganado"] == "1000000.00"
    assert pasado["comisiones"] == "30000.00"
    assert pasado["comisiones_cobradas"] == "30000.00"
    actual_usd = filas[(MES_ACTUAL.strftime(YM), "USD")]
    assert actual_usd["ganadas"] == 1 and actual_usd["comisiones"] == "0.00"
    assert filas[(MES_PASADO.strftime(YM), "USD")]["ganadas"] == 0
    totales = {t["moneda"]: t for t in body["totales"]}
    assert totales["ARS"]["mes"] == "total"
    assert totales["ARS"]["ganadas"] == 2  # la venta y el alquiler
    assert totales["USD"]["monto_ganado"] == "100000.00"


def test_operaciones_filtra_por_pipeline_y_agente(client, db, escenario):
    alquiler = pipeline_por_nombre(db, "Alquiler")
    r = client.get(f"/api/v1/reportes/operaciones?pipeline_id={alquiler.id}")
    assert sum(f["ganadas"] for f in r.json()["filas"]) == 1
    r = client.get(f"/api/v1/reportes/operaciones?agente_id={escenario['otro'].id}")
    assert sum(f["ganadas"] for f in r.json()["filas"]) == 1
    assert sum(f["perdidas"] for f in r.json()["filas"]) == 0


def test_operaciones_default_son_doce_meses(client, sesion):
    body = client.get("/api/v1/reportes/operaciones").json()
    assert len(body["filas"]) == 12  # sin datos: solo ARS
    assert body["hasta"] == HOY.isoformat()


def test_periodo_invertido_422(client, sesion):
    r = client.get("/api/v1/reportes/operaciones?desde=2026-05-01&hasta=2026-04-01")
    assert r.status_code == 422
    assert r.json()["detail"] == "El período termina antes de empezar"


def test_comisiones_detalle_y_por_agente(client, sesion, escenario):
    r = client.get(f"/api/v1/reportes/comisiones?desde={MES_PASADO}&hasta={HOY}")
    assert r.status_code == 200, r.text
    body = r.json()
    # g1 (cobrada, con reparto) y g3 (alquiler, monto 0); g2 no tiene comisión.
    assert [f["deal_id"] for f in body["filas"]] == [escenario["g3"]["id"], escenario["g1"]["id"]]
    g1 = body["filas"][1]
    assert g1["cobrada"] is True and g1["pipeline"] == "Venta"
    assert [(x["nombre"], x["monto"]) for x in g1["reparto"]] == [(sesion.name, "18000.00"), ("otro", "12000.00")]
    agentes = {(a["user_id"], a["moneda"]): a for a in body["por_agente"]}
    assert agentes[(sesion.id, "ARS")]["comision"] == "18000.00"
    assert agentes[(sesion.id, "ARS")]["cobrada"] == "18000.00"
    assert agentes[(escenario["otro"].id, "ARS")]["operaciones"] == 1
    assert (None, "ARS") not in agentes  # el 100 % está repartido y g3 vale 0


def test_comisiones_no_repartida_va_a_sin_asignar(client, sesion, escenario):
    client.put(
        f"/api/v1/deals/{escenario['g1']['id']}/comision",
        json={"monto_operacion": "1000000", "pct": "3", "reparto": [{"user_id": sesion.id, "pct": "50"}]},
    )
    body = client.get(f"/api/v1/reportes/comisiones?desde={MES_PASADO}").json()
    resto = next(a for a in body["por_agente"] if a["user_id"] is None)
    assert resto["nombre"] == "Sin asignar" and resto["comision"] == "15000.00"


def test_comisiones_filtra_cobrada_y_agente(client, sesion, escenario):
    body = client.get(f"/api/v1/reportes/comisiones?desde={MES_PASADO}&cobrada=false").json()
    assert [f["deal_id"] for f in body["filas"]] == [escenario["g3"]["id"]]
    body = client.get(f"/api/v1/reportes/comisiones?desde={MES_PASADO}&agente_id={escenario['otro'].id}").json()
    assert [f["deal_id"] for f in body["filas"]] == [escenario["g1"]["id"]]


def test_csv_operaciones(client, escenario):
    r = client.get(f"/api/v1/reportes/operaciones?desde={MES_PASADO}&hasta={HOY}&formato=csv")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    assert r.headers["content-disposition"] == f'attachment; filename="operaciones_{MES_PASADO}_{HOY}.csv"'
    texto = r.content.decode("utf-8-sig")
    assert r.content.startswith("﻿".encode())
    lineas = texto.splitlines()
    assert lineas[0] == "mes;moneda;ganadas;perdidas;monto_ganado;comisiones;comisiones_cobradas"
    assert f"{MES_PASADO.strftime(YM)};ARS;1;1;1000000,00;30000,00;30000,00" in lineas


def test_csv_comisiones_aplana_el_reparto(client, sesion, escenario):
    r = client.get(f"/api/v1/reportes/comisiones?desde={MES_PASADO}&formato=csv")
    texto = r.content.decode("utf-8-sig")
    assert f"{sesion.name} 60,00 % · otro 40,00 %" in texto
    assert ";Sí;" in texto


def test_reportes_requieren_staff(client):
    assert client.get("/api/v1/reportes/operaciones").status_code == 401
```

- [x] **Step 2: Correr** `python -m pytest tests/test_reportes.py -q` → FAIL (ImportError).

- [x] **Step 3: Schemas** `src/app/platform/reportes/schemas.py`:

```python
"""DTOs de los reportes (Bloque 4). Todo agrupado por moneda: nunca se suman ARS con USD."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel

from app.platform.deals.schemas import RepartoOut


class FilaOperaciones(BaseModel):
    mes: str  # "YYYY-MM"; "total" en `totales`
    moneda: str
    ganadas: int = 0
    perdidas: int = 0
    monto_ganado: Decimal = Decimal("0.00")
    comisiones: Decimal = Decimal("0.00")
    comisiones_cobradas: Decimal = Decimal("0.00")


class ReporteOperaciones(BaseModel):
    desde: date
    hasta: date
    pipeline_id: int | None
    agente_id: int | None
    filas: list[FilaOperaciones]
    totales: list[FilaOperaciones]


class FilaComision(BaseModel):
    deal_id: int
    titulo: str
    pipeline: str
    closed_at: date
    moneda: str
    monto_operacion: Decimal
    pct: Decimal | None
    monto: Decimal
    cobrada: bool
    fecha_cobro: date | None
    reparto: list[RepartoOut]


class FilaAgente(BaseModel):
    user_id: int | None  # None = parte no repartida: queda para la inmobiliaria
    nombre: str
    moneda: str
    operaciones: int = 0
    comision: Decimal = Decimal("0.00")
    cobrada: Decimal = Decimal("0.00")


class ReporteComisiones(BaseModel):
    desde: date
    hasta: date
    agente_id: int | None
    cobrada: bool | None
    filas: list[FilaComision]
    por_agente: list[FilaAgente]


class FilaEmbudo(BaseModel):
    stage_id: int
    nombre: str
    position: int
    is_won: bool
    is_lost: bool
    ingresaron: int
    actuales: int
    dias_promedio: Decimal | None
    conversion_pct: Decimal | None


class ReporteEmbudo(BaseModel):
    desde: date
    hasta: date
    pipeline_id: int
    pipeline: str
    etapas: list[FilaEmbudo]
    ganadas: int
    perdidas: int
    tasa_cierre_pct: Decimal | None
    dias_promedio_cierre: Decimal | None


class FilaAlquileres(BaseModel):
    mes: str
    moneda: str
    esperado: Decimal = Decimal("0.00")
    cobrado: Decimal = Decimal("0.00")
    pendiente: Decimal = Decimal("0.00")
    honorarios: Decimal = Decimal("0.00")
    contratos_vigentes: int = 0


class ReporteAlquileres(BaseModel):
    desde: date
    hasta: date
    filas: list[FilaAlquileres]
    totales: list[FilaAlquileres]
```

- [x] **Step 4: CSV** `src/app/platform/reportes/exportar.py`:

```python
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


def csv_response(nombre: str, columnas: Sequence[str], filas: Iterable[Sequence[object]]) -> Response:
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
```

- [x] **Step 5: Service** `src/app/platform/reportes/service.py` (primera parte):

```python
"""Reportes de solo lectura (Bloque 4).

Las consultas traen las filas del período y la agregación se hace en Python: el
volumen es de cientos de operaciones y así corre igual en SQLite (tests) y Postgres.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal

from dateutil.relativedelta import relativedelta
from fastapi import HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.formato import redondear
from app.platform.deals.models import Comision, Deal, DealStageHistory, Pipeline
from app.platform.deals.schemas import RepartoOut
from app.platform.reportes.schemas import (
    FilaAgente,
    FilaComision,
    FilaOperaciones,
    ReporteComisiones,
    ReporteOperaciones,
)

CERO = Decimal("0.00")
SIN_ASIGNAR = "Sin asignar"


def meses_del_rango(desde: date, hasta: date) -> list[str]:
    meses = []
    cursor = desde.replace(day=1)
    while cursor <= hasta:
        meses.append(cursor.strftime("%Y-%m"))
        cursor += relativedelta(months=1)
    return meses


def _mes(valor: date | datetime) -> str:
    return valor.strftime("%Y-%m")


def _utc(valor: datetime) -> datetime:
    # SQLite devuelve la fecha sin zona; se guardó en UTC.
    return valor if valor.tzinfo is not None else valor.replace(tzinfo=UTC)


def _limites(desde: date, hasta: date) -> tuple[datetime, datetime]:
    """[desde 00:00, hasta + 1 día 00:00) en UTC, para comparar columnas datetime."""
    return (
        datetime.combine(desde, time.min, tzinfo=UTC),
        datetime.combine(hasta + timedelta(days=1), time.min, tzinfo=UTC),
    )


def _deals_cerrados(
    db: Session,
    desde: date,
    hasta: date,
    pipeline_id: int | None = None,
    agente_id: int | None = None,
) -> list[Deal]:
    inicio, fin = _limites(desde, hasta)
    q = (
        db.query(Deal)
        .options(joinedload(Deal.comision).joinedload(Comision.reparto), joinedload(Deal.pipeline))
        .filter(
            Deal.deleted_at.is_(None),
            Deal.closed_at.isnot(None),
            Deal.closed_at >= inicio,
            Deal.closed_at < fin,
            (Deal.is_won.is_(True)) | (Deal.is_lost.is_(True)),
        )
    )
    if pipeline_id is not None:
        q = q.filter(Deal.pipeline_id == pipeline_id)
    if agente_id is not None:
        q = q.filter(Deal.assigned_to_user_id == agente_id)
    return q.all()


def _monedas(valores: set[str]) -> list[str]:
    return sorted(valores) or ["ARS"]


# ---------------------------------------------------------------------------
# Operaciones
# ---------------------------------------------------------------------------


def operaciones(
    db: Session,
    desde: date,
    hasta: date,
    pipeline_id: int | None = None,
    agente_id: int | None = None,
) -> ReporteOperaciones:
    deals = _deals_cerrados(db, desde, hasta, pipeline_id, agente_id)
    monedas = _monedas({d.currency for d in deals})
    filas = {
        (mes, moneda): FilaOperaciones(mes=mes, moneda=moneda)
        for mes in meses_del_rango(desde, hasta)
        for moneda in monedas
    }
    for d in deals:
        fila = filas[(_mes(d.closed_at), d.currency)]
        if d.is_won:
            fila.ganadas += 1
            fila.monto_ganado += d.amount or CERO
            if d.comision is not None:
                fila.comisiones += d.comision.monto
                if d.comision.cobrada:
                    fila.comisiones_cobradas += d.comision.monto
        else:
            fila.perdidas += 1
    return ReporteOperaciones(
        desde=desde,
        hasta=hasta,
        pipeline_id=pipeline_id,
        agente_id=agente_id,
        filas=list(filas.values()),
        totales=[_total_operaciones(filas.values(), moneda) for moneda in monedas],
    )


def _total_operaciones(filas, moneda: str) -> FilaOperaciones:
    propias = [f for f in filas if f.moneda == moneda]
    return FilaOperaciones(
        mes="total",
        moneda=moneda,
        ganadas=sum(f.ganadas for f in propias),
        perdidas=sum(f.perdidas for f in propias),
        monto_ganado=sum((f.monto_ganado for f in propias), CERO),
        comisiones=sum((f.comisiones for f in propias), CERO),
        comisiones_cobradas=sum((f.comisiones_cobradas for f in propias), CERO),
    )


COLUMNAS_OPERACIONES = [
    "mes", "moneda", "ganadas", "perdidas", "monto_ganado", "comisiones", "comisiones_cobradas",
]  # fmt: skip


def filas_csv_operaciones(reporte: ReporteOperaciones) -> list[list[object]]:
    return [[getattr(f, c) for c in COLUMNAS_OPERACIONES] for f in reporte.filas + reporte.totales]


# ---------------------------------------------------------------------------
# Comisiones
# ---------------------------------------------------------------------------


def comisiones(
    db: Session,
    desde: date,
    hasta: date,
    agente_id: int | None = None,
    cobrada: bool | None = None,
) -> ReporteComisiones:
    deals = [d for d in _deals_cerrados(db, desde, hasta) if d.is_won and d.comision is not None]
    if cobrada is not None:
        deals = [d for d in deals if d.comision.cobrada is cobrada]
    if agente_id is not None:
        deals = [
            d
            for d in deals
            if d.assigned_to_user_id == agente_id
            or any(r.user_id == agente_id for r in d.comision.reparto)
        ]
    deals.sort(key=lambda d: _utc(d.closed_at), reverse=True)

    filas = [
        FilaComision(
            deal_id=d.id,
            titulo=d.title,
            pipeline=d.pipeline.name,
            closed_at=d.closed_at.date(),
            moneda=d.comision.moneda,
            monto_operacion=d.comision.monto_operacion,
            pct=d.comision.pct,
            monto=d.comision.monto,
            cobrada=d.comision.cobrada,
            fecha_cobro=d.comision.fecha_cobro,
            reparto=[RepartoOut.model_validate(r) for r in d.comision.reparto],
        )
        for d in deals
    ]

    por_agente: dict[tuple[int | None, str], FilaAgente] = {}

    def acumular(user_id: int | None, nombre: str, moneda: str, monto: Decimal, cobrada: bool):
        fila = por_agente.setdefault(
            (user_id, moneda), FilaAgente(user_id=user_id, nombre=nombre, moneda=moneda)
        )
        fila.operaciones += 1
        fila.comision += monto
        if cobrada:
            fila.cobrada += monto

    for d in deals:
        c = d.comision
        repartido = CERO
        for r in c.reparto:
            acumular(r.user_id, r.nombre, c.moneda, r.monto, c.cobrada)
            repartido += r.monto
        resto = c.monto - repartido
        if resto > 0:
            acumular(None, SIN_ASIGNAR, c.moneda, resto, c.cobrada)

    return ReporteComisiones(
        desde=desde,
        hasta=hasta,
        agente_id=agente_id,
        cobrada=cobrada,
        filas=filas,
        por_agente=sorted(por_agente.values(), key=lambda f: f.comision, reverse=True),
    )


COLUMNAS_COMISIONES = [
    "operacion", "titulo", "pipeline", "cerrada_el", "moneda", "monto_operacion", "pct",
    "comision", "cobrada", "fecha_cobro", "reparto",
]  # fmt: skip


def filas_csv_comisiones(reporte: ReporteComisiones) -> list[list[object]]:
    return [
        [
            f.deal_id, f.titulo, f.pipeline, f.closed_at, f.moneda, f.monto_operacion, f.pct,
            f.monto, f.cobrada, f.fecha_cobro,
            " · ".join(f"{r.nombre} {r.pct:.2f} %".replace(".", ",") for r in f.reparto),
        ]
        for f in reporte.filas
    ]  # fmt: skip
```

- [x] **Step 6: Router** `src/app/platform/reportes/router.py`:

```python
"""Router reportes: solo lectura, staff, con variante CSV en cada uno."""

from __future__ import annotations

from datetime import date
from typing import Literal

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.platform.auth.dependencies import require_role
from app.platform.reportes import service
from app.platform.reportes.exportar import csv_response
from app.platform.reportes.schemas import ReporteComisiones, ReporteOperaciones

router = APIRouter(prefix="/reportes", tags=["reportes"])

SOLO_STAFF = [Depends(require_role("staff", "admin"))]
MESES_POR_DEFECTO = 12

Formato = Literal["json", "csv"]


def periodo(
    desde: date | None = Query(default=None),
    hasta: date | None = Query(default=None),
) -> tuple[date, date]:
    """Ambos inclusivos. Default: los últimos 12 meses hasta hoy."""
    hasta = hasta or date.today()
    desde = desde or hasta.replace(day=1) - relativedelta(months=MESES_POR_DEFECTO - 1)
    if hasta < desde:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El período termina antes de empezar",
        )
    return desde, hasta


def _nombre(reporte: str, desde: date, hasta: date) -> str:
    return f"{reporte}_{desde}_{hasta}"


@router.get("/operaciones", response_model=ReporteOperaciones, dependencies=SOLO_STAFF)
def reporte_operaciones(
    rango: tuple[date, date] = Depends(periodo),
    pipeline_id: int | None = Query(default=None),
    agente_id: int | None = Query(default=None),
    formato: Formato = Query(default="json"),
    db: Session = Depends(get_db),
) -> ReporteOperaciones | Response:
    desde, hasta = rango
    reporte = service.operaciones(db, desde, hasta, pipeline_id, agente_id)
    if formato == "csv":
        return csv_response(
            _nombre("operaciones", desde, hasta),
            service.COLUMNAS_OPERACIONES,
            service.filas_csv_operaciones(reporte),
        )
    return reporte


@router.get("/comisiones", response_model=ReporteComisiones, dependencies=SOLO_STAFF)
def reporte_comisiones(
    rango: tuple[date, date] = Depends(periodo),
    agente_id: int | None = Query(default=None),
    cobrada: bool | None = Query(default=None),
    formato: Formato = Query(default="json"),
    db: Session = Depends(get_db),
) -> ReporteComisiones | Response:
    desde, hasta = rango
    reporte = service.comisiones(db, desde, hasta, agente_id, cobrada)
    if formato == "csv":
        return csv_response(
            _nombre("comisiones", desde, hasta),
            service.COLUMNAS_COMISIONES,
            service.filas_csv_comisiones(reporte),
        )
    return reporte
```

Si FastAPI rechaza `response_model` combinado con devolver `Response`, está bien: devolver una `Response` saltea la validación. Si el `-> ReporteOperaciones | Response` molesta a la generación de OpenAPI, quitar la anotación de retorno y dejar solo `response_model`.

- [x] **Step 7: Montar** en `src/app/main.py`: `from app.platform.reportes.router import router as reportes_router` y `app.include_router(reportes_router, prefix="/api/v1")` después de `alquileres_router`.

- [x] **Step 8: Correr** `python -m pytest tests/test_reportes.py -q` → PASS. Cosas que pueden fallar y cómo resolver: (a) comparación de `closed_at` con datetime aware en SQLite → si no filtra, cambiar `_deals_cerrados` para filtrar `closed_at` en Python (`desde <= _utc(d.closed_at).date() <= hasta`) manteniendo `isnot(None)` en SQL; (b) `assert lineas[0] == ...` con `\r\n` → `splitlines()` ya lo maneja.

- [x] **Step 9:** `ruff check app tests && ruff format app/platform/reportes tests/test_reportes.py app/main.py`.

---

### Task 6: Reportes `embudo` y `alquileres`

**Files:**
- Modify: `src/app/platform/reportes/service.py`, `router.py`
- Test: `src/tests/test_reportes.py` (segunda parte)

**Interfaces:**
- Consumes: `DealStageHistory` (Task 2), `Cobro`, `Pago`, `Liquidacion`, `Contrato`.
- Produces: `service.embudo(db, desde, hasta, pipeline_id) -> ReporteEmbudo`, `service.alquileres(db, desde, hasta) -> ReporteAlquileres`.

- [x] **Step 1: Tests** — agregar al final de `test_reportes.py`:

```python
def test_embudo_conversion_y_dias(client, db, sesion):
    from app.platform.deals.models import DealStageHistory

    venta = pipeline_por_nombre(db, "Venta")
    a = _deal(client, db)  # Consulta → Visita → Ganada
    _mover(client, db, a["id"], "Visita")
    _mover(client, db, a["id"], "Ganada")
    b = _deal(client, db)  # Consulta → Perdida
    _mover(client, db, b["id"], "Perdida")
    _deal(client, db)  # queda en Consulta

    # Estadía cerrada de `a` en Consulta: 4 días (fabricado para el promedio).
    consulta = etapa(venta, "Consulta")
    est = (
        db.query(DealStageHistory)
        .filter(DealStageHistory.deal_id == a["id"], DealStageHistory.stage_id == consulta.id)
        .one()
    )
    est.entered_at = est.left_at - timedelta(days=4)
    db.commit()

    r = client.get(f"/api/v1/reportes/embudo?pipeline_id={venta.id}&desde={HOY - timedelta(days=30)}")
    assert r.status_code == 200, r.text
    body = r.json()
    etapas = {e["nombre"]: e for e in body["etapas"]}
    assert [e["nombre"] for e in body["etapas"]] == ["Consulta", "Visita", "Oferta", "Ganada", "Perdida"]
    assert etapas["Consulta"]["ingresaron"] == 3
    assert etapas["Consulta"]["actuales"] == 1
    # De 3 que entraron a Consulta, solo `a` avanzó (b se perdió, c sigue ahí).
    assert etapas["Consulta"]["conversion_pct"] == "33.33"
    assert etapas["Visita"]["ingresaron"] == 1 and etapas["Visita"]["conversion_pct"] == "100.00"
    assert etapas["Oferta"]["ingresaron"] == 0 and etapas["Oferta"]["conversion_pct"] is None
    assert etapas["Ganada"]["conversion_pct"] is None
    assert Decimal(etapas["Consulta"]["dias_promedio"]) == Decimal("2.00")  # (4 + 0) / 2 cerradas
    assert body["ganadas"] == 1 and body["perdidas"] == 1 and body["tasa_cierre_pct"] == "50.00"
    assert body["dias_promedio_cierre"] is not None


def test_embudo_pipeline_inexistente_404_y_requerido_422(client, sesion):
    assert client.get("/api/v1/reportes/embudo?pipeline_id=999").json()["detail"] == "Pipeline no encontrado"
    assert client.get("/api/v1/reportes/embudo").status_code == 422


def test_embudo_csv(client, db, sesion):
    venta = pipeline_por_nombre(db, "Venta")
    r = client.get(f"/api/v1/reportes/embudo?pipeline_id={venta.id}&formato=csv")
    assert r.headers["content-type"].startswith("text/csv")
    assert r.content.decode("utf-8-sig").splitlines()[0] == "etapa;ingresaron;actuales;dias_promedio;conversion_pct"


def test_alquileres_por_mes(client, db, sesion):
    from tests.helpers_crm import crear_contrato_de_prueba

    inicio = (MES_PASADO - timedelta(days=70)).replace(day=1)
    c = crear_contrato_de_prueba(db, sesion.id, fecha_inicio=inicio, fecha_fin=inicio + timedelta(days=700))
    cobro = next(x for x in c.cobros if x.periodo == MES_PASADO)
    r = client.post(
        f"/api/v1/alquileres/contratos/{c.id}/cobros/{cobro.id}/pagos",
        json={"fecha_pago": str(MES_PASADO + timedelta(days=3)), "monto": "40000", "punitorio": "0", "medio": "efectivo"},
    )
    assert r.status_code == 201, r.text

    r = client.get(f"/api/v1/reportes/alquileres?desde={MES_PASADO}&hasta={HOY}")
    assert r.status_code == 200, r.text
    body = r.json()
    filas = {f["mes"]: f for f in body["filas"]}
    assert set(filas) == {MES_PASADO.strftime(YM), MES_ACTUAL.strftime(YM)}
    pasado = filas[MES_PASADO.strftime(YM)]
    assert pasado["moneda"] == "ARS"
    assert pasado["esperado"] == "100000.00"
    assert pasado["cobrado"] == "40000.00"
    assert pasado["pendiente"] == "60000.00"
    assert pasado["contratos_vigentes"] == 1
    assert pasado["honorarios"] == "0.00"  # sin liquidación emitida
    assert body["totales"][0]["esperado"] == "200000.00"


def test_alquileres_sin_datos_devuelve_ceros_en_ars(client, sesion):
    body = client.get(f"/api/v1/reportes/alquileres?desde={MES_ACTUAL}&hasta={HOY}").json()
    assert body["filas"] == [{
        "mes": MES_ACTUAL.strftime(YM), "moneda": "ARS", "esperado": "0.00", "cobrado": "0.00",
        "pendiente": "0.00", "honorarios": "0.00", "contratos_vigentes": 0,
    }]
```

- [x] **Step 2: Correr** → FAIL (404 de ruta).

- [x] **Step 3: Service** — agregar a `service.py` (imports extra: `from collections import defaultdict`, `from app.platform.alquileres.models import Cobro, Contrato, EstadoCobro, EstadoContrato, Liquidacion, Pago`, y los schemas `FilaAlquileres, FilaEmbudo, ReporteAlquileres, ReporteEmbudo`):

```python
# ---------------------------------------------------------------------------
# Embudo
# ---------------------------------------------------------------------------


def _promedio_dias(pares: list[tuple[datetime, datetime]]) -> Decimal | None:
    if not pares:
        return None
    segundos = sum((_utc(fin) - _utc(inicio)).total_seconds() for inicio, fin in pares)
    return redondear(Decimal(segundos) / Decimal(86400 * len(pares)))


def _porcentaje(parte: int, total: int) -> Decimal | None:
    if total == 0:
        return None
    return redondear(Decimal(parte) * 100 / Decimal(total))


def embudo(db: Session, desde: date, hasta: date, pipeline_id: int) -> ReporteEmbudo:
    pipeline = db.get(Pipeline, pipeline_id)
    if pipeline is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pipeline no encontrado")
    inicio, fin = _limites(desde, hasta)

    del_periodo = (
        db.query(DealStageHistory)
        .join(Deal, Deal.id == DealStageHistory.deal_id)
        .filter(
            Deal.deleted_at.is_(None),
            Deal.pipeline_id == pipeline_id,
            DealStageHistory.entered_at >= inicio,
            DealStageHistory.entered_at < fin,
        )
        .all()
    )
    por_etapa: dict[int, list[DealStageHistory]] = defaultdict(list)
    for e in del_periodo:
        por_etapa[e.stage_id].append(e)

    # Para "avanzó" se mira el historial completo de esos deals, no solo el del período.
    deal_ids = {e.deal_id for e in del_periodo}
    por_deal: dict[int, list[DealStageHistory]] = defaultdict(list)
    if deal_ids:
        for e in db.query(DealStageHistory).filter(DealStageHistory.deal_id.in_(deal_ids)).all():
            por_deal[e.deal_id].append(e)
    posicion = {s.id: s.position for s in pipeline.stages}
    perdida = {s.id: s.is_lost for s in pipeline.stages}

    etapas = []
    for s in pipeline.stages:
        propias = por_etapa.get(s.id, [])
        ingresaron = {e.deal_id for e in propias}
        conversion = None
        if not (s.is_won or s.is_lost):
            avanzaron = 0
            for deal_id in ingresaron:
                primera = min(_utc(e.entered_at) for e in propias if e.deal_id == deal_id)
                if any(
                    _utc(x.entered_at) > primera
                    and posicion[x.stage_id] > s.position
                    and not perdida[x.stage_id]
                    for x in por_deal[deal_id]
                ):
                    avanzaron += 1
            conversion = _porcentaje(avanzaron, len(ingresaron))
        etapas.append(
            FilaEmbudo(
                stage_id=s.id,
                nombre=s.name,
                position=s.position,
                is_won=s.is_won,
                is_lost=s.is_lost,
                ingresaron=len(ingresaron),
                actuales=db.query(Deal)
                .filter(Deal.stage_id == s.id, Deal.deleted_at.is_(None))
                .count(),
                dias_promedio=_promedio_dias(
                    [(e.entered_at, e.left_at) for e in propias if e.left_at is not None]
                ),
                conversion_pct=conversion,
            )
        )

    cerrados = _deals_cerrados(db, desde, hasta, pipeline_id)
    ganados = [d for d in cerrados if d.is_won]
    perdidos = [d for d in cerrados if d.is_lost]
    return ReporteEmbudo(
        desde=desde,
        hasta=hasta,
        pipeline_id=pipeline.id,
        pipeline=pipeline.name,
        etapas=etapas,
        ganadas=len(ganados),
        perdidas=len(perdidos),
        tasa_cierre_pct=_porcentaje(len(ganados), len(cerrados)),
        dias_promedio_cierre=_promedio_dias([(d.created_at, d.closed_at) for d in ganados]),
    )


COLUMNAS_EMBUDO = ["etapa", "ingresaron", "actuales", "dias_promedio", "conversion_pct"]


def filas_csv_embudo(reporte: ReporteEmbudo) -> list[list[object]]:
    return [
        [e.nombre, e.ingresaron, e.actuales, e.dias_promedio, e.conversion_pct]
        for e in reporte.etapas
    ]


# ---------------------------------------------------------------------------
# Alquileres
# ---------------------------------------------------------------------------


def alquileres(db: Session, desde: date, hasta: date) -> ReporteAlquileres:
    meses = meses_del_rango(desde, hasta)
    primer_dia = date.fromisoformat(meses[0] + "-01")
    fin_exclusivo = date.fromisoformat(meses[-1] + "-01") + relativedelta(months=1)

    cobros = (
        db.query(Cobro)
        .options(joinedload(Cobro.contrato), joinedload(Cobro.pagos))
        .filter(
            Cobro.periodo >= primer_dia,
            Cobro.periodo < fin_exclusivo,
            Cobro.estado != EstadoCobro.anulado,
        )
        .all()
    )
    pagos = (
        db.query(Pago)
        .join(Cobro, Cobro.id == Pago.cobro_id)
        .options(joinedload(Pago.cobro).joinedload(Cobro.contrato))
        .filter(
            Pago.anulado_at.is_(None), Pago.fecha_pago >= primer_dia, Pago.fecha_pago < fin_exclusivo
        )
        .all()
    )
    liquidaciones = (
        db.query(Liquidacion)
        .options(joinedload(Liquidacion.contrato))
        .filter(Liquidacion.periodo >= primer_dia, Liquidacion.periodo < fin_exclusivo)
        .all()
    )
    contratos = (
        db.query(Contrato)
        .filter(Contrato.fecha_inicio < fin_exclusivo, Contrato.fecha_fin >= primer_dia)
        .all()
    )

    monedas = _monedas({c.contrato.moneda for c in cobros} | {c.moneda for c in contratos})
    filas = {
        (mes, moneda): FilaAlquileres(mes=mes, moneda=moneda)
        for mes in meses
        for moneda in monedas
    }
    for c in cobros:
        fila = filas[(_mes(c.periodo), c.contrato.moneda)]
        fila.esperado += c.monto
        if c.estado in (EstadoCobro.pendiente, EstadoCobro.parcial):
            fila.pendiente += c.saldo
    for p in pagos:
        filas[(_mes(p.fecha_pago), p.cobro.contrato.moneda)].cobrado += p.monto
    for liq in liquidaciones:
        filas[(_mes(liq.periodo), liq.contrato.moneda)].honorarios += liq.honorarios_monto
    for c in contratos:
        for mes in meses:
            inicio_mes = date.fromisoformat(mes + "-01")
            fin_mes = inicio_mes + relativedelta(months=1) - timedelta(days=1)
            rescindido_antes = (
                c.estado == EstadoContrato.rescindido
                and c.fecha_rescision is not None
                and c.fecha_rescision < inicio_mes
            )
            if c.fecha_inicio <= fin_mes and c.fecha_fin >= inicio_mes and not rescindido_antes:
                filas[(mes, c.moneda)].contratos_vigentes += 1

    return ReporteAlquileres(
        desde=desde,
        hasta=hasta,
        filas=list(filas.values()),
        totales=[_total_alquileres(filas.values(), moneda) for moneda in monedas],
    )


def _total_alquileres(filas, moneda: str) -> FilaAlquileres:
    propias = [f for f in filas if f.moneda == moneda]
    return FilaAlquileres(
        mes="total",
        moneda=moneda,
        esperado=sum((f.esperado for f in propias), CERO),
        cobrado=sum((f.cobrado for f in propias), CERO),
        pendiente=sum((f.pendiente for f in propias), CERO),
        honorarios=sum((f.honorarios for f in propias), CERO),
        contratos_vigentes=max((f.contratos_vigentes for f in propias), default=0),
    )


COLUMNAS_ALQUILERES = [
    "mes", "moneda", "esperado", "cobrado", "pendiente", "honorarios", "contratos_vigentes",
]  # fmt: skip


def filas_csv_alquileres(reporte: ReporteAlquileres) -> list[list[object]]:
    return [[getattr(f, c) for c in COLUMNAS_ALQUILERES] for f in reporte.filas + reporte.totales]
```

Verificar en `alquileres/models.py` que `Cobro.saldo` es una `@property` (sí, línea ~326) y que `Liquidacion` no tiene estado "anulada" (sus estados son `emitida`/`pagada`: se suman todas).

- [x] **Step 4: Router** — agregar a `reportes/router.py` (imports: `ReporteAlquileres, ReporteEmbudo`):

```python
@router.get("/embudo", response_model=ReporteEmbudo, dependencies=SOLO_STAFF)
def reporte_embudo(
    pipeline_id: int = Query(...),
    rango: tuple[date, date] = Depends(periodo),
    formato: Formato = Query(default="json"),
    db: Session = Depends(get_db),
) -> ReporteEmbudo | Response:
    desde, hasta = rango
    reporte = service.embudo(db, desde, hasta, pipeline_id)
    if formato == "csv":
        return csv_response(
            _nombre("embudo", desde, hasta), service.COLUMNAS_EMBUDO, service.filas_csv_embudo(reporte)
        )
    return reporte


@router.get("/alquileres", response_model=ReporteAlquileres, dependencies=SOLO_STAFF)
def reporte_alquileres(
    rango: tuple[date, date] = Depends(periodo),
    formato: Formato = Query(default="json"),
    db: Session = Depends(get_db),
) -> ReporteAlquileres | Response:
    desde, hasta = rango
    reporte = service.alquileres(db, desde, hasta)
    if formato == "csv":
        return csv_response(
            _nombre("alquileres", desde, hasta),
            service.COLUMNAS_ALQUILERES,
            service.filas_csv_alquileres(reporte),
        )
    return reporte
```

- [x] **Step 5: Correr** `python -m pytest tests/test_reportes.py -q` → PASS. Si el `dias_promedio` de Consulta no da `2.00`, revisar que la estadía de `c` (aún abierta) no entre en el promedio y que la de `b` (cerrada al perderse, ~0 días) sí.

- [x] **Step 6:** `python -m pytest tests/ -q`, `ruff check app tests`, `ruff format app/platform/reportes tests/test_reportes.py`.

---

### Task 7: Cierre del backend — despliegue y verificación

**Files:**
- Modify: `docs/despliegue.md`

- [x] **Step 1:** Agregar al final de `docs/despliegue.md`:

```markdown
### Comisiones y reportes (migración `0008`)

`alembic upgrade head` crea `comisiones`, `comisiones_reparto` y `deal_stage_history`, y carga en esta última una estadía abierta por cada operación viva (su etapa actual desde `stage_changed_at`): el embudo arranca con lo que se sabe y se completa con el uso. Las operaciones ganadas **antes** de esta migración no tienen comisión: la ficha muestra "Sin comisión cargada" y se carga a mano con "Cargar comisión". Sin variables nuevas. La exportación CSV usa `;` y coma decimal (Excel en español).
```

- [x] **Step 2: Verificación completa del backend** desde `src/`:

```bash
python -m pytest tests/ -q && ruff check app tests && alembic check
```
Esperado: todo verde; `alembic check` sin operaciones pendientes.

---

## Frontend

### Task 8: Tipos, API y helpers de formato

**Files:**
- Create: `client/src/types/comision.ts`, `client/src/types/reportes.ts`, `client/src/api/reportes.ts`
- Modify: `client/src/api/operaciones.ts`, `client/src/lib/formato.ts`
- Test: `client/src/lib/formato.test.ts`, `client/src/api/reportes.test.ts`

**Interfaces:**
- Produces: `Comision`, `ComisionIn`, `RepartoIn`, `RepartoOut`; `Reporte*`/`Fila*`, `FiltrosReporte`, `NombreReporte`; `operacionesApi.comision(id)`, `operacionesApi.guardarComision(id, body)`; `reportesApi.{operaciones,comisiones,embudo,alquileres,urlCsv}`; `etiquetaMes`, `etiquetaMesCorta`, `formatearPorcentaje`.

- [x] **Step 1: Tests de formato** — al final de `client/src/lib/formato.test.ts`:

```ts
import { etiquetaMes, etiquetaMesCorta, formatearPorcentaje } from './formato'

it('etiquetaMes y etiquetaMesCorta', () => {
  expect(etiquetaMes('2026-09')).toBe('sep 2026')
  expect(etiquetaMesCorta('2026-09')).toBe('sep 26')
  expect(etiquetaMes('total')).toBe('Total')
})

it('formatearPorcentaje acepta string, number y null', () => {
  expect(formatearPorcentaje('33.33')).toBe('33,33 %')
  expect(formatearPorcentaje(3)).toBe('3 %')
  expect(formatearPorcentaje(null)).toBe('—')
})
```

(Si el archivo ya importa de `./formato` arriba, sumar los nombres a ese import en vez de repetirlo.)

- [x] **Step 2: Correr** `npm test -- formato` → FAIL.

- [x] **Step 3: Helpers** — al final de `client/src/lib/formato.ts`:

```ts
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** `2026-09` → "sep 2026". El `mes: "total"` de los reportes se lee "Total". */
export function etiquetaMes(ym: string): string {
  if (ym === 'total') return 'Total'
  const [a, m] = ym.split('-').map(Number)
  return `${MESES_CORTOS[m - 1] ?? '?'} ${a}`
}

/** `2026-09` → "sep 26", para el eje de los gráficos. */
export function etiquetaMesCorta(ym: string): string {
  const [a, m] = ym.split('-').map(Number)
  return `${MESES_CORTOS[m - 1] ?? '?'} ${String(a).slice(2)}`
}

export function formatearPorcentaje(pct: number | string | null): string {
  if (pct === null) return '—'
  const n = typeof pct === 'string' ? Number(pct) : pct
  if (Number.isNaN(n)) return '—'
  return `${n.toLocaleString('es-AR')} %`
}
```

- [x] **Step 4: Tipos** `client/src/types/comision.ts`:

```ts
export interface RepartoIn { user_id: number; pct: number }

export interface ComisionIn {
  monto_operacion: number
  pct: number | null
  monto: number | null
  cobrada: boolean
  fecha_cobro: string | null
  notas: string | null
  reparto: RepartoIn[]
}

export interface RepartoOut { user_id: number; nombre: string; pct: string; monto: string }

export interface Comision {
  deal_id: number
  monto_operacion: string
  moneda: string
  pct: string | null
  monto: string
  cobrada: boolean
  fecha_cobro: string | null
  notas: string | null
  reparto: RepartoOut[]
  sin_monto: boolean
  updated_at: string
}
```

`client/src/types/reportes.ts`:

```ts
import type { RepartoOut } from './comision'

export interface FilaOperaciones {
  mes: string; moneda: string; ganadas: number; perdidas: number
  monto_ganado: string; comisiones: string; comisiones_cobradas: string
}
export interface ReporteOperaciones {
  desde: string; hasta: string; pipeline_id: number | null; agente_id: number | null
  filas: FilaOperaciones[]; totales: FilaOperaciones[]
}

export interface FilaComision {
  deal_id: number; titulo: string; pipeline: string; closed_at: string; moneda: string
  monto_operacion: string; pct: string | null; monto: string; cobrada: boolean
  fecha_cobro: string | null; reparto: RepartoOut[]
}
export interface FilaAgente {
  user_id: number | null; nombre: string; moneda: string
  operaciones: number; comision: string; cobrada: string
}
export interface ReporteComisiones {
  desde: string; hasta: string; agente_id: number | null; cobrada: boolean | null
  filas: FilaComision[]; por_agente: FilaAgente[]
}

export interface FilaEmbudo {
  stage_id: number; nombre: string; position: number; is_won: boolean; is_lost: boolean
  ingresaron: number; actuales: number; dias_promedio: string | null; conversion_pct: string | null
}
export interface ReporteEmbudo {
  desde: string; hasta: string; pipeline_id: number; pipeline: string
  etapas: FilaEmbudo[]; ganadas: number; perdidas: number
  tasa_cierre_pct: string | null; dias_promedio_cierre: string | null
}

export interface FilaAlquileres {
  mes: string; moneda: string; esperado: string; cobrado: string
  pendiente: string; honorarios: string; contratos_vigentes: number
}
export interface ReporteAlquileres {
  desde: string; hasta: string; filas: FilaAlquileres[]; totales: FilaAlquileres[]
}

export type NombreReporte = 'operaciones' | 'comisiones' | 'embudo' | 'alquileres'

export interface FiltrosReporte {
  desde?: string
  hasta?: string
  pipeline_id?: number
  agente_id?: number
  cobrada?: boolean
}
```

- [x] **Step 5: API** — en `client/src/api/operaciones.ts` sumar `import type { Comision, ComisionIn } from '../types/comision'` y, dentro de `operacionesApi`:

```ts
  comision:        (id: number)                   => api.get<Comision>(`${BASE}/deals/${id}/comision`),
  guardarComision: (id: number, data: ComisionIn) => api.put<Comision>(`${BASE}/deals/${id}/comision`, data),
```

Crear `client/src/api/reportes.ts`:

```ts
import { api, BASE_URL } from './client'
import { construirQuery } from '../lib/query'
import type {
  FiltrosReporte, NombreReporte, ReporteAlquileres, ReporteComisiones, ReporteEmbudo, ReporteOperaciones,
} from '../types/reportes'

const BASE = '/api/v1/reportes'

export const reportesApi = {
  operaciones: (f: FiltrosReporte = {}) => api.get<ReporteOperaciones>(`${BASE}/operaciones${construirQuery(f)}`),
  comisiones:  (f: FiltrosReporte = {}) => api.get<ReporteComisiones>(`${BASE}/comisiones${construirQuery(f)}`),
  embudo:      (f: FiltrosReporte = {}) => api.get<ReporteEmbudo>(`${BASE}/embudo${construirQuery(f)}`),
  alquileres:  (f: FiltrosReporte = {}) => api.get<ReporteAlquileres>(`${BASE}/alquileres${construirQuery(f)}`),
  /** URL absoluta del CSV: se abre con un `<a download>`; la cookie viaja porque es first-party. */
  urlCsv: (reporte: NombreReporte, f: FiltrosReporte = {}) =>
    `${BASE_URL}${BASE}/${reporte}${construirQuery({ ...f, formato: 'csv' })}`,
}
```

Test `client/src/api/reportes.test.ts`:

```ts
import { reportesApi } from './reportes'

it('urlCsv arma la query con formato=csv y omite filtros vacíos', () => {
  const url = reportesApi.urlCsv('operaciones', { desde: '2026-01-01', hasta: '2026-09-30', pipeline_id: 2, agente_id: undefined })
  expect(url).toMatch(/\/api\/v1\/reportes\/operaciones\?desde=2026-01-01&hasta=2026-09-30&pipeline_id=2&formato=csv$/)
})
```

- [x] **Step 6: Correr** `npm test -- formato reportes` → PASS; `npx tsc --noEmit` limpio.

---

### Task 9: `ModalComision` y sección "Comisión" en la ficha de la operación

**Files:**
- Create: `client/src/components/crm/ModalComision/ModalComision.tsx`, `ModalComision.test.tsx`
- Create: `client/src/components/crm/BloqueComision/BloqueComision.tsx`, `BloqueComision.css`, `BloqueComision.test.tsx`
- Modify: `client/src/pages/admin/operaciones/Ficha.tsx`, `Ficha.contrato.test.tsx` (mock)

**Interfaces:**
- Consumes: `operacionesApi.comision/guardarComision`, `usuariosApi.listar`, `Modal`, `Badge`, `formatearMonto`, `formatearFecha`, `formatearPorcentaje`.
- Produces: `<ModalComision operacion usuarios inicial? onGuardar onCerrar />`, `<BloqueComision operacion usuarios />`.

- [x] **Step 1: Test del modal** `ModalComision.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ModalComision from './ModalComision'
import type { Operacion } from '../../../types/operacion'
import type { Comision } from '../../../types/comision'

const OP = { id: 9, amount: 1000000, currency: 'ARS', assigned_to_user_id: 1 } as Operacion
const USUARIOS = [{ id: 1, name: 'Ana', email: 'a@m.ar' }, { id: 2, name: 'Juan', email: 'j@m.ar' }]
const INICIAL: Comision = {
  deal_id: 9, monto_operacion: '1000000.00', moneda: 'ARS', pct: '3.00', monto: '30000.00',
  cobrada: false, fecha_cobro: null, notas: null, sin_monto: false, updated_at: '',
  reparto: [{ user_id: 1, nombre: 'Ana', pct: '100.00', monto: '30000.00' }],
}

it('recalcula el monto al cambiar el porcentaje y envía el body', async () => {
  const usuario = userEvent.setup()
  const onGuardar = vi.fn().mockResolvedValue(undefined)
  render(<ModalComision operacion={OP} usuarios={USUARIOS} inicial={INICIAL} onGuardar={onGuardar} onCerrar={() => {}} />)

  const pct = screen.getByLabelText('Porcentaje')
  await usuario.clear(pct)
  await usuario.type(pct, '4')
  expect(screen.getByLabelText('Comisión')).toHaveValue(40000)

  await usuario.click(screen.getByLabelText('Cobrada'))
  await usuario.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(onGuardar).toHaveBeenCalledWith({
    monto_operacion: 1000000, pct: 4, monto: 40000, cobrada: true, fecha_cobro: expect.any(String),
    notas: null, reparto: [{ user_id: 1, pct: 100 }],
  })
})

it('bloquea guardar si el reparto supera el 100 %', async () => {
  const usuario = userEvent.setup()
  render(<ModalComision operacion={OP} usuarios={USUARIOS} inicial={INICIAL} onGuardar={vi.fn()} onCerrar={() => {}} />)
  await usuario.click(screen.getByRole('button', { name: 'Agregar agente' }))
  const selects = screen.getAllByLabelText('Agente')
  await usuario.selectOptions(selects[1], '2')
  const pcts = screen.getAllByLabelText('% del agente')
  await usuario.clear(pcts[1])
  await usuario.type(pcts[1], '10')
  expect(screen.getByText(/supera el 100 %/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
})

it('sin comisión previa arranca con el monto del deal y el asignado al 100 %', () => {
  render(<ModalComision operacion={OP} usuarios={USUARIOS} onGuardar={vi.fn()} onCerrar={() => {}} />)
  expect(screen.getByLabelText('Monto de la operación')).toHaveValue(1000000)
  expect(screen.getByLabelText('Agente')).toHaveValue('1')
})
```

- [x] **Step 2: Correr** `npm test -- ModalComision` → FAIL.

- [x] **Step 3: Modal** `ModalComision.tsx`:

```tsx
import { useState } from 'react'
import type { Operacion } from '../../../types/operacion'
import type { Comision, ComisionIn } from '../../../types/comision'
import type { UsuarioBrief } from '../../../types/inmobiliaria'
import { hoyIso } from '../../../lib/alquileres'
import { formatearMonto } from '../../../lib/formato'
import Modal from '../Modal/Modal'

interface FilaReparto { user_id: string; pct: string }

interface Props {
  operacion: Operacion
  usuarios: UsuarioBrief[]
  /** Sin `inicial` es un alta: arranca con el monto del deal y el asignado al 100 %. */
  inicial?: Comision
  onGuardar: (body: ComisionIn) => Promise<void>
  onCerrar: () => void
}

const redondear = (n: number) => Math.round(n * 100) / 100

/**
 * Alta/edición completa de la comisión. Escribir el % recalcula el monto; escribir
 * el monto deja el % como referencia. El reparto es en % de la comisión y no puede
 * pasar de 100 (lo que sobra queda para la inmobiliaria).
 */
export default function ModalComision({ operacion, usuarios, inicial, onGuardar, onCerrar }: Props) {
  const [montoOperacion, setMontoOperacion] = useState(String(Number(inicial?.monto_operacion ?? operacion.amount ?? 0)))
  const [pct, setPct] = useState(inicial?.pct !== null && inicial?.pct !== undefined ? String(Number(inicial.pct)) : '')
  const [monto, setMonto] = useState(String(Number(inicial?.monto ?? 0)))
  const [cobrada, setCobrada] = useState(inicial?.cobrada ?? false)
  const [fechaCobro, setFechaCobro] = useState(inicial?.fecha_cobro ?? hoyIso())
  const [notas, setNotas] = useState(inicial?.notas ?? '')
  const [reparto, setReparto] = useState<FilaReparto[]>(
    inicial
      ? inicial.reparto.map(r => ({ user_id: String(r.user_id), pct: String(Number(r.pct)) }))
      : operacion.assigned_to_user_id ? [{ user_id: String(operacion.assigned_to_user_id), pct: '100' }] : [],
  )
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recalcular = (nuevoMontoOp: string, nuevoPct: string) => {
    if (nuevoPct === '') return
    setMonto(String(redondear(Number(nuevoMontoOp) * Number(nuevoPct) / 100)))
  }

  const sumaReparto = reparto.reduce((acc, r) => acc + (Number(r.pct) || 0), 0)
  const repetidos = new Set(reparto.map(r => r.user_id)).size !== reparto.length
  const incompleto = reparto.some(r => r.user_id === '' || r.pct === '' || Number(r.pct) <= 0)
  const valido = monto !== '' && Number(monto) >= 0 && sumaReparto <= 100 && !repetidos && !incompleto

  const actualizarFila = (i: number, cambio: Partial<FilaReparto>) =>
    setReparto(filas => filas.map((f, j) => (j === i ? { ...f, ...cambio } : f)))

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valido) return
    setEnviando(true)
    setError(null)
    try {
      await onGuardar({
        monto_operacion: Number(montoOperacion),
        pct: pct === '' ? null : Number(pct),
        monto: Number(monto),
        cobrada,
        fecha_cobro: cobrada ? fechaCobro : null,
        notas: notas.trim() || null,
        reparto: reparto.map(r => ({ user_id: Number(r.user_id), pct: Number(r.pct) })),
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la comisión')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal titulo={inicial ? 'Editar comisión' : 'Cargar comisión'} onCerrar={onCerrar}>
      <form onSubmit={confirmar} className="form">
        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="com-monto-op">Monto de la operación</label>
            <input
              id="com-monto-op" type="number" min={0} step="0.01" required value={montoOperacion}
              onChange={e => { setMontoOperacion(e.target.value); recalcular(e.target.value, pct) }}
            />
          </div>
          <div className="form-field">
            <label htmlFor="com-pct">Porcentaje</label>
            <input
              id="com-pct" type="number" min={0} max={100} step="0.01" value={pct}
              onChange={e => { setPct(e.target.value); recalcular(montoOperacion, e.target.value) }}
            />
          </div>
          <div className="form-field">
            <label htmlFor="com-monto">Comisión</label>
            <input id="com-monto" type="number" min={0} step="0.01" required value={monto} onChange={e => setMonto(e.target.value)} />
          </div>
        </div>

        <fieldset className="form-field">
          <legend>Reparto entre agentes</legend>
          {reparto.map((fila, i) => (
            <div className="form-row" key={i}>
              <select aria-label="Agente" value={fila.user_id} onChange={e => actualizarFila(i, { user_id: e.target.value })}>
                <option value="">Elegí un agente</option>
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <input aria-label="% del agente" type="number" min={0} max={100} step="0.01" value={fila.pct} onChange={e => actualizarFila(i, { pct: e.target.value })} />
              <button type="button" className="btn btn-outline" onClick={() => setReparto(filas => filas.filter((_, j) => j !== i))}>Quitar</button>
            </div>
          ))}
          <button type="button" className="btn btn-outline" onClick={() => setReparto(filas => [...filas, { user_id: '', pct: '' }])}>Agregar agente</button>
          <p className="form-hint" aria-live="polite">
            {sumaReparto > 100
              ? `El reparto supera el 100 % (${sumaReparto} %)`
              : repetidos
                ? 'Un agente aparece dos veces'
                : `Repartido ${sumaReparto} % · Inmobiliaria ${redondear(100 - sumaReparto)} % · ${formatearMonto(redondear(Number(monto) * (100 - sumaReparto) / 100), operacion.currency)}`}
          </p>
        </fieldset>

        <div className="form-row">
          <label className="form-check">
            <input type="checkbox" aria-label="Cobrada" checked={cobrada} onChange={e => setCobrada(e.target.checked)} />
            Cobrada
          </label>
          <div className="form-field">
            <label htmlFor="com-fecha">Fecha de cobro</label>
            <input id="com-fecha" type="date" disabled={!cobrada} max={hoyIso()} value={fechaCobro} onChange={e => setFechaCobro(e.target.value)} />
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="com-notas">Notas</label>
          <input id="com-notas" value={notas} onChange={e => setNotas(e.target.value)} placeholder="Opcional" />
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn btn-magenta" disabled={!valido || enviando}>Guardar</button>
        </div>
      </form>
    </Modal>
  )
}
```

Si `.form-check`/`.form-actions` no existen en el CSS del panel, usar las clases que use `ModalRegistrarPago` para su botonera (mirar el final de ese archivo) y un `<div className="form-field">` para el checkbox.

- [x] **Step 4: Correr** `npm test -- ModalComision` → PASS. Si el checkbox no se encuentra por `aria-label`, usar `getByRole('checkbox', { name: 'Cobrada' })` en el test.

- [x] **Step 5: Test del bloque** `BloqueComision.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BloqueComision from './BloqueComision'
import { operacionesApi } from '../../../api/operaciones'
import type { Operacion } from '../../../types/operacion'
import type { Comision } from '../../../types/comision'

vi.mock('../../../api/operaciones', () => ({ operacionesApi: { comision: vi.fn(), guardarComision: vi.fn() } }))

const OP = { id: 9, amount: 1000000, currency: 'ARS', assigned_to_user_id: 1, is_won: true } as Operacion
const COMISION: Comision = {
  deal_id: 9, monto_operacion: '1000000.00', moneda: 'ARS', pct: '3.00', monto: '30000.00',
  cobrada: true, fecha_cobro: '2026-09-10', notas: null, sin_monto: false, updated_at: '',
  reparto: [{ user_id: 1, nombre: 'Ana', pct: '60.00', monto: '18000.00' }],
}

it('muestra la comisión, el reparto y lo que queda para la inmobiliaria', async () => {
  vi.mocked(operacionesApi.comision).mockResolvedValue(COMISION)
  render(<BloqueComision operacion={OP} usuarios={[]} />)
  expect(await screen.findByText('ARS 30.000')).toBeInTheDocument()
  expect(screen.getByText('Cobrada 10/09/2026')).toBeInTheDocument()
  expect(screen.getByText(/Ana · 60 % · ARS 18.000/)).toBeInTheDocument()
  expect(screen.getByText(/Inmobiliaria · 40 % · ARS 12.000/)).toBeInTheDocument()
})

it('sin comisión ofrece cargarla y guarda', async () => {
  const usuario = userEvent.setup()
  vi.mocked(operacionesApi.comision).mockRejectedValueOnce(new Error('La operación no tiene comisión cargada'))
  vi.mocked(operacionesApi.guardarComision).mockResolvedValue(COMISION)
  vi.mocked(operacionesApi.comision).mockResolvedValue(COMISION)
  render(<BloqueComision operacion={OP} usuarios={[{ id: 1, name: 'Ana', email: 'a@m.ar' }]} />)
  expect(await screen.findByText('Sin comisión cargada')).toBeInTheDocument()
  await usuario.click(screen.getByRole('button', { name: 'Cargar comisión' }))
  await usuario.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(operacionesApi.guardarComision).toHaveBeenCalledWith(9, expect.objectContaining({ monto_operacion: 1000000 }))
  expect(await screen.findByText('ARS 30.000')).toBeInTheDocument()
})

it('marca la operación sin monto', async () => {
  vi.mocked(operacionesApi.comision).mockResolvedValue({ ...COMISION, monto_operacion: '0.00', monto: '0.00', sin_monto: true, reparto: [] })
  render(<BloqueComision operacion={OP} usuarios={[]} />)
  expect(await screen.findByText(/no tiene monto/)).toBeInTheDocument()
})
```

- [x] **Step 6: Bloque** `BloqueComision.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { operacionesApi } from '../../../api/operaciones'
import type { Operacion } from '../../../types/operacion'
import type { Comision, ComisionIn } from '../../../types/comision'
import type { UsuarioBrief } from '../../../types/inmobiliaria'
import Badge from '../../Badge'
import { formatearFecha, formatearMonto, formatearPorcentaje } from '../../../lib/formato'
import ModalComision from '../ModalComision/ModalComision'
import './BloqueComision.css'

interface Props {
  operacion: Operacion
  usuarios: UsuarioBrief[]
}

/**
 * Sección "Comisión" de la ficha de una operación ganada. `null` = el backend
 * respondió que no hay comisión cargada (404); `undefined` = todavía no se consultó.
 */
export default function BloqueComision({ operacion, usuarios }: Props) {
  const [comision, setComision] = useState<Comision | null | undefined>(undefined)
  const [editando, setEditando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = () => {
    operacionesApi.comision(operacion.id).then(setComision).catch(() => setComision(null))
  }
  useEffect(cargar, [operacion.id]) // eslint-disable-line

  const guardar = async (body: ComisionIn) => {
    await operacionesApi.guardarComision(operacion.id, body)
    setEditando(false)
    setError(null)
    cargar()
  }

  const repartido = comision ? comision.reparto.reduce((acc, r) => acc + Number(r.pct), 0) : 0
  const restoPct = Math.round((100 - repartido) * 100) / 100
  const restoMonto = comision ? Number(comision.monto) * restoPct / 100 : 0

  return (
    <section className="admin-card">
      <div className="bloque-comision-cabecera">
        <h2 className="form-section-title">Comisión</h2>
        {comision !== undefined && (
          <button className="btn btn-outline" onClick={() => setEditando(true)}>
            {comision ? 'Editar' : 'Cargar comisión'}
          </button>
        )}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}

      {comision === undefined && <p className="lista-estado">Cargando...</p>}
      {comision === null && <p className="lista-estado">Sin comisión cargada</p>}
      {comision && (
        <>
          {comision.sin_monto && (
            <p className="form-hint">La operación no tiene monto: cargalo para calcular la comisión.</p>
          )}
          <dl className="ficha-op-datos">
            <dt>Operación</dt>
            <dd>{formatearMonto(comision.monto_operacion, comision.moneda)}</dd>
            <dt>Porcentaje</dt>
            <dd>{formatearPorcentaje(comision.pct)}</dd>
            <dt>Comisión</dt>
            <dd>
              {formatearMonto(comision.monto, comision.moneda)}{' '}
              <Badge
                value={comision.cobrada ? 'cobrada' : 'a_cobrar'}
                color={comision.cobrada ? 'ok' : 'espera'}
                label={comision.cobrada ? `Cobrada ${formatearFecha(comision.fecha_cobro)}` : 'A cobrar'}
              />
            </dd>
          </dl>
          <ul className="bloque-comision-reparto">
            {comision.reparto.map(r => (
              <li key={r.user_id}>{r.nombre} · {formatearPorcentaje(r.pct)} · {formatearMonto(r.monto, comision.moneda)}</li>
            ))}
            {restoPct > 0 && (
              <li className="bloque-comision-resto">Inmobiliaria · {formatearPorcentaje(restoPct)} · {formatearMonto(restoMonto, comision.moneda)}</li>
            )}
          </ul>
          {comision.notas && <p className="ficha-op-notas">{comision.notas}</p>}
        </>
      )}

      {editando && (
        <ModalComision
          operacion={operacion}
          usuarios={usuarios}
          inicial={comision ?? undefined}
          onGuardar={guardar}
          onCerrar={() => setEditando(false)}
        />
      )}
    </section>
  )
}
```

`BloqueComision.css`:

```css
.bloque-comision-cabecera { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; }
.bloque-comision-reparto { list-style: none; padding: 0; margin: 0.75rem 0 0; display: grid; gap: 0.25rem; }
.bloque-comision-resto { color: var(--color-texto-suave, #666); }
```

- [x] **Step 7: Ficha** — en `Ficha.tsx`: `import BloqueComision from '../../../components/crm/BloqueComision/BloqueComision'`; dentro de `.ficha-op-grilla`, después de la `<section>` "Estado":

```tsx
        {op.is_won && <BloqueComision operacion={op} usuarios={usuarios} />}
```

En `Ficha.contrato.test.tsx`, sumar `comision: vi.fn().mockRejectedValue(new Error('sin comisión'))` al mock de `operacionesApi` (el DEAL de ese test es ganado y ahora dispara la consulta).

- [x] **Step 8: Correr** `npm test -- BloqueComision ModalComision Ficha` → PASS; `npx tsc --noEmit`.

---

### Task 10: Gráficos SVG (`GraficoBarras`, `GraficoEmbudo`)

**Files:**
- Create: `client/src/components/graficos/GraficoBarras.tsx`, `GraficoEmbudo.tsx`, `graficos.css`, `GraficoBarras.test.tsx`, `GraficoEmbudo.test.tsx`

**Interfaces:**
- Produces: `<GraficoBarras categorias series formatear? alto? />`, `<GraficoEmbudo etapas />`.

- [x] **Step 1: Tests**

`GraficoBarras.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import GraficoBarras from './GraficoBarras'

it('dibuja una barra por categoría y serie, con etiquetas', () => {
  render(<GraficoBarras categorias={['ene 26', 'feb 26']} series={[{ nombre: 'Ganadas', valores: [2, 5] }, { nombre: 'Perdidas', valores: [1, 0] }]} />)
  const svg = screen.getByRole('img', { name: /Ganadas.*Perdidas/ })
  expect(svg.querySelectorAll('rect.barra')).toHaveLength(4)
  expect(screen.getByText('ene 26')).toBeInTheDocument()
  expect(screen.getByText('feb 26')).toBeInTheDocument()
})

it('con todo en cero no rompe ni divide por cero', () => {
  render(<GraficoBarras categorias={['ene 26']} series={[{ nombre: 'Ganadas', valores: [0] }]} />)
  const barra = document.querySelector('rect.barra')!
  expect(Number(barra.getAttribute('height'))).toBe(0)
})
```

`GraficoEmbudo.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import GraficoEmbudo from './GraficoEmbudo'

it('una fila por etapa, proporcional al máximo', () => {
  render(<GraficoEmbudo etapas={[{ nombre: 'Consulta', valor: 10, detalle: '50 %' }, { nombre: 'Visita', valor: 5 }]} />)
  const filas = screen.getAllByRole('listitem')
  expect(filas).toHaveLength(2)
  expect(filas[0].querySelector('.embudo-barra')).toHaveStyle({ width: '100%' })
  expect(filas[1].querySelector('.embudo-barra')).toHaveStyle({ width: '50%' })
  expect(screen.getByText('50 %')).toBeInTheDocument()
})

it('con ceros las barras quedan en 0 %', () => {
  render(<GraficoEmbudo etapas={[{ nombre: 'Consulta', valor: 0 }]} />)
  expect(document.querySelector('.embudo-barra')).toHaveStyle({ width: '0%' })
})
```

- [x] **Step 2: Correr** `npm test -- Grafico` → FAIL.

- [x] **Step 3: Componentes**

`GraficoBarras.tsx`:

```tsx
import './graficos.css'

export interface Serie { nombre: string; valores: number[]; color?: string }

interface Props {
  categorias: string[]
  series: Serie[]
  formatear?: (v: number) => string
  alto?: number
}

const COLORES = ['var(--color-petroleo, #1f5f6b)', 'var(--color-magenta, #b0306a)', '#8a8a8a']
const ANCHO = 600
const MARGEN = { arriba: 8, abajo: 22, izq: 4, der: 4 }

/** Barras agrupadas por categoría (un mes) con una barra por serie. SVG puro, sin librería. */
export default function GraficoBarras({ categorias, series, formatear = v => v.toLocaleString('es-AR'), alto = 180 }: Props) {
  const maximo = Math.max(0, ...series.flatMap(s => s.valores))
  const areaAlto = alto - MARGEN.arriba - MARGEN.abajo
  const anchoGrupo = (ANCHO - MARGEN.izq - MARGEN.der) / Math.max(1, categorias.length)
  const anchoBarra = (anchoGrupo * 0.7) / Math.max(1, series.length)
  const resumen = series.map(s => `${s.nombre}: ${s.valores.map(formatear).join(', ')}`).join('. ')

  return (
    <figure className="grafico">
      <svg viewBox={`0 0 ${ANCHO} ${alto}`} role="img" aria-label={resumen} className="grafico-svg">
        {categorias.map((cat, i) => {
          const x0 = MARGEN.izq + i * anchoGrupo + anchoGrupo * 0.15
          return (
            <g key={cat}>
              {series.map((s, j) => {
                const v = s.valores[i] ?? 0
                const h = maximo > 0 ? (v / maximo) * areaAlto : 0
                return (
                  <rect
                    key={s.nombre}
                    className="barra"
                    x={x0 + j * anchoBarra}
                    y={MARGEN.arriba + areaAlto - h}
                    width={Math.max(1, anchoBarra - 2)}
                    height={h}
                    fill={s.color ?? COLORES[j % COLORES.length]}
                  >
                    <title>{`${cat} · ${s.nombre}: ${formatear(v)}`}</title>
                  </rect>
                )
              })}
              <text x={x0 + (anchoGrupo * 0.7) / 2} y={alto - 6} textAnchor="middle" className="grafico-eje">{cat}</text>
            </g>
          )
        })}
      </svg>
      <figcaption className="grafico-leyenda">
        {series.map((s, j) => (
          <span key={s.nombre}><i style={{ background: s.color ?? COLORES[j % COLORES.length] }} /> {s.nombre}</span>
        ))}
      </figcaption>
    </figure>
  )
}
```

`GraficoEmbudo.tsx`:

```tsx
import './graficos.css'

interface Etapa { nombre: string; valor: number; detalle?: string }

/** Barras horizontales proporcionales al máximo; el detalle (conversión, días) va a la derecha. */
export default function GraficoEmbudo({ etapas }: { etapas: Etapa[] }) {
  const maximo = Math.max(0, ...etapas.map(e => e.valor))
  return (
    <ul className="embudo">
      {etapas.map(e => (
        <li key={e.nombre} className="embudo-fila">
          <span className="embudo-nombre">{e.nombre}</span>
          <span className="embudo-pista">
            <span className="embudo-barra" style={{ width: `${maximo > 0 ? (e.valor / maximo) * 100 : 0}%` }} />
          </span>
          <span className="embudo-valor">{e.valor.toLocaleString('es-AR')}</span>
          {e.detalle && <span className="embudo-detalle">{e.detalle}</span>}
        </li>
      ))}
    </ul>
  )
}
```

`graficos.css`:

```css
.grafico { margin: 0; }
.grafico-svg { width: 100%; height: auto; display: block; }
.grafico-eje { font-size: 11px; fill: var(--color-texto-suave, #666); }
.grafico-leyenda { display: flex; gap: 1rem; font-size: 0.85rem; margin-top: 0.5rem; }
.grafico-leyenda i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; vertical-align: middle; }

.embudo { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.5rem; }
.embudo-fila { display: grid; grid-template-columns: 9rem 1fr 3rem auto; gap: 0.75rem; align-items: center; }
.embudo-pista { background: var(--color-fondo-suave, #eee); height: 14px; border-radius: 7px; overflow: hidden; }
.embudo-barra { display: block; height: 100%; background: var(--color-petroleo, #1f5f6b); }
.embudo-valor { text-align: right; font-variant-numeric: tabular-nums; }
.embudo-detalle { font-size: 0.85rem; color: var(--color-texto-suave, #666); }
@media (max-width: 600px) { .embudo-fila { grid-template-columns: 6rem 1fr 3rem; } .embudo-detalle { grid-column: 1 / -1; } }
```

Usar los nombres de variables CSS que existan en `client/src/index.css` (grep `--color-`); si los nombres difieren, reemplazarlos y dejar los fallbacks.

- [x] **Step 4: Correr** `npm test -- Grafico` → PASS.

---

### Task 11: Página `/admin/reportes`, ruta y menú

**Files:**
- Create: `client/src/pages/admin/reportes/Reportes.tsx`, `Reportes.css`, `Reportes.test.tsx`
- Modify: `client/src/App.tsx`, `client/src/layouts/AdminLayout.tsx`

- [x] **Step 1: Test** `Reportes.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Reportes from './Reportes'
import { reportesApi } from '../../../api/reportes'
import { operacionesApi } from '../../../api/operaciones'
import { usuariosApi } from '../../../api/usuarios'

vi.mock('../../../api/reportes', () => ({
  reportesApi: { operaciones: vi.fn(), comisiones: vi.fn(), embudo: vi.fn(), alquileres: vi.fn(), urlCsv: vi.fn(() => '/csv') },
}))
vi.mock('../../../api/operaciones', () => ({ operacionesApi: { pipelines: vi.fn() } }))
vi.mock('../../../api/usuarios', () => ({ usuariosApi: { listar: vi.fn() } }))

const FILA = { mes: '2026-08', moneda: 'ARS', ganadas: 2, perdidas: 1, monto_ganado: '3000000.00', comisiones: '90000.00', comisiones_cobradas: '30000.00' }

beforeEach(() => {
  vi.mocked(operacionesApi.pipelines).mockResolvedValue([{ id: 1, name: 'Venta', is_active: true, stage_count: 5 }])
  vi.mocked(usuariosApi.listar).mockResolvedValue([{ id: 7, name: 'Ana', email: 'a@m.ar' }])
  vi.mocked(reportesApi.operaciones).mockResolvedValue({
    desde: '2026-01-01', hasta: '2026-09-20', pipeline_id: null, agente_id: null,
    filas: [FILA, { ...FILA, moneda: 'USD', ganadas: 1 }], totales: [{ ...FILA, mes: 'total' }],
  })
  vi.mocked(reportesApi.embudo).mockResolvedValue({
    desde: '2026-01-01', hasta: '2026-09-20', pipeline_id: 1, pipeline: 'Venta', ganadas: 2, perdidas: 1,
    tasa_cierre_pct: '66.67', dias_promedio_cierre: '12.50',
    etapas: [{ stage_id: 1, nombre: 'Consulta', position: 1, is_won: false, is_lost: false, ingresaron: 10, actuales: 3, dias_promedio: '4.00', conversion_pct: '50.00' }],
  })
})

const renderPagina = (url = '/admin/reportes') => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes><Route path="/admin/reportes" element={<Reportes />} /></Routes>
  </MemoryRouter>,
)

it('arranca en Operaciones, muestra la tabla y el CSV con los filtros vigentes', async () => {
  renderPagina('/admin/reportes?desde=2026-01-01&agente_id=7')
  expect(await screen.findByText('ago 2026')).toBeInTheDocument()
  expect(reportesApi.operaciones).toHaveBeenCalledWith(expect.objectContaining({ desde: '2026-01-01', agente_id: 7 }))
  expect(screen.getByRole('link', { name: 'Exportar CSV' })).toHaveAttribute('href', '/csv')
  expect(reportesApi.urlCsv).toHaveBeenCalledWith('operaciones', expect.objectContaining({ desde: '2026-01-01', agente_id: 7 }))
})

it('la pestaña Embudo pide el pipeline y muestra la tasa de cierre', async () => {
  const usuario = userEvent.setup()
  renderPagina()
  await screen.findByText('ago 2026')
  await usuario.click(screen.getByRole('tab', { name: 'Embudo' }))
  await waitFor(() => expect(reportesApi.embudo).toHaveBeenCalledWith(expect.objectContaining({ pipeline_id: 1 })))
  expect(await screen.findByText(/Tasa de cierre 66,67 %/)).toBeInTheDocument()
})

it('el selector de moneda filtra las filas', async () => {
  const usuario = userEvent.setup()
  renderPagina()
  await screen.findByText('ago 2026')
  await usuario.selectOptions(screen.getByLabelText('Moneda'), 'USD')
  expect(screen.getAllByRole('row')).toHaveLength(3) // encabezado + 1 fila + total
})
```

- [x] **Step 2: Correr** `npm test -- Reportes` → FAIL.

- [x] **Step 3: Página** `Reportes.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { reportesApi } from '../../../api/reportes'
import { operacionesApi } from '../../../api/operaciones'
import { usuariosApi } from '../../../api/usuarios'
import type { PipelineResumen } from '../../../types/operacion'
import type { UsuarioBrief } from '../../../types/inmobiliaria'
import type {
  FiltrosReporte, NombreReporte, ReporteAlquileres, ReporteComisiones, ReporteEmbudo, ReporteOperaciones,
} from '../../../types/reportes'
import GraficoBarras from '../../../components/graficos/GraficoBarras'
import GraficoEmbudo from '../../../components/graficos/GraficoEmbudo'
import Badge from '../../../components/Badge'
import { etiquetaMes, etiquetaMesCorta, formatearFecha, formatearMonto, formatearPorcentaje } from '../../../lib/formato'
import './Reportes.css'

const PESTANAS: { id: NombreReporte; label: string }[] = [
  { id: 'operaciones', label: 'Operaciones' },
  { id: 'comisiones', label: 'Comisiones' },
  { id: 'embudo', label: 'Embudo' },
  { id: 'alquileres', label: 'Alquileres' },
]

/** La moneda con más filas del reporte; empate → la primera en orden alfabético. */
function monedaPrincipal(filas: { moneda: string }[]): string {
  const conteo = new Map<string, number>()
  filas.forEach(f => conteo.set(f.moneda, (conteo.get(f.moneda) ?? 0) + 1))
  return [...conteo.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? 'ARS'
}

/**
 * Los cuatro reportes del Bloque 4 en pestañas. Los filtros viven en la query
 * string para poder linkear una vista (el dashboard lo usa).
 */
export default function Reportes() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as NombreReporte | null) ?? 'operaciones'
  const filtros: FiltrosReporte = useMemo(() => ({
    desde: params.get('desde') ?? undefined,
    hasta: params.get('hasta') ?? undefined,
    pipeline_id: params.get('pipeline_id') ? Number(params.get('pipeline_id')) : undefined,
    agente_id: params.get('agente_id') ? Number(params.get('agente_id')) : undefined,
    cobrada: params.get('cobrada') === null ? undefined : params.get('cobrada') === 'true',
  }), [params])
  const monedaParam = params.get('moneda')

  const [pipelines, setPipelines] = useState<PipelineResumen[]>([])
  const [usuarios, setUsuarios] = useState<UsuarioBrief[]>([])
  const [operaciones, setOperaciones] = useState<ReporteOperaciones | null>(null)
  const [comisiones, setComisiones] = useState<ReporteComisiones | null>(null)
  const [embudo, setEmbudo] = useState<ReporteEmbudo | null>(null)
  const [alquileres, setAlquileres] = useState<ReporteAlquileres | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    operacionesApi.pipelines().then(setPipelines).catch(() => setPipelines([]))
    usuariosApi.listar().then(setUsuarios).catch(() => setUsuarios([]))
  }, [])

  // El embudo necesita pipeline: sin uno elegido se usa el primero.
  const pipelineEmbudo = filtros.pipeline_id ?? pipelines[0]?.id

  useEffect(() => {
    setError(null)
    const fallo = (e: Error) => setError(e.message)
    if (tab === 'operaciones') reportesApi.operaciones(filtros).then(setOperaciones).catch(fallo)
    if (tab === 'comisiones') reportesApi.comisiones(filtros).then(setComisiones).catch(fallo)
    if (tab === 'embudo' && pipelineEmbudo) reportesApi.embudo({ ...filtros, pipeline_id: pipelineEmbudo }).then(setEmbudo).catch(fallo)
    if (tab === 'alquileres') reportesApi.alquileres({ desde: filtros.desde, hasta: filtros.hasta }).then(setAlquileres).catch(fallo)
  }, [tab, filtros, pipelineEmbudo])

  const setParam = (clave: string, valor: string) => {
    const nuevos = new URLSearchParams(params)
    if (valor === '') nuevos.delete(clave); else nuevos.set(clave, valor)
    setParams(nuevos, { replace: true })
  }

  const filasMonetarias = tab === 'operaciones' ? operaciones?.filas : tab === 'alquileres' ? alquileres?.filas : comisiones?.filas
  const monedas = [...new Set((filasMonetarias ?? []).map(f => f.moneda))].sort()
  const moneda = monedaParam && monedas.includes(monedaParam) ? monedaParam : monedaPrincipal(filasMonetarias ?? [])

  const filtrosCsv: FiltrosReporte = tab === 'embudo' ? { ...filtros, pipeline_id: pipelineEmbudo } : filtros

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <span className="section-label">Panel</span>
          <h1>Reportes</h1>
        </div>
        <a href={reportesApi.urlCsv(tab, filtrosCsv)} download className="btn btn-outline">Exportar CSV</a>
      </div>

      <div role="tablist" className="reportes-tabs">
        {PESTANAS.map(p => (
          <button
            key={p.id} role="tab" aria-selected={tab === p.id}
            className={`reportes-tab${tab === p.id ? ' activa' : ''}`}
            onClick={() => setParam('tab', p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="admin-card filtros-bar">
        <label className="filtros-label">Desde<input type="date" value={filtros.desde ?? ''} onChange={e => setParam('desde', e.target.value)} /></label>
        <label className="filtros-label">Hasta<input type="date" value={filtros.hasta ?? ''} onChange={e => setParam('hasta', e.target.value)} /></label>
        {(tab === 'operaciones' || tab === 'embudo') && (
          <label className="filtros-label">Pipeline
            <select value={filtros.pipeline_id ?? (tab === 'embudo' ? pipelineEmbudo ?? '' : '')} onChange={e => setParam('pipeline_id', e.target.value)}>
              {tab === 'operaciones' && <option value="">Todos</option>}
              {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        {(tab === 'operaciones' || tab === 'comisiones') && (
          <label className="filtros-label">Agente
            <select value={filtros.agente_id ?? ''} onChange={e => setParam('agente_id', e.target.value)}>
              <option value="">Todos</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
        )}
        {tab === 'comisiones' && (
          <label className="filtros-label">Cobrada
            <select value={filtros.cobrada === undefined ? '' : String(filtros.cobrada)} onChange={e => setParam('cobrada', e.target.value)}>
              <option value="">Todas</option><option value="true">Sí</option><option value="false">No</option>
            </select>
          </label>
        )}
        {monedas.length > 1 && (
          <label className="filtros-label">Moneda
            <select value={moneda} onChange={e => setParam('moneda', e.target.value)}>
              {monedas.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
        )}
      </div>

      {error && <p className="lista-estado lista-error" role="alert">{error}</p>}

      {tab === 'operaciones' && operaciones && <PestanaOperaciones datos={operaciones} moneda={moneda} />}
      {tab === 'comisiones' && comisiones && <PestanaComisiones datos={comisiones} moneda={moneda} />}
      {tab === 'embudo' && embudo && <PestanaEmbudo datos={embudo} />}
      {tab === 'alquileres' && alquileres && <PestanaAlquileres datos={alquileres} moneda={moneda} />}
    </div>
  )
}

function PestanaOperaciones({ datos, moneda }: { datos: ReporteOperaciones; moneda: string }) {
  const filas = datos.filas.filter(f => f.moneda === moneda)
  const total = datos.totales.find(t => t.moneda === moneda)
  return (
    <>
      <div className="admin-card">
        <GraficoBarras
          categorias={filas.map(f => etiquetaMesCorta(f.mes))}
          series={[
            { nombre: 'Ganadas', valores: filas.map(f => f.ganadas) },
            { nombre: 'Perdidas', valores: filas.map(f => f.perdidas) },
          ]}
        />
      </div>
      <div className="admin-card tabla-scroll">
        <table className="tabla">
          <thead><tr><th>Mes</th><th>Ganadas</th><th>Perdidas</th><th>Monto</th><th>Comisiones</th><th>Cobradas</th></tr></thead>
          <tbody>
            {[...filas, ...(total ? [total] : [])].map(f => (
              <tr key={f.mes} className={f.mes === 'total' ? 'fila-total' : undefined}>
                <td>{etiquetaMes(f.mes)}</td><td>{f.ganadas}</td><td>{f.perdidas}</td>
                <td>{formatearMonto(f.monto_ganado, moneda)}</td><td>{formatearMonto(f.comisiones, moneda)}</td><td>{formatearMonto(f.comisiones_cobradas, moneda)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function PestanaComisiones({ datos, moneda }: { datos: ReporteComisiones; moneda: string }) {
  const agentes = datos.por_agente.filter(a => a.moneda === moneda)
  const filas = datos.filas.filter(f => f.moneda === moneda)
  return (
    <>
      <div className="admin-card tabla-scroll">
        <h2 className="form-section-title">Por agente</h2>
        <table className="tabla">
          <thead><tr><th>Agente</th><th>Operaciones</th><th>Comisión</th><th>Cobrada</th></tr></thead>
          <tbody>
            {agentes.map(a => (
              <tr key={a.user_id ?? 'resto'}><td>{a.nombre}</td><td>{a.operaciones}</td><td>{formatearMonto(a.comision, moneda)}</td><td>{formatearMonto(a.cobrada, moneda)}</td></tr>
            ))}
            {agentes.length === 0 && <tr><td colSpan={4} className="lista-estado">Sin comisiones en el período.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="admin-card tabla-scroll">
        <h2 className="form-section-title">Por operación</h2>
        <table className="tabla">
          <thead><tr><th>Operación</th><th>Cerrada</th><th>Monto</th><th>%</th><th>Comisión</th><th>Estado</th><th>Reparto</th></tr></thead>
          <tbody>
            {filas.map(f => (
              <tr key={f.deal_id}>
                <td><Link to={`/admin/operaciones/${f.deal_id}`} className="tabla-titulo">{f.titulo}</Link> <small>{f.pipeline}</small></td>
                <td>{formatearFecha(f.closed_at)}</td>
                <td>{formatearMonto(f.monto_operacion, moneda)}</td>
                <td>{formatearPorcentaje(f.pct)}</td>
                <td>{formatearMonto(f.monto, moneda)}</td>
                <td><Badge value={f.cobrada ? 'cobrada' : 'a_cobrar'} color={f.cobrada ? 'ok' : 'espera'} label={f.cobrada ? `Cobrada ${formatearFecha(f.fecha_cobro)}` : 'A cobrar'} /></td>
                <td>{f.reparto.map(r => `${r.nombre} ${formatearPorcentaje(r.pct)}`).join(' · ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function PestanaEmbudo({ datos }: { datos: ReporteEmbudo }) {
  return (
    <div className="admin-card">
      <GraficoEmbudo
        etapas={datos.etapas.map(e => ({
          nombre: e.nombre,
          valor: e.ingresaron,
          detalle: [
            e.conversion_pct !== null ? `${formatearPorcentaje(e.conversion_pct)} avanzan` : null,
            e.dias_promedio !== null ? `${Number(e.dias_promedio).toLocaleString('es-AR')} días` : null,
            `${e.actuales} ahora`,
          ].filter(Boolean).join(' · '),
        }))}
      />
      <p className="reportes-resumen">
        Ganadas {datos.ganadas} · Perdidas {datos.perdidas} · Tasa de cierre {formatearPorcentaje(datos.tasa_cierre_pct)}
        {datos.dias_promedio_cierre !== null && ` · ${Number(datos.dias_promedio_cierre).toLocaleString('es-AR')} días promedio de cierre`}
      </p>
    </div>
  )
}

function PestanaAlquileres({ datos, moneda }: { datos: ReporteAlquileres; moneda: string }) {
  const filas = datos.filas.filter(f => f.moneda === moneda)
  const total = datos.totales.find(t => t.moneda === moneda)
  return (
    <>
      <div className="admin-card">
        <GraficoBarras
          categorias={filas.map(f => etiquetaMesCorta(f.mes))}
          series={[
            { nombre: 'Esperado', valores: filas.map(f => Number(f.esperado)) },
            { nombre: 'Cobrado', valores: filas.map(f => Number(f.cobrado)) },
          ]}
          formatear={v => formatearMonto(v, moneda)}
        />
      </div>
      <div className="admin-card tabla-scroll">
        <table className="tabla">
          <thead><tr><th>Mes</th><th>Esperado</th><th>Cobrado</th><th>Pendiente</th><th>Honorarios</th><th>Contratos</th></tr></thead>
          <tbody>
            {[...filas, ...(total ? [total] : [])].map(f => (
              <tr key={f.mes} className={f.mes === 'total' ? 'fila-total' : undefined}>
                <td>{etiquetaMes(f.mes)}</td>
                <td>{formatearMonto(f.esperado, moneda)}</td><td>{formatearMonto(f.cobrado, moneda)}</td>
                <td>{formatearMonto(f.pendiente, moneda)}</td><td>{formatearMonto(f.honorarios, moneda)}</td><td>{f.contratos_vigentes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
```

`Reportes.css`:

```css
.reportes-tabs { display: flex; gap: 0.25rem; margin-bottom: 1rem; border-bottom: 1px solid var(--color-borde, #ddd); }
.reportes-tab { background: none; border: 0; padding: 0.6rem 1rem; cursor: pointer; border-bottom: 2px solid transparent; font: inherit; }
.reportes-tab.activa { border-bottom-color: var(--color-magenta, #b0306a); font-weight: 600; }
.reportes-resumen { margin: 1rem 0 0; }
.fila-total td { font-weight: 600; border-top: 2px solid var(--color-borde, #ddd); }
.tabla-scroll { overflow-x: auto; }
```

Revisar los nombres de clase reales de las tablas del panel (`grep -rn "className=\"tabla" client/src/pages/admin/alquileres/Cobros.tsx`) y usar esos.

- [x] **Step 4: Ruta y menú.** En `App.tsx`: `import Reportes from './pages/admin/reportes/Reportes'` y, después de la ruta `configuracion`: `<Route path="reportes" element={<Reportes />} />`. En `AdminLayout.tsx`, un grupo nuevo después de "CRM":

```ts
  {
    titulo: 'Análisis',
    items: [{ to: '/admin/reportes', label: 'Reportes' }],
  },
```

- [x] **Step 5: Correr** `npm test -- Reportes AdminLayout App` → PASS; `npx tsc --noEmit`. Si el test de la moneda cuenta filas distintas por la fila de totales, ajustar la expectativa a lo que renderiza (encabezado + filas USD + total USD si existe).

---

### Task 12: Dashboard — tile "Comisiones a cobrar" y gráfico de los últimos 6 meses

**Files:**
- Modify: `client/src/pages/admin/Dashboard.tsx`, `Dashboard.test.tsx`

- [x] **Step 1: Test** — en `Dashboard.test.tsx`, sumar al mock de APIs `vi.mock('../../api/reportes', () => ({ reportesApi: { comisiones: vi.fn(), operaciones: vi.fn() } }))` y en el `beforeEach` los resolves por defecto:

```ts
vi.mocked(reportesApi.comisiones).mockResolvedValue({ desde: '', hasta: '', agente_id: null, cobrada: false, por_agente: [], filas: [{ deal_id: 1 }, { deal_id: 2 }] as never })
vi.mocked(reportesApi.operaciones).mockResolvedValue({
  desde: '', hasta: '', pipeline_id: null, agente_id: null, totales: [],
  filas: [{ mes: '2026-08', moneda: 'ARS', ganadas: 2, perdidas: 0, monto_ganado: '0', comisiones: '0', comisiones_cobradas: '0' }],
})
```

y un test:

```tsx
it('muestra las comisiones a cobrar y el gráfico de los últimos meses', async () => {
  renderDashboard()
  const tile = await screen.findByRole('link', { name: /Comisiones a cobrar/ })
  expect(tile).toHaveTextContent('2')
  expect(tile).toHaveAttribute('href', '/admin/reportes?tab=comisiones&cobrada=false')
  expect(screen.getByRole('heading', { name: 'Últimos 6 meses' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Ver reportes' })).toHaveAttribute('href', '/admin/reportes')
  expect(screen.getByText('ago 26')).toBeInTheDocument()
})
```

(Usar el helper de render que ya tenga el archivo.)

- [x] **Step 2: Correr** → FAIL.

- [x] **Step 3: Dashboard** — imports `reportesApi`, `ReporteOperaciones`, `GraficoBarras`, `etiquetaMesCorta`; constante `const MESES_GRAFICO = 6`; estados:

```ts
  const [comisionesACobrar, setComisionesACobrar] = useState(0)
  const [ultimosMeses, setUltimosMeses] = useState<ReporteOperaciones | null>(null)
```

en el `useEffect`:

```ts
    reportesApi.comisiones({ cobrada: false })
      .then(r => setComisionesACobrar(r.filas.length))
      .catch(() => setComisionesACobrar(0))
    const desde = new Date()
    desde.setMonth(desde.getMonth() - (MESES_GRAFICO - 1), 1)
    reportesApi.operaciones({ desde: desde.toISOString().slice(0, 10) })
      .then(setUltimosMeses)
      .catch(() => setUltimosMeses(null))
```

tile (después de "Recordatorios"):

```tsx
        <StatTile
          label="Comisiones a cobrar"
          valor={comisionesACobrar}
          tono={comisionesACobrar > 0 ? 'espera' : 'ok'}
          to="/admin/reportes?tab=comisiones&cobrada=false"
        />
```

y el bloque, después del de "Próximos N días":

```tsx
      <div className="admin-card" style={{ marginTop: '1.25rem' }}>
        <div className="admin-page-header" style={{ marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0 }}>Últimos {MESES_GRAFICO} meses</h2>
          <Link to="/admin/reportes" className="btn btn-outline">Ver reportes</Link>
        </div>
        {ultimosMeses
          ? <GraficoBarras
              categorias={filasGrafico.map(f => etiquetaMesCorta(f.mes))}
              series={[
                { nombre: 'Ganadas', valores: filasGrafico.map(f => f.ganadas) },
                { nombre: 'Perdidas', valores: filasGrafico.map(f => f.perdidas) },
              ]}
            />
          : <p className="lista-estado">Cargando...</p>}
      </div>
```

con, antes del `return`:

```ts
  // Una moneda por vez: la que más filas tiene (ARS en la práctica).
  const monedaGrafico = ultimosMeses ? monedaMasFrecuente(ultimosMeses.filas) : 'ARS'
  const filasGrafico = ultimosMeses ? ultimosMeses.filas.filter(f => f.moneda === monedaGrafico) : []
```

Mover `monedaPrincipal` de `Reportes.tsx` a `client/src/lib/reportes.ts` como `monedaMasFrecuente(filas: { moneda: string }[]): string` (exportada) y usarla en ambos lugares; un test de dos líneas en `client/src/lib/reportes.test.ts` (empate → alfabético; vacío → `'ARS'`).

- [x] **Step 4: Correr** `npm test -- Dashboard Reportes reportes` → PASS.

---

### Task 13: Verificación final y cierre

- [x] **Step 1: Backend** desde `src/`: `python -m pytest tests/ -q && ruff check app tests && alembic check`. Formatear con `ruff format` solo los archivos nuevos/tocados del bloque.
- [x] **Step 2: Frontend** desde `client/`: `npm test && npx tsc --noEmit && npm run build`.
- [x] **Step 3: Pasada a mano (si hay API y panel levantados):** ganar una operación de Venta con monto y asignado → la ficha muestra la comisión con el % de la inmobiliaria; editarla con dos agentes 60/40 y marcarla cobrada; volver la etapa a "Oferta" → 409 con el mensaje; desmarcar cobrada y volver a "Oferta" → la comisión desaparece; `/admin/reportes` en las cuatro pestañas; "Exportar CSV" abre en Excel con columnas separadas; el dashboard muestra el tile y el gráfico.
- [x] **Step 4: Mapa.** En `docs/superpowers/specs/2026-09-11-mapa-de-funcionalidades.md`: línea 6 → `**Bloque 4 terminado:** [Comisiones y estadísticas](2026-09-20-comisiones-estadisticas-design.md).` + `**Siguiente:** Bloque 3 — Contratos y documentos (spec pendiente).`; título `### Bloque 4 — Comisiones y estadísticas  ← terminado`.
- [x] **Step 5: Sin commit ni push.** Avisar a Matías: suites/ruff/tsc/build/`alembic check` pasaron; archivos nuevos y modificados (`git status --short`); migración `0008` aplicada en la base local y **no** en Supabase (que sigue en `0005`: faltan `0006`, `0007` y `0008`); las operaciones ganadas antes del bloque no tienen comisión y se cargan desde la ficha; el siguiente bloque es el 3 (documentos) y arranca con su spec.

## Self-review

- **Cobertura del spec:** §4.1 → T1; §4.3 → T2, T3; §4.2 + endpoints → T4; §4.4 operaciones/comisiones + CSV → T5; embudo/alquileres → T6; §7 → T7; §5.5 → T8; §5.1 → T9; §5.4 → T10; §5.2 → T11; §5.3 → T12; §6 tests repartidos en cada tarea.
- **Nombres consistentes:** `comisiones.guardar(db, deal, data)` recibe el `Deal` (T3 lo declara, T4 lo usa); `RepartoOut` vive en `deals/schemas.py` y lo importan `reportes/schemas.py` y `reportes/service.py`; `monedaMasFrecuente` en `lib/reportes.ts` reemplaza a `monedaPrincipal` (T11 lo define localmente y T12 lo mueve: al ejecutar T11 ya puede crearse directo en `lib/reportes.ts`).
- **Riesgos señalados en los pasos:** comparación de datetimes aware en SQLite (T5 paso 8), unique del reparto al reemplazar (T4), `response_model` + `Response` (T5 paso 6), variables CSS del tema (T10).
