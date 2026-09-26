# Actividades y agenda (Bloque 5a) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el backend de `activities` (vínculo a operación, validación de existencia, cobertura de tests) y construir la pantalla `/admin/actividades` del panel: filtros, alta, listado y cambios de estado.

**Architecture:** El backend de `activities` (`src/app/platform/activities/`) ya existe con CRUD completo; se le suma `deal_id`, validación de las tres FKs opcionales reusando los `get_*_or_404` de `people`, `propiedades` y `deals`, y una cobertura de tests que hoy no tiene ninguna. En el panel, una única pantalla `pages/admin/actividades/Lista.tsx` (filtros + alta inline + tabla) y un componente nuevo `SelectorOperacion` (calco de `SelectorPropiedad`).

**Tech Stack:** FastAPI + SQLAlchemy 2.0 + Alembic + pytest (SQLite en memoria) en `src/`; React + TypeScript + Vite + vitest + Testing Library en `client/`.

**Spec:** [docs/superpowers/specs/2026-09-21-actividades-agenda-design.md](../specs/2026-09-21-actividades-agenda-design.md)

## Global Constraints

- **No hacer `git commit` ni `git push`.** Todo queda en el working tree; Matías commitea. Los pasos "Commit" de este plan se reemplazan por "anotar los archivos tocados".
- Código, comentarios, docstrings y mensajes de API **en español**.
- Backend se ejecuta desde `src/` (`cd src`); `ruff check .` limpio en los archivos nuevos/tocados (line-length 100, reglas E/F/I/B/UP). `ruff format --check` solo sobre esos mismos archivos.
- Frontend: los tests corren con `npx vitest run --pool=threads <ruta>` desde `client/` (el pool `forks` cuelga en Windows).
- `Activity.deal_id` usa `ondelete=SET NULL` (no `CASCADE`): una actividad sigue existiendo si se borra la operación.
- Cualquier combinación de `person_id`/`property_id`/`deal_id` es válida, incluida ninguna (tarea general) — no se valida cardinalidad, solo existencia de las que vengan cargadas.
- `listing_id` no se toca ni se expone en el panel.
- `activities.models` y `activities.router` ya están registrados en `app/main.py` y en `alembic/env.py` (verificado: no hacen falta cambios ahí). `tests/conftest.py` tampoco necesita un import nuevo: `Activity` ya queda registrada en `Base.metadata` al importar `app.main` (cadena `router → service → models`), igual que ocurre hoy sin tests para el módulo.

---

## Estructura de archivos

**Backend (crear):**
- `src/alembic/versions/0010_activities_deal_id.py`.
- `src/tests/test_activities.py`.

**Backend (modificar):**
- `src/app/platform/activities/models.py` — `deal_id`, relaciones `deal` y `property`.
- `src/app/platform/activities/schemas.py` — `deal_id`, `DealBrief`, reusar `PropiedadBrief` y `UserBrief`.
- `src/app/platform/activities/service.py` — `_validar_entidades`, filtro `deal_id`.
- `src/app/platform/activities/router.py` — query param `deal_id`.
- `docs/despliegue.md` — nota de la migración 0010.

**Frontend (crear):**
- `client/src/types/actividad.ts`
- `client/src/api/actividades.ts` + `client/src/api/actividades.test.ts`
- `client/src/components/crm/SelectorOperacion/SelectorOperacion.tsx`, `.css`, `.test.tsx`
- `client/src/components/Badge.test.tsx`
- `client/src/pages/admin/actividades/Lista.tsx` + `Lista.test.tsx`

**Frontend (modificar):**
- `client/src/lib/formato.ts` + `formato.test.ts` — `formatearFechaHora`.
- `client/src/components/Badge.tsx` — mapear `hecha` y `cancelada`.
- `client/src/layouts/AdminLayout.tsx` — ítem de nav "Actividades".
- `client/src/App.tsx` — ruta `/admin/actividades`.

---

### Task 1: `deal_id` en `Activity` y migración `0010_activities_deal_id`

**Files:**
- Modify: `src/app/platform/activities/models.py:44-65`
- Create: `src/alembic/versions/0010_activities_deal_id.py`
- Test: `src/tests/test_activities.py` (nuevo)

**Interfaces:**
- Produces: `Activity.deal_id: int | None`, `Activity.deal` (relationship a `Deal`).

- [ ] **Step 1: Crear el test que falla**

`src/tests/test_activities.py`:

```python
"""Bloque 5a: actividades y agenda — CRUD, vínculos opcionales y cambios de estado."""

import pytest

from app.platform.activities.models import Activity
from tests.helpers_crm import crear_persona, etapa, pipeline_por_nombre


@pytest.fixture
def sesion(client, crear_usuario, iniciar_sesion):
    usuario = crear_usuario()
    iniciar_sesion()
    return usuario


def _crear_deal(client, db) -> int:
    p = pipeline_por_nombre(db, "Venta")
    r = client.post(
        "/api/v1/deals",
        json={
            "title": "Op",
            "pipeline_id": p.id,
            "stage_id": etapa(p, "Consulta").id,
            "amount": 1000000,
            "parties": [{"person_id": crear_persona(db).id, "role": "comprador"}],
        },
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_modelo_activity_se_persiste_con_deal_id(client, db, sesion):
    deal_id = _crear_deal(client, db)
    actividad = Activity(
        title="Llamar por seña",
        activity_type="llamada",
        deal_id=deal_id,
        created_by_user_id=sesion.id,
    )
    db.add(actividad)
    db.commit()
    db.refresh(actividad)

    assert actividad.id is not None
    assert actividad.deal_id == deal_id
    assert actividad.deal.id == deal_id
    assert actividad.status == "pendiente"
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd src && python -m pytest tests/test_activities.py -q`
Expected: `TypeError: 'deal_id' is an invalid keyword argument for Activity`

- [ ] **Step 3: Agregar la columna y la relación**

En `src/app/platform/activities/models.py`, después de `property_id` (línea ~47) y antes de `listing_id`:

```python
    deal_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("deals.id", ondelete="SET NULL"), nullable=True, index=True
    )
```

Y en el bloque de relaciones (después de `person`, línea ~65):

```python
    deal: Mapped[object | None] = relationship("Deal", foreign_keys=[deal_id])
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd src && python -m pytest tests/test_activities.py -q`
Expected: `1 passed` — el esquema de los tests se arma desde los modelos (`Base.metadata.create_all`), así que alcanza con el cambio en `models.py`; la migración es para Postgres.

- [ ] **Step 5: Escribir la migración**

`src/alembic/versions/0010_activities_deal_id.py`:

```python
"""Bloque 5a: activities.deal_id, para colgar una actividad de una operación

Columna nullable con ondelete=SET NULL: una actividad sigue existiendo si se
borra la operación a la que estaba ligada. `activities` está vacía en Supabase
al momento de esta migración (verificado el 21/09/2026), sin backfill.

Revision ID: 0010_activities_deal_id
Revises: 0009_documentos
Create Date: 2026-09-21

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0010_activities_deal_id"
down_revision: str | None = "0009_documentos"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "activities",
        sa.Column(
            "deal_id",
            sa.Integer(),
            sa.ForeignKey("deals.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_activities_deal_id", "activities", ["deal_id"])


def downgrade() -> None:
    op.drop_index("ix_activities_deal_id", table_name="activities")
    op.drop_column("activities", "deal_id")
```

- [ ] **Step 6: Lint**

Run: `cd src && ruff check app/platform/activities/models.py alembic/versions/0010_activities_deal_id.py tests/test_activities.py && ruff format --check app/platform/activities/models.py alembic/versions/0010_activities_deal_id.py tests/test_activities.py`
Expected: `All checks passed!` y `N files already formatted`. Si `format --check` falla, correr `ruff format` sobre esos mismos archivos.

- [ ] **Step 7: Anotar archivos tocados (sin commit)**

`src/app/platform/activities/models.py`, `src/alembic/versions/0010_activities_deal_id.py`, `src/tests/test_activities.py`.

---

### Task 2: Validación de existencia, schemas enriquecidos y filtro `deal_id`

**Files:**
- Modify: `src/app/platform/activities/models.py` (relación `property`)
- Modify: `src/app/platform/activities/schemas.py`
- Modify: `src/app/platform/activities/service.py`
- Modify: `src/app/platform/activities/router.py`
- Test: `src/tests/test_activities.py`

