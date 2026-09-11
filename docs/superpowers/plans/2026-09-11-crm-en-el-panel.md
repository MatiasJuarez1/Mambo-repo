# CRM en el panel — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ponerle pantalla al CRM que ya existe en el backend (personas, reservas, operaciones) y agregar las reglas que faltaban: etiquetas y roles derivados de las personas, propietario en la propiedad, y que reservas y deals muevan solos el estado de la propiedad.

**Architecture:** El backend conserva los módulos `people`, `reservations` y `deals` (patrón `models/schemas/service/router`) y se montan bajo `/api/v1` para que el proxy de Vercel los alcance. Una única función `aplicar_evento_de_operacion` en `modules/propiedades/service.py` concentra las transiciones de estado de la propiedad; los servicios de reservas y deals la invocan dentro de su propia transacción. El frontend sigue el patrón `pages/admin/<módulo>/`, `api/<módulo>.ts`, `types/<módulo>.ts`; los componentes nuevos del CRM van cada uno en su carpeta bajo `components/crm/<Nombre>/`.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 + Alembic + pytest (SQLite en memoria) en `src/`. React 19 + TypeScript + React Router 7 + Vitest + Testing Library en `client/`.

**Spec:** [docs/superpowers/specs/2026-09-11-crm-en-el-panel-design.md](../specs/2026-09-11-crm-en-el-panel-design.md)

## Global Constraints

- El código va en **castellano**: comentarios, docstrings, mensajes de la API, textos de UI. Los identificadores de los módulos de `platform/` ya están en inglés (`first_name`, `is_won`): mantener ese estilo dentro de esos módulos; el módulo nuevo `inmobiliaria` y todo lo de `modules/` van en castellano.
- Backend: `ruff check .` limpio (line-length 100, reglas E/F/I/B/UP). Los módulos existentes usan `Depends(...)` en defaults (B008) con el estilo del archivo: no "arreglar" de paso.
- Cada cambio de modelo va acompañado de su migración en la **misma tarea**; `alembic check` debe quedar limpio (necesita `DATABASE_URL` apuntando a un PostgreSQL con `alembic upgrade head` aplicado; si no hay uno a mano, dejar constancia en el commit de que no se corrió).
- Tests backend: `cd src && python -m pytest tests/ -q`. Fixtures disponibles en `src/tests/conftest.py`: `db`, `client`, `crear_usuario(email, password, roles)`, `iniciar_sesion(email, password)`.
- Tests frontend: `cd client && npm test` (ya incluye `--pool=threads`; **no** usar el pool `forks` en Windows). Tipos: `npx tsc --noEmit`.
- Toda regla de negocio violada responde **409** con `detail` en castellano que nombra la entidad; el frontend muestra ese `detail` tal cual.
- Componentes React nuevos: carpeta propia `client/src/components/crm/<Nombre>/` con `<Nombre>.tsx`, `<Nombre>.css` (si tiene estilos) y `<Nombre>.test.tsx`. Páginas nuevas: `client/src/pages/admin/<módulo>/`.
- Commits chicos, uno por tarea como mínimo, con mensaje en castellano y el pie `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Estructura de archivos

**Backend (`src/`)**

| Archivo | Responsabilidad |
|---|---|
| `app/main.py` | Montaje de routers; el CRM pasa a `/api/v1` |
| `app/modules/propiedades/models.py` | FK y relaciones `propietario`, `reservas`, `deals` |
| `app/modules/propiedades/schemas.py` | `PersonaBrief`, `PropiedadBrief`, `propietario` en las respuestas |
| `app/modules/propiedades/service.py` | `EventoOperacion`, `aplicar_evento_de_operacion`, guarda del cambio manual, validación de propietario, filtro por propietario, `procesar_imagen` (renombre) |
| `app/platform/people/models.py` | `PersonTag` + relación `tag_rows` y propiedad `tags` |
| `app/platform/people/schemas.py` | `tags`, `roles`, `TagsUpdate`, `TagCount`, `PersonLinksOut` y sus ítems |
| `app/platform/people/service.py` | `set_tags`, `list_tags`, `roles_de_personas`, filtros `tag`/`rol`, `get_person_links` |
| `app/platform/people/router.py` | Rutas `/tags`, `/{id}/tags`, `/{id}/vinculos` |
| `app/platform/reservations/models.py` | FK a `propiedades` + relación `propiedad` |
| `app/platform/reservations/schemas.py` | `propiedad: PropiedadBrief` en `ReservationOut` |
| `app/platform/reservations/service.py` | Llama a `aplicar_evento_de_operacion` al crear y liberar |
| `app/platform/deals/models.py` | FK a `propiedades`, `stage_changed_at`, `dias_en_etapa`, relación `propiedad` |
| `app/platform/deals/pipelines_base.py` | Constante `PIPELINES_BASE` (Venta y Alquiler) |
| `app/platform/deals/schemas.py` | `PartyRole` ampliado, `propiedad`, `dias_en_etapa`, `person` en partes |
| `app/platform/deals/service.py` | `sembrar_pipelines_base`, guardas de `remove_stage`, cierre/reapertura con reservas y estado de propiedad |
| `app/platform/inmobiliaria/{models,schemas,service,router}.py` | Configuración de la inmobiliaria (fila única) + logo |
| `app/platform/auth/router.py` | `GET /auth/users` (para "asignado a") |
| `app/storage.py` | `guardar_logo` |
| `alembic/versions/0004_crm_en_el_panel.py` | FKs, `stage_changed_at`, `people_tags`, `inmobiliaria`, pipelines base |
| `tests/test_crm_rutas.py`, `tests/test_people_tags.py`, `tests/test_people_roles.py`, `tests/test_people_vinculos.py`, `tests/test_propiedades_estado_operacion.py`, `tests/test_reservations_estado.py`, `tests/test_deals_estado.py`, `tests/test_deals_pipelines_base.py`, `tests/test_propiedades_propietario.py`, `tests/test_inmobiliaria.py` | Tests por regla |
| `tests/helpers_crm.py` | Fábricas de propiedad / persona / pipeline para los tests |

**Frontend (`client/src/`)**

| Archivo | Responsabilidad |
|---|---|
| `types/persona.ts`, `types/reserva.ts`, `types/operacion.ts`, `types/inmobiliaria.ts` | DTOs del backend |
| `api/personas.ts`, `api/reservas.ts`, `api/operaciones.ts`, `api/inmobiliaria.ts`, `api/usuarios.ts` | Clientes HTTP |
| `lib/formato.ts` | `formatearMonto`, `formatearFecha`, `diasHasta` |
| `lib/crm.ts` | Etiquetas de roles/estados de reserva, `rolInicialSegunOperacion`, `etapaInicialSegunOperacion` |
| `components/crm/SelectorPersona/` | Buscador con creación inline |
| `components/crm/ChipsRol/` | Chips de rol derivado |
| `components/crm/TarjetaOperacion/` | Tarjeta del tablero con selector de etapa |
| `components/crm/BloqueVinculos/` | Bloque de lista con estado vacío para la ficha |
| `pages/admin/personas/{Lista,Formulario,Ficha}.tsx` | Personas |
| `pages/admin/reservas/{Lista,Formulario}.tsx` | Reservas |
| `pages/admin/operaciones/{Tablero,Ficha,Formulario}.tsx` | Operaciones |
| `pages/admin/configuracion/Configuracion.tsx` | Inmobiliaria |
| `layouts/AdminLayout.tsx`, `App.tsx` | Menú y rutas |
| `pages/admin/propiedades/{Formulario,Lista}.tsx` | Propietario y botón Reservar |
| `pages/admin/Dashboard.tsx` | Tiles nuevos |

---

## Fase A — Backend

### Task 1: CRM bajo `/api/v1`

**Files:**
- Modify: `src/app/main.py:55-62`
- Modify: `client/src/api/client.ts` (solo el comentario del proxy no cambia; nada que tocar)
- Test: `src/tests/test_crm_rutas.py`

**Interfaces:**
- Produces: todos los routers de `platform/` salvo `auth` responden bajo `/api/v1/...`.

- [ ] **Step 1: Test que falla**

```python
"""El CRM tiene que vivir bajo /api/v1: el proxy de Vercel solo reenvía /api/* y /auth/*."""