**Interfaces:**
- Consumes: `Activity.deal` (Task 1); `app.platform.people.service.get_person_or_404`, `app.modules.propiedades.service.obtener_propiedad`, `app.platform.deals.service.get_deal_or_404` (todos levantan `HTTPException(404)`); `app.modules.propiedades.schemas.PropiedadBrief`; `app.platform.auth.schemas.UserBrief`.
- Produces: `service._validar_entidades(db, *, person_id, property_id, deal_id) -> None`; `schemas.DealBrief`; `ActivityOut.deal: DealBrief | None`, `ActivityOut.property: PropiedadBrief | None`, `ActivityOut.assigned_to/created_by: UserBrief` (ahora con `name`); filtro `deal_id` en `service.list_activities` y en `GET /activities`.

**Por qué se toca esto ahora:** el mockup de la pantalla (spec, sección 5.3) muestra el nombre del asignado ("Ana P.") y el título de la propiedad vinculada — el `UserBrief` local de `activities` solo tenía `id`/`email`, y `property_id` era un entero suelto sin título. Se reusa el `UserBrief` de `auth.schemas` (que ya tiene `name`) y se agrega la relación `property` con el mismo `PropiedadBrief` que ya usa `modules/propiedades`, en vez de inventar una versión nueva.

- [ ] **Step 1: Agregar los tests que fallan**

Agregar a `src/tests/test_activities.py` (sumar `from app.modules.propiedades.schemas import PropiedadBrief` no hace falta en el test; sumar `crear_propiedad` al import de `helpers_crm`):

```python
from tests.helpers_crm import crear_persona, crear_propiedad, etapa, pipeline_por_nombre
```

```python
API = "/api/v1/activities"


def test_crear_con_person_id_inexistente_404(client, db, sesion):
    r = client.post(API, json={"title": "Llamar", "activity_type": "llamada", "person_id": 9999})
    assert r.status_code == 404
    assert r.json()["detail"] == "Persona no encontrada"


def test_crear_con_property_id_inexistente_404(client, db, sesion):
    r = client.post(API, json={"title": "Visitar", "activity_type": "visita", "property_id": 9999})
    assert r.status_code == 404
    assert r.json()["detail"] == "Propiedad no encontrada"


def test_crear_con_deal_id_inexistente_404(client, db, sesion):
    r = client.post(API, json={"title": "Seguimiento", "activity_type": "tarea", "deal_id": 9999})
    assert r.status_code == 404
    assert r.json()["detail"] == "Deal no encontrado"


def test_editar_con_deal_id_inexistente_404(client, db, sesion):
    r = client.post(API, json={"title": "Tarea", "activity_type": "tarea"})
    activity_id = r.json()["id"]
    r = client.patch(f"{API}/{activity_id}", json={"deal_id": 9999})
    assert r.status_code == 404
    assert r.json()["detail"] == "Deal no encontrado"


def test_crear_con_deal_id_valido_lo_persiste_y_lo_expone(client, db, sesion):
    deal_id = _crear_deal(client, db)
    r = client.post(API, json={"title": "Firma", "activity_type": "tarea", "deal_id": deal_id})
    assert r.status_code == 201, r.text
    cuerpo = r.json()
    assert cuerpo["deal"] == {"id": deal_id, "title": "Op"}


def test_listar_filtra_por_deal_id(client, db, sesion):
    deal_a = _crear_deal(client, db)
    deal_b = _crear_deal(client, db)
    client.post(API, json={"title": "A", "activity_type": "tarea", "deal_id": deal_a})
    client.post(API, json={"title": "B", "activity_type": "tarea", "deal_id": deal_b})

    r = client.get(f"{API}?deal_id={deal_a}")
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["title"] == "A"


def test_activity_out_expone_asignado_con_nombre_y_propiedad_con_titulo(client, db, sesion):
    prop = crear_propiedad(db, titulo="Casa en Villa Elisa")
    r = client.post(
        API,
        json={
            "title": "Mostrar casa",
            "activity_type": "visita",
            "property_id": prop.id,
            "assigned_to_user_id": sesion.id,
        },
    )
    assert r.status_code == 201, r.text
    cuerpo = r.json()
    assert cuerpo["assigned_to"] == {"id": sesion.id, "name": sesion.name, "email": sesion.email}
    assert cuerpo["property"]["id"] == prop.id
    assert cuerpo["property"]["titulo"] == "Casa en Villa Elisa"
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd src && python -m pytest tests/test_activities.py -q`
Expected: los tests de 404 fallan porque hoy no hay validación (la fila se crea igual, o revienta con 500 al armar `property`/`deal` en la respuesta si esos campos no existen aún en el schema); los de `deal`/`property`/`assigned_to` fallan porque `ActivityOut` no tiene esos campos todavía.

- [ ] **Step 3: Agregar la relación `property` al modelo**

En `src/app/platform/activities/models.py`, junto a la relación `deal` agregada en la Task 1:

```python
    property: Mapped[object | None] = relationship("Propiedad", foreign_keys=[property_id])
```

- [ ] **Step 4: Reescribir `schemas.py`**

`src/app/platform/activities/schemas.py` completo:

```python
"""Schemas Pydantic para el módulo activities."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.modules.propiedades.schemas import PropiedadBrief
from app.platform.auth.schemas import UserBrief

ActivityType = Literal["llamada", "visita", "tarea", "whatsapp", "email", "otro"]
ActivityStatus = Literal["pendiente", "hecha", "cancelada"]


# ---------------------------------------------------------------------------
# Base y mutaciones
# ---------------------------------------------------------------------------


class ActivityCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    activity_type: ActivityType
    description: str | None = None
    due_at: datetime | None = None

    assigned_to_user_id: int | None = None
    person_id: int | None = None
    property_id: int | None = None
    deal_id: int | None = None
    listing_id: int | None = None


class ActivityUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    activity_type: ActivityType | None = None
    description: str | None = None
    due_at: datetime | None = None
    assigned_to_user_id: int | None = None
    person_id: int | None = None
    property_id: int | None = None
    deal_id: int | None = None
    listing_id: int | None = None


# ---------------------------------------------------------------------------
# Respuestas
# ---------------------------------------------------------------------------


class PersonBrief(BaseModel):
    id: int
    full_name: str

    model_config = {"from_attributes": True}


class DealBrief(BaseModel):
    id: int
    title: str

    model_config = {"from_attributes": True}


class ActivityOut(BaseModel):
    id: int
    title: str
    activity_type: str
    status: str
    description: str | None
    due_at: datetime | None
    done_at: datetime | None
    assigned_to: UserBrief | None
    created_by: UserBrief
    person: PersonBrief | None
    property: PropiedadBrief | None
    deal: DealBrief | None
    listing_id: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PaginatedActivities(BaseModel):
    total: int
    items: list[ActivityOut]
```

- [ ] **Step 5: Validación de existencia y filtro en `service.py`**

En `src/app/platform/activities/service.py`, agregar los imports (orden alfabético) y la función de validación antes de `list_activities`:

```python
from app.modules.propiedades.service import obtener_propiedad
from app.platform.deals.service import get_deal_or_404
from app.platform.people.service import get_person_or_404


def _validar_entidades(
    db: DBSession, *, person_id: int | None, property_id: int | None, deal_id: int | None
) -> None:
    """Si vienen cargadas, deben existir. Cualquier combinación es válida, o ninguna."""
    if person_id is not None:
        get_person_or_404(db, person_id)
    if property_id is not None:
        obtener_propiedad(db, property_id)
    if deal_id is not None:
        get_deal_or_404(db, deal_id)
```

Agregar `deal_id` a `list_activities` (parámetro y filtro):

```python
def list_activities(
    db: DBSession,
    *,
    person_id: int | None = None,
    assigned_to_user_id: int | None = None,
    activity_status: str | None = None,
    activity_type: str | None = None,
    property_id: int | None = None,
    deal_id: int | None = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[int, list[Activity]]:
    q = db.query(Activity)

    if person_id is not None:
        q = q.filter(Activity.person_id == person_id)
    if assigned_to_user_id is not None:
        q = q.filter(Activity.assigned_to_user_id == assigned_to_user_id)
    if activity_status is not None:
        q = q.filter(Activity.status == activity_status)
    if activity_type is not None:
        q = q.filter(Activity.activity_type == activity_type)
    if property_id is not None:
        q = q.filter(Activity.property_id == property_id)
    if deal_id is not None:
        q = q.filter(Activity.deal_id == deal_id)

    total = q.count()
    items = (
        q.order_by(Activity.due_at.asc().nullslast(), Activity.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return total, items
```

Llamar `_validar_entidades` al principio de `create_activity` y de `update_activity` (después del chequeo de `status == "hecha"` en este último):

```python
def create_activity(db: DBSession, data: ActivityCreate, created_by_user_id: int) -> Activity:
    _validar_entidades(
        db, person_id=data.person_id, property_id=data.property_id, deal_id=data.deal_id
    )
    activity = Activity(
        **data.model_dump(),
        created_by_user_id=created_by_user_id,
        status="pendiente",
    )
    db.add(activity)
    db.commit()
    db.refresh(activity)
    return activity


def update_activity(db: DBSession, activity_id: int, data: ActivityUpdate) -> Activity:
    activity = get_activity_or_404(db, activity_id)

    if activity.status == "hecha":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se puede editar una actividad ya completada",
        )
    _validar_entidades(
        db, person_id=data.person_id, property_id=data.property_id, deal_id=data.deal_id
    )

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(activity, field, value)

    activity.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(activity)
    return activity
```

- [ ] **Step 6: Query param `deal_id` en `router.py`**

En `src/app/platform/activities/router.py`, en `list_activities`:

```python
@router.get("", response_model=PaginatedActivities)
def list_activities(
    person_id: int | None = Query(default=None),
    assigned_to_user_id: int | None = Query(default=None),
    activity_status: str | None = Query(default=None, alias="status"),
    activity_type: str | None = Query(default=None, alias="type"),
    property_id: int | None = Query(default=None),
    deal_id: int | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: DBSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> PaginatedActivities:
    total, items = service.list_activities(
        db,
        person_id=person_id,
        assigned_to_user_id=assigned_to_user_id,
        activity_status=activity_status,
        activity_type=activity_type,
        property_id=property_id,
        deal_id=deal_id,
        skip=skip,
        limit=limit,
    )
    return PaginatedActivities(
        total=total,
        items=[ActivityOut.model_validate(a) for a in items],
    )
```

- [ ] **Step 7: Correr los tests**

Run: `cd src && python -m pytest tests/test_activities.py -q`
Expected: todos pasan.

- [ ] **Step 8: Lint**

Run: `cd src && ruff check app/platform/activities tests/test_activities.py && ruff format --check app/platform/activities tests/test_activities.py`
Expected: limpio.

- [ ] **Step 9: Anotar archivos tocados (sin commit)**

`src/app/platform/activities/models.py`, `schemas.py`, `service.py`, `router.py`, `src/tests/test_activities.py`.

---

### Task 3: Cobertura completa del CRUD, estados y permisos existentes

**Files:**
- Test: `src/tests/test_activities.py`

**Interfaces:**
- Consumes: todo lo de las Tasks 1 y 2. Sin cambios de producción en esta task — es la cobertura que le faltaba al módulo desde que se escribió.

- [ ] **Step 1: Agregar los tests**

Agregar al final de `src/tests/test_activities.py`:

```python
# ---------------------------------------------------------------------------
# CRUD base
# ---------------------------------------------------------------------------


def test_crear_actividad_minima(client, db, sesion):
    r = client.post(API, json={"title": "Llamar a Fernández", "activity_type": "llamada"})
    assert r.status_code == 201, r.text
    cuerpo = r.json()
    assert cuerpo["status"] == "pendiente"
    assert cuerpo["person"] is None
    assert cuerpo["property"] is None
    assert cuerpo["deal"] is None
    assert cuerpo["created_by"]["id"] == sesion.id


def test_crear_actividad_con_persona(client, db, sesion):
    persona = crear_persona(db, first_name="Fernanda", last_name="Gómez")
    r = client.post(
        API, json={"title": "Llamar", "activity_type": "llamada", "person_id": persona.id}
    )
    assert r.status_code == 201, r.text
    assert r.json()["person"] == {"id": persona.id, "full_name": "Fernanda Gómez"}


def test_obtener_actividad(client, db, sesion):
    creada = client.post(API, json={"title": "Tarea", "activity_type": "tarea"}).json()
    r = client.get(f"{API}/{creada['id']}")
    assert r.status_code == 200
    assert r.json()["id"] == creada["id"]


def test_obtener_actividad_inexistente_404(client, db, sesion):
    r = client.get(f"{API}/9999")
    assert r.status_code == 404
    assert r.json()["detail"] == "Actividad no encontrada"


def test_editar_actividad(client, db, sesion):
    creada = client.post(API, json={"title": "Tarea", "activity_type": "tarea"}).json()
    r = client.patch(f"{API}/{creada['id']}", json={"title": "Tarea actualizada"})
    assert r.status_code == 200
    assert r.json()["title"] == "Tarea actualizada"


def test_editar_actividad_hecha_409(client, db, sesion):
    creada = client.post(API, json={"title": "Tarea", "activity_type": "tarea"}).json()
    client.patch(f"{API}/{creada['id']}/done")
    r = client.patch(f"{API}/{creada['id']}", json={"title": "Otra cosa"})
    assert r.status_code == 409
    assert r.json()["detail"] == "No se puede editar una actividad ya completada"


def test_borrar_actividad(client, db, sesion):
    creada = client.post(API, json={"title": "Tarea", "activity_type": "tarea"}).json()
    r = client.delete(f"{API}/{creada['id']}")
    assert r.status_code == 204
    assert client.get(f"{API}/{creada['id']}").status_code == 404

    r = client.delete(f"{API}/{creada['id']}")
    assert r.status_code == 404
    assert r.json()["detail"] == "Actividad no encontrada"


# ---------------------------------------------------------------------------
# Cambios de estado
# ---------------------------------------------------------------------------


def test_marcar_hecha(client, db, sesion):
    creada = client.post(API, json={"title": "Tarea", "activity_type": "tarea"}).json()
    r = client.patch(f"{API}/{creada['id']}/done")
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["status"] == "hecha"
    assert cuerpo["done_at"] is not None


def test_marcar_hecha_dos_veces_409(client, db, sesion):
    creada = client.post(API, json={"title": "Tarea", "activity_type": "tarea"}).json()
    client.patch(f"{API}/{creada['id']}/done")
    r = client.patch(f"{API}/{creada['id']}/done")
    assert r.status_code == 409
    assert r.json()["detail"] == "La actividad ya está completada"


def test_cancelar_pendiente(client, db, sesion):
    creada = client.post(API, json={"title": "Tarea", "activity_type": "tarea"}).json()
    r = client.patch(f"{API}/{creada['id']}/cancel")
    assert r.status_code == 200
    assert r.json()["status"] == "cancelada"


def test_cancelar_no_pendiente_409(client, db, sesion):
    creada = client.post(API, json={"title": "Tarea", "activity_type": "tarea"}).json()
    client.patch(f"{API}/{creada['id']}/done")
    r = client.patch(f"{API}/{creada['id']}/cancel")
    assert r.status_code == 409
    assert r.json()["detail"] == "Solo se pueden cancelar actividades pendientes"


# ---------------------------------------------------------------------------
# Listado: filtros y orden
# ---------------------------------------------------------------------------


def test_listar_filtra_por_status_type_y_assigned_to(client, db, sesion):
    a = client.post(API, json={"title": "A", "activity_type": "llamada"}).json()
    b = client.post(
        API, json={"title": "B", "activity_type": "visita", "assigned_to_user_id": sesion.id}
    ).json()
    client.patch(f"{API}/{a['id']}/cancel")

    r = client.get(f"{API}?status=cancelada")
    assert [i["title"] for i in r.json()["items"]] == ["A"]

    r = client.get(f"{API}?type=visita")
    assert [i["title"] for i in r.json()["items"]] == ["B"]

    r = client.get(f"{API}?assigned_to_user_id={sesion.id}")
    assert [i["id"] for i in r.json()["items"]] == [b["id"]]


def test_listar_ordena_por_vencimiento_con_nulls_al_final(client, db, sesion):
    sin_vencimiento = client.post(API, json={"title": "Sin fecha", "activity_type": "tarea"}).json()
    lejos = client.post(
        API,
        json={
            "title": "Lejos",
            "activity_type": "tarea",
            "due_at": "2026-12-01T10:00:00Z",
        },
    ).json()
    cerca = client.post(
        API,
        json={
            "title": "Cerca",
            "activity_type": "tarea",
            "due_at": "2026-09-25T10:00:00Z",
        },
    ).json()

    r = client.get(API)
    ids = [i["id"] for i in r.json()["items"]]
    assert ids == [cerca["id"], lejos["id"], sin_vencimiento["id"]]


# ---------------------------------------------------------------------------
# Permisos
# ---------------------------------------------------------------------------


def test_anonimo_401_en_lectura_y_escritura(client, db):
    assert client.get(API).status_code == 401
    assert client.get(f"{API}/1").status_code == 401
    assert client.post(API, json={"title": "X", "activity_type": "tarea"}).status_code == 401
    assert client.patch(f"{API}/1", json={"title": "Y"}).status_code == 401
    assert client.delete(f"{API}/1").status_code == 401
    assert client.patch(f"{API}/1/done").status_code == 401
    assert client.patch(f"{API}/1/cancel").status_code == 401


def test_lectura_no_exige_rol_staff(client, db, crear_usuario, iniciar_sesion):
    """A diferencia de la escritura, `GET` solo exige sesión (`get_current_user`), no rol."""
    crear_usuario(email="curioso@mambo.com.ar", roles=("cliente",))
    iniciar_sesion(email="curioso@mambo.com.ar")
    assert client.get(API).status_code == 200


def test_escritura_sin_rol_suficiente_da_403(client, db, crear_usuario, iniciar_sesion):
    crear_usuario(email="curioso@mambo.com.ar", roles=("cliente",))
    iniciar_sesion(email="curioso@mambo.com.ar")

    assert client.post(API, json={"title": "X", "activity_type": "tarea"}).status_code == 403
    assert client.patch(f"{API}/1", json={"title": "Y"}).status_code == 403
    assert client.delete(f"{API}/1").status_code == 403
    assert client.patch(f"{API}/1/done").status_code == 403
    assert client.patch(f"{API}/1/cancel").status_code == 403
```