def test_crm_montado_bajo_api_v1(client, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()

    assert client.get("/api/v1/people").status_code == 200
    assert client.get("/api/v1/reservations").status_code == 200
    assert client.get("/api/v1/deals").status_code == 200
    assert client.get("/api/v1/pipelines").status_code == 200
    assert client.get("/api/v1/activities").status_code == 200
    # auth se queda en la raíz: ya está proxiado y el frontend lo usa
    assert client.get("/auth/me").status_code == 200


def test_crm_ya_no_responde_en_la_raiz(client, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()

    assert client.get("/people").status_code == 404
    assert client.get("/deals").status_code == 404
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd src && python -m pytest tests/test_crm_rutas.py -q`
Expected: FAIL — `/api/v1/people` devuelve 404.

- [ ] **Step 3: Montar con prefijo**

En `src/app/main.py` reemplazar el bloque "Plataforma / CRM":

```python
# Plataforma / CRM. Bajo /api/v1 como el catálogo: `client/vercel.json` solo
# reenvía `/api/*` y `/auth/*` a Render, así que cualquier router montado en la
# raíz responde en local y da 404 en producción. `auth` se queda en la raíz.
app.include_router(auth_router)
app.include_router(people_router, prefix="/api/v1")
app.include_router(activities_router, prefix="/api/v1")
app.include_router(reservations_router, prefix="/api/v1")
app.include_router(deals_router, prefix="/api/v1")
app.include_router(notes_router, prefix="/api/v1")
app.include_router(audit_router, prefix="/api/v1")
```

- [ ] **Step 4: Correr toda la suite**

Run: `cd src && python -m pytest tests/ -q && ruff check .`
Expected: todo verde.

- [ ] **Step 5: Commit**

```bash
git add src/app/main.py src/tests/test_crm_rutas.py
git commit -m "fix(backend): montar el CRM bajo /api/v1 para que el proxy lo alcance"
```

---

### Task 2: Modelos, FKs, `stage_changed_at`, `people_tags`, `inmobiliaria` y migración `0004`

**Files:**
- Modify: `src/app/modules/propiedades/models.py` (columna `propietario_persona_id`, relaciones)
- Modify: `src/app/platform/reservations/models.py` (`property_id`, relación `propiedad`)
- Modify: `src/app/platform/deals/models.py` (`property_id`, `stage_changed_at`, `dias_en_etapa`, relación `propiedad`)
- Modify: `src/app/platform/activities/models.py` (`property_id`)
- Modify: `src/app/platform/people/models.py` (`PersonTag`)
- Create: `src/app/platform/inmobiliaria/__init__.py`, `src/app/platform/inmobiliaria/models.py`
- Create: `src/app/platform/deals/pipelines_base.py`
- Create: `src/alembic/versions/0004_crm_en_el_panel.py`
- Modify: `src/alembic/env.py` (importar `inmobiliaria.models`)
- Test: `src/tests/test_modelos_crm.py`

**Interfaces:**
- Produces: `Propiedad.propietario`, `Propiedad.reservas`, `Propiedad.deals`; `Reservation.propiedad`; `Deal.propiedad`, `Deal.stage_changed_at`, `Deal.dias_en_etapa`; `Person.tag_rows`, `Person.tags`; `PersonTag(person_id, nombre)`; `Inmobiliaria`; `PIPELINES_BASE`.

- [ ] **Step 1: Test que falla**

```python
"""Relaciones y columnas que suma el bloque CRM. Se prueban contra el esquema en memoria."""

from datetime import UTC, datetime, timedelta

from app.modules.propiedades.models import Propiedad
from app.platform.deals.models import Deal, Pipeline, PipelineStage
from app.platform.inmobiliaria.models import Inmobiliaria
from app.platform.people.models import Person, PersonTag
from app.platform.reservations.models import Reservation


def test_propiedad_conoce_a_su_propietario(db):
    persona = Person(first_name="Ana", last_name="Pérez")
    db.add(persona)
    db.flush()
    prop = Propiedad(titulo="Casa", propietario_persona_id=persona.id)
    db.add(prop)
    db.commit()

    assert prop.propietario.full_name == "Ana Pérez"


def test_reserva_y_deal_conocen_a_su_propiedad(db, crear_usuario):
    usuario = crear_usuario()
    persona = Person(first_name="Ana", last_name="Pérez")
    prop = Propiedad(titulo="Casa")
    pipeline = Pipeline(name="Venta")
    db.add_all([persona, prop, pipeline])
    db.flush()
    etapa = PipelineStage(pipeline_id=pipeline.id, name="Consulta", position=1)
    db.add(etapa)
    db.flush()
    reserva = Reservation(person_id=persona.id, property_id=prop.id, created_by_user_id=usuario.id)
    deal = Deal(
        title="Venta casa", pipeline_id=pipeline.id, stage_id=etapa.id,
        created_by_user_id=usuario.id, property_id=prop.id,
    )
    db.add_all([reserva, deal])
    db.commit()

    assert reserva.propiedad.titulo == "Casa"
    assert deal.propiedad.titulo == "Casa"
    assert [r.id for r in prop.reservas] == [reserva.id]
    assert [d.id for d in prop.deals] == [deal.id]


def test_dias_en_etapa_sale_de_stage_changed_at(db, crear_usuario):
    usuario = crear_usuario()
    pipeline = Pipeline(name="Venta")
    db.add(pipeline)
    db.flush()
    etapa = PipelineStage(pipeline_id=pipeline.id, name="Consulta", position=1)
    db.add(etapa)
    db.flush()
    deal = Deal(
        title="x", pipeline_id=pipeline.id, stage_id=etapa.id, created_by_user_id=usuario.id,
        stage_changed_at=datetime.now(UTC) - timedelta(days=3, hours=1),
    )
    db.add(deal)
    db.commit()

    assert deal.dias_en_etapa == 3


def test_persona_expone_sus_etiquetas_como_strings(db):
    persona = Person(first_name="Ana", last_name="Pérez")
    persona.tag_rows = [PersonTag(nombre="inversor"), PersonTag(nombre="zona norte")]
    db.add(persona)
    db.commit()

    assert persona.tags == ["inversor", "zona norte"]


def test_inmobiliaria_es_una_tabla(db):
    db.add(Inmobiliaria(id=1, nombre="Mambo Groups"))
    db.commit()
    assert db.get(Inmobiliaria, 1).nombre == "Mambo Groups"
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd src && python -m pytest tests/test_modelos_crm.py -q`
Expected: FAIL — `ImportError` de `app.platform.inmobiliaria`.

- [ ] **Step 3: `Propiedad` con FK y relaciones**

En `src/app/modules/propiedades/models.py`, reemplazar la columna `propietario_persona_id` y su comentario por:

```python
    # FK real desde el bloque CRM. El comentario viejo ("MySQL no permite FK entre
    # signed/unsigned") ya no aplica: la base es PostgreSQL. SET NULL: borrar una
    # persona no puede borrar su propiedad, solo la deja sin dueño cargado.
    propietario_persona_id = Column(
        BigInteger,
        ForeignKey("people.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
```

y, junto a las otras relaciones de `Propiedad`, agregar:

```python
    propietario = relationship("Person", foreign_keys=[propietario_persona_id])
    # Del lado del CRM. Sin cascade: una propiedad con operaciones no se borra
    # (la FK es RESTRICT), se da de baja.
    reservas = relationship("Reservation", back_populates="propiedad")
    deals = relationship("Deal", back_populates="propiedad")
```

Quitar también el comentario "Sin FK: la tabla de personas (people) usa BIGINT UNSIGNED" que queda huérfano.

- [ ] **Step 4: `Reservation`, `Deal` y `Activity` con FK a `propiedades`**

`src/app/platform/reservations/models.py`:

```python
    property_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("propiedades.id", ondelete="RESTRICT"), nullable=False, index=True
    )
```

y entre las relaciones:

```python
    propiedad: Mapped[object] = relationship("Propiedad", back_populates="reservas")
```

`src/app/platform/deals/models.py`, en `Deal`:

```python
    property_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("propiedades.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    # Cuándo entró a la etapa actual. Alimenta `dias_en_etapa` en el tablero; se
    # setea al crear y en cada `move_stage`.
    stage_changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
```

relación:

```python
    propiedad: Mapped[object | None] = relationship("Propiedad", back_populates="deals")
```

y una propiedad calculada al lado de `is_closed`:

```python
    @property
    def dias_en_etapa(self) -> int:
        # SQLite devuelve la fecha sin zona; se asume UTC, que es como se guardó.
        desde = self.stage_changed_at
        if desde.tzinfo is None:
            desde = desde.replace(tzinfo=UTC)
        return (datetime.now(UTC) - desde).days
```

`src/app/platform/activities/models.py`:

```python
    property_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("propiedades.id", ondelete="SET NULL"), nullable=True, index=True
    )
```

- [ ] **Step 5: `PersonTag`**

En `src/app/platform/people/models.py`, agregar en `Person`:

```python
    tag_rows: Mapped[list[PersonTag]] = relationship(
        "PersonTag", back_populates="person", cascade="all, delete-orphan",
        order_by="PersonTag.nombre",
    )

    @property
    def tags(self) -> list[str]:
        """Etiquetas como strings, que es lo que ve la API."""
        return [t.nombre for t in self.tag_rows]
```

y al final del archivo:

```python
class PersonTag(Base):
    """Etiqueta libre de una persona ("inversor", "busca depto zona norte").

    Cubre lo que los roles derivados no pueden: una persona que todavía no está
    vinculada a ninguna propiedad ni operación. La unicidad es por par y sin
    distinguir mayúsculas: la aplica `service.set_tags`, no la base.
    """

    __tablename__ = "people_tags"
    __table_args__ = (UniqueConstraint("person_id", "nombre", name="uq_person_tag"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    person_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("people.id", ondelete="CASCADE"), nullable=False, index=True
    )
    nombre: Mapped[str] = mapped_column(String(60), nullable=False)

    person: Mapped[Person] = relationship("Person", back_populates="tag_rows")
```

- [ ] **Step 6: Módulo `inmobiliaria` (solo el modelo por ahora)**

`src/app/platform/inmobiliaria/__init__.py` vacío. `src/app/platform/inmobiliaria/models.py`:

```python
"""Configuración de la inmobiliaria: una sola fila (id=1).

Es la única tabla del backend que sabe cómo se llama la inmobiliaria. Está en
tabla y no en código para que convertir el producto en multi-inmobiliaria sea
agregar un `inmobiliaria_id` a las demás, no rehacer módulos.
"""
from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import DateTime, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Inmobiliaria(Base):
    __tablename__ = "inmobiliaria"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    logo_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    # Clave del archivo en el almacenamiento, para poder borrar el logo anterior.
    logo_storage_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    telefono: Mapped[str | None] = mapped_column(String(50), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cuit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    direccion: Mapped[str | None] = mapped_column(String(255), nullable=True)
    honorarios_venta_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    honorarios_alquiler_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    actualizado_en: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )
```

En `src/alembic/env.py`, junto a los otros imports de modelos:

```python
from app.platform.inmobiliaria import models as _inmobiliaria_models  # noqa: F401
```

Y en `src/tests/conftest.py`, después del import de `propiedades_models`:

```python
from app.platform.inmobiliaria import models as inmobiliaria_models  # noqa: F401
```

(`app.main` todavía no importa el router de inmobiliaria; hasta la Task 11 el modelo se registra por este import.)

- [ ] **Step 7: `PIPELINES_BASE`**

`src/app/platform/deals/pipelines_base.py`:

```python
"""Pipelines con los que arranca el sistema.

Un solo lugar para la migración 0004 y para `service.sembrar_pipelines_base`
(que usan los tests): si cambian las etapas, cambian acá.
"""

# (nombre, [(etapa, posición, is_won, is_lost), ...])
PIPELINES_BASE: list[tuple[str, list[tuple[str, int, bool, bool]]]] = [
    (
        "Venta",
        [
            ("Consulta", 1, False, False),
            ("Visita", 2, False, False),
            ("Oferta", 3, False, False),
            ("Ganada", 4, True, False),
            ("Perdida", 5, False, True),
        ],
    ),
    (
        "Alquiler",
        [
            ("Consulta", 1, False, False),
            ("Visita", 2, False, False),
            ("Reserva", 3, False, False),
            ("Contrato firmado", 4, True, False),
            ("Perdida", 5, False, True),
        ],
    ),
]
```

- [ ] **Step 8: Migración `0004`**

`src/alembic/versions/0004_crm_en_el_panel.py`:

```python
"""Bloque CRM: FKs que faltaban, stage_changed_at, people_tags, inmobiliaria, pipelines base

Las columnas `propietario_persona_id`, `reservations.property_id`, `deals.property_id`
y `activities.property_id` nacieron sin FK por una limitación de MySQL (no admite FK
entre signed/unsigned) que en PostgreSQL no existe. Se formalizan.

**Antes de correrla contra una base con datos**, verificar que no haya referencias
huérfanas o el CREATE de cada FK falla:

    SELECT id FROM propiedades WHERE propietario_persona_id IS NOT NULL
      AND propietario_persona_id NOT IN (SELECT id FROM people);
    SELECT id FROM reservations WHERE property_id NOT IN (SELECT id FROM propiedades);
    SELECT id FROM deals WHERE property_id IS NOT NULL
      AND property_id NOT IN (SELECT id FROM propiedades);
    SELECT id FROM activities WHERE property_id IS NOT NULL
      AND property_id NOT IN (SELECT id FROM propiedades);

Revision ID: 0004_crm_en_el_panel
Revises: 0003_variantes_medios
Create Date: 2026-09-11

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op
from app.platform.deals.pipelines_base import PIPELINES_BASE

revision: str = "0004_crm_en_el_panel"
down_revision: str | None = "0003_variantes_medios"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- FKs que faltaban -------------------------------------------------
    op.create_index(
        "ix_propiedades_propietario_persona_id", "propiedades", ["propietario_persona_id"]
    )
    op.create_foreign_key(
        "fk_propiedades_propietario_persona", "propiedades", "people",
        ["propietario_persona_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_reservations_property", "reservations", "propiedades",
        ["property_id"], ["id"], ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_deals_property", "deals", "propiedades",
        ["property_id"], ["id"], ondelete="RESTRICT",
    )
    op.create_index("ix_activities_property_id", "activities", ["property_id"])
    op.create_foreign_key(
        "fk_activities_property", "activities", "propiedades",
        ["property_id"], ["id"], ondelete="SET NULL",
    )

    # --- deals.stage_changed_at: las filas existentes arrancan en updated_at ---
    op.add_column(
        "deals", sa.Column("stage_changed_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.execute("UPDATE deals SET stage_changed_at = updated_at")
    op.alter_column("deals", "stage_changed_at", nullable=False)

    # --- people_tags -------------------------------------------------------
    op.create_table(
        "people_tags",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "person_id", sa.Integer(),
            sa.ForeignKey("people.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("nombre", sa.String(60), nullable=False),
        sa.UniqueConstraint("person_id", "nombre", name="uq_person_tag"),
    )
    op.create_index("ix_people_tags_person_id", "people_tags", ["person_id"])

    # --- inmobiliaria: una fila, id=1 ---------------------------------------
    inmobiliaria = op.create_table(
        "inmobiliaria",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("nombre", sa.String(150), nullable=False),
        sa.Column("logo_url", sa.String(1024), nullable=True),
        sa.Column("logo_storage_key", sa.String(512), nullable=True),
        sa.Column("telefono", sa.String(50), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("cuit", sa.String(20), nullable=True),
        sa.Column("direccion", sa.String(255), nullable=True),
        sa.Column("honorarios_venta_pct", sa.Numeric(5, 2), nullable=True),
        sa.Column("honorarios_alquiler_pct", sa.Numeric(5, 2), nullable=True),
        sa.Column("actualizado_en", sa.DateTime(timezone=True), nullable=False),
    )
    op.bulk_insert(
        inmobiliaria,
        [{"id": 1, "nombre": "Mambo Groups", "actualizado_en": sa.func.now()}],
    )

    # --- pipelines base, solo si la tabla está vacía -------------------------
    conn = op.get_bind()
    if conn.execute(sa.text("SELECT COUNT(*) FROM pipelines")).scalar() == 0:
        for nombre, etapas in PIPELINES_BASE:
            pipeline_id = conn.execute(
                sa.text(
                    "INSERT INTO pipelines (name, is_active, created_at) "
                    "VALUES (:name, TRUE, NOW()) RETURNING id"
                ),
                {"name": nombre},
            ).scalar()
            for etapa, posicion, is_won, is_lost in etapas:
                conn.execute(
                    sa.text(
                        "INSERT INTO pipeline_stages "
                        "(pipeline_id, name, position, is_won, is_lost) "
                        "VALUES (:p, :n, :pos, :w, :l)"
                    ),
                    {"p": pipeline_id, "n": etapa, "pos": posicion, "w": is_won, "l": is_lost},
                )


def downgrade() -> None:
    op.drop_table("inmobiliaria")
    op.drop_index("ix_people_tags_person_id", table_name="people_tags")
    op.drop_table("people_tags")
    op.drop_column("deals", "stage_changed_at")
    op.drop_constraint("fk_activities_property", "activities", type_="foreignkey")
    op.drop_index("ix_activities_property_id", table_name="activities")
    op.drop_constraint("fk_deals_property", "deals", type_="foreignkey")
    op.drop_constraint("fk_reservations_property", "reservations", type_="foreignkey")
    op.drop_constraint("fk_propiedades_propietario_persona", "propiedades", type_="foreignkey")
    op.drop_index("ix_propiedades_propietario_persona_id", table_name="propiedades")
    # Los pipelines sembrados no se borran: pueden tener deals colgados.
```

- [ ] **Step 9: Correr tests y `alembic check`**

Run: `cd src && python -m pytest tests/ -q && ruff check .`
Expected: verde.

Run (con `DATABASE_URL` a un PostgreSQL de prueba): `cd src && alembic upgrade head && alembic check`
Expected: `No new upgrade operations detected.` Si `alembic check` reporta diferencias de nombres de índice o FK, ajustar los nombres de la migración a los que espera, **no** los modelos.

- [ ] **Step 10: Commit**

```bash
git add src/app src/alembic src/tests/test_modelos_crm.py src/tests/conftest.py
git commit -m "feat(backend): FKs del CRM, etiquetas de persona, inmobiliaria y pipelines base"
```

---

### Task 3: Pipelines base sembrables y guardas de etapas

**Files:**
- Modify: `src/app/platform/deals/service.py` (`sembrar_pipelines_base`, `remove_stage`)
- Create: `src/tests/helpers_crm.py`
- Test: `src/tests/test_deals_pipelines_base.py`

**Interfaces:**
- Produces: `sembrar_pipelines_base(db) -> None` (idempotente); `helpers_crm.crear_propiedad(db, **campos) -> Propiedad`, `helpers_crm.crear_persona(db, first_name="Ana", last_name="Pérez") -> Person`, `helpers_crm.pipeline_por_nombre(db, nombre) -> Pipeline`, `helpers_crm.etapa(pipeline, nombre) -> PipelineStage`.

- [ ] **Step 1: Helpers de test**

`src/tests/helpers_crm.py`:

```python
"""Fábricas mínimas para los tests del CRM. Insertan directo en la sesión de test."""

from app.modules.propiedades.models import EstadoComercial, Propiedad, TipoOperacion
from app.platform.deals.models import Pipeline, PipelineStage
from app.platform.deals.service import sembrar_pipelines_base
from app.platform.people.models import Person


def crear_propiedad(
    db,
    titulo: str = "Casa en Villa Elisa",
    estado: EstadoComercial = EstadoComercial.disponible,
    operacion: TipoOperacion = TipoOperacion.venta,
    **campos,
) -> Propiedad:
    prop = Propiedad(
        titulo=titulo, estado_comercial=estado, tipo_operacion=operacion, precio=100000, **campos
    )
    db.add(prop)
    db.commit()
    db.refresh(prop)
    return prop


def crear_persona(db, first_name: str = "Ana", last_name: str = "Pérez", **campos) -> Person:
    persona = Person(first_name=first_name, last_name=last_name, **campos)
    db.add(persona)
    db.commit()
    db.refresh(persona)
    return persona


def pipeline_por_nombre(db, nombre: str) -> Pipeline:
    """Devuelve el pipeline base, sembrándolos si hace falta."""
    sembrar_pipelines_base(db)
    return db.query(Pipeline).filter(Pipeline.name == nombre).one()


def etapa(pipeline: Pipeline, nombre: str) -> PipelineStage:
    return next(s for s in pipeline.stages if s.name == nombre)
```

- [ ] **Step 2: Test que falla**

`src/tests/test_deals_pipelines_base.py`:

```python
from app.platform.deals.models import Pipeline
from app.platform.deals.service import sembrar_pipelines_base
from tests.helpers_crm import etapa, pipeline_por_nombre


def test_siembra_venta_y_alquiler_una_sola_vez(db):
    sembrar_pipelines_base(db)
    sembrar_pipelines_base(db)

    nombres = sorted(p.name for p in db.query(Pipeline).all())
    assert nombres == ["Alquiler", "Venta"]
    venta = pipeline_por_nombre(db, "Venta")
    assert [s.name for s in venta.stages] == ["Consulta", "Visita", "Oferta", "Ganada", "Perdida"]
    assert etapa(venta, "Ganada").is_won and etapa(venta, "Perdida").is_lost


def test_no_se_borra_la_etapa_ganada(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    venta = pipeline_por_nombre(db, "Venta")
    ganada = etapa(venta, "Ganada")

    r = client.delete(f"/api/v1/pipelines/{venta.id}/stages/{ganada.id}")

    assert r.status_code == 409
    assert "ganada" in r.json()["detail"].lower()
```

- [ ] **Step 3: Correr y ver que falla**

Run: `cd src && python -m pytest tests/test_deals_pipelines_base.py -q`
Expected: FAIL — `ImportError: sembrar_pipelines_base`.

- [ ] **Step 4: Implementar**

En `src/app/platform/deals/service.py`, importar `from app.platform.deals.pipelines_base import PIPELINES_BASE` y agregar al final de la sección Pipeline:

```python
def sembrar_pipelines_base(db: DBSession) -> None:
    """Crea Venta y Alquiler con sus etapas si la tabla está vacía.

    Idempotente. La migración 0004 hace lo mismo en producción; esta versión es
    para los tests y para un entorno de desarrollo recién creado.
    """
    if db.query(Pipeline).count() > 0:
        return
    for nombre, etapas in PIPELINES_BASE:
        pipeline = Pipeline(name=nombre)
        db.add(pipeline)
        db.flush()
        for etapa, posicion, is_won, is_lost in etapas:
            db.add(
                PipelineStage(
                    pipeline_id=pipeline.id, name=etapa, position=posicion,
                    is_won=is_won, is_lost=is_lost,
                )
            )
    db.commit()
```

Reemplazar `remove_stage` por:

```python
def remove_stage(db: DBSession, pipeline_id: int, stage_id: int) -> None:
    stage = get_stage_or_404(db, pipeline_id, stage_id)
    if stage.is_won or stage.is_lost:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se puede borrar la etapa ganada ni la perdida: el tablero las necesita",
        )
    abiertos = (
        db.query(Deal)
        .filter(Deal.stage_id == stage_id, Deal.deleted_at.is_(None))
        .count()
    )
    if abiertos:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"La etapa tiene {abiertos} operación(es); movelas antes de borrarla",
        )
    db.delete(stage)
    db.commit()
```

(Si el `remove_stage` actual ya hace la segunda comprobación, conservar su texto y sumar solo la primera.)

- [ ] **Step 5: Verificar y commitear**

Run: `cd src && python -m pytest tests/ -q && ruff check .`

```bash
git add src/app/platform/deals/service.py src/tests/helpers_crm.py src/tests/test_deals_pipelines_base.py
git commit -m "feat(backend): pipelines base sembrables y guardas al borrar etapas"
```

---

### Task 4: `aplicar_evento_de_operacion` y guarda del cambio manual

**Files:**
- Modify: `src/app/modules/propiedades/service.py`
- Test: `src/tests/test_propiedades_estado_operacion.py`

**Interfaces:**
- Produces: `EventoOperacion` (StrEnum: `reserva_creada`, `reserva_liberada`, `deal_ganado`, `deal_perdido`, `deal_reabierto`); `aplicar_evento_de_operacion(db, propiedad_id: int, evento: EventoOperacion) -> Propiedad` (hace `flush`, **no** `commit`; 404 si la propiedad no existe; 409 si el evento no corresponde).
- `actualizar_propiedad` rechaza con 409 pasar a `disponible` una propiedad con reserva activa o deal ganado.

- [ ] **Step 1: Test que falla**

```python
"""Tabla de transiciones del estado de la propiedad ante reservas y deals (spec 4.5)."""

import pytest
from fastapi import HTTPException

from app.modules.propiedades.models import EstadoComercial as E
from app.modules.propiedades.service import EventoOperacion as Ev
from app.modules.propiedades.service import aplicar_evento_de_operacion
from app.platform.deals.models import Deal
from app.platform.reservations.models import Reservation
from tests.helpers_crm import crear_persona, crear_propiedad, etapa, pipeline_por_nombre


@pytest.mark.parametrize(
    ("antes", "evento", "despues"),
    [
        (E.disponible, Ev.reserva_creada, E.reservada),
        (E.reservada, Ev.reserva_creada, E.reservada),  # reserva "de palabra" cargada a mano
        (E.reservada, Ev.reserva_liberada, E.disponible),
        (E.cerrada, Ev.reserva_liberada, E.cerrada),  # sin cambio
        (E.disponible, Ev.deal_ganado, E.cerrada),
        (E.reservada, Ev.deal_ganado, E.cerrada),
        (E.reservada, Ev.deal_perdido, E.disponible),
        (E.disponible, Ev.deal_perdido, E.disponible),  # sin cambio
        (E.cerrada, Ev.deal_reabierto, E.disponible),
        (E.baja, Ev.deal_reabierto, E.baja),  # sin cambio
    ],
)
def test_transiciones(db, antes, evento, despues):
    prop = crear_propiedad(db, estado=antes)

    aplicar_evento_de_operacion(db, prop.id, evento)
    db.commit()

    assert prop.estado_comercial == despues


@pytest.mark.parametrize(
    ("antes", "evento", "fragmento"),
    [
        (E.cerrada, Ev.reserva_creada, "no está disponible"),
        (E.baja, Ev.reserva_creada, "no está disponible"),
        (E.baja, Ev.deal_ganado, "dada de baja"),
    ],
)
def test_eventos_rechazados(db, antes, evento, fragmento):
    prop = crear_propiedad(db, estado=antes)

    with pytest.raises(HTTPException) as exc:
        aplicar_evento_de_operacion(db, prop.id, evento)

    assert exc.value.status_code == 409
    assert fragmento in exc.value.detail


def test_propiedad_inexistente_404(db):
    with pytest.raises(HTTPException) as exc:
        aplicar_evento_de_operacion(db, 9999, Ev.reserva_creada)
    assert exc.value.status_code == 404


def test_no_se_libera_a_mano_con_reserva_activa(client, db, crear_usuario, iniciar_sesion):
    usuario = crear_usuario()
    iniciar_sesion()
    persona = crear_persona(db)
    prop = crear_propiedad(db, estado=E.reservada)
    reserva = Reservation(
        person_id=persona.id, property_id=prop.id, created_by_user_id=usuario.id, status="activa"
    )
    db.add(reserva)
    db.commit()

    r = client.put(f"/api/v1/propiedades/{prop.id}", json={"estado_comercial": "disponible"})

    assert r.status_code == 409
    assert f"reserva {reserva.id} activa" in r.json()["detail"]
    db.refresh(prop)
    assert prop.estado_comercial == E.reservada


def test_no_se_libera_a_mano_con_deal_ganado(client, db, crear_usuario, iniciar_sesion):
    usuario = crear_usuario()
    iniciar_sesion()
    prop = crear_propiedad(db, estado=E.cerrada)
    venta = pipeline_por_nombre(db, "Venta")
    deal = Deal(
        title="x", pipeline_id=venta.id, stage_id=etapa(venta, "Ganada").id,
        created_by_user_id=usuario.id, property_id=prop.id, is_won=True,
    )
    db.add(deal)
    db.commit()

    r = client.put(f"/api/v1/propiedades/{prop.id}", json={"estado_comercial": "disponible"})

    assert r.status_code == 409
    assert f"operación {deal.id} ganada" in r.json()["detail"]


def test_se_libera_a_mano_sin_operaciones(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    prop = crear_propiedad(db, estado=E.cerrada)

    r = client.put(f"/api/v1/propiedades/{prop.id}", json={"estado_comercial": "disponible"})

    assert r.status_code == 200
    assert r.json()["estado_comercial"] == "disponible"
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd src && python -m pytest tests/test_propiedades_estado_operacion.py -q`
Expected: FAIL — `ImportError: EventoOperacion`.

- [ ] **Step 3: Implementar**

En `src/app/modules/propiedades/service.py`: agregar `from enum import StrEnum` a los imports, y

```python
from app.platform.deals.models import Deal
from app.platform.reservations.models import Reservation
```

(no hay ciclo: los módulos de `platform` importan **este** servicio, y este solo importa sus modelos).

Después de `obtener_propiedad`:

```python
class EventoOperacion(StrEnum):
    """Lo que le puede pasar a una propiedad desde el CRM."""

    reserva_creada = "reserva_creada"
    reserva_liberada = "reserva_liberada"  # cancelada o vencida
    deal_ganado = "deal_ganado"
    deal_perdido = "deal_perdido"
    deal_reabierto = "deal_reabierto"  # de ganada/perdida a una etapa abierta


def aplicar_evento_de_operacion(
    db: Session, propiedad_id: int, evento: EventoOperacion
) -> Propiedad:
    """Mueve `estado_comercial` según un evento del CRM (spec 4.5).

    No hace commit: corre dentro de la transacción del servicio que la llama,
    para que reserva (o deal) y propiedad cambien juntos o no cambie nada.
    Los eventos que no corresponden al estado actual se ignoran, salvo los dos
    que serían un error del operador, que devuelven 409.
    """
    prop = obtener_propiedad(db, propiedad_id)
    estado = prop.estado_comercial

    if evento == EventoOperacion.reserva_creada:
        if estado in (EstadoComercial.cerrada, EstadoComercial.baja):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"La propiedad no está disponible (estado: {estado})",
            )
        prop.estado_comercial = EstadoComercial.reservada
    elif evento == EventoOperacion.reserva_liberada:
        if estado == EstadoComercial.reservada:
            prop.estado_comercial = EstadoComercial.disponible
    elif evento == EventoOperacion.deal_ganado:
        if estado == EstadoComercial.baja:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="La propiedad está dada de baja",
            )
        prop.estado_comercial = EstadoComercial.cerrada
    elif evento == EventoOperacion.deal_perdido:
        if estado == EstadoComercial.reservada:
            prop.estado_comercial = EstadoComercial.disponible
    elif evento == EventoOperacion.deal_reabierto:
        if estado == EstadoComercial.cerrada:
            prop.estado_comercial = EstadoComercial.disponible

    db.flush()
    return prop


def _verificar_liberacion_manual(db: Session, prop: Propiedad) -> None:
    """Un operador no puede poner `disponible` lo que el CRM tiene tomado."""
    reserva = (
        db.query(Reservation)
        .filter(Reservation.property_id == prop.id, Reservation.status == "activa")
        .first()
    )
    if reserva:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"La propiedad tiene la reserva {reserva.id} activa",
        )
    deal = (
        db.query(Deal)
        .filter(Deal.property_id == prop.id, Deal.is_won.is_(True), Deal.deleted_at.is_(None))
        .first()
    )
    if deal:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"La propiedad tiene la operación {deal.id} ganada",
        )
```

En `actualizar_propiedad`, antes del `for field, value in campos.items()`:

```python
    if campos.get("estado_comercial") == EstadoComercial.disponible:
        _verificar_liberacion_manual(db, prop)
```

- [ ] **Step 4: Verificar y commitear**

Run: `cd src && python -m pytest tests/ -q && ruff check .`

```bash
git add src/app/modules/propiedades/service.py src/tests/test_propiedades_estado_operacion.py
git commit -m "feat(backend): el estado de la propiedad sigue a reservas y deals"
```

---

### Task 5: Reservas que mueven la propiedad y traen su propiedad

**Files:**
- Modify: `src/app/platform/reservations/service.py`
- Modify: `src/app/platform/reservations/schemas.py`
- Modify: `src/app/modules/propiedades/schemas.py` (`PropiedadBrief`)
- Test: `src/tests/test_reservations_estado.py`

**Interfaces:**
- Consumes: `aplicar_evento_de_operacion`, `EventoOperacion` (Task 4).
- Produces: `PropiedadBrief(id, titulo, estado_comercial)` en `app.modules.propiedades.schemas`; `ReservationOut.propiedad: PropiedadBrief`.

- [ ] **Step 1: Test que falla**

```python
"""Crear, cancelar, vencer y convertir una reserva mueven (o no) el estado de la propiedad."""

from app.modules.propiedades.models import EstadoComercial as E
from app.platform.reservations.models import Reservation
from tests.helpers_crm import crear_persona, crear_propiedad


def _reservar(client, prop_id, persona_id):
    return client.post(
        "/api/v1/reservations",
        json={"person_id": persona_id, "property_id": prop_id, "amount": 1000},
    )


def test_reservar_deja_la_propiedad_reservada(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    prop = crear_propiedad(db)
    persona = crear_persona(db)

    r = _reservar(client, prop.id, persona.id)

    assert r.status_code == 201, r.text
    assert r.json()["propiedad"] == {"id": prop.id, "titulo": prop.titulo, "estado_comercial": "reservada"}
    db.refresh(prop)
    assert prop.estado_comercial == E.reservada


def test_reservar_una_cerrada_da_409_y_no_crea_la_fila(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    prop = crear_propiedad(db, estado=E.cerrada)
    persona = crear_persona(db)

    r = _reservar(client, prop.id, persona.id)

    assert r.status_code == 409
    assert "no está disponible" in r.json()["detail"]
    assert db.query(Reservation).count() == 0


def test_reservar_una_propiedad_inexistente_da_404(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    persona = crear_persona(db)

    assert _reservar(client, 9999, persona.id).status_code == 404


def test_cancelar_y_vencer_liberan(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    persona = crear_persona(db)
    for accion in ("cancel", "expire"):
        prop = crear_propiedad(db)
        reserva_id = _reservar(client, prop.id, persona.id).json()["id"]

        r = client.patch(f"/api/v1/reservations/{reserva_id}/{accion}")

        assert r.status_code == 200, r.text
        db.refresh(prop)
        assert prop.estado_comercial == E.disponible


def test_convertir_no_toca_la_propiedad(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    prop = crear_propiedad(db)
    persona = crear_persona(db)
    reserva_id = _reservar(client, prop.id, persona.id).json()["id"]

    r = client.patch(f"/api/v1/reservations/{reserva_id}/convert")

    assert r.status_code == 200
    db.refresh(prop)
    assert prop.estado_comercial == E.reservada
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd src && python -m pytest tests/test_reservations_estado.py -q`
Expected: FAIL en el primer test — la propiedad sigue `disponible` y la respuesta no trae `propiedad`.

- [ ] **Step 3: `PropiedadBrief`**

En `src/app/modules/propiedades/schemas.py`, antes de `PropiedadBase`:

```python
class PropiedadBrief(BaseModel):
    """Lo mínimo para nombrar y linkear una propiedad desde el CRM."""

    id: int
    titulo: str
    estado_comercial: EstadoComercial

    model_config = ConfigDict(from_attributes=True)
```

- [ ] **Step 4: Schema y servicio de reservas**

`src/app/platform/reservations/schemas.py`: importar `from app.modules.propiedades.schemas import PropiedadBrief` y en `ReservationOut` reemplazar `property_id: int` por:

```python
    property_id: int
    propiedad: PropiedadBrief
```

`src/app/platform/reservations/service.py`: importar

```python
from app.modules.propiedades.service import EventoOperacion, aplicar_evento_de_operacion
```

En `create_reservation`, entre la comprobación de `existing_active` y `reservation = Reservation(...)`:

```python
    # Valida que la propiedad exista (404) y la deja `reservada`, en la misma
    # transacción que la reserva: si algo falla, no queda ninguna de las dos.
    aplicar_evento_de_operacion(db, data.property_id, EventoOperacion.reserva_creada)
```

En `change_status`, después de `reservation.status = new_status`:

```python
    if new_status in ("cancelada", "vencida"):
        aplicar_evento_de_operacion(
            db, reservation.property_id, EventoOperacion.reserva_liberada
        )
```

- [ ] **Step 5: Verificar y commitear**

Run: `cd src && python -m pytest tests/ -q && ruff check .`

```bash
git add src/app/platform/reservations src/app/modules/propiedades/schemas.py src/tests/test_reservations_estado.py
git commit -m "feat(backend): las reservas mueven el estado de la propiedad"
```

---

### Task 6: Deals que cierran y reabren la propiedad, roles nuevos, `dias_en_etapa`

**Files:**
- Modify: `src/app/platform/deals/service.py` (`create_deal`, `move_stage`, helpers)
- Modify: `src/app/platform/deals/schemas.py`
- Test: `src/tests/test_deals_estado.py`

**Interfaces:**
- Consumes: `aplicar_evento_de_operacion`, `EventoOperacion`, `PropiedadBrief`, `PersonBrief` (de `reservations.schemas`).
- Produces: `PartyRole` = comprador | vendedor | inquilino | propietario | garante | interesado | otro. `DealPartyOut.person: PersonBrief`. `DealOut` y `DealListOut` con `propiedad: PropiedadBrief | None`, `stage_changed_at`, `dias_en_etapa: int`, `parties: list[DealPartyOut]`.

- [ ] **Step 1: Test que falla**

```python
"""Ganar, perder y reabrir un deal mueven la propiedad y su reserva (spec 4.5)."""

from app.modules.propiedades.models import EstadoComercial as E
from app.platform.reservations.models import Reservation
from tests.helpers_crm import crear_persona, crear_propiedad, etapa, pipeline_por_nombre


def _deal(client, db, prop_id, persona_id, etapa_nombre="Consulta", pipeline="Venta"):
    p = pipeline_por_nombre(db, pipeline)
    r = client.post(
        "/api/v1/deals",
        json={
            "title": "Op", "pipeline_id": p.id, "stage_id": etapa(p, etapa_nombre).id,
            "property_id": prop_id, "amount": 100000,
            "parties": [{"person_id": persona_id, "role": "comprador"}],
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def _mover(client, db, deal_id, etapa_nombre, pipeline="Venta"):
    p = pipeline_por_nombre(db, pipeline)
    return client.patch(
        f"/api/v1/deals/{deal_id}/stage", json={"stage_id": etapa(p, etapa_nombre).id}
    )


def test_ganar_cierra_la_propiedad_y_convierte_la_reserva(client, db, crear_usuario, iniciar_sesion):
    usuario = crear_usuario()
    iniciar_sesion()
    prop = crear_propiedad(db, estado=E.reservada)
    persona = crear_persona(db)
    reserva = Reservation(
        person_id=persona.id, property_id=prop.id, created_by_user_id=usuario.id, status="activa"
    )
    db.add(reserva)
    db.commit()
    deal = _deal(client, db, prop.id, persona.id)

    r = _mover(client, db, deal["id"], "Ganada")

    assert r.status_code == 200, r.text
    assert r.json()["propiedad"]["estado_comercial"] == "cerrada"
    db.refresh(prop)
    db.refresh(reserva)
    assert prop.estado_comercial == E.cerrada
    assert reserva.status == "convertida"


def test_perder_cancela_la_reserva_y_libera(client, db, crear_usuario, iniciar_sesion):
    usuario = crear_usuario()
    iniciar_sesion()
    prop = crear_propiedad(db, estado=E.reservada)
    persona = crear_persona(db)
    reserva = Reservation(
        person_id=persona.id, property_id=prop.id, created_by_user_id=usuario.id, status="activa"
    )
    db.add(reserva)
    db.commit()
    deal = _deal(client, db, prop.id, persona.id)

    assert _mover(client, db, deal["id"], "Perdida").status_code == 200
    db.refresh(prop)
    db.refresh(reserva)
    assert prop.estado_comercial == E.disponible
    assert reserva.status == "cancelada"


def test_reabrir_devuelve_a_disponible(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    prop = crear_propiedad(db)
    persona = crear_persona(db)
    deal = _deal(client, db, prop.id, persona.id)
    _mover(client, db, deal["id"], "Ganada")

    assert _mover(client, db, deal["id"], "Oferta").status_code == 200
    db.refresh(prop)
    assert prop.estado_comercial == E.disponible


def test_ganar_una_dada_de_baja_da_409_y_no_mueve(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    prop = crear_propiedad(db)
    persona = crear_persona(db)
    deal = _deal(client, db, prop.id, persona.id)
    prop.estado_comercial = E.baja
    db.commit()

    r = _mover(client, db, deal["id"], "Ganada")

    assert r.status_code == 409
    assert "dada de baja" in r.json()["detail"]
    assert client.get(f"/api/v1/deals/{deal['id']}").json()["is_won"] is False


def test_deal_sin_propiedad_no_toca_nada(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    persona = crear_persona(db)
    p = pipeline_por_nombre(db, "Venta")
    r = client.post(
        "/api/v1/deals",
        json={"title": "Compró por afuera", "pipeline_id": p.id, "stage_id": etapa(p, "Consulta").id},
    )
    deal_id = r.json()["id"]

    r = _mover(client, db, deal_id, "Ganada")

    assert r.status_code == 200
    assert r.json()["propiedad"] is None
    assert r.json()["is_won"] is True


def test_partes_traen_a_la_persona_y_admiten_inquilino(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    prop = crear_propiedad(db)
    persona = crear_persona(db)
    deal = _deal(client, db, prop.id, persona.id)

    r = client.post(
        f"/api/v1/deals/{deal['id']}/parties", json={"person_id": persona.id, "role": "inquilino"}
    )

    assert r.status_code == 201, r.text
    assert r.json()["person"] == {"id": persona.id, "full_name": "Ana Pérez"}
    detalle = client.get(f"/api/v1/deals/{deal['id']}").json()
    assert {p["role"] for p in detalle["parties"]} == {"comprador", "inquilino"}
    assert detalle["dias_en_etapa"] == 0
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd src && python -m pytest tests/test_deals_estado.py -q`
Expected: FAIL — la propiedad sigue `reservada` tras ganar; `role: inquilino` devuelve 422.

- [ ] **Step 3: Schemas**

En `src/app/platform/deals/schemas.py`:

```python
from app.modules.propiedades.schemas import PropiedadBrief
from app.platform.reservations.schemas import PersonBrief

PartyRole = Literal[
    "comprador", "vendedor", "inquilino", "propietario", "garante", "interesado", "otro"
]
```

`DealPartyOut` suma `person: PersonBrief`. `DealOut` suma:

```python
    propiedad: PropiedadBrief | None = None
    stage_changed_at: datetime
    dias_en_etapa: int
```

`DealListOut` suma:

```python
    propiedad: PropiedadBrief | None = None
    stage_changed_at: datetime
    dias_en_etapa: int
    parties: list[DealPartyOut] = []
```

- [ ] **Step 4: Servicio**

En `src/app/platform/deals/service.py`, importar:

```python
from app.modules.propiedades.service import EventoOperacion, aplicar_evento_de_operacion
from app.platform.reservations.models import Reservation
```

Agregar a los helpers internos:

```python
def _reserva_activa(db: DBSession, property_id: int) -> Reservation | None:
    return (
        db.query(Reservation)
        .filter(Reservation.property_id == property_id, Reservation.status == "activa")
        .first()
    )


def _aplicar_cierre(db: DBSession, deal: Deal, stage: PipelineStage, estaba_cerrado: bool) -> None:
    """Refleja en la propiedad (y en su reserva activa) que el deal cambió de etapa.

    Sin commit: lo hace quien llama. Un deal sin propiedad no dispara nada. Si la
    propiedad rechaza el evento (409), se revierte la sesión entera: el deal ya
    tiene la etapa nueva en memoria y sin rollback un lector de la misma sesión
    (los tests, o el `refresh` de un error posterior) la vería como aplicada.
    """
    if deal.property_id is None:
        return
    try:
        _aplicar_cierre_sin_proteccion(db, deal, stage, estaba_cerrado)
    except HTTPException:
        db.rollback()
        raise


def _aplicar_cierre_sin_proteccion(
    db: DBSession, deal: Deal, stage: PipelineStage, estaba_cerrado: bool
) -> None:
    if stage.is_won:
        aplicar_evento_de_operacion(db, deal.property_id, EventoOperacion.deal_ganado)
        reserva = _reserva_activa(db, deal.property_id)
        if reserva:
            reserva.status = "convertida"
            reserva.updated_at = datetime.now(UTC)
    elif stage.is_lost:
        reserva = _reserva_activa(db, deal.property_id)
        if reserva:
            reserva.status = "cancelada"
            reserva.updated_at = datetime.now(UTC)
        aplicar_evento_de_operacion(db, deal.property_id, EventoOperacion.deal_perdido)
    elif estaba_cerrado:
        aplicar_evento_de_operacion(db, deal.property_id, EventoOperacion.deal_reabierto)
```

En `create_deal`, cambiar el `db.flush()` posterior al `db.add(deal)` y lo que sigue por:

```python
    db.add(deal)
    db.flush()

    for party_data in data.parties:
        db.add(DealParty(deal_id=deal.id, **party_data.model_dump()))

    # Crear directo en Ganada/Perdida es raro pero legal: aplica las mismas reglas.
    stage = db.query(PipelineStage).filter(PipelineStage.id == data.stage_id).first()
    deal.is_won = stage.is_won
    deal.is_lost = stage.is_lost
    if stage.is_won or stage.is_lost:
        deal.closed_at = datetime.now(UTC)
    _aplicar_cierre(db, deal, stage, estaba_cerrado=False)

    db.commit()
    db.refresh(deal)
    return deal
```

Reemplazar `move_stage` por:

```python
def move_stage(db: DBSession, deal_id: int, data: DealMoveStage) -> Deal:
    deal = get_deal_or_404(db, deal_id)
    _validate_stage_belongs_to_pipeline(db, data.stage_id, deal.pipeline_id)
    stage = db.query(PipelineStage).filter(PipelineStage.id == data.stage_id).first()
    estaba_cerrado = deal.is_closed
    ahora = datetime.now(UTC)

    deal.stage_id = data.stage_id
    deal.stage_changed_at = ahora
    deal.is_won = stage.is_won
    deal.is_lost = stage.is_lost
    deal.closed_at = ahora if (stage.is_won or stage.is_lost) else None
    deal.updated_at = ahora

    # Antes del commit: si la propiedad rechaza el cierre (409), el deal no se mueve.
    _aplicar_cierre(db, deal, stage, estaba_cerrado)

    db.commit()
    db.refresh(deal)
    return deal
```

- [ ] **Step 5: Verificar y commitear**

Run: `cd src && python -m pytest tests/ -q && ruff check .`

```bash
git add src/app/platform/deals src/tests/test_deals_estado.py
git commit -m "feat(backend): ganar o perder un deal mueve la propiedad y su reserva"
```

---

### Task 7: Etiquetas de persona

**Files:**
- Modify: `src/app/platform/people/schemas.py`
- Modify: `src/app/platform/people/service.py`
- Modify: `src/app/platform/people/router.py`
- Test: `src/tests/test_people_tags.py`

**Interfaces:**
- Produces: `PUT /api/v1/people/{id}/tags` body `{"tags": [str]}` → `PersonOut`; `GET /api/v1/people/tags` → `[{"nombre", "cantidad"}]`; `GET /api/v1/people?tag=` filtra; `PersonOut.tags`, `PersonListOut.tags`; `service.set_tags(db, person_id, tags) -> Person`; `service.list_tags(db) -> list[tuple[str, int]]`; `list_people(..., tag: str | None = None)`.

- [ ] **Step 1: Test que falla**

```python
from tests.helpers_crm import crear_persona


def test_put_reemplaza_el_conjunto_y_normaliza(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    persona = crear_persona(db)

    r = client.put(
        f"/api/v1/people/{persona.id}/tags",
        json={"tags": [" Inversor ", "inversor", "zona norte", ""]},
    )

    assert r.status_code == 200, r.text
    assert r.json()["tags"] == ["Inversor", "zona norte"]

    r = client.put(f"/api/v1/people/{persona.id}/tags", json={"tags": ["otra"]})
    assert r.json()["tags"] == ["otra"]


def test_listado_de_etiquetas_con_conteo(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    a, b = crear_persona(db), crear_persona(db, first_name="Bruno")
    client.put(f"/api/v1/people/{a.id}/tags", json={"tags": ["inversor", "zona norte"]})
    client.put(f"/api/v1/people/{b.id}/tags", json={"tags": ["Inversor"]})

    r = client.get("/api/v1/people/tags")

    assert r.status_code == 200
    assert r.json()[0] == {"nombre": "inversor", "cantidad": 2}
    assert r.json()[1]["nombre"] == "zona norte"


def test_filtro_por_etiqueta_sin_distinguir_mayusculas(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    a, b = crear_persona(db), crear_persona(db, first_name="Bruno")
    client.put(f"/api/v1/people/{a.id}/tags", json={"tags": ["Inversor"]})

    r = client.get("/api/v1/people?tag=inversor")

    assert [p["id"] for p in r.json()["items"]] == [a.id]
    assert r.json()["items"][0]["tags"] == ["Inversor"]
    assert b.id not in [p["id"] for p in r.json()["items"]]
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd src && python -m pytest tests/test_people_tags.py -q`
Expected: FAIL — `PUT .../tags` da 404/405.

- [ ] **Step 3: Schemas**

En `src/app/platform/people/schemas.py`, agregar `tags: list[str] = []` a `PersonOut` y a `PersonListOut`, y al final:

```python
class TagsUpdate(BaseModel):
    tags: list[str]


class TagCount(BaseModel):
    nombre: str
    cantidad: int
```

- [ ] **Step 4: Servicio**

En `src/app/platform/people/service.py`, importar `from sqlalchemy import func, or_` y `PersonTag` desde los modelos. `list_people` gana el parámetro `tag`:

```python
def list_people(
    db: DBSession,
    search: str | None = None,
    tag: str | None = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[int, list[Person]]:
    q = db.query(Person).filter(Person.deleted_at.is_(None))
    if search:
        term = f"%{search}%"
        q = q.filter(
            or_(
                Person.first_name.ilike(term),
                Person.last_name.ilike(term),
                Person.document_number.ilike(term),
            )
        )
    if tag:
        q = q.join(PersonTag).filter(func.lower(PersonTag.nombre) == tag.strip().lower())
    total = q.count()
    items = q.order_by(Person.last_name, Person.first_name).offset(skip).limit(limit).all()
    return total, items
```

Sección nueva después de People:

```python
# ---------------------------------------------------------------------------
# Tags
# ---------------------------------------------------------------------------

def set_tags(db: DBSession, person_id: int, tags: list[str]) -> Person:
    """Reemplaza el conjunto entero. Recorta, descarta vacíos y deduplica sin
    distinguir mayúsculas conservando la primera forma escrita."""
    person = get_person_or_404(db, person_id)
    unicos: dict[str, str] = {}
    for crudo in tags:
        limpio = crudo.strip()
        if limpio:
            unicos.setdefault(limpio.lower(), limpio)
    person.tag_rows = [PersonTag(nombre=nombre) for nombre in unicos.values()]
    person.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(person)
    return person


def list_tags(db: DBSession) -> list[tuple[str, int]]:
    """Etiquetas distintas en uso (en minúsculas) con cuántas personas las tienen."""
    filas = (
        db.query(func.lower(PersonTag.nombre), func.count(PersonTag.id))
        .join(Person)
        .filter(Person.deleted_at.is_(None))
        .group_by(func.lower(PersonTag.nombre))
        .order_by(func.count(PersonTag.id).desc(), func.lower(PersonTag.nombre))
        .all()
    )
    return [(nombre, cantidad) for nombre, cantidad in filas]
```

- [ ] **Step 5: Router**

En `src/app/platform/people/router.py`, importar `TagCount`, `TagsUpdate`. **Antes** de `@router.get("/{person_id}")` (si no, `/tags` cae en la ruta con parámetro y devuelve 422):

```python
@router.get("/tags", response_model=list[TagCount])
def list_tags(
    db: DBSession = Depends(get_db),
    _: object = Depends(get_current_user),
) -> list[TagCount]:
    return [TagCount(nombre=n, cantidad=c) for n, c in service.list_tags(db)]
```

`list_people` gana `tag: str | None = Query(default=None, description="Filtrar por etiqueta")` y lo pasa al servicio. Junto a las rutas de contactos:

```python
@router.put("/{person_id}/tags", response_model=PersonOut, dependencies=[_staff])
def set_tags(
    person_id: int,
    body: TagsUpdate,
    db: DBSession = Depends(get_db),
) -> PersonOut:
    return PersonOut.model_validate(service.set_tags(db, person_id, body.tags))
```

- [ ] **Step 6: Verificar y commitear**

Run: `cd src && python -m pytest tests/ -q && ruff check .`

```bash
git add src/app/platform/people src/tests/test_people_tags.py
git commit -m "feat(backend): etiquetas libres en personas"
```

---

### Task 8: Roles derivados

**Files:**
- Modify: `src/app/platform/people/schemas.py`, `service.py`, `router.py`
- Test: `src/tests/test_people_roles.py`

**Interfaces:**
- Produces: `service.ROLES = ("propietario", "comprador", "vendedor", "inquilino", "interesado")`; `service.roles_de_personas(db, person_ids: list[int]) -> dict[int, dict[str, int]]`; `list_people(..., rol: str | None = None)`; `PersonOut.roles`, `PersonListOut.roles: dict[str, int]`; `GET /api/v1/people?rol=`.

- [ ] **Step 1: Test que falla**

```python
from app.platform.deals.models import Deal, DealParty
from app.platform.reservations.models import Reservation
from tests.helpers_crm import crear_persona, crear_propiedad, etapa, pipeline_por_nombre

CERO = {"propietario": 0, "comprador": 0, "vendedor": 0, "inquilino": 0, "interesado": 0}


def _deal(db, usuario, pipeline, etapa_nombre, partes):
    p = pipeline_por_nombre(db, pipeline)
    e = etapa(p, etapa_nombre)
    deal = Deal(
        title="x", pipeline_id=p.id, stage_id=e.id, created_by_user_id=usuario.id,
        is_won=e.is_won, is_lost=e.is_lost,
    )
    db.add(deal)
    db.flush()
    for persona, rol in partes:
        db.add(DealParty(deal_id=deal.id, person_id=persona.id, role=rol))
    db.commit()
    return deal


def test_persona_sin_vinculos_tiene_todo_en_cero(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    persona = crear_persona(db)

    assert client.get(f"/api/v1/people/{persona.id}").json()["roles"] == CERO


def test_propietario_sale_de_las_propiedades(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    persona = crear_persona(db)
    crear_propiedad(db, propietario_persona_id=persona.id)
    crear_propiedad(db, propietario_persona_id=persona.id)

    assert client.get(f"/api/v1/people/{persona.id}").json()["roles"]["propietario"] == 2


def test_roles_de_deals_ganados_y_abiertos(client, db, crear_usuario, iniciar_sesion):
    usuario = crear_usuario()
    iniciar_sesion()
    ana, bruno = crear_persona(db), crear_persona(db, first_name="Bruno")
    _deal(db, usuario, "Venta", "Ganada", [(ana, "comprador"), (bruno, "vendedor")])
    _deal(db, usuario, "Alquiler", "Contrato firmado", [(ana, "inquilino")])
    _deal(db, usuario, "Venta", "Visita", [(bruno, "comprador")])  # abierto: interesado

    roles_ana = client.get(f"/api/v1/people/{ana.id}").json()["roles"]
    roles_bruno = client.get(f"/api/v1/people/{bruno.id}").json()["roles"]

    assert roles_ana == {**CERO, "comprador": 1, "inquilino": 1}
    assert roles_bruno == {**CERO, "vendedor": 1, "interesado": 1}


def test_reserva_activa_cuenta_como_interesado(client, db, crear_usuario, iniciar_sesion):
    usuario = crear_usuario()
    iniciar_sesion()
    persona = crear_persona(db)
    prop = crear_propiedad(db)
    db.add(Reservation(person_id=persona.id, property_id=prop.id, created_by_user_id=usuario.id))
    db.commit()

    assert client.get(f"/api/v1/people/{persona.id}").json()["roles"]["interesado"] == 1


def test_filtro_por_rol_y_roles_en_el_listado(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    ana, bruno = crear_persona(db), crear_persona(db, first_name="Bruno")
    crear_propiedad(db, propietario_persona_id=ana.id)

    r = client.get("/api/v1/people?rol=propietario")

    assert [p["id"] for p in r.json()["items"]] == [ana.id]
    assert r.json()["items"][0]["roles"]["propietario"] == 1
    assert client.get("/api/v1/people?rol=comprador").json()["total"] == 0
    assert bruno.id in [p["id"] for p in client.get("/api/v1/people").json()["items"]]
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd src && python -m pytest tests/test_people_roles.py -q`
Expected: FAIL — `KeyError: 'roles'`.

- [ ] **Step 3: Schemas**

`PersonOut` y `PersonListOut` suman `roles: dict[str, int] = {}`.

- [ ] **Step 4: Servicio**

En `src/app/platform/people/service.py`, importar:

```python
from sqlalchemy import func, or_, select

from app.modules.propiedades.models import Propiedad
from app.platform.deals.models import Deal, DealParty
from app.platform.reservations.models import Reservation
```

Sección nueva:

```python
# ---------------------------------------------------------------------------
# Roles derivados
# ---------------------------------------------------------------------------
#
# Una persona no "es" compradora: figura como tal en una operación ganada. Los
# roles se calculan siempre desde las relaciones para que nunca queden viejos y
# para que la misma persona pueda ser dueña de una cosa y compradora de otra.

ROLES = ("propietario", "comprador", "vendedor", "inquilino", "interesado")


def _consulta_rol(rol: str):
    """Select (person_id, cantidad) para un rol. Se reutiliza para contar y filtrar."""
    if rol == "propietario":
        return (
            select(Propiedad.propietario_persona_id.label("person_id"), func.count().label("n"))
            .where(Propiedad.propietario_persona_id.is_not(None), Propiedad.eliminado_en.is_(None))
            .group_by(Propiedad.propietario_persona_id)
        )
    if rol in ("comprador", "vendedor", "inquilino"):
        return (
            select(DealParty.person_id.label("person_id"), func.count().label("n"))
            .join(Deal, Deal.id == DealParty.deal_id)
            .where(DealParty.role == rol, Deal.is_won.is_(True), Deal.deleted_at.is_(None))
            .group_by(DealParty.person_id)
        )
    if rol == "interesado":
        abiertos = (
            select(DealParty.person_id.label("person_id"))
            .join(Deal, Deal.id == DealParty.deal_id)
            .where(Deal.is_won.is_(False), Deal.is_lost.is_(False), Deal.deleted_at.is_(None))
        )
        reservas = select(Reservation.person_id.label("person_id")).where(
            Reservation.status == "activa"
        )
        union = abiertos.union_all(reservas).subquery()
        return (
            select(union.c.person_id.label("person_id"), func.count().label("n"))
            .group_by(union.c.person_id)
        )
    raise ValueError(f"Rol desconocido: {rol}")


def roles_de_personas(db: DBSession, person_ids: list[int]) -> dict[int, dict[str, int]]:
    """Roles de varias personas en cinco consultas agregadas (no una por persona)."""
    resultado = {pid: dict.fromkeys(ROLES, 0) for pid in person_ids}
    if not person_ids:
        return resultado
    for rol in ROLES:
        sub = _consulta_rol(rol).subquery()
        filas = db.execute(
            select(sub.c.person_id, sub.c.n).where(sub.c.person_id.in_(person_ids))
        ).all()
        for pid, n in filas:
            resultado[pid][rol] = n
    return resultado


def _ids_con_rol(rol: str):
    if rol not in ROLES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Rol desconocido: {rol}. Válidos: {', '.join(ROLES)}",
        )
    sub = _consulta_rol(rol).subquery()
    return select(sub.c.person_id)
```

`list_people` gana `rol: str | None = None` y, después del filtro por `tag`:

```python
    if rol:
        q = q.filter(Person.id.in_(_ids_con_rol(rol)))
```

- [ ] **Step 5: Router**

`list_people` gana `rol: str | None = Query(default=None, description="Filtrar por rol derivado")` y arma la respuesta con los roles:

```python
    total, items = service.list_people(db, search=search, tag=tag, rol=rol, skip=skip, limit=limit)
    roles = service.roles_de_personas(db, [p.id for p in items])
    salida = []
    for p in items:
        out = PersonListOut.model_validate(p)
        out.roles = roles[p.id]
        salida.append(out)
    return PaginatedPeople(total=total, items=salida)
```

`get_person`, `create_person`, `update_person` y `set_tags` devuelven con roles mediante un helper en el router:

```python
def _con_roles(db: DBSession, person) -> PersonOut:
    out = PersonOut.model_validate(person)
    out.roles = service.roles_de_personas(db, [person.id])[person.id]
    return out
```

(reemplazar cada `PersonOut.model_validate(person)` por `_con_roles(db, person)`).

- [ ] **Step 6: Verificar y commitear**

Run: `cd src && python -m pytest tests/ -q && ruff check .`

```bash
git add src/app/platform/people src/tests/test_people_roles.py
git commit -m "feat(backend): roles de persona derivados de propiedades, deals y reservas"
```

---

### Task 9: Vínculos de una persona

**Files:**
- Modify: `src/app/platform/people/schemas.py`, `service.py`, `router.py`
- Test: `src/tests/test_people_vinculos.py`

**Interfaces:**
- Produces: `GET /api/v1/people/{id}/vinculos` → `PersonLinksOut{propiedades, reservas, deals, actividades}`; `service.get_person_links(db, person_id) -> PersonLinksOut`.

- [ ] **Step 1: Test que falla**

```python
from app.platform.activities.models import Activity
from app.platform.deals.models import Deal, DealParty
from app.platform.reservations.models import Reservation
from tests.helpers_crm import crear_persona, crear_propiedad, etapa, pipeline_por_nombre


def test_vinculos_trae_las_cuatro_listas(client, db, crear_usuario, iniciar_sesion):
    usuario = crear_usuario()
    iniciar_sesion()
    persona = crear_persona(db)
    propia = crear_propiedad(db, titulo="Depto propio", propietario_persona_id=persona.id)
    ajena = crear_propiedad(db, titulo="Casa ajena")
    db.add(Reservation(person_id=persona.id, property_id=ajena.id, created_by_user_id=usuario.id))
    venta = pipeline_por_nombre(db, "Venta")
    deal = Deal(
        title="Compra casa", pipeline_id=venta.id, stage_id=etapa(venta, "Visita").id,
        created_by_user_id=usuario.id, property_id=ajena.id,
    )
    db.add(deal)
    db.flush()
    db.add(DealParty(deal_id=deal.id, person_id=persona.id, role="comprador"))
    db.add(Activity(activity_type="visita", title="Visitar", created_by_user_id=usuario.id,
                    person_id=persona.id))
    db.add(Activity(activity_type="llamada", title="Hecha", status="hecha",
                    created_by_user_id=usuario.id, person_id=persona.id))
    db.commit()

    r = client.get(f"/api/v1/people/{persona.id}/vinculos")

    assert r.status_code == 200, r.text
    v = r.json()
    assert [p["titulo"] for p in v["propiedades"]] == ["Depto propio"]
    assert v["propiedades"][0]["foto_principal"] is None
    assert v["reservas"][0]["propiedad"] == {"id": ajena.id, "titulo": "Casa ajena"}
    assert v["deals"][0]["role"] == "comprador"
    assert v["deals"][0]["stage"] == "Visita"
    assert v["deals"][0]["pipeline"] == "Venta"
    assert [a["title"] for a in v["actividades"]] == ["Visitar"]  # solo pendientes
    assert propia.id == v["propiedades"][0]["id"]


def test_vinculos_de_persona_inexistente_404(client, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    assert client.get("/api/v1/people/9999/vinculos").status_code == 404
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd src && python -m pytest tests/test_people_vinculos.py -q`
Expected: FAIL — 404 en `/vinculos` para la persona existente (cae en `/{person_id}`... con 422) o 404.

- [ ] **Step 3: Schemas**

Al final de `src/app/platform/people/schemas.py`:

```python
# ---------------------------------------------------------------------------
# Vínculos (ficha)
# ---------------------------------------------------------------------------

class PropiedadVinculoOut(BaseModel):
    id: int
    titulo: str
    tipo_operacion: str
    estado_comercial: str
    foto_principal: str | None


class PropiedadRef(BaseModel):
    id: int
    titulo: str


class ReservaVinculoOut(BaseModel):
    id: int
    status: str
    amount: Decimal | None
    currency: str
    expires_at: datetime | None
    propiedad: PropiedadRef


class DealVinculoOut(BaseModel):
    id: int
    title: str
    pipeline: str
    stage: str
    is_won: bool
    is_lost: bool
    amount: Decimal | None
    currency: str
    role: str
    propiedad: PropiedadRef | None


class ActividadVinculoOut(BaseModel):
    id: int
    activity_type: str
    status: str
    title: str
    due_at: datetime | None


class PersonLinksOut(BaseModel):
    propiedades: list[PropiedadVinculoOut]
    reservas: list[ReservaVinculoOut]
    deals: list[DealVinculoOut]
    actividades: list[ActividadVinculoOut]
```

(agregar `from decimal import Decimal` a los imports).

- [ ] **Step 4: Servicio**

En `service.py`, importar `Activity` de `app.platform.activities.models` y los schemas nuevos. Sección:

```python
# ---------------------------------------------------------------------------
# Vínculos (lo que carga la ficha de una persona en una sola llamada)
# ---------------------------------------------------------------------------

def get_person_links(db: DBSession, person_id: int) -> PersonLinksOut:
    get_person_or_404(db, person_id)

    propiedades = (
        db.query(Propiedad)
        .filter(Propiedad.propietario_persona_id == person_id, Propiedad.eliminado_en.is_(None))
        .order_by(Propiedad.creado_en.desc())
        .all()
    )
    reservas = (
        db.query(Reservation)
        .filter(Reservation.person_id == person_id)
        .order_by(Reservation.created_at.desc())
        .all()
    )
    partes = (
        db.query(DealParty)
        .join(Deal, Deal.id == DealParty.deal_id)
        .filter(DealParty.person_id == person_id, Deal.deleted_at.is_(None))
        .order_by(Deal.created_at.desc())
        .all()
    )
    actividades = (
        db.query(Activity)
        .filter(Activity.person_id == person_id, Activity.status == "pendiente")
        .order_by(Activity.due_at.asc().nulls_last(), Activity.created_at.desc())
        .all()
    )

    return PersonLinksOut(
        propiedades=[
            PropiedadVinculoOut(
                id=p.id, titulo=p.titulo, tipo_operacion=p.tipo_operacion,
                estado_comercial=p.estado_comercial, foto_principal=_foto_principal(p),
            )
            for p in propiedades
        ],
        reservas=[
            ReservaVinculoOut(
                id=r.id, status=r.status, amount=r.amount, currency=r.currency,
                expires_at=r.expires_at,
                propiedad=PropiedadRef(id=r.propiedad.id, titulo=r.propiedad.titulo),
            )
            for r in reservas
        ],
        deals=[
            DealVinculoOut(
                id=pt.deal.id, title=pt.deal.title, pipeline=pt.deal.pipeline.name,
                stage=pt.deal.stage.name, is_won=pt.deal.is_won, is_lost=pt.deal.is_lost,
                amount=pt.deal.amount, currency=pt.deal.currency, role=pt.role,
                propiedad=(
                    PropiedadRef(id=pt.deal.propiedad.id, titulo=pt.deal.propiedad.titulo)
                    if pt.deal.propiedad else None
                ),
            )
            for pt in partes
        ],
        actividades=[
            ActividadVinculoOut(
                id=a.id, activity_type=a.activity_type, status=a.status, title=a.title,
                due_at=a.due_at,
            )
            for a in actividades
        ],
    )


def _foto_principal(prop: Propiedad) -> str | None:
    principal = next((m for m in prop.medios if m.es_principal), None) or (
        prop.medios[0] if prop.medios else None
    )
    return principal.url if principal else None
```

- [ ] **Step 5: Router**

```python
@router.get("/{person_id}/vinculos", response_model=PersonLinksOut)
def get_person_links(
    person_id: int,
    db: DBSession = Depends(get_db),
    _: object = Depends(get_current_user),
) -> PersonLinksOut:
    return service.get_person_links(db, person_id)
```

- [ ] **Step 6: Verificar y commitear**

Run: `cd src && python -m pytest tests/ -q && ruff check .`

```bash
git add src/app/platform/people src/tests/test_people_vinculos.py
git commit -m "feat(backend): vínculos de una persona en una sola llamada"
```

---

### Task 10: Propietario en la propiedad

**Files:**
- Modify: `src/app/modules/propiedades/schemas.py`, `service.py`, `router.py`
- Test: `src/tests/test_propiedades_propietario.py`

**Interfaces:**
- Produces: `PersonaBrief(id, full_name)` en `propiedades.schemas`; `PropiedadResponse.propietario`, `PropiedadListItem.propietario: PersonaBrief | None`; `GET /api/v1/propiedades?propietario_persona_id=`; 404 "La persona {id} no existe" al crear/editar con un id inválido.

- [ ] **Step 1: Test que falla**

```python
from tests.helpers_crm import crear_persona, crear_propiedad


def test_respuestas_traen_al_propietario(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()
    persona = crear_persona(db)
    prop = crear_propiedad(db, propietario_persona_id=persona.id)
    sin = crear_propiedad(db, titulo="Sin dueño")

    detalle = client.get(f"/api/v1/propiedades/{prop.id}").json()
    assert detalle["propietario"] == {"id": persona.id, "full_name": "Ana Pérez"}

    lista = client.get(f"/api/v1/propiedades?propietario_persona_id={persona.id}").json()
    assert [p["id"] for p in lista] == [prop.id]
    assert lista[0]["propietario"]["full_name"] == "Ana Pérez"
    assert client.get(f"/api/v1/propiedades/{sin.id}").json()["propietario"] is None


def test_propietario_inexistente_da_404(client, db, crear_usuario, iniciar_sesion):
    crear_usuario()
    iniciar_sesion()

    r = client.post(
        "/api/v1/propiedades", json={"titulo": "Casa", "propietario_persona_id": 9999}
    )
    assert r.status_code == 404
    assert r.json()["detail"] == "La persona 9999 no existe"

    prop = crear_propiedad(db)
    r = client.put(f"/api/v1/propiedades/{prop.id}", json={"propietario_persona_id": 9999})
    assert r.status_code == 404
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd src && python -m pytest tests/test_propiedades_propietario.py -q`
Expected: FAIL — `KeyError: 'propietario'`.

- [ ] **Step 3: Schemas**

En `src/app/modules/propiedades/schemas.py`, junto a `PropiedadBrief`:

```python
class PersonaBrief(BaseModel):
    id: int
    full_name: str

    model_config = ConfigDict(from_attributes=True)
```

`PropiedadResponse` y `PropiedadListItem` suman `propietario: PersonaBrief | None = None`.

- [ ] **Step 4: Servicio y router**

En `service.py`, importar `from app.platform.people.models import Person` y agregar:

```python
def _verificar_persona(db: Session, persona_id: int | None) -> None:
    if persona_id is None:
        return
    existe = db.query(Person.id).filter(Person.id == persona_id, Person.deleted_at.is_(None)).first()
    if not existe:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"La persona {persona_id} no existe"
        )
```

Llamarla al principio de `crear_propiedad` (`_verificar_persona(db, data.propietario_persona_id)`) y en `actualizar_propiedad` cuando `"propietario_persona_id" in campos`.

`listar_propiedades` gana `propietario_persona_id: int | None = None` y filtra `Propiedad.propietario_persona_id == propietario_persona_id` cuando viene. El router agrega el `Query` correspondiente y lo pasa.

- [ ] **Step 5: Verificar y commitear**

Run: `cd src && python -m pytest tests/ -q && ruff check .`

```bash
git add src/app/modules/propiedades src/tests/test_propiedades_propietario.py
git commit -m "feat(backend): propietario en las respuestas y filtro de propiedades"
```

---

### Task 11: Módulo `inmobiliaria` y `GET /auth/users`

**Files:**
- Create: `src/app/platform/inmobiliaria/schemas.py`, `service.py`, `router.py`
- Modify: `src/app/storage.py` (`guardar_logo`), `src/app/modules/propiedades/service.py` (renombrar `_procesar_imagen` → `procesar_imagen`), `src/app/main.py`, `src/app/platform/auth/router.py`, `src/app/platform/auth/schemas.py`
- Test: `src/tests/test_inmobiliaria.py`

**Interfaces:**
- Produces: `GET /api/v1/inmobiliaria` (autenticado) → `InmobiliariaOut`; `PUT /api/v1/inmobiliaria` (admin) body `InmobiliariaUpdate`; `POST /api/v1/inmobiliaria/logo` (admin, multipart `archivo`) → `InmobiliariaOut`; `GET /auth/users` (autenticado) → `[{"id", "name", "email"}]`.

- [ ] **Step 1: Test que falla**

```python
import io

from PIL import Image


def _png() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (64, 64), "white").save(buffer, format="PNG")
    return buffer.getvalue()


def test_get_crea_la_fila_por_defecto(client, crear_usuario, iniciar_sesion):
    crear_usuario(roles=("staff",))
    iniciar_sesion()

    r = client.get("/api/v1/inmobiliaria")

    assert r.status_code == 200
    assert r.json()["nombre"] == "Mambo Groups"
    assert r.json()["honorarios_venta_pct"] is None


def test_put_solo_admin(client, crear_usuario, iniciar_sesion):
    crear_usuario(email="staff@mambo.com.ar", roles=("staff",))
    iniciar_sesion(email="staff@mambo.com.ar")
    assert client.put("/api/v1/inmobiliaria", json={"nombre": "Otra"}).status_code == 403

    crear_usuario()
    iniciar_sesion()
    r = client.put(
        "/api/v1/inmobiliaria",
        json={"nombre": "Mambo", "honorarios_venta_pct": 3, "honorarios_alquiler_pct": 5},
    )
    assert r.status_code == 200, r.text
    assert r.json()["nombre"] == "Mambo"
    assert float(r.json()["honorarios_venta_pct"]) == 3.0


def test_subir_logo(client, crear_usuario, iniciar_sesion, tmp_path, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "media_root", tmp_path)
    crear_usuario()
    iniciar_sesion()

    r = client.post(
        "/api/v1/inmobiliaria/logo", files={"archivo": ("logo.png", _png(), "image/png")}
    )

    assert r.status_code == 200, r.text
    assert r.json()["logo_url"].endswith(".jpg") or r.json()["logo_url"].endswith(".png")


def test_listado_de_usuarios(client, crear_usuario, iniciar_sesion):
    crear_usuario()
    crear_usuario(email="staff@mambo.com.ar", roles=("staff",))
    iniciar_sesion()

    r = client.get("/auth/users")

    assert r.status_code == 200
    assert {u["email"] for u in r.json()} == {"admin@mambo.com.ar", "staff@mambo.com.ar"}
    assert set(r.json()[0]) == {"id", "name", "email"}
```

(Si `test_propiedades_variantes.py` ya parchea `media_root` de otra forma, copiar esa forma.)

- [ ] **Step 2: Correr y ver que falla**

Run: `cd src && python -m pytest tests/test_inmobiliaria.py -q`
Expected: FAIL — 404 en `/api/v1/inmobiliaria`.

- [ ] **Step 3: Renombrar `_procesar_imagen` y agregar `guardar_logo`**

En `src/app/modules/propiedades/service.py` renombrar `_procesar_imagen` a `procesar_imagen` (definición y sus llamadas; `grep -rn _procesar_imagen src` tiene que quedar vacío).

En `src/app/storage.py`, después de `guardar_imagen`:

```python
CARPETA_INMOBILIARIA = "inmobiliaria"


def guardar_logo(contenido: bytes, extension: str) -> ArchivoGuardado:
    """El logo de la inmobiliaria va en su propia carpeta, sin variantes."""
    clave = f"{CARPETA_INMOBILIARIA}/{uuid.uuid4().hex}{extension}"
    return ArchivoGuardado(url=_guardar(contenido, clave), clave=clave)
```

- [ ] **Step 4: Schemas, servicio, router**

`src/app/platform/inmobiliaria/schemas.py`:

```python
"""DTOs de la configuración de la inmobiliaria."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class InmobiliariaUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=150)
    telefono: str | None = Field(default=None, max_length=50)
    email: str | None = Field(default=None, max_length=255)
    cuit: str | None = Field(default=None, max_length=20)
    direccion: str | None = Field(default=None, max_length=255)
    honorarios_venta_pct: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=2)
    honorarios_alquiler_pct: Decimal | None = Field(default=None, ge=0, le=100, decimal_places=2)


class InmobiliariaOut(BaseModel):
    id: int
    nombre: str
    logo_url: str | None
    telefono: str | None
    email: str | None
    cuit: str | None
    direccion: str | None
    honorarios_venta_pct: Decimal | None
    honorarios_alquiler_pct: Decimal | None
    actualizado_en: datetime

    model_config = ConfigDict(from_attributes=True)
```

`src/app/platform/inmobiliaria/service.py`:

```python
"""Configuración de la inmobiliaria: siempre la fila id=1."""
from __future__ import annotations

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.modules.propiedades.service import MAX_BYTES_IMAGEN, procesar_imagen
from app.platform.inmobiliaria.models import Inmobiliaria
from app.platform.inmobiliaria.schemas import InmobiliariaUpdate
from app.storage import borrar_imagen, guardar_logo

ID_UNICO = 1
NOMBRE_POR_DEFECTO = "Mambo Groups"


def obtener(db: Session) -> Inmobiliaria:
    """La migración 0004 crea la fila; si no está (base de test, entorno nuevo) se crea."""
    fila = db.get(Inmobiliaria, ID_UNICO)
    if fila is None:
        fila = Inmobiliaria(id=ID_UNICO, nombre=NOMBRE_POR_DEFECTO)
        db.add(fila)
        db.commit()
        db.refresh(fila)
    return fila


def actualizar(db: Session, data: InmobiliariaUpdate) -> Inmobiliaria:
    fila = obtener(db)
    for campo, valor in data.model_dump(exclude_unset=True).items():
        setattr(fila, campo, valor)
    db.commit()
    db.refresh(fila)
    return fila


def subir_logo(db: Session, archivo: UploadFile) -> Inmobiliaria:
    fila = obtener(db)
    contenido = archivo.file.read()
    if len(contenido) > MAX_BYTES_IMAGEN:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="El logo supera el máximo de 8 MB.",
        )
    contenido, extension = procesar_imagen(contenido)
    guardado = guardar_logo(contenido, extension)
    if fila.logo_storage_key:
        borrar_imagen(fila.logo_storage_key)
    fila.logo_url = guardado.url
    fila.logo_storage_key = guardado.clave
    db.commit()
    db.refresh(fila)
    return fila
```

(Revisar la firma real de `borrar_imagen` en `app/storage.py:215` y adaptar la llamada; si recibe también las variantes, pasar `None`/vacío.)

`src/app/platform/inmobiliaria/router.py`:

```python
"""Router: GET/PUT /inmobiliaria y POST /inmobiliaria/logo."""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.platform.auth.dependencies import get_current_user, require_role
from app.platform.inmobiliaria import service
from app.platform.inmobiliaria.schemas import InmobiliariaOut, InmobiliariaUpdate

router = APIRouter(prefix="/inmobiliaria", tags=["inmobiliaria"])

SOLO_ADMIN = [Depends(require_role("admin"))]


@router.get("", response_model=InmobiliariaOut)
def obtener(db: Session = Depends(get_db), _: object = Depends(get_current_user)):
    return service.obtener(db)


@router.put("", response_model=InmobiliariaOut, dependencies=SOLO_ADMIN)
def actualizar(data: InmobiliariaUpdate, db: Session = Depends(get_db)):
    return service.actualizar(db, data)


@router.post("/logo", response_model=InmobiliariaOut, dependencies=SOLO_ADMIN)
def subir_logo(archivo: UploadFile = File(...), db: Session = Depends(get_db)):
    return service.subir_logo(db, archivo)
```

En `main.py`: importar `from app.platform.inmobiliaria.router import router as inmobiliaria_router` y `app.include_router(inmobiliaria_router, prefix="/api/v1")`. Quitar de `conftest.py` el import de `inmobiliaria_models` (ya lo registra `app.main`).

`GET /auth/users` en `src/app/platform/auth/router.py`:

```python
@router.get("/users", response_model=list[UserBrief])
def list_users(db: DBSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Staff activo, para el selector "asignado a" del CRM."""
    usuarios = db.query(User).filter(User.is_active.is_(True)).order_by(User.name).all()
    return [UserBrief.model_validate(u) for u in usuarios]
```

con `UserBrief(id, name, email)` (`from_attributes`) en `auth/schemas.py`. Adaptar los nombres de `db`/imports al estilo del router de auth.

- [ ] **Step 5: Verificar y commitear**

Run: `cd src && python -m pytest tests/ -q && ruff check .`

```bash
git add src/app src/tests
git commit -m "feat(backend): configuración de la inmobiliaria con logo y listado de usuarios"
```

---

### Task 12: Cierre del backend — `alembic check` y limpieza

- [ ] Correr `cd src && python -m pytest tests/ -q && ruff check . && ruff format --check .`
- [ ] Con `DATABASE_URL` a un PostgreSQL de prueba: `alembic upgrade head && alembic check`. Si reporta diferencias, corregir la migración (nombres de índices/constraints) hasta que quede `No new upgrade operations detected.`
- [ ] Actualizar en `CLAUDE.md` la línea "mounted at the root" de los módulos de `platform/`: ahora van bajo `/api/v1` salvo `auth`. Sumar `inmobiliaria` a la lista de módulos.
- [ ] Commit: `docs: el CRM vive bajo /api/v1`

---

## Fase B — Frontend

### Task 13: Tipos, clientes de API, utilidades y navegación

**Files:**
- Create: `client/src/types/persona.ts`, `client/src/types/reserva.ts`, `client/src/types/operacion.ts`, `client/src/types/inmobiliaria.ts`
- Create: `client/src/api/personas.ts`, `client/src/api/reservas.ts`, `client/src/api/operaciones.ts`, `client/src/api/inmobiliaria.ts`, `client/src/api/usuarios.ts`
- Create: `client/src/lib/formato.ts`, `client/src/lib/formato.test.ts`, `client/src/lib/crm.ts`, `client/src/lib/crm.test.ts`
- Modify: `client/src/api/client.ts` (método `patch`), `client/src/types/propiedad.ts` (`propietario`), `client/src/layouts/AdminLayout.tsx` (menú)

**Interfaces:**
- Produces: todo lo que consumen las páginas. Los nombres de campos calcan los del backend (inglés en `platform/`, castellano en `propiedades`/`inmobiliaria`).

- [ ] **Step 1: `api.patch`**

En `client/src/api/client.ts`: `type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'` y en `api`:

```ts
  patch:  <T>(path: string, body?: unknown, opciones?: OpcionesRequest) => request<T>('PATCH',  path, body,      opciones),
```

- [ ] **Step 2: Tipos**

`client/src/types/persona.ts`:

```ts
/** Contacto de una persona, como lo devuelve `/api/v1/people/{id}/contacts`. */
export type TipoContacto = 'email' | 'telefono' | 'whatsapp' | 'otro'

export interface Contacto {
  id: number
  person_id: number
  type: TipoContacto
  value: string
  is_primary: boolean
  created_at: string
}

export type Rol = 'propietario' | 'comprador' | 'vendedor' | 'inquilino' | 'interesado'

/** Cantidad de vínculos por rol; los calcula el backend, nunca se editan. */
export type Roles = Record<Rol, number>

export interface PersonaListItem {
  id: number
  full_name: string
  document_type: string | null
  document_number: string | null
  created_at: string
  tags: string[]
  roles: Roles
}

export interface Persona extends PersonaListItem {
  first_name: string
  last_name: string
  notes: string | null
  contacts: Contacto[]
  updated_at: string
}

export interface PersonaBrief {
  id: number
  full_name: string
}

export interface ContactoPayload {
  type: TipoContacto
  value: string
  is_primary?: boolean
}

export interface PersonaCreatePayload {
  first_name: string
  last_name: string
  document_type?: string
  document_number?: string
  notes?: string
  contacts?: ContactoPayload[]
}

export type PersonaUpdatePayload = Partial<Omit<PersonaCreatePayload, 'contacts'>>

export interface EtiquetaConteo {
  nombre: string
  cantidad: number
}

/** Respuesta de `/api/v1/people/{id}/vinculos`: lo que muestra la ficha. */
export interface Vinculos {
  propiedades: {
    id: number
    titulo: string
    tipo_operacion: string
    estado_comercial: string
    foto_principal: string | null
  }[]
  reservas: {
    id: number
    status: string
    amount: number | null
    currency: string
    expires_at: string | null
    propiedad: { id: number; titulo: string }
  }[]
  deals: {
    id: number
    title: string
    pipeline: string
    stage: string
    is_won: boolean
    is_lost: boolean
    amount: number | null
    currency: string
    role: string
    propiedad: { id: number; titulo: string } | null
  }[]
  actividades: {
    id: number
    activity_type: string
    status: string
    title: string
    due_at: string | null
  }[]
}

export interface Paginado<T> {
  total: number
  items: T[]
}
```

Revisar `ContactType` en `src/app/platform/people/schemas.py` y copiar sus valores exactos en `TipoContacto`.

`client/src/types/reserva.ts`:

```ts
import type { PersonaBrief } from './persona'

export type EstadoReserva = 'activa' | 'cancelada' | 'vencida' | 'convertida'

export interface PropiedadBrief {
  id: number
  titulo: string
  estado_comercial: string
}

export interface Reserva {
  id: number
  status: EstadoReserva
  person: PersonaBrief
  property_id: number
  propiedad: PropiedadBrief
  amount: number | null
  currency: string
  notes: string | null
  expires_at: string | null
  created_by: { id: number; email: string }
  created_at: string
  updated_at: string
}

export interface ReservaCreatePayload {
  person_id: number
  property_id: number
  amount?: number
  currency?: string
  notes?: string
  expires_at?: string
}
```

`client/src/types/operacion.ts`:

```ts
import type { PersonaBrief } from './persona'
import type { PropiedadBrief } from './reserva'

export type RolParte =
  | 'comprador' | 'vendedor' | 'inquilino' | 'propietario' | 'garante' | 'interesado' | 'otro'

export interface Etapa {
  id: number
  pipeline_id: number
  name: string
  position: number
  is_won: boolean
  is_lost: boolean
}

export interface PipelineResumen {
  id: number
  name: string
  is_active: boolean
  stage_count: number
}

export interface Pipeline {
  id: number
  name: string
  description: string | null
  is_active: boolean
  stages: Etapa[]
  created_at: string
}

export interface Parte {
  id: number
  deal_id: number
  person_id: number
  person: PersonaBrief
  role: RolParte
  notes: string | null
  created_at: string
}

/** Tarjeta del tablero: `GET /api/v1/deals`. */
export interface OperacionListItem {
  id: number
  title: string
  pipeline_id: number
  stage_id: number
  assigned_to_user_id: number | null
  property_id: number | null
  propiedad: PropiedadBrief | null
  amount: number | null
  currency: string
  is_won: boolean
  is_lost: boolean
  stage_changed_at: string
  dias_en_etapa: number
  parties: Parte[]
  created_at: string
}

export interface Operacion extends OperacionListItem {
  notes: string | null
  closed_at: string | null
  updated_at: string
}

export interface PartePayload {
  person_id: number
  role: RolParte
  notes?: string
}

export interface OperacionCreatePayload {
  title: string
  pipeline_id: number
  stage_id: number
  assigned_to_user_id?: number
  property_id?: number
  amount?: number
  currency?: string
  notes?: string
  parties?: PartePayload[]
}

export type OperacionUpdatePayload = Partial<
  Pick<OperacionCreatePayload, 'title' | 'assigned_to_user_id' | 'property_id' | 'amount' | 'currency' | 'notes'>
>
```

`client/src/types/inmobiliaria.ts`:

```ts
export interface Inmobiliaria {
  id: number
  nombre: string
  logo_url: string | null
  telefono: string | null
  email: string | null
  cuit: string | null
  direccion: string | null
  honorarios_venta_pct: number | null
  honorarios_alquiler_pct: number | null
  actualizado_en: string
}

export type InmobiliariaUpdatePayload = Partial<Omit<Inmobiliaria, 'id' | 'logo_url' | 'actualizado_en'>>

export interface UsuarioBrief {
  id: number
  name: string
  email: string
}
```

En `client/src/types/propiedad.ts`, agregar a `PropiedadListItem`:

```ts
  propietario: { id: number; full_name: string } | null
```

y corregir los fixtures de tests que construyen `PropiedadListItem` (buscar con `grep -rn "propietario_persona_id" client/src --include=*.test.tsx`) agregando `propietario: null`.

- [ ] **Step 3: Clientes de API**

`client/src/api/personas.ts`:

```ts
import { api } from './client'
import type {
  Contacto, ContactoPayload, EtiquetaConteo, Paginado, Persona, PersonaCreatePayload,
  PersonaListItem, PersonaUpdatePayload, Vinculos,
} from '../types/persona'

const BASE = '/api/v1/people'

export interface ListarPersonasParams {
  search?: string
  tag?: string
  rol?: string
  skip?: number
  limit?: number
}

function query(params: object): string {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') q.set(k, String(v))
  })
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const personasApi = {
  listar:   (params: ListarPersonasParams = {}) => api.get<Paginado<PersonaListItem>>(`${BASE}${query(params)}`),
  obtener:  (id: number)                         => api.get<Persona>(`${BASE}/${id}`),
  vinculos: (id: number)                         => api.get<Vinculos>(`${BASE}/${id}/vinculos`),
  crear:    (data: PersonaCreatePayload)         => api.post<Persona>(BASE, data),
  editar:   (id: number, data: PersonaUpdatePayload) => api.patch<Persona>(`${BASE}/${id}`, data),
  eliminar: (id: number)                         => api.delete<void>(`${BASE}/${id}`),

  etiquetas:      ()                               => api.get<EtiquetaConteo[]>(`${BASE}/tags`),
  setEtiquetas:   (id: number, tags: string[])     => api.put<Persona>(`${BASE}/${id}/tags`, { tags }),

  agregarContacto: (id: number, data: ContactoPayload)         => api.post<Contacto>(`${BASE}/${id}/contacts`, data),
  quitarContacto:  (id: number, contactoId: number)            => api.delete<void>(`${BASE}/${id}/contacts/${contactoId}`),
  marcarPrincipal: (id: number, contactoId: number)            => api.patch<Contacto>(`${BASE}/${id}/contacts/${contactoId}`, { is_primary: true }),
}
```

`client/src/api/reservas.ts`:

```ts
import { api } from './client'
import type { Paginado } from '../types/persona'
import type { Reserva, ReservaCreatePayload } from '../types/reserva'

const BASE = '/api/v1/reservations'

export interface ListarReservasParams {
  status?: string
  person_id?: number
  property_id?: number
  skip?: number
  limit?: number
}

function query(params: object): string {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') q.set(k, String(v))
  })
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const reservasApi = {
  listar:    (params: ListarReservasParams = {}) => api.get<Paginado<Reserva>>(`${BASE}${query(params)}`),
  obtener:   (id: number)                         => api.get<Reserva>(`${BASE}/${id}`),
  crear:     (data: ReservaCreatePayload)         => api.post<Reserva>(BASE, data),
  cancelar:  (id: number)                         => api.patch<Reserva>(`${BASE}/${id}/cancel`),
  vencer:    (id: number)                         => api.patch<Reserva>(`${BASE}/${id}/expire`),
  convertir: (id: number)                         => api.patch<Reserva>(`${BASE}/${id}/convert`),
}
```

`client/src/api/operaciones.ts`:

```ts
import { api } from './client'
import type { Paginado } from '../types/persona'
import type {
  Operacion, OperacionCreatePayload, OperacionListItem, OperacionUpdatePayload,
  Parte, PartePayload, Pipeline, PipelineResumen,
} from '../types/operacion'

const BASE = '/api/v1'

export interface ListarOperacionesParams {
  pipeline_id?: number
  stage_id?: number
  is_closed?: boolean
  skip?: number
  limit?: number
}

function query(params: object): string {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') q.set(k, String(v))
  })
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const operacionesApi = {
  pipelines:  ()                 => api.get<PipelineResumen[]>(`${BASE}/pipelines`),
  pipeline:   (id: number)       => api.get<Pipeline>(`${BASE}/pipelines/${id}`),

  listar:     (params: ListarOperacionesParams = {}) => api.get<Paginado<OperacionListItem>>(`${BASE}/deals${query(params)}`),
  obtener:    (id: number)                            => api.get<Operacion>(`${BASE}/deals/${id}`),
  crear:      (data: OperacionCreatePayload)          => api.post<Operacion>(`${BASE}/deals`, data),
  editar:     (id: number, data: OperacionUpdatePayload) => api.patch<Operacion>(`${BASE}/deals/${id}`, data),
  moverEtapa: (id: number, stage_id: number)          => api.patch<Operacion>(`${BASE}/deals/${id}/stage`, { stage_id }),
  eliminar:   (id: number)                            => api.delete<void>(`${BASE}/deals/${id}`),

  agregarParte: (id: number, data: PartePayload) => api.post<Parte>(`${BASE}/deals/${id}/parties`, data),
  quitarParte:  (id: number, parteId: number)    => api.delete<void>(`${BASE}/deals/${id}/parties/${parteId}`),
}
```

`client/src/api/inmobiliaria.ts`:

```ts
import { api } from './client'
import type { Inmobiliaria, InmobiliariaUpdatePayload } from '../types/inmobiliaria'

const BASE = '/api/v1/inmobiliaria'

export const inmobiliariaApi = {
  obtener:    ()                                  => api.get<Inmobiliaria>(BASE),
  actualizar: (data: InmobiliariaUpdatePayload)   => api.put<Inmobiliaria>(BASE, data),
  subirLogo:  (archivo: File) => {
    const form = new FormData()
    form.append('archivo', archivo)
    return api.post<Inmobiliaria>(`${BASE}/logo`, form)
  },
}
```

`client/src/api/usuarios.ts`:

```ts
import { api } from './client'
import type { UsuarioBrief } from '../types/inmobiliaria'

export const usuariosApi = {
  listar: () => api.get<UsuarioBrief[]>('/auth/users'),
}
```

- [ ] **Step 4: Utilidades con test**

`client/src/lib/formato.test.ts`:

```ts
import { diasHasta, formatearFecha, formatearMonto } from './formato'

describe('formatearMonto', () => {
  it('usa separador de miles argentino y la moneda adelante', () => {
    expect(formatearMonto(1234567.5, 'USD')).toBe('USD 1.234.567,5')
  })
  it('devuelve un guion sin monto', () => {
    expect(formatearMonto(null, 'ARS')).toBe('—')
  })
})

describe('formatearFecha', () => {
  it('muestra dd/mm/aaaa', () => {
    expect(formatearFecha('2026-09-11T15:00:00Z')).toBe('11/09/2026')
  })
  it('devuelve un guion sin fecha', () => {
    expect(formatearFecha(null)).toBe('—')
  })
})

describe('diasHasta', () => {
  it('cuenta días enteros desde hoy, negativo si ya pasó', () => {
    const hoy = new Date('2026-09-11T12:00:00Z')
    expect(diasHasta('2026-09-14T00:00:00Z', hoy)).toBe(2)
    expect(diasHasta('2026-09-10T00:00:00Z', hoy)).toBe(-2)
    expect(diasHasta(null, hoy)).toBeNull()
  })
})
```

`client/src/lib/formato.ts`:

```ts
/** Formato de montos y fechas del panel. Una sola implementación para todas las tablas. */

export function formatearMonto(monto: number | null, moneda: string): string {
  if (monto === null) return '—'
  return `${moneda} ${monto.toLocaleString('es-AR')}`
}

export function formatearFecha(iso: string | null): string {
  if (!iso) return '—'
  const fecha = new Date(iso)
  const dd = String(fecha.getUTCDate()).padStart(2, '0')
  const mm = String(fecha.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${fecha.getUTCFullYear()}`
}

/** Días enteros entre `desde` (hoy por defecto) y `iso`; negativo si ya pasó. */
export function diasHasta(iso: string | null, desde: Date = new Date()): number | null {
  if (!iso) return null
  const ms = new Date(iso).getTime() - desde.getTime()
  return Math.floor(ms / 86_400_000)
}
```

`client/src/lib/crm.test.ts`:

```ts
import { etapaInicialSegunOperacion, LABEL_ROL, rolInicialSegunOperacion } from './crm'

describe('rolInicialSegunOperacion', () => {
  it('comprador para venta, inquilino para alquiler y temporal', () => {
    expect(rolInicialSegunOperacion('venta')).toBe('comprador')
    expect(rolInicialSegunOperacion('alquiler')).toBe('inquilino')
    expect(rolInicialSegunOperacion('temporal')).toBe('inquilino')
  })
})

describe('etapaInicialSegunOperacion', () => {
  it('una reserva convertida entra en Oferta (venta) o Reserva (alquiler)', () => {
    expect(etapaInicialSegunOperacion('venta')).toEqual({ pipeline: 'Venta', etapa: 'Oferta' })
    expect(etapaInicialSegunOperacion('alquiler')).toEqual({ pipeline: 'Alquiler', etapa: 'Reserva' })
  })
})

it('todos los roles tienen etiqueta', () => {
  expect(Object.keys(LABEL_ROL)).toEqual(
    expect.arrayContaining(['propietario', 'comprador', 'vendedor', 'inquilino', 'interesado']),
  )
})
```

`client/src/lib/crm.ts`:

```ts
import type { Rol } from '../types/persona'
import type { RolParte } from '../types/operacion'
import type { EstadoReserva } from '../types/reserva'
import type { TipoOperacion } from '../types/propiedad'

export const LABEL_ROL: Record<Rol, string> = {
  propietario: 'Propietario',
  comprador:   'Comprador',
  vendedor:    'Vendedor',
  inquilino:   'Inquilino',
  interesado:  'Interesado',
}

export const LABEL_ROL_PARTE: Record<RolParte, string> = {
  ...LABEL_ROL,
  garante: 'Garante',
  otro:    'Otro',
}

export const ROLES_PARTE: RolParte[] = [
  'comprador', 'vendedor', 'inquilino', 'propietario', 'garante', 'interesado', 'otro',
]

export const LABEL_ESTADO_RESERVA: Record<EstadoReserva, string> = {
  activa:     'Activa',
  cancelada:  'Cancelada',
  vencida:    'Vencida',
  convertida: 'Convertida',
}

/** Con qué rol entra la persona al convertir una reserva en operación. */
export function rolInicialSegunOperacion(operacion: TipoOperacion): RolParte {
  return operacion === 'venta' ? 'comprador' : 'inquilino'
}

/** A qué pipeline y etapa va una reserva convertida. Los nombres son los sembrados. */
export function etapaInicialSegunOperacion(operacion: TipoOperacion): { pipeline: string; etapa: string } {
  return operacion === 'venta'
    ? { pipeline: 'Venta', etapa: 'Oferta' }
    : { pipeline: 'Alquiler', etapa: 'Reserva' }
}
```

- [ ] **Step 5: Menú**

En `client/src/layouts/AdminLayout.tsx`, `grupos` pasa a:

```ts
const grupos = [
  {
    titulo: 'Inventario',
    items: [
      { to: '/admin/propiedades',   label: 'Propiedades' },
      { to: '/admin/publicaciones', label: 'Publicaciones' },
    ],
  },
  {
    titulo: 'CRM',
    items: [
      { to: '/admin/personas',    label: 'Personas' },
      { to: '/admin/reservas',    label: 'Reservas' },
      { to: '/admin/operaciones', label: 'Operaciones' },
    ],
  },
]
```

y se borran las dos líneas `admin-nav-item-soon` ("Contactos", "Consultas") y su `<p>CRM</p>`. Debajo del `grupos.map`, solo para admin:

```tsx
          {usuario?.roles.includes('admin') && (
            <div>
              <p className="admin-nav-group">Ajustes</p>
              <NavLink to="/admin/configuracion" className={({ isActive }) => `admin-nav-item${isActive ? ' active' : ''}`}>
                Configuración
              </NavLink>
            </div>
          )}
```

Si `AdminLayout.test.tsx` cuenta enlaces o busca "Contactos", actualizarlo.

- [ ] **Step 6: Verificar y commitear**

Run: `cd client && npm test && npx tsc --noEmit`

```bash
git add client/src
git commit -m "feat(client): tipos, clientes de API y menú del CRM"
```

---

### Task 14: `SelectorPersona`

**Files:**
- Create: `client/src/components/crm/SelectorPersona/SelectorPersona.tsx`, `SelectorPersona.css`, `SelectorPersona.test.tsx`

**Interfaces:**
- Produces: `<SelectorPersona valor={PersonaBrief | null} onChange={(p: PersonaBrief | null) => void} label?: string />`. Busca en `/people?search=` con debounce de 250 ms; ofrece "Crear a «texto»" con mini-formulario (nombre, apellido, teléfono) que llama a `personasApi.crear`.

- [ ] **Step 1: Test que falla**

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SelectorPersona from './SelectorPersona'
import { personasApi } from '../../../api/personas'

vi.mock('../../../api/personas', () => ({
  personasApi: { listar: vi.fn(), crear: vi.fn() },
}))

const listar = vi.mocked(personasApi.listar)
const crear = vi.mocked(personasApi.crear)

const ANA = {
  id: 1, full_name: 'Ana Pérez', document_type: null, document_number: null,
  created_at: '', tags: [], roles: { propietario: 1, comprador: 0, vendedor: 0, inquilino: 0, interesado: 0 },
}

beforeEach(() => {
  listar.mockResolvedValue({ total: 1, items: [ANA] })
})

it('busca mientras se tipea y emite la persona elegida', async () => {
  const usuario = userEvent.setup()
  const onChange = vi.fn()
  render(<SelectorPersona valor={null} onChange={onChange} />)

  await usuario.type(screen.getByRole('combobox'), 'Ana')

  await waitFor(() => expect(listar).toHaveBeenCalledWith({ search: 'Ana', limit: 8 }))
  await usuario.click(await screen.findByRole('option', { name: /Ana Pérez/ }))
  expect(onChange).toHaveBeenCalledWith({ id: 1, full_name: 'Ana Pérez' })
})

it('muestra la persona elegida y permite quitarla', async () => {
  const usuario = userEvent.setup()
  const onChange = vi.fn()
  render(<SelectorPersona valor={{ id: 1, full_name: 'Ana Pérez' }} onChange={onChange} />)

  expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
  await usuario.click(screen.getByRole('button', { name: 'Quitar' }))
  expect(onChange).toHaveBeenCalledWith(null)
})

it('crea a la persona inline cuando no existe', async () => {
  const usuario = userEvent.setup()
  listar.mockResolvedValue({ total: 0, items: [] })
  crear.mockResolvedValue({ ...ANA, id: 7, full_name: 'Bruno Díaz', first_name: 'Bruno', last_name: 'Díaz', notes: null, contacts: [], updated_at: '' })
  const onChange = vi.fn()
  render(<SelectorPersona valor={null} onChange={onChange} />)

  await usuario.type(screen.getByRole('combobox'), 'Bruno Díaz')
  await usuario.click(await screen.findByRole('button', { name: /Crear a «Bruno Díaz»/ }))
  await usuario.type(screen.getByLabelText('Teléfono'), '221555')
  await usuario.click(screen.getByRole('button', { name: 'Guardar persona' }))

  await waitFor(() =>
    expect(crear).toHaveBeenCalledWith({
      first_name: 'Bruno', last_name: 'Díaz',
      contacts: [{ type: 'telefono', value: '221555', is_primary: true }],
    }),
  )
  expect(onChange).toHaveBeenCalledWith({ id: 7, full_name: 'Bruno Díaz' })
})

it('si la búsqueda falla avisa y deja crear igual', async () => {
  const usuario = userEvent.setup()
  listar.mockRejectedValue(new Error('caído'))
  render(<SelectorPersona valor={null} onChange={vi.fn()} />)

  await usuario.type(screen.getByRole('combobox'), 'Zoe')

  expect(await screen.findByText('No se pudo buscar')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Crear a «Zoe»/ })).toBeInTheDocument()
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd client && npx vitest run --pool=threads src/components/crm/SelectorPersona`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Componente**

`client/src/components/crm/SelectorPersona/SelectorPersona.tsx`:

```tsx
import { useEffect, useId, useState } from 'react'
import { personasApi } from '../../../api/personas'
import type { PersonaBrief, PersonaListItem, TipoContacto } from '../../../types/persona'
import './SelectorPersona.css'

interface Props {
  valor: PersonaBrief | null
  onChange: (persona: PersonaBrief | null) => void
  label?: string
}

const DEBOUNCE_MS = 250
const MAX_RESULTADOS = 8

/** Parte "Nombre Apellido" en (first_name, last_name); todo va al nombre si es una sola palabra. */
function partirNombre(texto: string): { first_name: string; last_name: string } {
  const partes = texto.trim().split(/\s+/)
  if (partes.length === 1) return { first_name: partes[0], last_name: '' }
  return { first_name: partes.slice(0, -1).join(' '), last_name: partes[partes.length - 1] }
}

/**
 * Buscador de personas con creación inline. Se usa en propiedad (propietario),
 * reserva (interesado) y partes de una operación: cargar un dueño nunca obliga a
 * ir a otra pantalla.
 */
export default function SelectorPersona({ valor, onChange, label = 'Persona' }: Props) {
  const id = useId()
  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState<PersonaListItem[]>([])
  const [buscando, setBuscando] = useState(false)
  const [errorBusqueda, setErrorBusqueda] = useState(false)
  const [creando, setCreando] = useState(false)
  const [telefono, setTelefono] = useState('')
  const [errorCreacion, setErrorCreacion] = useState<string | null>(null)

  useEffect(() => {
    const termino = texto.trim()
    if (!termino) {
      setResultados([])
      setErrorBusqueda(false)
      return
    }
    setBuscando(true)
    const timer = setTimeout(() => {
      personasApi
        .listar({ search: termino, limit: MAX_RESULTADOS })
        .then(r => { setResultados(r.items); setErrorBusqueda(false) })
        .catch(() => { setResultados([]); setErrorBusqueda(true) })
        .finally(() => setBuscando(false))
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [texto])

  const elegir = (p: PersonaBrief) => {
    onChange({ id: p.id, full_name: p.full_name })
    setTexto('')
    setResultados([])
    setCreando(false)
  }

  const guardarNueva = async () => {
    setErrorCreacion(null)
    const nombre = partirNombre(texto)
    if (!nombre.last_name) {
      setErrorCreacion('Escribí nombre y apellido')
      return
    }
    try {
      const contacts = telefono.trim()
        ? [{ type: 'telefono' as TipoContacto, value: telefono.trim(), is_primary: true }]
        : undefined
      const creada = await personasApi.crear({ ...nombre, ...(contacts ? { contacts } : {}) })
      setTelefono('')
      elegir(creada)
    } catch (e: unknown) {
      setErrorCreacion(e instanceof Error ? e.message : 'No se pudo crear')
    }
  }

  if (valor) {
    return (
      <div className="selector-persona">
        <label className="selector-persona-label">{label}</label>
        <div className="selector-persona-elegida">
          <span>{valor.full_name}</span>
          <button type="button" className="btn btn-outline btn-chico" onClick={() => onChange(null)}>
            Quitar
          </button>
        </div>
      </div>
    )
  }

  const hayTexto = texto.trim().length > 0
  const listaId = `${id}-lista`

  return (
    <div className="selector-persona">
      <label className="selector-persona-label" htmlFor={id}>{label}</label>
      <input
        id={id}
        role="combobox"
        aria-expanded={hayTexto}
        aria-controls={listaId}
        aria-autocomplete="list"
        className="selector-persona-input"
        placeholder="Buscar por nombre o documento…"
        value={texto}
        onChange={e => { setTexto(e.target.value); setCreando(false) }}
        autoComplete="off"
      />

      {hayTexto && (
        <div className="selector-persona-panel">
          {buscando && <p className="selector-persona-estado">Buscando…</p>}
          {errorBusqueda && <p className="selector-persona-estado selector-persona-error">No se pudo buscar</p>}

          <ul id={listaId} role="listbox" className="selector-persona-lista">
            {resultados.map(p => (
              <li
                key={p.id}
                role="option"
                aria-selected={false}
                className="selector-persona-opcion"
                onClick={() => elegir(p)}
              >
                <span>{p.full_name}</span>
                {p.document_number && <small>{p.document_number}</small>}
              </li>
            ))}
          </ul>

          {!creando && (
            <button type="button" className="selector-persona-crear" onClick={() => setCreando(true)}>
              + Crear a «{texto.trim()}»
            </button>
          )}

          {creando && (
            <div className="selector-persona-nueva">
              <p className="selector-persona-estado">Se crea como <strong>{texto.trim()}</strong></p>
              <label htmlFor={`${id}-tel`}>Teléfono</label>
              <input
                id={`${id}-tel`}
                value={telefono}
                onChange={e => setTelefono(e.target.value)}
                placeholder="Opcional"
              />
              {errorCreacion && <p className="form-error">{errorCreacion}</p>}
              <div className="selector-persona-acciones">
                <button type="button" className="btn btn-magenta btn-chico" onClick={guardarNueva}>
                  Guardar persona
                </button>
                <button type="button" className="btn btn-outline btn-chico" onClick={() => setCreando(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

`SelectorPersona.css` (usar los tokens de color existentes en `client/src/index.css` / la paleta; revisar nombres reales antes de escribir):

```css
.selector-persona { position: relative; display: flex; flex-direction: column; gap: 0.35rem; }
.selector-persona-label { font-size: 0.85rem; color: var(--text-muted); }
.selector-persona-input { width: 100%; }
.selector-persona-elegida {
  display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
  padding: 0.5rem 0.75rem; border: 1px solid var(--border); border-radius: 6px;
}
.selector-persona-panel {
  position: absolute; top: 100%; left: 0; right: 0; z-index: 20; margin-top: 0.25rem;
  background: var(--surface); border: 1px solid var(--border); border-radius: 6px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
}
.selector-persona-lista { list-style: none; margin: 0; padding: 0; max-height: 240px; overflow-y: auto; }
.selector-persona-opcion {
  display: flex; justify-content: space-between; gap: 0.5rem; padding: 0.5rem 0.75rem; cursor: pointer;
}
.selector-persona-opcion:hover { background: var(--surface-hover); }
.selector-persona-opcion small { color: var(--text-muted); }
.selector-persona-estado { margin: 0; padding: 0.5rem 0.75rem; font-size: 0.85rem; color: var(--text-muted); }
.selector-persona-error { color: var(--danger); }
.selector-persona-crear {
  width: 100%; text-align: left; padding: 0.6rem 0.75rem; border: 0; border-top: 1px solid var(--border);
  background: transparent; cursor: pointer; font-weight: 600;
}
.selector-persona-nueva { display: flex; flex-direction: column; gap: 0.4rem; padding: 0.75rem; border-top: 1px solid var(--border); }
.selector-persona-acciones { display: flex; gap: 0.5rem; }
.btn-chico { padding: 0.3rem 0.7rem; font-size: 0.85rem; }
```

Si no existe una clase `.btn-chico` global, dejarla acá; si los tokens `--surface`, `--surface-hover`, `--border`, `--danger` tienen otro nombre en la paleta, usar los reales.

- [ ] **Step 4: Verificar y commitear**

Run: `cd client && npm test && npx tsc --noEmit`

```bash
git add client/src/components/crm/SelectorPersona
git commit -m "feat(client): SelectorPersona con búsqueda y creación inline"
```

---

### Task 15: `ChipsRol` y `BloqueVinculos`

**Files:**
- Create: `client/src/components/crm/ChipsRol/ChipsRol.tsx`, `ChipsRol.css`, `ChipsRol.test.tsx`
- Create: `client/src/components/crm/BloqueVinculos/BloqueVinculos.tsx`, `BloqueVinculos.css`, `BloqueVinculos.test.tsx`

**Interfaces:**
- Produces: `<ChipsRol roles={Roles} />` (solo los > 0, "Propietario · 2"); `<BloqueVinculos titulo vacio>{children}</BloqueVinculos>` (muestra `vacio` cuando `children` es un array vacío o `null`).

- [ ] **Step 1: Tests que fallan**

`ChipsRol.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import ChipsRol from './ChipsRol'

it('muestra solo los roles con cantidad y la cantidad al lado', () => {
  render(<ChipsRol roles={{ propietario: 2, comprador: 0, vendedor: 1, inquilino: 0, interesado: 0 }} />)
  expect(screen.getByText('Propietario · 2')).toBeInTheDocument()
  expect(screen.getByText('Vendedor · 1')).toBeInTheDocument()
  expect(screen.queryByText(/Comprador/)).not.toBeInTheDocument()
})

it('sin roles muestra "Sin vínculos"', () => {
  render(<ChipsRol roles={{ propietario: 0, comprador: 0, vendedor: 0, inquilino: 0, interesado: 0 }} />)
  expect(screen.getByText('Sin vínculos')).toBeInTheDocument()
})
```

`BloqueVinculos.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import BloqueVinculos from './BloqueVinculos'

it('muestra el estado vacío cuando no hay hijos', () => {
  render(<BloqueVinculos titulo="Propiedades" vacio="Sin propiedades">{[]}</BloqueVinculos>)
  expect(screen.getByRole('heading', { name: 'Propiedades' })).toBeInTheDocument()
  expect(screen.getByText('Sin propiedades')).toBeInTheDocument()
})

it('renderiza los hijos cuando los hay', () => {
  render(<BloqueVinculos titulo="Reservas" vacio="Sin reservas">{[<li key="1">Una</li>]}</BloqueVinculos>)
  expect(screen.getByText('Una')).toBeInTheDocument()
  expect(screen.queryByText('Sin reservas')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Componentes**

`ChipsRol.tsx`:

```tsx
import type { Roles, Rol } from '../../../types/persona'
import { LABEL_ROL } from '../../../lib/crm'
import './ChipsRol.css'

const ORDEN: Rol[] = ['propietario', 'comprador', 'vendedor', 'inquilino', 'interesado']

/** Roles derivados de una persona. Solo los que tienen vínculos; nunca se editan. */
export default function ChipsRol({ roles }: { roles: Roles }) {
  const activos = ORDEN.filter(rol => roles[rol] > 0)
  if (activos.length === 0) return <span className="chips-rol-vacio">Sin vínculos</span>
  return (
    <span className="chips-rol">
      {activos.map(rol => (
        <span key={rol} className={`chip-rol chip-rol-${rol}`}>
          {LABEL_ROL[rol]} · {roles[rol]}
        </span>
      ))}
    </span>
  )
}
```

`ChipsRol.css`:

```css
.chips-rol { display: inline-flex; flex-wrap: wrap; gap: 0.3rem; }
.chip-rol {
  display: inline-block; padding: 0.15rem 0.55rem; border-radius: 999px;
  font-size: 0.78rem; font-weight: 600; background: var(--surface-hover); color: var(--text);
}
.chip-rol-propietario { background: var(--ok-bg); color: var(--ok-fg); }
.chip-rol-comprador, .chip-rol-inquilino { background: var(--operacion-bg); color: var(--operacion-fg); }
.chips-rol-vacio { font-size: 0.8rem; color: var(--text-muted); }
```

(usar los tokens reales de `Badge.css` para `ok`/`operacion`).

`BloqueVinculos.tsx`:

```tsx
import type { ReactNode } from 'react'
import './BloqueVinculos.css'

interface Props {
  titulo: string
  vacio: string
  children: ReactNode
}

/**
 * Bloque de la ficha de persona. Un bloque vacío dice "Sin …" en vez de
 * desaparecer, para que la ficha tenga siempre la misma forma.
 */
export default function BloqueVinculos({ titulo, vacio, children }: Props) {
  const hayContenido = Array.isArray(children) ? children.length > 0 : children != null
  return (
    <section className="admin-card bloque-vinculos">
      <h2 className="bloque-vinculos-titulo">{titulo}</h2>
      {hayContenido ? <ul className="bloque-vinculos-lista">{children}</ul> : <p className="bloque-vinculos-vacio">{vacio}</p>}
    </section>
  )
}
```

`BloqueVinculos.css`:

```css
.bloque-vinculos-titulo { margin: 0 0 0.75rem; font-size: 1rem; }
.bloque-vinculos-lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.bloque-vinculos-lista li { display: flex; justify-content: space-between; gap: 0.75rem; align-items: center; }
.bloque-vinculos-vacio { margin: 0; color: var(--text-muted); font-size: 0.9rem; }
```

- [ ] **Step 3: Verificar y commitear**

Run: `cd client && npm test && npx tsc --noEmit`

```bash
git add client/src/components/crm
git commit -m "feat(client): ChipsRol y BloqueVinculos"
```

---

### Task 16: Personas — lista y formulario

**Files:**
- Create: `client/src/pages/admin/personas/Lista.tsx`, `Lista.css`, `Lista.test.tsx`, `Formulario.tsx`, `Formulario.css`
- Modify: `client/src/App.tsx` (rutas `personas`)

**Interfaces:**
- Consumes: `personasApi`, `ChipsRol`, `LABEL_ROL`.
- Produces: rutas `/admin/personas`, `/admin/personas/nueva`, `/admin/personas/:id/editar`.

- [ ] **Step 1: Test que falla** (`Lista.test.tsx`)

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import PersonasLista from './Lista'
import { personasApi } from '../../../api/personas'

vi.mock('../../../api/personas', () => ({
  personasApi: { listar: vi.fn(), etiquetas: vi.fn() },
}))

const listar = vi.mocked(personasApi.listar)
const etiquetas = vi.mocked(personasApi.etiquetas)

const ANA = {
  id: 1, full_name: 'Ana Pérez', document_type: 'DNI', document_number: '30111222',
  created_at: '', tags: ['inversor'],
  roles: { propietario: 2, comprador: 0, vendedor: 0, inquilino: 0, interesado: 0 },
}

beforeEach(() => {
  listar.mockResolvedValue({ total: 1, items: [ANA] })
  etiquetas.mockResolvedValue([{ nombre: 'inversor', cantidad: 1 }])
})

function renderLista() {
  return render(<MemoryRouter><PersonasLista /></MemoryRouter>)
}

it('lista personas con chips de rol y etiquetas', async () => {
  renderLista()
  expect(await screen.findByText('Ana Pérez')).toBeInTheDocument()
  expect(screen.getByText('Propietario · 2')).toBeInTheDocument()
  expect(screen.getByText('inversor')).toBeInTheDocument()
  expect(screen.queryByText(/Comprador/)).not.toBeInTheDocument()
})

it('los filtros arman la query', async () => {
  const usuario = userEvent.setup()
  renderLista()
  await screen.findByText('Ana Pérez')

  await usuario.selectOptions(screen.getByLabelText('Rol'), 'propietario')
  await waitFor(() => expect(listar).toHaveBeenLastCalledWith(expect.objectContaining({ rol: 'propietario' })))

  await usuario.selectOptions(screen.getByLabelText('Etiqueta'), 'inversor')
  await waitFor(() => expect(listar).toHaveBeenLastCalledWith(expect.objectContaining({ tag: 'inversor' })))
})
```

- [ ] **Step 2: Lista**

`client/src/pages/admin/personas/Lista.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { personasApi, type ListarPersonasParams } from '../../../api/personas'
import type { EtiquetaConteo, PersonaListItem, Rol } from '../../../types/persona'
import ChipsRol from '../../../components/crm/ChipsRol/ChipsRol'
import { LABEL_ROL } from '../../../lib/crm'
import './Lista.css'

const ROLES: Rol[] = ['propietario', 'comprador', 'vendedor', 'inquilino', 'interesado']
const POR_PAGINA = 50

export default function PersonasLista() {
  const [personas, setPersonas] = useState<PersonaListItem[]>([])
  const [total, setTotal] = useState(0)
  const [etiquetas, setEtiquetas] = useState<EtiquetaConteo[]>([])
  const [filtros, setFiltros] = useState<ListarPersonasParams>({ search: '', rol: '', tag: '', skip: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    personasApi.etiquetas().then(setEtiquetas).catch(() => setEtiquetas([]))
  }, [])

  // La búsqueda se dispara con un pequeño retraso para no pegarle a la API por tecla.
  useEffect(() => {
    setLoading(true)
    setError(null)
    const timer = setTimeout(() => {
      personasApi
        .listar({ ...filtros, limit: POR_PAGINA })
        .then(r => { setPersonas(r.items); setTotal(r.total) })
        .catch(e => setError(e.message))
        .finally(() => setLoading(false))
    }, 200)
    return () => clearTimeout(timer)
  }, [filtros])

  const set = (campo: keyof ListarPersonasParams, valor: string) =>
    setFiltros(f => ({ ...f, [campo]: valor, skip: 0 }))

  return (
    <div>
      <div className="admin-page-header">
        <h1>Personas</h1>
        <Link to="/admin/personas/nueva" className="btn btn-magenta">+ Nueva persona</Link>
      </div>

      <div className="admin-card filtros-bar">
        <input
          type="search"
          className="filtros-buscar"
          placeholder="Buscar por nombre o documento…"
          aria-label="Buscar"
          value={filtros.search ?? ''}
          onChange={e => set('search', e.target.value)}
        />
        <label className="filtros-label">
          Rol
          <select value={filtros.rol ?? ''} onChange={e => set('rol', e.target.value)}>
            <option value="">Todos</option>
            {ROLES.map(r => <option key={r} value={r}>{LABEL_ROL[r]}</option>)}
          </select>
        </label>
        <label className="filtros-label">
          Etiqueta
          <select value={filtros.tag ?? ''} onChange={e => set('tag', e.target.value)}>
            <option value="">Todas</option>
            {etiquetas.map(t => <option key={t.nombre} value={t.nombre}>{t.nombre} ({t.cantidad})</option>)}
          </select>
        </label>
      </div>

      {loading && <p className="lista-estado">Cargando...</p>}
      {error && <p className="lista-estado lista-error">{error}</p>}

      {!loading && !error && (
        personas.length === 0
          ? <p className="lista-estado">No hay personas que coincidan.</p>
          : (
            <div className="admin-card tabla-wrapper">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Documento</th>
                    <th>Roles</th>
                    <th>Etiquetas</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {personas.map(p => (
                    <tr key={p.id}>
                      <td data-label="Nombre"><Link to={`/admin/personas/${p.id}`} className="tabla-titulo">{p.full_name}</Link></td>
                      <td data-label="Documento">{p.document_number ? `${p.document_type ?? ''} ${p.document_number}`.trim() : '—'}</td>
                      <td data-label="Roles"><ChipsRol roles={p.roles} /></td>
                      <td data-label="Etiquetas">
                        <span className="etiquetas">
                          {p.tags.map(t => <span key={t} className="etiqueta">{t}</span>)}
                        </span>
                      </td>
                      <td data-label="Acciones">
                        <Link to={`/admin/personas/${p.id}/editar`} className="btn btn-outline">Editar</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="lista-total">{total} persona{total === 1 ? '' : 's'}</p>
            </div>
          )
      )}
    </div>
  )
}
```

`Lista.css`: `.etiquetas { display: inline-flex; flex-wrap: wrap; gap: 0.3rem; } .etiqueta { padding: 0.1rem 0.5rem; border-radius: 4px; background: var(--surface-hover); font-size: 0.78rem; } .filtros-label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.8rem; color: var(--text-muted); } .lista-total { margin: 0.75rem 0 0; color: var(--text-muted); font-size: 0.85rem; }` más la regla responsive de `tabla` que ya usa `propiedades/Lista.css` (copiar el bloque `@media (max-width: 640px)` con los `data-label`; si esa regla vive en un CSS global, no duplicarla).

- [ ] **Step 3: Formulario**

`client/src/pages/admin/personas/Formulario.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { personasApi } from '../../../api/personas'
import type { Contacto, ContactoPayload, EtiquetaConteo, TipoContacto } from '../../../types/persona'
import './Formulario.css'

const TIPOS_CONTACTO: { valor: TipoContacto; label: string }[] = [
  { valor: 'telefono', label: 'Teléfono' },
  { valor: 'whatsapp', label: 'WhatsApp' },
  { valor: 'email', label: 'Email' },
  { valor: 'otro', label: 'Otro' },
]

interface FormState {
  first_name: string
  last_name: string
  document_type: string
  document_number: string
  notes: string
}

const INICIAL: FormState = { first_name: '', last_name: '', document_type: 'DNI', document_number: '', notes: '' }

export default function PersonaFormulario() {
  const { id } = useParams()
  const navigate = useNavigate()
  const editando = id !== undefined
  const personaId = editando ? Number(id) : null

  const [form, setForm] = useState<FormState>(INICIAL)
  const [contactos, setContactos] = useState<Contacto[]>([])
  const [nuevoContacto, setNuevoContacto] = useState<ContactoPayload>({ type: 'telefono', value: '' })
  const [etiquetas, setEtiquetas] = useState<string[]>([])
  const [nuevaEtiqueta, setNuevaEtiqueta] = useState('')
  const [sugeridas, setSugeridas] = useState<EtiquetaConteo[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    personasApi.etiquetas().then(setSugeridas).catch(() => setSugeridas([]))
    if (personaId === null) return
    personasApi.obtener(personaId).then(p => {
      setForm({
        first_name: p.first_name, last_name: p.last_name,
        document_type: p.document_type ?? '', document_number: p.document_number ?? '',
        notes: p.notes ?? '',
      })
      setContactos(p.contacts)
      setEtiquetas(p.tags)
    }).catch(e => setError(e.message))
  }, [personaId])

  const set = (campo: keyof FormState, valor: string) => setForm(f => ({ ...f, [campo]: valor }))

  const agregarEtiqueta = (texto: string) => {
    const limpio = texto.trim()
    if (!limpio || etiquetas.some(t => t.toLowerCase() === limpio.toLowerCase())) return
    setEtiquetas(e => [...e, limpio])
    setNuevaEtiqueta('')
  }

  // En edición los contactos se guardan al toque (son sub-recurso); en alta van
  // dentro del POST de la persona.
  const agregarContacto = async () => {
    if (!nuevoContacto.value.trim()) return
    if (personaId === null) {
      setContactos(c => [...c, { ...nuevoContacto, id: -Date.now(), person_id: 0, is_primary: c.length === 0, created_at: '' }])
    } else {
      try {
        const creado = await personasApi.agregarContacto(personaId, { ...nuevoContacto, is_primary: contactos.length === 0 })
        setContactos(c => [...c, creado])
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'No se pudo agregar el contacto')
        return
      }
    }
    setNuevoContacto({ type: 'telefono', value: '' })
  }

  const quitarContacto = async (contacto: Contacto) => {
    if (personaId !== null && contacto.id > 0) {
      try { await personasApi.quitarContacto(personaId, contacto.id) } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'No se pudo quitar'); return
      }
    }
    setContactos(c => c.filter(x => x.id !== contacto.id))
  }

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    setError(null)
    const datos = {
      first_name: form.first_name.trim(), last_name: form.last_name.trim(),
      document_type: form.document_type || undefined, document_number: form.document_number || undefined,
      notes: form.notes || undefined,
    }
    try {
      let guardadaId = personaId
      if (guardadaId === null) {
        const creada = await personasApi.crear({
          ...datos,
          contacts: contactos.map(c => ({ type: c.type, value: c.value, is_primary: c.is_primary })),
        })
        guardadaId = creada.id
      } else {
        await personasApi.editar(guardadaId, datos)
      }
      await personasApi.setEtiquetas(guardadaId, etiquetas)
      navigate(`/admin/personas/${guardadaId}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div>
      <div className="admin-page-header">
        <h1>{editando ? 'Editar persona' : 'Nueva persona'}</h1>
      </div>
      {error && <p className="form-error">{error}</p>}

      <form onSubmit={guardar} className="admin-card form">
        <h2 className="form-section-title">Datos</h2>
        <div className="form-row">
          <div className="form-field">
            <label htmlFor="first_name">Nombre *</label>
            <input id="first_name" required value={form.first_name} onChange={e => set('first_name', e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="last_name">Apellido *</label>
            <input id="last_name" required value={form.last_name} onChange={e => set('last_name', e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-field" style={{ maxWidth: 120 }}>
            <label htmlFor="document_type">Tipo doc.</label>
            <select id="document_type" value={form.document_type} onChange={e => set('document_type', e.target.value)}>
              <option value="">—</option>
              <option value="DNI">DNI</option>
              <option value="CUIT">CUIT</option>
              <option value="CUIL">CUIL</option>
              <option value="Pasaporte">Pasaporte</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="document_number">Número</label>
            <input id="document_number" value={form.document_number} onChange={e => set('document_number', e.target.value)} />
          </div>
        </div>
        <div className="form-field full">
          <label htmlFor="notes">Notas</label>
          <textarea id="notes" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>

        <h2 className="form-section-title">Contactos</h2>
        <ul className="contactos-lista">
          {contactos.map(c => (
            <li key={c.id}>
              <span className="contacto-tipo">{TIPOS_CONTACTO.find(t => t.valor === c.type)?.label ?? c.type}</span>
              <span>{c.value}</span>
              {c.is_primary && <span className="contacto-principal">principal</span>}
              <button type="button" className="btn btn-outline btn-chico" onClick={() => quitarContacto(c)}>Quitar</button>
            </li>
          ))}
        </ul>
        <div className="form-row contacto-nuevo">
          <select aria-label="Tipo de contacto" value={nuevoContacto.type} onChange={e => setNuevoContacto(n => ({ ...n, type: e.target.value as TipoContacto }))}>
            {TIPOS_CONTACTO.map(t => <option key={t.valor} value={t.valor}>{t.label}</option>)}
          </select>
          <input aria-label="Valor del contacto" placeholder="221 555 0000 / mail@…" value={nuevoContacto.value} onChange={e => setNuevoContacto(n => ({ ...n, value: e.target.value }))} />
          <button type="button" className="btn btn-outline" onClick={agregarContacto}>Agregar</button>
        </div>

        <h2 className="form-section-title">Etiquetas</h2>
        <div className="etiquetas-editor">
          {etiquetas.map(t => (
            <span key={t} className="etiqueta">
              {t} <button type="button" aria-label={`Quitar ${t}`} onClick={() => setEtiquetas(e => e.filter(x => x !== t))}>×</button>
            </span>
          ))}
          <input
            aria-label="Nueva etiqueta"
            list="etiquetas-sugeridas"
            placeholder="Escribí y Enter"
            value={nuevaEtiqueta}
            onChange={e => setNuevaEtiqueta(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarEtiqueta(nuevaEtiqueta) } }}
          />
          <datalist id="etiquetas-sugeridas">
            {sugeridas.map(s => <option key={s.nombre} value={s.nombre} />)}
          </datalist>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-magenta" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          <button type="button" className="btn btn-outline" onClick={() => navigate(-1)}>Cancelar</button>
        </div>
      </form>
    </div>
  )
}
```

`Formulario.css`: `.contactos-lista { list-style: none; margin: 0 0 0.75rem; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; } .contactos-lista li { display: flex; gap: 0.75rem; align-items: center; } .contacto-tipo { font-size: 0.8rem; color: var(--text-muted); min-width: 70px; } .contacto-principal { font-size: 0.75rem; color: var(--ok-fg); } .etiquetas-editor { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; } .etiquetas-editor .etiqueta button { border: 0; background: transparent; cursor: pointer; }` — reutilizar las clases `form*` de `propiedades/Formulario.css` si son globales; si no, copiarlas a un `client/src/styles/form.css` importado por ambos.

- [ ] **Step 4: Rutas**

En `client/src/App.tsx`, importar `PersonasLista`, `PersonaFormulario` y agregar dentro de `<AdminLayout>`:

```tsx
              <Route path="personas">
                <Route index             element={<PersonasLista />} />
                <Route path="nueva"      element={<PersonaFormulario />} />
                <Route path=":id/editar" element={<PersonaFormulario />} />
              </Route>
```

- [ ] **Step 5: Verificar y commitear**

Run: `cd client && npm test && npx tsc --noEmit`

```bash
git add client/src
git commit -m "feat(client): lista y formulario de personas"
```

---

### Task 17: Personas — ficha

**Files:**
- Create: `client/src/pages/admin/personas/Ficha.tsx`, `Ficha.css`, `Ficha.test.tsx`
- Modify: `client/src/App.tsx` (ruta `personas/:id`)

**Interfaces:**
- Consumes: `personasApi.obtener`, `personasApi.vinculos`, `ChipsRol`, `BloqueVinculos`, `formatearMonto`, `formatearFecha`, `LABEL_ESTADO_RESERVA`.

- [ ] **Step 1: Test que falla**

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PersonaFicha from './Ficha'
import { personasApi } from '../../../api/personas'

vi.mock('../../../api/personas', () => ({
  personasApi: { obtener: vi.fn(), vinculos: vi.fn() },
}))

const PERSONA = {
  id: 1, full_name: 'Ana Pérez', first_name: 'Ana', last_name: 'Pérez', document_type: 'DNI',
  document_number: '30111222', notes: null, created_at: '', updated_at: '', tags: ['inversor'],
  contacts: [{ id: 1, person_id: 1, type: 'whatsapp' as const, value: '2215550000', is_primary: true, created_at: '' }],
  roles: { propietario: 1, comprador: 0, vendedor: 0, inquilino: 0, interesado: 0 },
}

beforeEach(() => {
  vi.mocked(personasApi.obtener).mockResolvedValue(PERSONA)
  vi.mocked(personasApi.vinculos).mockResolvedValue({
    propiedades: [{ id: 5, titulo: 'Depto en La Plata', tipo_operacion: 'venta', estado_comercial: 'disponible', foto_principal: null }],
    reservas: [],
    deals: [{ id: 9, title: 'Compra casa', pipeline: 'Venta', stage: 'Visita', is_won: false, is_lost: false, amount: 100000, currency: 'USD', role: 'comprador', propiedad: { id: 6, titulo: 'Casa' } }],
    actividades: [],
  })
})

function renderFicha() {
  return render(
    <MemoryRouter initialEntries={['/admin/personas/1']}>
      <Routes><Route path="/admin/personas/:id" element={<PersonaFicha />} /></Routes>
    </MemoryRouter>,
  )
}

it('muestra cabecera, contactos y los cuatro bloques, incluidos los vacíos', async () => {
  renderFicha()
  expect(await screen.findByRole('heading', { name: 'Ana Pérez' })).toBeInTheDocument()
  expect(screen.getByText('Propietario · 1')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /2215550000/ })).toHaveAttribute('href', expect.stringContaining('wa.me'))
  expect(screen.getByRole('link', { name: 'Depto en La Plata' })).toHaveAttribute('href', '/admin/propiedades/5/editar')
  expect(screen.getByRole('link', { name: /Compra casa/ })).toHaveAttribute('href', '/admin/operaciones/9')
  expect(screen.getByText('Sin reservas')).toBeInTheDocument()
  expect(screen.getByText('Sin actividades pendientes')).toBeInTheDocument()
})
```

- [ ] **Step 2: Ficha**

```tsx
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { personasApi } from '../../../api/personas'
import type { Contacto, Persona, Vinculos } from '../../../types/persona'
import ChipsRol from '../../../components/crm/ChipsRol/ChipsRol'
import BloqueVinculos from '../../../components/crm/BloqueVinculos/BloqueVinculos'
import Badge from '../../../components/Badge'
import { formatearFecha, formatearMonto } from '../../../lib/formato'
import { LABEL_ESTADO_RESERVA, LABEL_ROL_PARTE } from '../../../lib/crm'
import type { EstadoReserva } from '../../../types/reserva'
import type { RolParte } from '../../../types/operacion'
import './Ficha.css'

/** Un teléfono linkea a `tel:`; un WhatsApp, al chat. El email, a `mailto:`. */
function hrefDeContacto(c: Contacto): string | null {
  const soloDigitos = c.value.replace(/\D/g, '')
  if (c.type === 'whatsapp') return `https://wa.me/${soloDigitos}`
  if (c.type === 'telefono') return `tel:${c.value}`
  if (c.type === 'email') return `mailto:${c.value}`
  return null
}

export default function PersonaFicha() {
  const { id } = useParams()
  const personaId = Number(id)
  const [persona, setPersona] = useState<Persona | null>(null)
  const [vinculos, setVinculos] = useState<Vinculos | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([personasApi.obtener(personaId), personasApi.vinculos(personaId)])
      .then(([p, v]) => { setPersona(p); setVinculos(v) })
      .catch(e => setError(e.message))
  }, [personaId])

  if (error) return <p className="lista-estado lista-error">{error}</p>
  if (!persona || !vinculos) return <p className="lista-estado">Cargando...</p>

  return (
    <div>
      <div className="admin-page-header ficha-cabecera">
        <div>
          <span className="section-label">Persona</span>
          <h1>{persona.full_name}</h1>
          <div className="ficha-meta">
            <ChipsRol roles={persona.roles} />
            {persona.tags.map(t => <span key={t} className="etiqueta">{t}</span>)}
          </div>
          <ul className="ficha-contactos">
            {persona.contacts.map(c => {
              const href = hrefDeContacto(c)
              return (
                <li key={c.id}>
                  {href ? <a href={href} target="_blank" rel="noreferrer">{c.value}</a> : c.value}
                  {c.is_primary && <small> · principal</small>}
                </li>
              )
            })}
            {persona.document_number && <li><small>{persona.document_type} {persona.document_number}</small></li>}
          </ul>
        </div>
        <Link to={`/admin/personas/${persona.id}/editar`} className="btn btn-outline">Editar</Link>
      </div>

      {persona.notes && <div className="admin-card ficha-notas">{persona.notes}</div>}

      <div className="ficha-grilla">
        <BloqueVinculos titulo="Propiedades" vacio="Sin propiedades">
          {vinculos.propiedades.map(p => (
            <li key={p.id}>
              <Link to={`/admin/propiedades/${p.id}/editar`}>{p.titulo}</Link>
              <Badge value={p.estado_comercial} />
            </li>
          ))}
        </BloqueVinculos>

        <BloqueVinculos titulo="Reservas" vacio="Sin reservas">
          {vinculos.reservas.map(r => (
            <li key={r.id}>
              <span>{r.propiedad.titulo} · {formatearMonto(r.amount, r.currency)} · vence {formatearFecha(r.expires_at)}</span>
              <Badge value={r.status} label={LABEL_ESTADO_RESERVA[r.status as EstadoReserva] ?? r.status} />
            </li>
          ))}
        </BloqueVinculos>

        <BloqueVinculos titulo="Operaciones" vacio="Sin operaciones">
          {vinculos.deals.map(d => (
            <li key={d.id}>
              <Link to={`/admin/operaciones/${d.id}`}>{d.title} <small>({LABEL_ROL_PARTE[d.role as RolParte] ?? d.role})</small></Link>
              <span className="ficha-etapa">{d.pipeline} · {d.stage}</span>
            </li>
          ))}
        </BloqueVinculos>

        <BloqueVinculos titulo="Actividades pendientes" vacio="Sin actividades pendientes">
          {vinculos.actividades.map(a => (
            <li key={a.id}>
              <span>{a.title}</span>
              <small>{a.activity_type} · {formatearFecha(a.due_at)}</small>
            </li>
          ))}
        </BloqueVinculos>
      </div>
    </div>
  )
}
```

`Ficha.css`:

```css
.ficha-cabecera { align-items: flex-start; }
.ficha-meta { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; margin-top: 0.5rem; }
.ficha-contactos { list-style: none; margin: 0.75rem 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 1rem; }
.ficha-notas { margin-bottom: 1.25rem; white-space: pre-wrap; }
.ficha-grilla { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.25rem; }
.ficha-etapa { font-size: 0.85rem; color: var(--text-muted); white-space: nowrap; }
@media (max-width: 860px) { .ficha-grilla { grid-template-columns: 1fr; } }
```

Ruta en `App.tsx`, dentro de `personas`: `<Route path=":id" element={<PersonaFicha />} />`. Si `Badge` no tiene color para `activa`/`convertida` de reserva, `Badge.tsx` ya mapea `activa` a `ok`; agregar `convertida: 'neutro'` y `vencida: 'baja'` al `colorMap`.

- [ ] **Step 3: Verificar y commitear**

Run: `cd client && npm test && npx tsc --noEmit`

```bash
git add client/src
git commit -m "feat(client): ficha de persona con vínculos"
```

---

### Task 18: Propietario en la propiedad y botón Reservar

**Files:**
- Modify: `client/src/pages/admin/propiedades/Formulario.tsx`, `Lista.tsx`
- Test: ampliar `client/src/pages/admin/propiedades/*.test.tsx` si existen; si no, crear `Formulario.propietario.test.tsx`

- [ ] **Step 1: Test que falla**

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PropiedadFormulario from './Formulario'
import { propiedadesApi } from '../../../api/propiedades'
import { personasApi } from '../../../api/personas'

vi.mock('../../../api/propiedades', () => ({
  propiedadesApi: { obtener: vi.fn(), crear: vi.fn(), editar: vi.fn(), listarMedios: vi.fn() },
}))
vi.mock('../../../api/personas', () => ({
  personasApi: { listar: vi.fn(), crear: vi.fn() },
}))

it('al crear manda el propietario elegido', async () => {
  const usuario = userEvent.setup()
  vi.mocked(personasApi.listar).mockResolvedValue({
    total: 1,
    items: [{ id: 3, full_name: 'Ana Pérez', document_type: null, document_number: null, created_at: '', tags: [], roles: { propietario: 0, comprador: 0, vendedor: 0, inquilino: 0, interesado: 0 } }],
  })
  vi.mocked(propiedadesApi.crear).mockResolvedValue({ id: 10 } as never)
  render(
    <MemoryRouter initialEntries={['/admin/propiedades/nueva']}>
      <Routes>
        <Route path="/admin/propiedades/nueva" element={<PropiedadFormulario />} />
        <Route path="/admin/propiedades/:id/editar" element={<p>editar</p>} />
        <Route path="/admin/propiedades" element={<p>lista</p>} />
      </Routes>
    </MemoryRouter>,
  )

  await usuario.type(screen.getByLabelText(/Título/), 'Casa')
  await usuario.type(screen.getByRole('combobox', { name: 'Propietario' }), 'Ana')
  await usuario.click(await screen.findByRole('option', { name: /Ana Pérez/ }))
  await usuario.click(screen.getByRole('button', { name: /Guardar|Crear/ }))

  await waitFor(() =>
    expect(propiedadesApi.crear).toHaveBeenCalledWith(expect.objectContaining({ propietario_persona_id: 3 })),
  )
})
```

Adaptar los nombres de los métodos mockeados de `propiedadesApi` y el texto del botón de guardar a los reales del formulario (leer `Formulario.tsx` antes).

- [ ] **Step 2: Formulario**

En `Formulario.tsx`: estado `const [propietario, setPropietario] = useState<PersonaBrief | null>(null)`; al cargar una propiedad existente, `setPropietario(p.propietario)` (viene de `PropiedadListItem.propietario`); en el payload, `propietario_persona_id: propietario?.id`. Nueva sección después de "Datos básicos":

```tsx
        <section className="form-section">
          <h2 className="form-section-title">Propietario</h2>
          <SelectorPersona valor={propietario} onChange={setPropietario} label="Propietario" />
          <p className="form-hint">La persona que figura como dueña. Aparece en su ficha como "Propietario".</p>
        </section>
```

Al editar con `propietario_persona_id` explícitamente `null` (se quitó), el backend recibe `propietario_persona_id: null` — verificar que el `PropiedadUpdatePayload` lo admita (`propietario_persona_id?: number | null`).

- [ ] **Step 3: Lista**

En `propiedades/Lista.tsx`: columna "Propietario" entre "Precio" y "Ciudad":

```tsx
                        <td data-label="Propietario">
                          {p.propietario
                            ? <Link to={`/admin/personas/${p.propietario.id}`}>{p.propietario.full_name}</Link>
                            : '—'}
                        </td>
```

y en acciones, solo para `disponible`:

```tsx
                            {p.estado_comercial === 'disponible' && (
                              <Link to={`/admin/reservas/nueva?propiedad=${p.id}`} className="btn btn-outline">Reservar</Link>
                            )}
```

- [ ] **Step 4: Verificar y commitear**

Run: `cd client && npm test && npx tsc --noEmit`

```bash
git add client/src
git commit -m "feat(client): propietario en el formulario y la lista de propiedades"
```

---

### Task 19: Reservas — lista, alta y acciones

**Files:**
- Create: `client/src/pages/admin/reservas/Lista.tsx`, `Lista.css`, `Lista.test.tsx`, `Formulario.tsx`, `Formulario.test.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes: `reservasApi`, `propiedadesApi.listar({ estado_comercial: 'disponible' })`, `propiedadesApi.obtener`, `SelectorPersona`, `diasHasta`, `formatearMonto`, `formatearFecha`, `LABEL_ESTADO_RESERVA`, `rolInicialSegunOperacion`, `etapaInicialSegunOperacion`.
- Produces: rutas `/admin/reservas`, `/admin/reservas/nueva?propiedad=ID`. "Convertir" navega a `/admin/operaciones/nueva?propiedad=ID&persona=ID&rol=comprador&pipeline=Venta&etapa=Oferta&reserva=ID`.

- [ ] **Step 1: Tests que fallan**

`Lista.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ReservasLista from './Lista'
import { reservasApi } from '../../../api/reservas'
import { propiedadesApi } from '../../../api/propiedades'

vi.mock('../../../api/reservas', () => ({
  reservasApi: { listar: vi.fn(), cancelar: vi.fn(), vencer: vi.fn(), convertir: vi.fn() },
}))
vi.mock('../../../api/propiedades', () => ({
  propiedadesApi: { obtener: vi.fn() },
}))

const RESERVA = {
  id: 4, status: 'activa' as const, person: { id: 1, full_name: 'Ana Pérez' }, property_id: 7,
  propiedad: { id: 7, titulo: 'Casa', estado_comercial: 'reservada' }, amount: 1000, currency: 'USD',
  notes: null, expires_at: '2099-01-01T00:00:00Z', created_by: { id: 1, email: 'a@a' }, created_at: '', updated_at: '',
}

beforeEach(() => {
  vi.mocked(reservasApi.listar).mockResolvedValue({ total: 1, items: [RESERVA] })
  vi.mocked(reservasApi.convertir).mockResolvedValue({ ...RESERVA, status: 'convertida' })
  vi.mocked(propiedadesApi.obtener).mockResolvedValue({ id: 7, tipo_operacion: 'alquiler' } as never)
})

function renderLista() {
  return render(
    <MemoryRouter initialEntries={['/admin/reservas']}>
      <Routes>
        <Route path="/admin/reservas" element={<ReservasLista />} />
        <Route path="/admin/operaciones/nueva" element={<p>alta de operación</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

it('lista activas por defecto', async () => {
  renderLista()
  expect(await screen.findByText('Ana Pérez')).toBeInTheDocument()
  expect(reservasApi.listar).toHaveBeenCalledWith(expect.objectContaining({ status: 'activa' }))
})

it('convertir llama a la API y navega al alta de operación con los datos de la propiedad', async () => {
  const usuario = userEvent.setup()
  renderLista()
  await usuario.click(await screen.findByRole('button', { name: 'Convertir' }))
  await waitFor(() => expect(reservasApi.convertir).toHaveBeenCalledWith(4))
  expect(await screen.findByText('alta de operación')).toBeInTheDocument()
})

it('muestra el detail del backend si una acción falla', async () => {
  const usuario = userEvent.setup()
  vi.mocked(reservasApi.cancelar).mockRejectedValue(new Error("No se puede pasar de 'vencida' a 'cancelada'"))
  renderLista()
  await usuario.click(await screen.findByRole('button', { name: 'Cancelar' }))
  expect(await screen.findByText(/No se puede pasar/)).toBeInTheDocument()
})
```

`Formulario.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ReservaFormulario from './Formulario'
import { reservasApi } from '../../../api/reservas'
import { propiedadesApi } from '../../../api/propiedades'
import { personasApi } from '../../../api/personas'

vi.mock('../../../api/reservas', () => ({ reservasApi: { crear: vi.fn() } }))
vi.mock('../../../api/propiedades', () => ({ propiedadesApi: { obtener: vi.fn(), listar: vi.fn() } }))
vi.mock('../../../api/personas', () => ({ personasApi: { listar: vi.fn(), crear: vi.fn() } }))

beforeEach(() => {
  vi.mocked(propiedadesApi.obtener).mockResolvedValue({ id: 7, titulo: 'Casa', estado_comercial: 'disponible' } as never)
  vi.mocked(propiedadesApi.listar).mockResolvedValue([])
  vi.mocked(personasApi.listar).mockResolvedValue({
    total: 1,
    items: [{ id: 1, full_name: 'Ana Pérez', document_type: null, document_number: null, created_at: '', tags: [], roles: { propietario: 0, comprador: 0, vendedor: 0, inquilino: 0, interesado: 0 } }],
  })
})

function renderAlta() {
  return render(
    <MemoryRouter initialEntries={['/admin/reservas/nueva?propiedad=7']}>
      <Routes>
        <Route path="/admin/reservas/nueva" element={<ReservaFormulario />} />
        <Route path="/admin/reservas" element={<p>lista de reservas</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

it('preselecciona la propiedad del query param y crea la reserva', async () => {
  const usuario = userEvent.setup()
  vi.mocked(reservasApi.crear).mockResolvedValue({ id: 1 } as never)
  renderAlta()

  expect(await screen.findByText('Casa')).toBeInTheDocument()
  await usuario.type(screen.getByRole('combobox', { name: 'Persona' }), 'Ana')
  await usuario.click(await screen.findByRole('option', { name: /Ana Pérez/ }))
  await usuario.type(screen.getByLabelText('Monto de la seña'), '1500')
  await usuario.click(screen.getByRole('button', { name: 'Reservar' }))

  await waitFor(() =>
    expect(reservasApi.crear).toHaveBeenCalledWith(expect.objectContaining({ property_id: 7, person_id: 1, amount: 1500 })),
  )
  expect(await screen.findByText('lista de reservas')).toBeInTheDocument()
})

it('muestra el 409 del backend tal cual', async () => {
  const usuario = userEvent.setup()
  vi.mocked(reservasApi.crear).mockRejectedValue(new Error('La propiedad 7 ya tiene una reserva activa (id=3)'))
  renderAlta()
  await screen.findByText('Casa')
  await usuario.type(screen.getByRole('combobox', { name: 'Persona' }), 'Ana')
  await usuario.click(await screen.findByRole('option', { name: /Ana Pérez/ }))
  await usuario.click(screen.getByRole('button', { name: 'Reservar' }))
  expect(await screen.findByText(/ya tiene una reserva activa/)).toBeInTheDocument()
})
```

- [ ] **Step 2: Lista**

```tsx
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { reservasApi } from '../../../api/reservas'
import { propiedadesApi } from '../../../api/propiedades'
import type { EstadoReserva, Reserva } from '../../../types/reserva'
import Badge from '../../../components/Badge'
import { diasHasta, formatearFecha, formatearMonto } from '../../../lib/formato'
import { LABEL_ESTADO_RESERVA, etapaInicialSegunOperacion, rolInicialSegunOperacion } from '../../../lib/crm'
import './Lista.css'

const ESTADOS: EstadoReserva[] = ['activa', 'vencida', 'cancelada', 'convertida']
const DIAS_ALERTA = 3

export default function ReservasLista() {
  const navigate = useNavigate()
  const [estado, setEstado] = useState<EstadoReserva | ''>('activa')
  const [reservas, setReservas] = useState<Reserva[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = () => {
    setLoading(true)
    setError(null)
    reservasApi.listar({ status: estado || undefined, limit: 200 })
      .then(r => setReservas(r.items))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(cargar, [estado]) // eslint-disable-line

  const accion = async (fn: () => Promise<unknown>) => {
    setError(null)
    try { await fn(); cargar() } catch (e: unknown) { setError(e instanceof Error ? e.message : 'No se pudo') }
  }

  // Convertir marca la reserva y abre el alta de operación ya cargada: la propiedad
  // decide pipeline, etapa y rol (comprador/inquilino).
  const convertir = async (r: Reserva) => {
    setError(null)
    try {
      await reservasApi.convertir(r.id)
      const prop = await propiedadesApi.obtener(r.property_id)
      const { pipeline, etapa } = etapaInicialSegunOperacion(prop.tipo_operacion)
      const params = new URLSearchParams({
        propiedad: String(r.property_id), persona: String(r.person.id),
        rol: rolInicialSegunOperacion(prop.tipo_operacion), pipeline, etapa, reserva: String(r.id),
      })
      navigate(`/admin/operaciones/nueva?${params}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo convertir')
    }
  }

  const claseVencimiento = (r: Reserva) => {
    const dias = diasHasta(r.expires_at)
    if (r.status !== 'activa' || dias === null) return ''
    return dias < 0 ? 'reserva-vencida' : dias <= DIAS_ALERTA ? 'reserva-por-vencer' : ''
  }

  return (
    <div>
      <div className="admin-page-header">
        <h1>Reservas</h1>
        <Link to="/admin/reservas/nueva" className="btn btn-magenta">+ Nueva reserva</Link>
      </div>

      <div className="admin-card filtros-bar">
        <label className="filtros-label">
          Estado
          <select value={estado} onChange={e => setEstado(e.target.value as EstadoReserva | '')}>
            <option value="">Todas</option>
            {ESTADOS.map(e => <option key={e} value={e}>{LABEL_ESTADO_RESERVA[e]}</option>)}
          </select>
        </label>
      </div>

      {loading && <p className="lista-estado">Cargando...</p>}
      {error && <p className="lista-estado lista-error" role="alert">{error}</p>}

      {!loading && (
        reservas.length === 0
          ? <p className="lista-estado">No hay reservas.</p>
          : (
            <div className="admin-card tabla-wrapper">
              <table className="tabla">
                <thead>
                  <tr><th>Propiedad</th><th>Persona</th><th>Seña</th><th>Vence</th><th>Estado</th><th>Acciones</th></tr>
                </thead>
                <tbody>
                  {reservas.map(r => (
                    <tr key={r.id} className={claseVencimiento(r)}>
                      <td data-label="Propiedad"><Link to={`/admin/propiedades/${r.property_id}/editar`}>{r.propiedad.titulo}</Link></td>
                      <td data-label="Persona"><Link to={`/admin/personas/${r.person.id}`}>{r.person.full_name}</Link></td>
                      <td data-label="Seña">{formatearMonto(r.amount, r.currency)}</td>
                      <td data-label="Vence">{formatearFecha(r.expires_at)}</td>
                      <td data-label="Estado"><Badge value={r.status} label={LABEL_ESTADO_RESERVA[r.status]} /></td>
                      <td data-label="Acciones">
                        {r.status === 'activa' && (
                          <div className="tabla-acciones">
                            <button className="btn btn-magenta" onClick={() => convertir(r)}>Convertir</button>
                            <button className="btn btn-outline" onClick={() => accion(() => reservasApi.vencer(r.id))}>Marcar vencida</button>
                            <button className="btn btn-danger" onClick={() => accion(() => reservasApi.cancelar(r.id))}>Cancelar</button>
                          </div>
                        )}
                        {r.status === 'vencida' && (
                          <button className="btn btn-danger" onClick={() => accion(() => reservasApi.cancelar(r.id))}>Cancelar</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
      )}
    </div>
  )
}
```

`Lista.css`: `.reserva-por-vencer td { background: var(--espera-bg); } .reserva-vencida td { background: var(--baja-bg); }` (tokens de `Badge.css`).

- [ ] **Step 3: Formulario**

```tsx
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { reservasApi } from '../../../api/reservas'
import { propiedadesApi } from '../../../api/propiedades'
import type { PropiedadListItem } from '../../../types/propiedad'
import type { PersonaBrief } from '../../../types/persona'
import SelectorPersona from '../../../components/crm/SelectorPersona/SelectorPersona'

export default function ReservaFormulario() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const propiedadInicial = params.get('propiedad')

  const [propiedad, setPropiedad] = useState<{ id: number; titulo: string } | null>(null)
  const [disponibles, setDisponibles] = useState<PropiedadListItem[]>([])
  const [persona, setPersona] = useState<PersonaBrief | null>(null)
  const [monto, setMonto] = useState('')
  const [moneda, setMoneda] = useState('ARS')
  const [vence, setVence] = useState('')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (propiedadInicial) {
      propiedadesApi.obtener(Number(propiedadInicial))
        .then(p => setPropiedad({ id: p.id, titulo: p.titulo }))
        .catch(e => setError(e.message))
    } else {
      propiedadesApi.listar({ estado_comercial: 'disponible', limit: 500 })
        .then(setDisponibles)
        .catch(e => setError(e.message))
    }
  }, [propiedadInicial])

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!propiedad || !persona) { setError('Elegí la propiedad y la persona'); return }
    setGuardando(true)
    setError(null)
    try {
      await reservasApi.crear({
        property_id: propiedad.id, person_id: persona.id,
        amount: monto ? Number(monto) : undefined, currency: moneda,
        expires_at: vence ? new Date(`${vence}T23:59:59`).toISOString() : undefined,
        notes: notas || undefined,
      })
      navigate('/admin/reservas')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo reservar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div>
      <div className="admin-page-header"><h1>Nueva reserva</h1></div>
      {error && <p className="form-error" role="alert">{error}</p>}

      <form onSubmit={guardar} className="admin-card form">
        <div className="form-field full">
          <label htmlFor="propiedad">Propiedad</label>
          {propiedad
            ? <p id="propiedad" className="form-valor">{propiedad.titulo}</p>
            : (
              <select id="propiedad" required onChange={e => {
                const p = disponibles.find(d => d.id === Number(e.target.value))
                setPropiedad(p ? { id: p.id, titulo: p.titulo } : null)
              }}>
                <option value="">Elegí una propiedad disponible…</option>
                {disponibles.map(p => <option key={p.id} value={p.id}>{p.titulo}</option>)}
              </select>
            )}
        </div>

        <div className="form-field full">
          <SelectorPersona valor={persona} onChange={setPersona} label="Persona" />
        </div>

        <div className="form-row">
          <div className="form-field" style={{ maxWidth: 100 }}>
            <label htmlFor="moneda">Moneda</label>
            <select id="moneda" value={moneda} onChange={e => setMoneda(e.target.value)}>
              <option>ARS</option><option>USD</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="monto">Monto de la seña</label>
            <input id="monto" type="number" min={0} value={monto} onChange={e => setMonto(e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="vence">Vence</label>
            <input id="vence" type="date" value={vence} onChange={e => setVence(e.target.value)} />
          </div>
        </div>

        <div className="form-field full">
          <label htmlFor="notas">Notas</label>
          <textarea id="notas" rows={3} value={notas} onChange={e => setNotas(e.target.value)} />
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-magenta" disabled={guardando}>Reservar</button>
          <button type="button" className="btn btn-outline" onClick={() => navigate(-1)}>Cancelar</button>
        </div>
      </form>
    </div>
  )
}
```

Rutas en `App.tsx`:

```tsx
              <Route path="reservas">
                <Route index        element={<ReservasLista />} />
                <Route path="nueva" element={<ReservaFormulario />} />
              </Route>
```

- [ ] **Step 4: Verificar y commitear**

Run: `cd client && npm test && npx tsc --noEmit`

```bash
git add client/src
git commit -m "feat(client): reservas con alta desde la propiedad y conversión a operación"
```

---

### Task 20: Operaciones — `TarjetaOperacion` y tablero

**Files:**
- Create: `client/src/components/crm/TarjetaOperacion/TarjetaOperacion.tsx`, `.css`, `.test.tsx`
- Create: `client/src/pages/admin/operaciones/Tablero.tsx`, `Tablero.css`, `Tablero.test.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Produces: `<TarjetaOperacion operacion etapas onMover={(stageId) => Promise<void>} />`; ruta `/admin/operaciones`.

- [ ] **Step 1: Tests que fallan**

`TarjetaOperacion.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import TarjetaOperacion from './TarjetaOperacion'

const ETAPAS = [
  { id: 1, pipeline_id: 1, name: 'Consulta', position: 1, is_won: false, is_lost: false },
  { id: 2, pipeline_id: 1, name: 'Visita', position: 2, is_won: false, is_lost: false },
  { id: 4, pipeline_id: 1, name: 'Ganada', position: 4, is_won: true, is_lost: false },
]
const OP = {
  id: 9, title: 'Compra casa', pipeline_id: 1, stage_id: 1, assigned_to_user_id: null, property_id: 7,
  propiedad: { id: 7, titulo: 'Casa', estado_comercial: 'disponible' }, amount: 120000, currency: 'USD',
  is_won: false, is_lost: false, stage_changed_at: '', dias_en_etapa: 4,
  parties: [{ id: 1, deal_id: 9, person_id: 1, person: { id: 1, full_name: 'Ana Pérez' }, role: 'comprador' as const, notes: null, created_at: '' }],
  created_at: '',
}

it('muestra título, propiedad, monto, partes y días en etapa', () => {
  render(<MemoryRouter><TarjetaOperacion operacion={OP} etapas={ETAPAS} onMover={vi.fn()} /></MemoryRouter>)
  expect(screen.getByRole('link', { name: 'Compra casa' })).toHaveAttribute('href', '/admin/operaciones/9')
  expect(screen.getByText('Casa')).toBeInTheDocument()
  expect(screen.getByText('USD 120.000')).toBeInTheDocument()
  expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
  expect(screen.getByText('4 días')).toBeInTheDocument()
})

it('cambiar el selector llama a onMover con la etapa nueva', async () => {
  const usuario = userEvent.setup()
  const onMover = vi.fn().mockResolvedValue(undefined)
  render(<MemoryRouter><TarjetaOperacion operacion={OP} etapas={ETAPAS} onMover={onMover} /></MemoryRouter>)
  await usuario.selectOptions(screen.getByLabelText('Etapa'), '2')
  await waitFor(() => expect(onMover).toHaveBeenCalledWith(2))
})
```

`Tablero.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Tablero from './Tablero'
import { operacionesApi } from '../../../api/operaciones'

vi.mock('../../../api/operaciones', () => ({
  operacionesApi: { pipelines: vi.fn(), pipeline: vi.fn(), listar: vi.fn(), moverEtapa: vi.fn() },
}))

const VENTA = {
  id: 1, name: 'Venta', description: null, is_active: true, created_at: '',
  stages: [
    { id: 1, pipeline_id: 1, name: 'Consulta', position: 1, is_won: false, is_lost: false },
    { id: 2, pipeline_id: 1, name: 'Visita', position: 2, is_won: false, is_lost: false },
    { id: 4, pipeline_id: 1, name: 'Ganada', position: 4, is_won: true, is_lost: false },
    { id: 5, pipeline_id: 1, name: 'Perdida', position: 5, is_won: false, is_lost: true },
  ],
}
const OP = {
  id: 9, title: 'Compra casa', pipeline_id: 1, stage_id: 1, assigned_to_user_id: null, property_id: null,
  propiedad: null, amount: null, currency: 'ARS', is_won: false, is_lost: false, stage_changed_at: '',
  dias_en_etapa: 0, parties: [], created_at: '',
}

beforeEach(() => {
  vi.mocked(operacionesApi.pipelines).mockResolvedValue([
    { id: 1, name: 'Venta', is_active: true, stage_count: 4 },
    { id: 2, name: 'Alquiler', is_active: true, stage_count: 4 },
  ])
  vi.mocked(operacionesApi.pipeline).mockResolvedValue(VENTA)
  vi.mocked(operacionesApi.listar).mockResolvedValue({ total: 1, items: [OP] })
})

it('agrupa por etapa y colapsa ganada/perdida con el conteo', async () => {
  render(<MemoryRouter><Tablero /></MemoryRouter>)
  expect(await screen.findByRole('heading', { name: 'Consulta' })).toBeInTheDocument()
  expect(screen.getByText('Compra casa')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Ganada · 0/ })).toBeInTheDocument()
})

it('un 409 al mover deja la tarjeta donde estaba y muestra el detail', async () => {
  const usuario = userEvent.setup()
  vi.mocked(operacionesApi.moverEtapa).mockRejectedValue(new Error('La propiedad está dada de baja'))
  render(<MemoryRouter><Tablero /></MemoryRouter>)
  await screen.findByText('Compra casa')

  await usuario.selectOptions(screen.getByLabelText('Etapa'), '4')

  expect(await screen.findByText('La propiedad está dada de baja')).toBeInTheDocument()
  await waitFor(() => expect(screen.getByLabelText('Etapa')).toHaveValue('1'))
})
```

- [ ] **Step 2: `TarjetaOperacion`**

```tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Etapa, OperacionListItem } from '../../../types/operacion'
import { formatearMonto } from '../../../lib/formato'
import './TarjetaOperacion.css'

interface Props {
  operacion: OperacionListItem
  etapas: Etapa[]
  onMover: (stageId: number) => Promise<void>
}

/**
 * Tarjeta del tablero. Se mueve con un selector, no con drag & drop: es la
 * misma acción, anda en el celular y cuesta una fracción.
 */
export default function TarjetaOperacion({ operacion, etapas, onMover }: Props) {
  const [moviendo, setMoviendo] = useState(false)
  const selectId = `etapa-${operacion.id}`

  const mover = async (stageId: number) => {
    setMoviendo(true)
    try { await onMover(stageId) } finally { setMoviendo(false) }
  }

  return (
    <article className="tarjeta-op">
      <Link to={`/admin/operaciones/${operacion.id}`} className="tarjeta-op-titulo">{operacion.title}</Link>
      {operacion.propiedad && <p className="tarjeta-op-propiedad">{operacion.propiedad.titulo}</p>}
      <p className="tarjeta-op-monto">{formatearMonto(operacion.amount, operacion.currency)}</p>
      {operacion.parties.length > 0 && (
        <p className="tarjeta-op-partes">{operacion.parties.map(p => p.person.full_name).join(', ')}</p>
      )}
      <footer className="tarjeta-op-pie">
        <span className="tarjeta-op-dias">{operacion.dias_en_etapa} día{operacion.dias_en_etapa === 1 ? '' : 's'}</span>
        <label htmlFor={selectId} className="sr-only">Etapa</label>
        <select
          id={selectId}
          value={operacion.stage_id}
          disabled={moviendo}
          onChange={e => mover(Number(e.target.value))}
        >
          {etapas.map(et => <option key={et.id} value={et.id}>{et.name}</option>)}
        </select>
      </footer>
    </article>
  )
}
```

`TarjetaOperacion.css`:

```css
.tarjeta-op { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.75rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; }
.tarjeta-op-titulo { font-weight: 600; }
.tarjeta-op-propiedad, .tarjeta-op-partes { margin: 0; font-size: 0.85rem; color: var(--text-muted); }
.tarjeta-op-monto { margin: 0; font-size: 0.9rem; }
.tarjeta-op-pie { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; margin-top: 0.35rem; }
.tarjeta-op-dias { font-size: 0.78rem; color: var(--text-muted); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
```

(si `.sr-only` ya existe globalmente, no duplicar).

- [ ] **Step 3: Tablero**

```tsx
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { operacionesApi } from '../../../api/operaciones'
import type { OperacionListItem, Pipeline, PipelineResumen } from '../../../types/operacion'
import TarjetaOperacion from '../../../components/crm/TarjetaOperacion/TarjetaOperacion'
import './Tablero.css'

const CLAVE_PIPELINE = 'mambo.tablero.pipeline'
const MAX_CERRADAS = 20

function pipelineRecordado(): number | null {
  try { const v = localStorage.getItem(CLAVE_PIPELINE); return v ? Number(v) : null } catch { return null }
}

export default function Tablero() {
  const [pipelines, setPipelines] = useState<PipelineResumen[]>([])
  const [pipelineId, setPipelineId] = useState<number | null>(pipelineRecordado())
  const [pipeline, setPipeline] = useState<Pipeline | null>(null)
  const [operaciones, setOperaciones] = useState<OperacionListItem[]>([])
  const [cerradaAbierta, setCerradaAbierta] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    operacionesApi.pipelines()
      .then(ps => {
        const activos = ps.filter(p => p.is_active)
        setPipelines(activos)
        if (pipelineId === null || !activos.some(p => p.id === pipelineId)) setPipelineId(activos[0]?.id ?? null)
      })
      .catch(e => setError(e.message))
  }, []) // eslint-disable-line

  const cargar = () => {
    if (pipelineId === null) return
    try { localStorage.setItem(CLAVE_PIPELINE, String(pipelineId)) } catch { /* sin storage, sin memoria */ }
    Promise.all([operacionesApi.pipeline(pipelineId), operacionesApi.listar({ pipeline_id: pipelineId, limit: 200 })])
      .then(([p, ops]) => { setPipeline(p); setOperaciones(ops.items) })
      .catch(e => setError(e.message))
  }

  useEffect(cargar, [pipelineId]) // eslint-disable-line

  const porEtapa = useMemo(() => {
    const mapa = new Map<number, OperacionListItem[]>()
    operaciones.forEach(op => mapa.set(op.stage_id, [...(mapa.get(op.stage_id) ?? []), op]))
    return mapa
  }, [operaciones])

  // Optimista: la tarjeta cambia de columna al toque; si el backend rechaza
  // (409, propiedad dada de baja) se recarga y vuelve a donde estaba.
  const mover = async (op: OperacionListItem, stageId: number) => {
    setError(null)
    setOperaciones(ops => ops.map(o => (o.id === op.id ? { ...o, stage_id: stageId } : o)))
    try {
      await operacionesApi.moverEtapa(op.id, stageId)
      cargar()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo mover')
      cargar()
    }
  }

  const abiertas = pipeline?.stages.filter(s => !s.is_won && !s.is_lost) ?? []
  const cerradas = pipeline?.stages.filter(s => s.is_won || s.is_lost) ?? []

  return (
    <div>
      <div className="admin-page-header">
        <div className="tablero-cabecera">
          <h1>Operaciones</h1>
          <div className="tablero-pipelines" role="tablist">
            {pipelines.map(p => (
              <button
                key={p.id}
                role="tab"
                aria-selected={p.id === pipelineId}
                className={`tablero-pipeline${p.id === pipelineId ? ' activo' : ''}`}
                onClick={() => setPipelineId(p.id)}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
        <Link to={`/admin/operaciones/nueva${pipeline ? `?pipeline=${pipeline.name}` : ''}`} className="btn btn-magenta">+ Nueva operación</Link>
      </div>

      {error && <p className="lista-estado lista-error" role="alert">{error}</p>}

      {pipeline && (
        <>
          <div className="tablero">
            {abiertas.map(etapa => (
              <section key={etapa.id} className="tablero-columna">
                <h2 className="tablero-columna-titulo">{etapa.name} <span>{porEtapa.get(etapa.id)?.length ?? 0}</span></h2>
                <div className="tablero-tarjetas">
                  {(porEtapa.get(etapa.id) ?? []).map(op => (
                    <TarjetaOperacion key={op.id} operacion={op} etapas={pipeline.stages} onMover={id => mover(op, id)} />
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="tablero-cerradas">
            {cerradas.map(etapa => {
              const lista = porEtapa.get(etapa.id) ?? []
              const abierta = cerradaAbierta === etapa.id
              return (
                <section key={etapa.id} className="admin-card">
                  <button className="tablero-cerrada-toggle" aria-expanded={abierta} onClick={() => setCerradaAbierta(abierta ? null : etapa.id)}>
                    {etapa.name} · {lista.length}
                  </button>
                  {abierta && (
                    <div className="tablero-tarjetas">
                      {lista.slice(0, MAX_CERRADAS).map(op => (
                        <TarjetaOperacion key={op.id} operacion={op} etapas={pipeline.stages} onMover={id => mover(op, id)} />
                      ))}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
```

`Tablero.css`:

```css
.tablero-cabecera { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; }
.tablero-pipelines { display: inline-flex; gap: 0.25rem; padding: 0.2rem; background: var(--surface-hover); border-radius: 8px; }
.tablero-pipeline { border: 0; background: transparent; padding: 0.35rem 0.9rem; border-radius: 6px; cursor: pointer; font-weight: 600; }
.tablero-pipeline.activo { background: var(--surface); box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.tablero { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(240px, 1fr); gap: 1rem; overflow-x: auto; padding-bottom: 0.5rem; }
.tablero-columna { min-width: 0; }
.tablero-columna-titulo { display: flex; justify-content: space-between; font-size: 0.95rem; margin: 0 0 0.5rem; }
.tablero-columna-titulo span { color: var(--text-muted); font-weight: 400; }
.tablero-tarjetas { display: flex; flex-direction: column; gap: 0.5rem; }
.tablero-cerradas { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; margin-top: 1.25rem; }
.tablero-cerrada-toggle { width: 100%; text-align: left; border: 0; background: transparent; font-weight: 600; cursor: pointer; padding: 0; }
@media (max-width: 640px) { .tablero-cerradas { grid-template-columns: 1fr; } }
```

Ruta en `App.tsx`: `<Route path="operaciones"><Route index element={<Tablero />} /></Route>` (las otras dos rutas se agregan en la Task 21).

- [ ] **Step 4: Verificar y commitear**

Run: `cd client && npm test && npx tsc --noEmit`

```bash
git add client/src
git commit -m "feat(client): tablero de operaciones por etapa"
```

---

### Task 21: Operaciones — ficha y alta

**Files:**
- Create: `client/src/pages/admin/operaciones/Ficha.tsx`, `Ficha.css`, `Formulario.tsx`, `Formulario.test.tsx`
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes: `operacionesApi`, `usuariosApi.listar`, `propiedadesApi.listar`, `SelectorPersona`, `ROLES_PARTE`, `LABEL_ROL_PARTE`.
- Produces: rutas `/admin/operaciones/nueva` (query params `propiedad`, `persona`, `rol`, `pipeline`, `etapa`) y `/admin/operaciones/:id`.

- [ ] **Step 1: Test que falla** (`Formulario.test.tsx`)

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import OperacionFormulario from './Formulario'
import { operacionesApi } from '../../../api/operaciones'
import { propiedadesApi } from '../../../api/propiedades'
import { personasApi } from '../../../api/personas'
import { usuariosApi } from '../../../api/usuarios'

vi.mock('../../../api/operaciones', () => ({ operacionesApi: { pipelines: vi.fn(), pipeline: vi.fn(), crear: vi.fn() } }))
vi.mock('../../../api/propiedades', () => ({ propiedadesApi: { obtener: vi.fn(), listar: vi.fn() } }))
vi.mock('../../../api/personas', () => ({ personasApi: { obtener: vi.fn(), listar: vi.fn(), crear: vi.fn() } }))
vi.mock('../../../api/usuarios', () => ({ usuariosApi: { listar: vi.fn() } }))

const VENTA = {
  id: 1, name: 'Venta', description: null, is_active: true, created_at: '',
  stages: [
    { id: 1, pipeline_id: 1, name: 'Consulta', position: 1, is_won: false, is_lost: false },
    { id: 3, pipeline_id: 1, name: 'Oferta', position: 3, is_won: false, is_lost: false },
  ],
}

beforeEach(() => {
  vi.mocked(operacionesApi.pipelines).mockResolvedValue([{ id: 1, name: 'Venta', is_active: true, stage_count: 2 }])
  vi.mocked(operacionesApi.pipeline).mockResolvedValue(VENTA)
  vi.mocked(propiedadesApi.obtener).mockResolvedValue({ id: 7, titulo: 'Casa', precio: 150000, moneda: 'USD', tipo_operacion: 'venta' } as never)
  vi.mocked(propiedadesApi.listar).mockResolvedValue([])
  vi.mocked(personasApi.obtener).mockResolvedValue({ id: 1, full_name: 'Ana Pérez' } as never)
  vi.mocked(usuariosApi.listar).mockResolvedValue([])
  vi.mocked(operacionesApi.crear).mockResolvedValue({ id: 22 } as never)
})

it('viene precargada desde una reserva convertida y crea el deal', async () => {
  const usuario = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/admin/operaciones/nueva?propiedad=7&persona=1&rol=comprador&pipeline=Venta&etapa=Oferta']}>
      <Routes>
        <Route path="/admin/operaciones/nueva" element={<OperacionFormulario />} />
        <Route path="/admin/operaciones/:id" element={<p>ficha</p>} />
      </Routes>
    </MemoryRouter>,
  )

  expect(await screen.findByDisplayValue('Casa')).toBeInTheDocument()   // título autocompletado
  expect(screen.getByDisplayValue('150000')).toBeInTheDocument()        // monto autocompletado
  expect(screen.getByText('Ana Pérez')).toBeInTheDocument()             // parte precargada
  await waitFor(() => expect(screen.getByLabelText('Etapa')).toHaveValue('3'))

  await usuario.click(screen.getByRole('button', { name: 'Crear operación' }))

  await waitFor(() =>
    expect(operacionesApi.crear).toHaveBeenCalledWith(expect.objectContaining({
      pipeline_id: 1, stage_id: 3, property_id: 7, title: 'Casa', amount: 150000, currency: 'USD',
      parties: [{ person_id: 1, role: 'comprador' }],
    })),
  )
  expect(await screen.findByText('ficha')).toBeInTheDocument()
})
```

- [ ] **Step 2: Formulario (alta)**

```tsx
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { operacionesApi } from '../../../api/operaciones'
import { propiedadesApi } from '../../../api/propiedades'
import { personasApi } from '../../../api/personas'
import { usuariosApi } from '../../../api/usuarios'
import type { Pipeline, PipelineResumen, RolParte } from '../../../types/operacion'
import type { PersonaBrief } from '../../../types/persona'
import type { PropiedadListItem } from '../../../types/propiedad'
import type { UsuarioBrief } from '../../../types/inmobiliaria'
import SelectorPersona from '../../../components/crm/SelectorPersona/SelectorPersona'
import { LABEL_ROL_PARTE, ROLES_PARTE } from '../../../lib/crm'

interface ParteEnAlta { persona: PersonaBrief; rol: RolParte }

export default function OperacionFormulario() {
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [pipelines, setPipelines] = useState<PipelineResumen[]>([])
  const [pipeline, setPipeline] = useState<Pipeline | null>(null)
  const [etapaId, setEtapaId] = useState<number | null>(null)
  const [propiedades, setPropiedades] = useState<PropiedadListItem[]>([])
  const [propiedad, setPropiedad] = useState<{ id: number; titulo: string } | null>(null)
  const [titulo, setTitulo] = useState('')
  const [monto, setMonto] = useState('')
  const [moneda, setMoneda] = useState('ARS')
  const [usuarios, setUsuarios] = useState<UsuarioBrief[]>([])
  const [asignado, setAsignado] = useState('')
  const [notas, setNotas] = useState('')
  const [partes, setPartes] = useState<ParteEnAlta[]>([])
  const [nuevaParte, setNuevaParte] = useState<PersonaBrief | null>(null)
  const [nuevoRol, setNuevoRol] = useState<RolParte>('comprador')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Precarga desde los query params (reserva convertida) y catálogos.
  useEffect(() => {
    const pipelineNombre = params.get('pipeline')
    operacionesApi.pipelines().then(ps => {
      const activos = ps.filter(p => p.is_active)
      setPipelines(activos)
      const elegido = activos.find(p => p.name === pipelineNombre) ?? activos[0]
      if (elegido) cargarPipeline(elegido.id, params.get('etapa'))
    }).catch(e => setError(e.message))

    propiedadesApi.listar({ limit: 500 }).then(setPropiedades).catch(() => setPropiedades([]))
    usuariosApi.listar().then(setUsuarios).catch(() => setUsuarios([]))

    const propiedadId = params.get('propiedad')
    if (propiedadId) {
      propiedadesApi.obtener(Number(propiedadId)).then(p => {
        setPropiedad({ id: p.id, titulo: p.titulo })
        setTitulo(t => t || p.titulo)
        if (p.precio !== null) { setMonto(String(p.precio)); setMoneda(p.moneda) }
      }).catch(e => setError(e.message))
    }
    const personaId = params.get('persona')
    if (personaId) {
      personasApi.obtener(Number(personaId)).then(p => {
        setPartes([{ persona: { id: p.id, full_name: p.full_name }, rol: (params.get('rol') as RolParte) ?? 'interesado' }])
      }).catch(e => setError(e.message))
    }
  }, []) // eslint-disable-line

  const cargarPipeline = (id: number, etapaNombre: string | null) => {
    operacionesApi.pipeline(id).then(p => {
      setPipeline(p)
      const abiertas = p.stages.filter(s => !s.is_won && !s.is_lost)
      const inicial = abiertas.find(s => s.name === etapaNombre) ?? abiertas[0]
      setEtapaId(inicial?.id ?? null)
    }).catch(e => setError(e.message))
  }

  const elegirPropiedad = (id: number) => {
    const p = propiedades.find(x => x.id === id)
    setPropiedad(p ? { id: p.id, titulo: p.titulo } : null)
    if (p) {
      setTitulo(t => t || p.titulo)
      if (p.precio !== null) { setMonto(String(p.precio)); setMoneda(p.moneda) }
    }
  }

  const agregarParte = () => {
    if (!nuevaParte) return
    setPartes(ps => [...ps, { persona: nuevaParte, rol: nuevoRol }])
    setNuevaParte(null)
  }

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pipeline || etapaId === null) { setError('Elegí el pipeline y la etapa'); return }
    setGuardando(true)
    setError(null)
    try {
      const creada = await operacionesApi.crear({
        title: titulo.trim(), pipeline_id: pipeline.id, stage_id: etapaId,
        property_id: propiedad?.id, amount: monto ? Number(monto) : undefined, currency: moneda,
        assigned_to_user_id: asignado ? Number(asignado) : undefined, notes: notas || undefined,
        parties: partes.map(p => ({ person_id: p.persona.id, role: p.rol })),
      })
      navigate(`/admin/operaciones/${creada.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo crear')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div>
      <div className="admin-page-header"><h1>Nueva operación</h1></div>
      {error && <p className="form-error" role="alert">{error}</p>}

      <form onSubmit={guardar} className="admin-card form">
        <div className="form-row">
          <div className="form-field">
            <label htmlFor="pipeline">Pipeline</label>
            <select id="pipeline" value={pipeline?.id ?? ''} onChange={e => cargarPipeline(Number(e.target.value), null)}>
              {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="etapa">Etapa</label>
            <select id="etapa" value={etapaId ?? ''} onChange={e => setEtapaId(Number(e.target.value))}>
              {pipeline?.stages.filter(s => !s.is_won && !s.is_lost).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        <div className="form-field full">
          <label htmlFor="propiedad">Propiedad (opcional)</label>
          {propiedad
            ? <p id="propiedad" className="form-valor">{propiedad.titulo} <button type="button" className="btn btn-outline btn-chico" onClick={() => setPropiedad(null)}>Quitar</button></p>
            : (
              <select id="propiedad" value="" onChange={e => elegirPropiedad(Number(e.target.value))}>
                <option value="">Sin propiedad</option>
                {propiedades.map(p => <option key={p.id} value={p.id}>{p.titulo}</option>)}
              </select>
            )}
        </div>

        <div className="form-field full">
          <label htmlFor="titulo">Título *</label>
          <input id="titulo" required value={titulo} onChange={e => setTitulo(e.target.value)} />
        </div>

        <div className="form-row">
          <div className="form-field" style={{ maxWidth: 100 }}>
            <label htmlFor="moneda">Moneda</label>
            <select id="moneda" value={moneda} onChange={e => setMoneda(e.target.value)}><option>ARS</option><option>USD</option></select>
          </div>
          <div className="form-field">
            <label htmlFor="monto">Monto</label>
            <input id="monto" type="number" min={0} value={monto} onChange={e => setMonto(e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="asignado">Asignado a</label>
            <select id="asignado" value={asignado} onChange={e => setAsignado(e.target.value)}>
              <option value="">Nadie</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        </div>

        <h2 className="form-section-title">Partes</h2>
        <ul className="partes-lista">
          {partes.map((p, i) => (
            <li key={`${p.persona.id}-${p.rol}`}>
              <span>{p.persona.full_name}</span> <small>{LABEL_ROL_PARTE[p.rol]}</small>
              <button type="button" className="btn btn-outline btn-chico" onClick={() => setPartes(ps => ps.filter((_, j) => j !== i))}>Quitar</button>
            </li>
          ))}
        </ul>
        <div className="form-row">
          <div className="form-field"><SelectorPersona valor={nuevaParte} onChange={setNuevaParte} label="Agregar parte" /></div>
          <div className="form-field" style={{ maxWidth: 160 }}>
            <label htmlFor="rol">Rol</label>
            <select id="rol" value={nuevoRol} onChange={e => setNuevoRol(e.target.value as RolParte)}>
              {ROLES_PARTE.map(r => <option key={r} value={r}>{LABEL_ROL_PARTE[r]}</option>)}
            </select>
          </div>
          <button type="button" className="btn btn-outline" onClick={agregarParte} disabled={!nuevaParte}>Agregar</button>
        </div>

        <div className="form-field full">
          <label htmlFor="notas">Notas</label>
          <textarea id="notas" rows={3} value={notas} onChange={e => setNotas(e.target.value)} />
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-magenta" disabled={guardando}>Crear operación</button>
          <button type="button" className="btn btn-outline" onClick={() => navigate(-1)}>Cancelar</button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 3: Ficha**

```tsx
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { operacionesApi } from '../../../api/operaciones'
import { usuariosApi } from '../../../api/usuarios'
import type { Operacion, Pipeline, RolParte } from '../../../types/operacion'
import type { PersonaBrief } from '../../../types/persona'
import type { UsuarioBrief } from '../../../types/inmobiliaria'
import SelectorPersona from '../../../components/crm/SelectorPersona/SelectorPersona'
import Badge from '../../../components/Badge'
import { formatearFecha, formatearMonto } from '../../../lib/formato'
import { LABEL_ROL_PARTE, ROLES_PARTE } from '../../../lib/crm'
import './Ficha.css'

export default function OperacionFicha() {
  const { id } = useParams()
  const navigate = useNavigate()
  const opId = Number(id)
  const [op, setOp] = useState<Operacion | null>(null)
  const [pipeline, setPipeline] = useState<Pipeline | null>(null)
  const [usuarios, setUsuarios] = useState<UsuarioBrief[]>([])
  const [nuevaParte, setNuevaParte] = useState<PersonaBrief | null>(null)
  const [nuevoRol, setNuevoRol] = useState<RolParte>('comprador')
  const [error, setError] = useState<string | null>(null)

  const cargar = () => {
    operacionesApi.obtener(opId)
      .then(async o => { setOp(o); setPipeline(await operacionesApi.pipeline(o.pipeline_id)) })
      .catch(e => setError(e.message))
  }

  useEffect(() => { cargar(); usuariosApi.listar().then(setUsuarios).catch(() => setUsuarios([])) }, [opId]) // eslint-disable-line

  const intentar = async (fn: () => Promise<unknown>) => {
    setError(null)
    try { await fn(); cargar() } catch (e: unknown) { setError(e instanceof Error ? e.message : 'No se pudo') }
  }

  if (error && !op) return <p className="lista-estado lista-error">{error}</p>
  if (!op || !pipeline) return <p className="lista-estado">Cargando...</p>

  const etapa = pipeline.stages.find(s => s.id === op.stage_id)

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <span className="section-label">{pipeline.name}</span>
          <h1>{op.title}</h1>
        </div>
        <button className="btn btn-danger" onClick={() => { if (window.confirm('¿Eliminar la operación?')) intentar(async () => { await operacionesApi.eliminar(op.id); navigate('/admin/operaciones') }) }}>
          Eliminar
        </button>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="ficha-op-grilla">
        <section className="admin-card">
          <h2 className="form-section-title">Estado</h2>
          <div className="form-field">
            <label htmlFor="etapa">Etapa</label>
            <select id="etapa" value={op.stage_id} onChange={e => intentar(() => operacionesApi.moverEtapa(op.id, Number(e.target.value)))}>
              {pipeline.stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <p className="form-hint">{op.dias_en_etapa} días en {etapa?.name ?? 'la etapa'}{op.closed_at ? ` · cerrada el ${formatearFecha(op.closed_at)}` : ''}</p>
          </div>
          <dl className="ficha-op-datos">
            <dt>Propiedad</dt>
            <dd>{op.propiedad ? <><Link to={`/admin/propiedades/${op.propiedad.id}/editar`}>{op.propiedad.titulo}</Link> <Badge value={op.propiedad.estado_comercial} /></> : '—'}</dd>
            <dt>Monto</dt>
            <dd>{formatearMonto(op.amount, op.currency)}</dd>
            <dt>Asignado a</dt>
            <dd>
              <select aria-label="Asignado a" value={op.assigned_to_user_id ?? ''} onChange={e => intentar(() => operacionesApi.editar(op.id, { assigned_to_user_id: e.target.value ? Number(e.target.value) : undefined }))}>
                <option value="">Nadie</option>
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </dd>
          </dl>
          {op.notes && <p className="ficha-op-notas">{op.notes}</p>}
        </section>

        <section className="admin-card">
          <h2 className="form-section-title">Partes</h2>
          <ul className="partes-lista">
            {op.parties.map(p => (
              <li key={p.id}>
                <Link to={`/admin/personas/${p.person.id}`}>{p.person.full_name}</Link> <small>{LABEL_ROL_PARTE[p.role]}</small>
                <button type="button" className="btn btn-outline btn-chico" onClick={() => intentar(() => operacionesApi.quitarParte(op.id, p.id))}>Quitar</button>
              </li>
            ))}
            {op.parties.length === 0 && <li className="ficha-op-vacio">Sin partes</li>}
          </ul>
          <div className="form-row">
            <div className="form-field"><SelectorPersona valor={nuevaParte} onChange={setNuevaParte} label="Agregar parte" /></div>
            <div className="form-field" style={{ maxWidth: 160 }}>
              <label htmlFor="rol">Rol</label>
              <select id="rol" value={nuevoRol} onChange={e => setNuevoRol(e.target.value as RolParte)}>
                {ROLES_PARTE.map(r => <option key={r} value={r}>{LABEL_ROL_PARTE[r]}</option>)}
              </select>
            </div>
            <button type="button" className="btn btn-outline" disabled={!nuevaParte} onClick={() => nuevaParte && intentar(async () => { await operacionesApi.agregarParte(op.id, { person_id: nuevaParte.id, role: nuevoRol }); setNuevaParte(null) })}>
              Agregar
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
```

`Ficha.css`: `.ficha-op-grilla { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.25rem; } .ficha-op-datos { display: grid; grid-template-columns: auto 1fr; gap: 0.4rem 1rem; margin: 1rem 0 0; } .ficha-op-datos dt { color: var(--text-muted); font-size: 0.85rem; } .ficha-op-datos dd { margin: 0; } .ficha-op-notas { white-space: pre-wrap; margin-top: 1rem; } .partes-lista { list-style: none; margin: 0 0 1rem; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; } .partes-lista li { display: flex; gap: 0.6rem; align-items: center; } .ficha-op-vacio { color: var(--text-muted); } @media (max-width: 860px) { .ficha-op-grilla { grid-template-columns: 1fr; } }`

Rutas en `App.tsx`, dentro de `operaciones`: `<Route path="nueva" element={<OperacionFormulario />} />` y `<Route path=":id" element={<OperacionFicha />} />`.

- [ ] **Step 4: Verificar y commitear**

Run: `cd client && npm test && npx tsc --noEmit`

```bash
git add client/src
git commit -m "feat(client): ficha y alta de operaciones con partes"
```

---

### Task 22: Dashboard y configuración de la inmobiliaria

**Files:**
- Modify: `client/src/pages/admin/Dashboard.tsx`
- Create: `client/src/pages/admin/configuracion/Configuracion.tsx`, `Configuracion.test.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Test que falla** (`Configuracion.test.tsx`)

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Configuracion from './Configuracion'
import { inmobiliariaApi } from '../../../api/inmobiliaria'

vi.mock('../../../api/inmobiliaria', () => ({
  inmobiliariaApi: { obtener: vi.fn(), actualizar: vi.fn(), subirLogo: vi.fn() },
}))

const INMO = {
  id: 1, nombre: 'Mambo Groups', logo_url: null, telefono: null, email: null, cuit: null, direccion: null,
  honorarios_venta_pct: null, honorarios_alquiler_pct: null, actualizado_en: '',
}

it('carga los datos y guarda los cambios', async () => {
  const usuario = userEvent.setup()
  vi.mocked(inmobiliariaApi.obtener).mockResolvedValue(INMO)
  vi.mocked(inmobiliariaApi.actualizar).mockResolvedValue({ ...INMO, honorarios_venta_pct: 3 })
  render(<Configuracion />)

  expect(await screen.findByDisplayValue('Mambo Groups')).toBeInTheDocument()
  await usuario.type(screen.getByLabelText('Honorarios de venta (%)'), '3')
  await usuario.click(screen.getByRole('button', { name: 'Guardar' }))

  await waitFor(() => expect(inmobiliariaApi.actualizar).toHaveBeenCalledWith(expect.objectContaining({ honorarios_venta_pct: 3 })))
  expect(await screen.findByText('Guardado')).toBeInTheDocument()
})
```

- [ ] **Step 2: Configuración**

```tsx
import { useEffect, useState } from 'react'
import { inmobiliariaApi } from '../../../api/inmobiliaria'
import type { Inmobiliaria } from '../../../types/inmobiliaria'

type Campo = 'nombre' | 'telefono' | 'email' | 'cuit' | 'direccion' | 'honorarios_venta_pct' | 'honorarios_alquiler_pct'

const CAMPOS: { campo: Campo; label: string; tipo?: string }[] = [
  { campo: 'nombre', label: 'Nombre' },
  { campo: 'telefono', label: 'Teléfono' },
  { campo: 'email', label: 'Email', tipo: 'email' },
  { campo: 'cuit', label: 'CUIT' },
  { campo: 'direccion', label: 'Dirección' },
  { campo: 'honorarios_venta_pct', label: 'Honorarios de venta (%)', tipo: 'number' },
  { campo: 'honorarios_alquiler_pct', label: 'Honorarios de alquiler (%)', tipo: 'number' },
]

export default function Configuracion() {
  const [datos, setDatos] = useState<Inmobiliaria | null>(null)
  const [form, setForm] = useState<Record<Campo, string>>({ nombre: '', telefono: '', email: '', cuit: '', direccion: '', honorarios_venta_pct: '', honorarios_alquiler_pct: '' })
  const [estado, setEstado] = useState<'idle' | 'guardando' | 'guardado'>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    inmobiliariaApi.obtener().then(i => {
      setDatos(i)
      setForm({
        nombre: i.nombre, telefono: i.telefono ?? '', email: i.email ?? '', cuit: i.cuit ?? '', direccion: i.direccion ?? '',
        honorarios_venta_pct: i.honorarios_venta_pct === null ? '' : String(i.honorarios_venta_pct),
        honorarios_alquiler_pct: i.honorarios_alquiler_pct === null ? '' : String(i.honorarios_alquiler_pct),
      })
    }).catch(e => setError(e.message))
  }, [])

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setEstado('guardando')
    setError(null)
    try {
      const actualizado = await inmobiliariaApi.actualizar({
        nombre: form.nombre, telefono: form.telefono || undefined, email: form.email || undefined,
        cuit: form.cuit || undefined, direccion: form.direccion || undefined,
        honorarios_venta_pct: form.honorarios_venta_pct ? Number(form.honorarios_venta_pct) : undefined,
        honorarios_alquiler_pct: form.honorarios_alquiler_pct ? Number(form.honorarios_alquiler_pct) : undefined,
      })
      setDatos(actualizado)
      setEstado('guardado')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
      setEstado('idle')
    }
  }

  const subirLogo = async (archivo: File | undefined) => {
    if (!archivo) return
    setError(null)
    try { setDatos(await inmobiliariaApi.subirLogo(archivo)) } catch (err: unknown) { setError(err instanceof Error ? err.message : 'No se pudo subir el logo') }
  }

  return (
    <div>
      <div className="admin-page-header"><h1>Configuración</h1></div>
      {error && <p className="form-error" role="alert">{error}</p>}

      <form onSubmit={guardar} className="admin-card form">
        <h2 className="form-section-title">Inmobiliaria</h2>
        {CAMPOS.map(({ campo, label, tipo }) => (
          <div key={campo} className="form-field">
            <label htmlFor={campo}>{label}</label>
            <input id={campo} type={tipo ?? 'text'} step={tipo === 'number' ? '0.01' : undefined} value={form[campo]} onChange={e => { setForm(f => ({ ...f, [campo]: e.target.value })); setEstado('idle') }} />
          </div>
        ))}

        <h2 className="form-section-title">Logo</h2>
        {datos?.logo_url && <img src={datos.logo_url} alt="Logo" style={{ maxHeight: 80, marginBottom: '0.5rem' }} />}
        <div className="form-field">
          <label htmlFor="logo">Subir logo</label>
          <input id="logo" type="file" accept="image/*" onChange={e => subirLogo(e.target.files?.[0])} />
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-magenta" disabled={estado === 'guardando'}>Guardar</button>
          {estado === 'guardado' && <span className="form-hint">Guardado</span>}
        </div>
      </form>
    </div>
  )
}
```

Ruta: `<Route path="configuracion" element={<Configuracion />} />`. La visibilidad por rol ya la maneja el menú; el backend devuelve 403 al `PUT` si no es admin y el formulario lo muestra.

- [ ] **Step 3: Dashboard**

En `Dashboard.tsx`, sumar `reservasApi.listar({ status: 'activa', limit: 200 })` y `operacionesApi.listar({ is_closed: false, limit: 1 })` en el `useEffect`, y tres tiles:

```tsx
        <StatTile label="Reservas activas" valor={reservasActivas.length} tono="espera" />
        <StatTile label="Vencen esta semana" valor={reservasActivas.filter(r => { const d = diasHasta(r.expires_at); return d !== null && d >= 0 && d <= 7 }).length} tono="espera" />
        <StatTile label="Operaciones abiertas" valor={operacionesAbiertas} tono="ok" />
```

(`operacionesAbiertas` sale del `total` del paginado). Si `Dashboard` tiene test, mockear las dos APIs nuevas.

- [ ] **Step 4: Verificar y commitear**

Run: `cd client && npm test && npx tsc --noEmit`

```bash
git add client/src
git commit -m "feat(client): configuración de la inmobiliaria y tiles del CRM en el dashboard"
```

---

### Task 23: Verificación final

- [ ] `cd src && python -m pytest tests/ -q && ruff check . && ruff format --check .`
- [ ] `cd client && npm test && npx tsc --noEmit && npm run build`
- [ ] Con backend y frontend levantados (`uvicorn app.main:app --reload --port 8000` y `npm run dev`), recorrer a mano el flujo de la spec §8: crear persona → cargarla como dueña de una propiedad → reservar esa propiedad (queda `reservada`) → convertir → ganar la operación (queda `cerrada`, la reserva `convertida`) → en la ficha de la persona aparecen "Propietario · 1" y "Comprador · 1". Probar también el 409 al poner `disponible` a mano una propiedad reservada.
- [ ] Revisar el panel a 400px de ancho: tablero con scroll horizontal, ficha en una columna, tablas en tarjetas.
- [ ] Actualizar `docs/despliegue.md` con la nota: antes de `alembic upgrade head` para `0004`, correr las cuatro consultas de referencias huérfanas del docstring de la migración.
- [ ] Commit final: `docs: notas de despliegue de la migración 0004`.