- [ ] **Step 2: Correr toda la suite del módulo**

Run: `cd src && python -m pytest tests/test_activities.py -q`
Expected: todos pasan.

- [ ] **Step 3: Correr la suite completa del backend**

Run: `cd src && python -m pytest tests/ -q`
Expected: todo verde.

- [ ] **Step 4: Lint**

Run: `cd src && ruff check app/platform/activities tests/test_activities.py && ruff format --check app/platform/activities tests/test_activities.py`
Expected: limpio.

- [ ] **Step 5: Nota en `docs/despliegue.md`**

Buscar la sección de migraciones pendientes (donde está la nota de `0009_documentos`) y agregar debajo:

```markdown
- `0010_activities_deal_id` (Bloque 5a): una columna nullable en `activities`, sin backfill ni variables nuevas.
```

- [ ] **Step 6: Anotar archivos tocados (sin commit)**

`src/tests/test_activities.py`, `docs/despliegue.md`.

---

### Task 4: Frontend — tipos, API y `formatearFechaHora`

**Files:**
- Create: `client/src/types/actividad.ts`
- Create: `client/src/api/actividades.ts`
- Create: `client/src/api/actividades.test.ts`
- Modify: `client/src/lib/formato.ts` (agregar al final)
- Modify: `client/src/lib/formato.test.ts` (agregar al final)

**Interfaces:**
- Consumes: `api` de `client/src/api/client.ts`, `construirQuery` de `lib/query.ts`, `Paginado<T>` de `types/persona.ts`, `PersonaBrief` de `types/persona.ts`, `PropiedadBrief` de `types/reserva.ts`, `UsuarioBrief` de `types/inmobiliaria.ts`.
- Produces:
  - `types/actividad.ts`: `TipoActividad`, `EstadoActividad`, `ETIQUETAS_TIPO_ACTIVIDAD: Record<TipoActividad, string>`, `OperacionBrief`, `Actividad`, `ActividadCreatePayload`, `ActividadUpdatePayload`.
  - `api/actividades.ts`: `actividadesApi.listar(params)`, `.crear(data)`, `.editar(id, data)`, `.marcarHecha(id)`, `.cancelar(id)`, `.eliminar(id)`, y `ListarActividadesParams`.
  - `lib/formato.ts`: `formatearFechaHora(iso: string | null): string`.

- [ ] **Step 1: Test de `formatearFechaHora` que falla**

Agregar al final de `client/src/lib/formato.test.ts`:

```ts
import { formatearFechaHora } from './formato'

describe('formatearFechaHora', () => {
  it('DD/MM/YYYY HH:mm en UTC, igual que formatearFecha pero con hora', () => {
    expect(formatearFechaHora(null)).toBe('—')
    expect(formatearFechaHora('2026-09-22T10:00:00Z')).toBe('22/09/2026 10:00')
    expect(formatearFechaHora('2026-01-05T09:05:00Z')).toBe('05/01/2026 09:05')
  })
})
```

(Si el archivo ya importa desde `./formato` arriba, sumar `formatearFechaHora` a ese import en vez de repetirlo.)

- [ ] **Step 2: Correr y ver que falla**

Run: `cd client && npx vitest run --pool=threads src/lib/formato.test.ts`
Expected: FAIL — `formatearFechaHora is not a function`.

- [ ] **Step 3: Implementar `formatearFechaHora`**

Agregar al final de `client/src/lib/formato.ts`:

```ts
/** `2026-09-22T10:00:00Z` → "22/09/2026 10:00". Mismo criterio UTC que `formatearFecha`. */
export function formatearFechaHora(iso: string | null): string {
  if (!iso) return '—'
  const fecha = new Date(iso)
  const hh = String(fecha.getUTCHours()).padStart(2, '0')
  const min = String(fecha.getUTCMinutes()).padStart(2, '0')
  return `${formatearFecha(iso)} ${hh}:${min}`
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `cd client && npx vitest run --pool=threads src/lib/formato.test.ts`
Expected: PASS.

- [ ] **Step 5: Tipos**

`client/src/types/actividad.ts`:

```ts
import type { PersonaBrief } from './persona'
import type { PropiedadBrief } from './reserva'
import type { UsuarioBrief } from './inmobiliaria'

export type TipoActividad = 'llamada' | 'visita' | 'tarea' | 'whatsapp' | 'email' | 'otro'
export type EstadoActividad = 'pendiente' | 'hecha' | 'cancelada'

export const TIPOS_ACTIVIDAD: TipoActividad[] = [
  'llamada', 'visita', 'tarea', 'whatsapp', 'email', 'otro',
]

export const ETIQUETAS_TIPO_ACTIVIDAD: Record<TipoActividad, string> = {
  llamada: 'Llamada',
  visita: 'Visita',
  tarea: 'Tarea',
  whatsapp: 'WhatsApp',
  email: 'Email',
  otro: 'Otro',
}

/** Lo mínimo de una operación para nombrarla y linkearla. */
export interface OperacionBrief {
  id: number
  title: string
}

export interface Actividad {
  id: number
  title: string
  activity_type: TipoActividad
  status: EstadoActividad
  description: string | null
  due_at: string | null
  done_at: string | null
  assigned_to: UsuarioBrief | null
  created_by: UsuarioBrief
  person: PersonaBrief | null
  property: PropiedadBrief | null
  deal: OperacionBrief | null
  created_at: string
  updated_at: string
}

export interface ActividadCreatePayload {
  title: string
  activity_type: TipoActividad
  description?: string | null
  due_at?: string | null
  assigned_to_user_id?: number | null
  person_id?: number | null
  property_id?: number | null
  deal_id?: number | null
}

export type ActividadUpdatePayload = Partial<ActividadCreatePayload>
```

- [ ] **Step 6: Test de la API que falla**

`client/src/api/actividades.test.ts`:

```ts
import { actividadesApi } from './actividades'
import { api } from './client'

vi.mock('./client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

beforeEach(() => vi.clearAllMocks())

it('listar sin params pega a la ruta base', async () => {
  vi.mocked(api.get).mockResolvedValue({ total: 0, items: [] })
  await actividadesApi.listar()
  expect(api.get).toHaveBeenCalledWith('/api/v1/activities')
})

it('listar con params arma la query', async () => {
  vi.mocked(api.get).mockResolvedValue({ total: 0, items: [] })
  await actividadesApi.listar({ deal_id: 9, status: 'pendiente' })
  expect(api.get).toHaveBeenCalledWith('/api/v1/activities?deal_id=9&status=pendiente')
})

it('crear postea el payload', async () => {
  vi.mocked(api.post).mockResolvedValue({})
  await actividadesApi.crear({ title: 'Llamar', activity_type: 'llamada', person_id: 3 })
  expect(api.post).toHaveBeenCalledWith('/api/v1/activities', {
    title: 'Llamar', activity_type: 'llamada', person_id: 3,
  })
})

it('marcarHecha pega al endpoint /done', async () => {
  vi.mocked(api.patch).mockResolvedValue({})
  await actividadesApi.marcarHecha(5)
  expect(api.patch).toHaveBeenCalledWith('/api/v1/activities/5/done')
})

it('cancelar pega al endpoint /cancel', async () => {
  vi.mocked(api.patch).mockResolvedValue({})
  await actividadesApi.cancelar(5)
  expect(api.patch).toHaveBeenCalledWith('/api/v1/activities/5/cancel')
})

it('eliminar pega al DELETE por id', async () => {
  vi.mocked(api.delete).mockResolvedValue(undefined)
  await actividadesApi.eliminar(5)
  expect(api.delete).toHaveBeenCalledWith('/api/v1/activities/5')
})
```

- [ ] **Step 7: Correr y ver que falla**

Run: `cd client && npx vitest run --pool=threads src/api/actividades.test.ts`
Expected: FAIL — no existe `./actividades`.

- [ ] **Step 8: Implementar la API**

`client/src/api/actividades.ts`:

```ts
import { api } from './client'
import { construirQuery } from '../lib/query'
import type {
  Actividad, ActividadCreatePayload, ActividadUpdatePayload, EstadoActividad, TipoActividad,
} from '../types/actividad'
import type { Paginado } from '../types/persona'

const BASE = '/api/v1/activities'

export interface ListarActividadesParams {
  person_id?: number
  property_id?: number
  deal_id?: number
  assigned_to_user_id?: number
  status?: EstadoActividad
  type?: TipoActividad
  skip?: number
  limit?: number
}

export const actividadesApi = {
  listar: (params: ListarActividadesParams = {}) =>
    api.get<Paginado<Actividad>>(`${BASE}${construirQuery(params)}`),

  crear: (data: ActividadCreatePayload) => api.post<Actividad>(BASE, data),
  editar: (id: number, data: ActividadUpdatePayload) => api.patch<Actividad>(`${BASE}/${id}`, data),
  marcarHecha: (id: number) => api.patch<Actividad>(`${BASE}/${id}/done`),
  cancelar: (id: number) => api.patch<Actividad>(`${BASE}/${id}/cancel`),
  eliminar: (id: number) => api.delete<void>(`${BASE}/${id}`),
}
```

- [ ] **Step 9: Correr y ver que pasa**

Run: `cd client && npx vitest run --pool=threads src/api/actividades.test.ts src/lib/formato.test.ts`
Expected: PASS.

- [ ] **Step 10: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 11: Anotar archivos tocados (sin commit)**

`client/src/types/actividad.ts`, `client/src/api/actividades.ts`, `client/src/api/actividades.test.ts`, `client/src/lib/formato.ts`, `client/src/lib/formato.test.ts`.

---

### Task 5: Componente `SelectorOperacion`

**Files:**
- Create: `client/src/components/crm/SelectorOperacion/SelectorOperacion.tsx`
- Create: `client/src/components/crm/SelectorOperacion/SelectorOperacion.css`
- Create: `client/src/components/crm/SelectorOperacion/SelectorOperacion.test.tsx`

**Interfaces:**
- Consumes: `operacionesApi.listar` de `api/operaciones.ts` (ya existe, devuelve `Paginado<OperacionListItem>`; `OperacionListItem.title: string`).
- Produces: `export default function SelectorOperacion({ valor, onChange, label, bloqueada }: Props)`, `export interface OperacionElegida { id: number; title: string }`.

- [ ] **Step 1: Test que falla**

`client/src/components/crm/SelectorOperacion/SelectorOperacion.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SelectorOperacion from './SelectorOperacion'
import { operacionesApi } from '../../../api/operaciones'
import type { OperacionListItem } from '../../../types/operacion'

vi.mock('../../../api/operaciones', () => ({
  operacionesApi: { listar: vi.fn() },
}))

const OPERACIONES: OperacionListItem[] = [
  { id: 1, title: 'Venta depto Rivadavia' } as OperacionListItem,
  { id: 2, title: 'Alquiler casa Villa Elisa' } as OperacionListItem,
]

beforeEach(() => vi.clearAllMocks())

it('sin texto no muestra panel ni busca', async () => {
  vi.mocked(operacionesApi.listar).mockResolvedValue({ total: 2, items: OPERACIONES })
  render(<SelectorOperacion valor={null} onChange={vi.fn()} />)
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
})

it('filtra por título client-side', async () => {
  vi.mocked(operacionesApi.listar).mockResolvedValue({ total: 2, items: OPERACIONES })
  const usuario = userEvent.setup()
  render(<SelectorOperacion valor={null} onChange={vi.fn()} />)

  await usuario.type(screen.getByRole('combobox'), 'rivadavia')
  await waitFor(() => expect(screen.getByText('Venta depto Rivadavia')).toBeInTheDocument())
  expect(screen.queryByText('Alquiler casa Villa Elisa')).not.toBeInTheDocument()
})

it('elegir una operación llama onChange y limpia el texto', async () => {
  vi.mocked(operacionesApi.listar).mockResolvedValue({ total: 2, items: OPERACIONES })
  const onChange = vi.fn()
  const usuario = userEvent.setup()
  render(<SelectorOperacion valor={null} onChange={onChange} />)

  await usuario.type(screen.getByRole('combobox'), 'rivadavia')
  await waitFor(() => screen.getByText('Venta depto Rivadavia'))
  await usuario.click(screen.getByText('Venta depto Rivadavia'))

  expect(onChange).toHaveBeenCalledWith({ id: 1, title: 'Venta depto Rivadavia' })
})

it('con valor elegido muestra el título y un botón Quitar', () => {
  render(<SelectorOperacion valor={{ id: 1, title: 'Venta depto Rivadavia' }} onChange={vi.fn()} />)
  expect(screen.getByText('Venta depto Rivadavia')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Quitar' })).toBeInTheDocument()
})

it('bloqueada oculta el botón Quitar', () => {
  render(
    <SelectorOperacion
      valor={{ id: 1, title: 'Venta depto Rivadavia' }}
      onChange={vi.fn()}
      bloqueada
    />,
  )
  expect(screen.queryByRole('button', { name: 'Quitar' })).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd client && npx vitest run --pool=threads src/components/crm/SelectorOperacion/SelectorOperacion.test.tsx`
Expected: FAIL — no existe `./SelectorOperacion`.

- [ ] **Step 3: Implementar el componente**

`client/src/components/crm/SelectorOperacion/SelectorOperacion.tsx` (calco de `SelectorPropiedad`, ver `client/src/components/crm/SelectorPropiedad/SelectorPropiedad.tsx`):

```tsx
import { useEffect, useId, useMemo, useState } from 'react'
import { operacionesApi } from '../../../api/operaciones'
import type { OperacionListItem } from '../../../types/operacion'
import './SelectorOperacion.css'

export interface OperacionElegida {
  id: number
  title: string
}

interface Props {
  valor: OperacionElegida | null
  onChange: (operacion: OperacionElegida | null) => void
  label?: string
  /** Precargada por la pantalla de origen: se muestra sin "Quitar". */
  bloqueada?: boolean
}

const MAX_RESULTADOS = 8

/**
 * Buscador de operaciones para vincular una actividad. El listado del backend
 * no tiene búsqueda por texto, así que se trae entero una vez (sin filtrar por
 * `is_closed`: una tarea puede seguir ligada a una operación ya cerrada) y se
 * filtra acá, igual que `SelectorPropiedad`.
 */
export default function SelectorOperacion({ valor, onChange, label = 'Operación', bloqueada = false }: Props) {
  const id = useId()
  const [texto, setTexto] = useState('')
  const [todas, setTodas] = useState<OperacionListItem[]>([])
  const [errorCarga, setErrorCarga] = useState(false)

  useEffect(() => {
    if (valor && bloqueada) return
    operacionesApi.listar({ limit: 500 })
      .then(p => { setTodas(p.items); setErrorCarga(false) })
      .catch(() => setErrorCarga(true))
  }, [valor, bloqueada])

  const resultados = useMemo(() => {
    const termino = texto.trim().toLowerCase()
    if (!termino) return []
    return todas
      .filter(o => o.title.toLowerCase().includes(termino) || String(o.id) === termino)
      .slice(0, MAX_RESULTADOS)
  }, [texto, todas])

  if (valor) {
    return (
      <div className="selector-operacion">
        <label className="selector-operacion-label">{label}</label>
        <div className="selector-operacion-elegida">
          <span>{valor.title}</span>
          {!bloqueada && (
            <button type="button" className="btn btn-outline btn-chico" onClick={() => onChange(null)}>
              Quitar
            </button>
          )}
        </div>
      </div>
    )
  }

  const hayTexto = texto.trim().length > 0
  const listaId = `${id}-lista`

  return (
    <div className="selector-operacion">
      <label className="selector-operacion-label" htmlFor={id}>{label}</label>
      <input
        id={id}
        role="combobox"
        aria-expanded={hayTexto}
        aria-controls={listaId}
        aria-autocomplete="list"
        className="selector-operacion-input"
        placeholder="Buscar por título…"
        value={texto}
        onChange={e => setTexto(e.target.value)}
        autoComplete="off"
      />
      {hayTexto && (
        <div className="selector-operacion-panel">
          {errorCarga && <p className="selector-operacion-estado selector-operacion-error">No se pudieron cargar las operaciones</p>}
          {!errorCarga && resultados.length === 0 && <p className="selector-operacion-estado">Sin resultados</p>}
          <ul id={listaId} role="listbox" className="selector-operacion-lista">
            {resultados.map(o => (
              <li
                key={o.id}
                role="option"
                aria-selected={false}
                className="selector-operacion-opcion"
                onClick={() => { onChange({ id: o.id, title: o.title }); setTexto('') }}
              >
                <span>{o.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
```

`client/src/components/crm/SelectorOperacion/SelectorOperacion.css` (calco de `SelectorPropiedad.css`, mismas clases con el prefijo `selector-operacion`):

```css
.selector-operacion {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  position: relative;
}

.selector-operacion-label {
  font-size: 0.85rem;
  font-weight: 600;
}

.selector-operacion-input {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--borde, #ccc);
  border-radius: 6px;
}

.selector-operacion-elegida {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--borde, #ccc);
  border-radius: 6px;
}

.selector-operacion-panel {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 10;
  background: var(--fondo-tarjeta, #fff);
  border: 1px solid var(--borde, #ccc);
  border-radius: 6px;
  margin-top: 0.25rem;
  max-height: 240px;
  overflow-y: auto;
}

.selector-operacion-estado {
  padding: 0.5rem 0.75rem;
  font-size: 0.85rem;
  color: var(--texto-secundario, #666);
}

.selector-operacion-error {
  color: var(--color-error, #c0392b);
}

.selector-operacion-lista {
  list-style: none;
  margin: 0;
  padding: 0;
}

.selector-operacion-opcion {
  padding: 0.5rem 0.75rem;
  cursor: pointer;
}

.selector-operacion-opcion:hover {
  background: var(--fondo-hover, #f5f5f5);
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `cd client && npx vitest run --pool=threads src/components/crm/SelectorOperacion/SelectorOperacion.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Anotar archivos tocados (sin commit)**

`client/src/components/crm/SelectorOperacion/SelectorOperacion.tsx`, `.css`, `.test.tsx`.

---

### Task 6: Badge (`hecha`/`cancelada`), página `Lista.tsx`, nav y ruta

**Files:**
- Modify: `client/src/components/Badge.tsx`
- Create: `client/src/components/Badge.test.tsx`
- Create: `client/src/pages/admin/actividades/Lista.tsx`
- Create: `client/src/pages/admin/actividades/Lista.test.tsx`
- Modify: `client/src/layouts/AdminLayout.tsx:17-19`
- Modify: `client/src/App.tsx` (import cerca de la línea 33; ruta cerca de la línea 110)

**Interfaces:**
- Consumes: `actividadesApi`, `Actividad`, `ActividadCreatePayload`, `TIPOS_ACTIVIDAD`, `ETIQUETAS_TIPO_ACTIVIDAD` (Task 4); `SelectorOperacion` (Task 5); `SelectorPersona`, `SelectorPropiedad` (ya existen); `usuariosApi.listar()` (ya existe); `Badge`, `formatearFechaHora` (`lib/formato.ts`).
- Produces: `export default function ActividadesLista()`; ítem de nav y ruta `/admin/actividades`.

- [ ] **Step 1: Extender `Badge` — test que falla**

Como `Badge.tsx` no tiene test todavía, crear `client/src/components/Badge.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import Badge from './Badge'

it('mapea hecha a verde y cancelada a rojo, con etiqueta capitalizada', () => {
  render(<Badge value="hecha" />)
  expect(screen.getByText('Hecha')).toHaveClass('badge-ok')

  render(<Badge value="cancelada" />)
  expect(screen.getByText('Cancelada')).toHaveClass('badge-baja')
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd client && npx vitest run --pool=threads src/components/Badge.test.tsx`
Expected: FAIL — el texto sale en minúscula (`hecha`/`cancelada`, sin mapear) y la clase es `badge-neutro`.

- [ ] **Step 3: Agregar los mapeos**

En `client/src/components/Badge.tsx`, en `colorMap` (después de `pendiente: 'espera',`, línea ~27):

```ts
  hecha:      'ok',
  cancelada:  'baja',
```

Y en `labelMap` (después de `pendiente: 'Pendiente',`, línea ~48):

```ts
  hecha:      'Hecha',
  cancelada:  'Cancelada',
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `cd client && npx vitest run --pool=threads src/components/Badge.test.tsx`
Expected: PASS.

- [ ] **Step 5: Test de la página que falla**

`client/src/pages/admin/actividades/Lista.test.tsx`:

```tsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ActividadesLista from './Lista'
import { actividadesApi } from '../../../api/actividades'
import { usuariosApi } from '../../../api/usuarios'
import { personasApi } from '../../../api/personas'
import { propiedadesApi } from '../../../api/propiedades'
import { operacionesApi } from '../../../api/operaciones'
import type { Actividad } from '../../../types/actividad'

vi.mock('../../../api/actividades', () => ({
  actividadesApi: {
    listar: vi.fn(), crear: vi.fn(), marcarHecha: vi.fn(), cancelar: vi.fn(), eliminar: vi.fn(),
  },
}))
vi.mock('../../../api/usuarios', () => ({ usuariosApi: { listar: vi.fn() } }))
vi.mock('../../../api/personas', () => ({
  personasApi: { listar: vi.fn().mockResolvedValue({ total: 0, items: [] }), crear: vi.fn() },
}))
vi.mock('../../../api/propiedades', () => ({ propiedadesApi: { listar: vi.fn().mockResolvedValue([]) } }))
vi.mock('../../../api/operaciones', () => ({ operacionesApi: { listar: vi.fn().mockResolvedValue({ total: 0, items: [] }) } }))

const AHORA = new Date('2026-09-21T12:00:00Z')

const VENCIDA: Actividad = {
  id: 1, title: 'Mostrar depto Rivadavia', activity_type: 'visita', status: 'pendiente',
  description: null, due_at: '2026-09-20T10:00:00Z', done_at: null,
  assigned_to: { id: 2, name: 'Ana P.', email: 'ana@mambo.com.ar' },
  created_by: { id: 1, name: 'Admin', email: 'admin@mambo.com.ar' },
  person: { id: 5, full_name: 'Fam. Gómez' }, property: null, deal: null,
  created_at: '2026-09-19T10:00:00Z', updated_at: '2026-09-19T10:00:00Z',
}

const PENDIENTE_FUTURA: Actividad = {
  ...VENCIDA, id: 2, title: 'Llamar por seña', due_at: '2026-10-01T10:00:00Z', property: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.setSystemTime(AHORA)
  vi.mocked(usuariosApi.listar).mockResolvedValue([
    { id: 1, name: 'Admin', email: 'admin@mambo.com.ar' },
    { id: 2, name: 'Ana P.', email: 'ana@mambo.com.ar' },
  ])
})

afterEach(() => vi.useRealTimers())

it('lista vacía muestra el aviso', async () => {
  vi.mocked(actividadesApi.listar).mockResolvedValue({ total: 0, items: [] })
  render(<ActividadesLista />)
  expect(await screen.findByText('No hay actividades')).toBeInTheDocument()
})

it('sin filtro por defecto pide todas las actividades', async () => {
  vi.mocked(actividadesApi.listar).mockResolvedValue({ total: 0, items: [] })
  render(<ActividadesLista />)
  await waitFor(() => expect(actividadesApi.listar).toHaveBeenCalledWith({}))
})

it('renderiza filas y marca la vencida', async () => {
  vi.mocked(actividadesApi.listar).mockResolvedValue({ total: 2, items: [VENCIDA, PENDIENTE_FUTURA] })
  render(<ActividadesLista />)

  const filaVencida = (await screen.findByText('Mostrar depto Rivadavia')).closest('tr')!
  expect(within(filaVencida).getByText('Vencida')).toBeInTheDocument()

  const filaFutura = screen.getByText('Llamar por seña').closest('tr')!
  expect(within(filaFutura).queryByText('Vencida')).not.toBeInTheDocument()
})

it('cambiar el filtro de estado dispara un nuevo listado', async () => {
  vi.mocked(actividadesApi.listar).mockResolvedValue({ total: 0, items: [] })
  const usuario = userEvent.setup()
  render(<ActividadesLista />)
  await screen.findByText('No hay actividades')

  await usuario.selectOptions(screen.getByLabelText('Estado'), 'hecha')
  await waitFor(() => expect(actividadesApi.listar).toHaveBeenLastCalledWith({ status: 'hecha' }))
})

it('alta manda el payload y agrega la fila sin recargar', async () => {
  vi.mocked(actividadesApi.listar).mockResolvedValue({ total: 0, items: [] })
  vi.mocked(actividadesApi.crear).mockResolvedValue(PENDIENTE_FUTURA)
  const usuario = userEvent.setup()
  render(<ActividadesLista />)
  await screen.findByText('No hay actividades')

  await usuario.click(screen.getByRole('button', { name: '+ Nueva actividad' }))
  // El formulario de alta repite las etiquetas "Tipo"/"Asignado" de la barra de
  // filtros (son campos con el mismo nombre en dos bloques distintos de la
  // pantalla); se acota la búsqueda al `group` del formulario para no ambiguar.
  const formulario = screen.getByRole('group', { name: 'Nueva actividad' })
  await usuario.type(within(formulario).getByLabelText('Título'), 'Llamar por seña')
  await usuario.selectOptions(within(formulario).getByLabelText('Tipo'), 'tarea')
  await usuario.click(within(formulario).getByRole('button', { name: 'Crear' }))

  await waitFor(() => expect(actividadesApi.crear).toHaveBeenCalledWith(
    expect.objectContaining({ title: 'Llamar por seña', activity_type: 'tarea' }),
  ))
  expect(await screen.findByText('Llamar por seña')).toBeInTheDocument()
  expect(actividadesApi.listar).toHaveBeenCalledTimes(1)
})

it('marcar hecha actualiza la fila sin recargar la lista', async () => {
  vi.mocked(actividadesApi.listar).mockResolvedValue({ total: 1, items: [PENDIENTE_FUTURA] })
  vi.mocked(actividadesApi.marcarHecha).mockResolvedValue({ ...PENDIENTE_FUTURA, status: 'hecha' })
  const usuario = userEvent.setup()
  render(<ActividadesLista />)
  await screen.findByText('Llamar por seña')

  await usuario.click(screen.getByRole('button', { name: 'Hecha' }))
  await waitFor(() => expect(actividadesApi.marcarHecha).toHaveBeenCalledWith(2))
  expect(await screen.findByText('Hecha')).toBeInTheDocument()
  expect(actividadesApi.listar).toHaveBeenCalledTimes(1)
})

it('cancelar pide confirmación y actualiza la fila', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.mocked(actividadesApi.listar).mockResolvedValue({ total: 1, items: [PENDIENTE_FUTURA] })
  vi.mocked(actividadesApi.cancelar).mockResolvedValue({ ...PENDIENTE_FUTURA, status: 'cancelada' })
  const usuario = userEvent.setup()
  render(<ActividadesLista />)
  await screen.findByText('Llamar por seña')

  await usuario.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(window.confirm).toHaveBeenCalledWith('¿Cancelar "Llamar por seña"?')
  await waitFor(() => expect(actividadesApi.cancelar).toHaveBeenCalledWith(2))
  expect(await screen.findByText('Cancelada')).toBeInTheDocument()
})

it('borrar pide confirmación y saca la fila', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.mocked(actividadesApi.listar).mockResolvedValue({ total: 1, items: [PENDIENTE_FUTURA] })
  vi.mocked(actividadesApi.eliminar).mockResolvedValue(undefined)
  const usuario = userEvent.setup()
  render(<ActividadesLista />)
  await screen.findByText('Llamar por seña')

  await usuario.click(screen.getByRole('button', { name: 'Borrar' }))
  expect(window.confirm).toHaveBeenCalledWith('¿Borrar "Llamar por seña"?')
  await waitFor(() => expect(actividadesApi.eliminar).toHaveBeenCalledWith(2))
  expect(screen.queryByText('Llamar por seña')).not.toBeInTheDocument()
})

it('una actividad hecha no muestra los botones Hecha/Cancelar', async () => {
  const hecha: Actividad = { ...PENDIENTE_FUTURA, status: 'hecha', done_at: '2026-09-21T09:00:00Z' }
  vi.mocked(actividadesApi.listar).mockResolvedValue({ total: 1, items: [hecha] })
  render(<ActividadesLista />)
  const fila = (await screen.findByText('Llamar por seña')).closest('tr')!
  expect(within(fila).queryByRole('button', { name: 'Hecha' })).not.toBeInTheDocument()
  expect(within(fila).queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument()
  expect(within(fila).getByRole('button', { name: 'Borrar' })).toBeInTheDocument()
})
```

- [ ] **Step 6: Correr y ver que falla**

Run: `cd client && npx vitest run --pool=threads src/pages/admin/actividades/Lista.test.tsx`
Expected: FAIL — no existe `./Lista`.

- [ ] **Step 7: Implementar la página**

`client/src/pages/admin/actividades/Lista.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { actividadesApi, type ListarActividadesParams } from '../../../api/actividades'
import { usuariosApi } from '../../../api/usuarios'
import Badge from '../../../components/Badge'
import SelectorPersona from '../../../components/crm/SelectorPersona/SelectorPersona'
import SelectorPropiedad, { type PropiedadElegida } from '../../../components/crm/SelectorPropiedad/SelectorPropiedad'
import SelectorOperacion, { type OperacionElegida } from '../../../components/crm/SelectorOperacion/SelectorOperacion'
import { formatearFechaHora } from '../../../lib/formato'
import { ETIQUETAS_TIPO_ACTIVIDAD, TIPOS_ACTIVIDAD } from '../../../types/actividad'
import type { Actividad, EstadoActividad, TipoActividad } from '../../../types/actividad'
import type { PersonaBrief } from '../../../types/persona'
import type { UsuarioBrief } from '../../../types/inmobiliaria'

const ESTADOS: EstadoActividad[] = ['pendiente', 'hecha', 'cancelada']

function estaVencida(a: Actividad): boolean {
  return a.status === 'pendiente' && a.due_at !== null && new Date(a.due_at) < new Date()
}

export default function ActividadesLista() {
  const [actividades, setActividades] = useState<Actividad[]>([])
  const [usuarios, setUsuarios] = useState<UsuarioBrief[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filtros: independientes del formulario de alta de abajo. Filtrar por una
  // persona no debe atarla a la próxima actividad que se cree, ni al revés.
  const [filtroEstado, setFiltroEstado] = useState<EstadoActividad | ''>('')
  const [filtroTipo, setFiltroTipo] = useState<TipoActividad | ''>('')
  const [filtroAsignado, setFiltroAsignado] = useState<number | ''>('')
  const [filtroPersona, setFiltroPersona] = useState<PersonaBrief | null>(null)
  const [filtroPropiedad, setFiltroPropiedad] = useState<PropiedadElegida | null>(null)
  const [filtroOperacion, setFiltroOperacion] = useState<OperacionElegida | null>(null)

  const [mostrarAlta, setMostrarAlta] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [tipo, setTipo] = useState<TipoActividad>('tarea')
  const [vencimiento, setVencimiento] = useState('')
  const [asignadoAlta, setAsignadoAlta] = useState<number | ''>('')
  const [altaPersona, setAltaPersona] = useState<PersonaBrief | null>(null)
  const [altaPropiedad, setAltaPropiedad] = useState<PropiedadElegida | null>(null)
  const [altaOperacion, setAltaOperacion] = useState<OperacionElegida | null>(null)
  const [errorAlta, setErrorAlta] = useState<string | null>(null)

  useEffect(() => {
    usuariosApi.listar().then(setUsuarios).catch(() => setUsuarios([]))
  }, [])

  const cargar = () => {
    setLoading(true)
    setError(null)
    const params: ListarActividadesParams = {}
    if (filtroEstado) params.status = filtroEstado
    if (filtroTipo) params.type = filtroTipo
    if (filtroAsignado) params.assigned_to_user_id = filtroAsignado
    if (filtroPersona) params.person_id = filtroPersona.id
    if (filtroPropiedad) params.property_id = filtroPropiedad.id
    if (filtroOperacion) params.deal_id = filtroOperacion.id
    actividadesApi.listar(params)
      .then(r => setActividades(r.items))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    cargar()
  }, [filtroEstado, filtroTipo, filtroAsignado, filtroPersona, filtroPropiedad, filtroOperacion])

  const crear = async () => {
    setErrorAlta(null)
    try {
      const nueva = await actividadesApi.crear({
        title: titulo,
        activity_type: tipo,
        due_at: vencimiento ? new Date(vencimiento).toISOString() : null,
        assigned_to_user_id: asignadoAlta || null,
        person_id: altaPersona?.id ?? null,
        property_id: altaPropiedad?.id ?? null,
        deal_id: altaOperacion?.id ?? null,
      })
      setActividades(a => [nueva, ...a])
      setTitulo('')
      setVencimiento('')
      setAsignadoAlta('')
      setAltaPersona(null)
      setAltaPropiedad(null)
      setAltaOperacion(null)
      setMostrarAlta(false)
    } catch (e: unknown) {
      setErrorAlta(e instanceof Error ? e.message : 'No se pudo crear')
    }
  }

  const marcarHecha = async (id: number) => {
    const actualizada = await actividadesApi.marcarHecha(id)
    setActividades(a => a.map(x => (x.id === id ? actualizada : x)))
  }

  const cancelar = async (a: Actividad) => {
    if (!window.confirm(`¿Cancelar "${a.title}"?`)) return
    const actualizada = await actividadesApi.cancelar(a.id)
    setActividades(list => list.map(x => (x.id === a.id ? actualizada : x)))
  }

  const borrar = async (a: Actividad) => {
    if (!window.confirm(`¿Borrar "${a.title}"?`)) return
    await actividadesApi.eliminar(a.id)
    setActividades(list => list.filter(x => x.id !== a.id))
  }

  return (
    <div>
      <div className="admin-page-header">
        <h1>Actividades</h1>
      </div>

      <div className="admin-card filtros-bar">
        <label className="filtros-label">
          Estado
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value as EstadoActividad | '')}>
            <option value="">Todos</option>
            {ESTADOS.map(e => <option key={e} value={e}>{e === 'pendiente' ? 'Pendiente' : e === 'hecha' ? 'Hecha' : 'Cancelada'}</option>)}
          </select>
        </label>
        <label className="filtros-label">
          Tipo
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value as TipoActividad | '')}>
            <option value="">Todos</option>
            {TIPOS_ACTIVIDAD.map(t => <option key={t} value={t}>{ETIQUETAS_TIPO_ACTIVIDAD[t]}</option>)}
          </select>
        </label>
        <label className="filtros-label">
          Asignado
          <select value={filtroAsignado} onChange={e => setFiltroAsignado(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Todos</option>
            {usuarios.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        <SelectorPersona valor={filtroPersona} onChange={setFiltroPersona} />
        <SelectorPropiedad valor={filtroPropiedad} onChange={setFiltroPropiedad} />
        <SelectorOperacion valor={filtroOperacion} onChange={setFiltroOperacion} />
      </div>

      <div className="admin-card">
        <button type="button" className="btn btn-outline" onClick={() => setMostrarAlta(m => !m)}>
          {mostrarAlta ? 'Cerrar' : '+ Nueva actividad'}
        </button>
        {mostrarAlta && (
          <div className="actividades-alta" role="group" aria-label="Nueva actividad">
            <label htmlFor="actividad-titulo">Título</label>
            <input id="actividad-titulo" value={titulo} onChange={e => setTitulo(e.target.value)} />

            <label htmlFor="actividad-tipo">Tipo</label>
            <select id="actividad-tipo" value={tipo} onChange={e => setTipo(e.target.value as TipoActividad)}>
              {TIPOS_ACTIVIDAD.map(t => <option key={t} value={t}>{ETIQUETAS_TIPO_ACTIVIDAD[t]}</option>)}
            </select>

            <label htmlFor="actividad-vencimiento">Vencimiento</label>
            <input
              id="actividad-vencimiento"
              type="datetime-local"
              value={vencimiento}
              onChange={e => setVencimiento(e.target.value)}
            />

            <label htmlFor="actividad-asignado">Asignado</label>
            <select
              id="actividad-asignado"
              value={asignadoAlta}
              onChange={e => setAsignadoAlta(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Sin asignar</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>

            <SelectorPersona valor={altaPersona} onChange={setAltaPersona} />
            <SelectorPropiedad valor={altaPropiedad} onChange={setAltaPropiedad} />
            <SelectorOperacion valor={altaOperacion} onChange={setAltaOperacion} />

            {errorAlta && <p className="form-error" role="alert">{errorAlta}</p>}

            <button
              type="button"
              className="btn btn-magenta"
              disabled={!titulo.trim()}
              onClick={crear}
            >
              Crear
            </button>
          </div>
        )}
      </div>

      {loading && <p className="lista-estado">Cargando...</p>}
      {error && <p className="lista-estado lista-error">{error}</p>}

      {!loading && !error && (
        actividades.length === 0
          ? <p className="lista-estado">No hay actividades</p>
          : (
            <div className="admin-card tabla-wrapper">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Vence</th>
                    <th>Tipo</th>
                    <th>Título</th>
                    <th>Vinculada a</th>
                    <th>Asignado</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {actividades.map(a => (
                    <tr key={a.id}>
                      <td data-label="Vence">
                        {formatearFechaHora(a.due_at)}
                        {estaVencida(a) && <Badge value="vencida" />}
                      </td>
                      <td data-label="Tipo">{ETIQUETAS_TIPO_ACTIVIDAD[a.activity_type]}</td>
                      <td data-label="Título">{a.title}</td>
                      <td data-label="Vinculada a">
                        {[a.person?.full_name, a.property?.titulo, a.deal?.title].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td data-label="Asignado">{a.assigned_to?.name ?? '—'}</td>
                      <td data-label="Estado"><Badge value={a.status} /></td>
                      <td data-label="Acciones">
                        {a.status === 'pendiente' && (
                          <>
                            <button type="button" className="btn btn-outline btn-chico" onClick={() => marcarHecha(a.id)}>Hecha</button>
                            <button type="button" className="btn btn-outline btn-chico" onClick={() => cancelar(a)}>Cancelar</button>
                          </>
                        )}
                        <button type="button" className="btn btn-outline btn-chico" onClick={() => borrar(a)}>Borrar</button>
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

- [ ] **Step 8: Correr y ver que pasa**

Run: `cd client && npx vitest run --pool=threads src/pages/admin/actividades/Lista.test.tsx`
Expected: PASS. Si el test de "vinculada a" con más de un dato falla porque el mock solo trae uno cargado (`person` en los fixtures de arriba), ajustar el test para verificar solo el dato presente; el componente concatena los que existan.

- [ ] **Step 9: Nav y ruta**

En `client/src/layouts/AdminLayout.tsx`, en el grupo `CRM` (después de `Operaciones`, línea ~19):

```ts
      { to: '/admin/actividades', label: 'Actividades' },
```

En `client/src/App.tsx`, agregar el import junto a los de operaciones (línea ~33):

```tsx
import ActividadesLista       from './pages/admin/actividades/Lista'
```

Y la ruta, después del bloque de `operaciones` y antes de `alquileres` (línea ~110):

```tsx
              <Route path="actividades" element={<ActividadesLista />} />
```

- [ ] **Step 10: Suite completa del frontend y typecheck**

Run: `cd client && npm test && npx tsc --noEmit`
Expected: todo verde, sin errores de tipos.

- [ ] **Step 11: Anotar archivos tocados (sin commit)**

`client/src/components/Badge.tsx`, `client/src/components/Badge.test.tsx`, `client/src/pages/admin/actividades/Lista.tsx`, `Lista.test.tsx`, `client/src/layouts/AdminLayout.tsx`, `client/src/App.tsx`.

---

### Task 7: Verificación final

**Files:** ninguno nuevo.

- [ ] **Step 1: Backend completo**

Run: `cd src && python -m pytest tests/ -q && ruff check .`
Expected: todo verde; `ruff check` limpio (si marca archivos viejos ajenos a este bloque —ya se sabe que `seed.py` tiene errores preexistentes—, ignorarlos y reportarlos).

- [ ] **Step 2: Frontend completo**

Run: `cd client && npm test && npm run build`
Expected: tests verdes y build OK.

- [ ] **Step 3: Migración vs modelos**

Si hay una base con `DATABASE_URL` configurada: `cd src && alembic upgrade head && alembic check`. Expected: `No new upgrade operations detected.` Si no hay base disponible, dejarlo anotado para que Matías lo corra antes de aplicar en Supabase.

- [ ] **Step 4: Prueba manual (si hay backend y frontend levantados)**

Con `uvicorn app.main:app --reload --port 8000` en `src/` y `npm run dev` en `client/`: entrar a `/admin/actividades`, crear una actividad con persona, con propiedad, con operación y sin ninguna; marcar una hecha; cancelar otra; borrar otra; poner un vencimiento en el pasado y confirmar que aparece el badge "Vencida"; filtrar por estado, tipo y asignado.

- [ ] **Step 5: Reporte final**

Listar todos los archivos creados/modificados (backend, frontend, docs) para que Matías los revise y commitee. Recordar la migración `0010_activities_deal_id` pendiente en Supabase.
