# Propiedades: medidas, orden de fotos y características — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sumar `m2_terreno`/`m2_construidos`/`m2_propios`, reordenar fotos por drag & drop (la primera pasa a ser Principal) y cargar características con un checklist en el formulario de propiedades.

**Architecture:** Backend FastAPI en `src/app/modules/propiedades` (modelo + migración 0012 + endpoint `PUT /medios/orden`); frontend React en `client/src/pages/admin/propiedades/Formulario.tsx` y la ficha pública `client/src/pages/public/Detalle.tsx`. Las características reusan el modelo y los endpoints existentes, solo se les agrega UI.

**Tech Stack:** Python 3 / FastAPI / SQLAlchemy / Alembic / pytest (SQLite en memoria); React + TypeScript / Vite / vitest + Testing Library.

**Spec:** [docs/superpowers/specs/2026-09-28-medidas-fotos-caracteristicas-propiedades-design.md](../specs/2026-09-28-medidas-fotos-caracteristicas-propiedades-design.md)

## Global Constraints

- **NO hacer `git add`, `git commit` ni `git push`.** Todo queda en el working tree; Matías commitea. Esto incluye el spec y este plan.
- **NO correr `alembic upgrade`, `alembic downgrade` ni `alembic check`**: el `.env` local apunta al pooler de Supabase (producción), no hay Postgres local. La migración la aplica Matías al desplegar. Para validar la cadena de revisiones usar solo `alembic heads` (no se conecta a la base).
- Código, comentarios, mensajes de API y textos de UI en **español**.
- Lint backend: `ruff check .` desde `src/`. `ruff format --check` solo sobre los archivos nuevos/tocados (hay ~36 archivos viejos que ya fallan el format).
- Tests frontend siempre con `--pool=threads` (en Windows el pool por defecto cuelga).
- Sin dependencias nuevas (ni backend ni frontend). Drag & drop con la API nativa HTML5.
- Los 5 campos de m2 son opcionales (`nullable`), sin condicionar por `tipo_propiedad`.
- Checkbox tildado = característica `{clave: <ítem>, valor: "si"}`. En la ficha pública, `valor === "si"` se muestra como `✅ <clave>`; cualquier otro valor como `<clave>: <valor>`.

## Mapa de archivos

| Archivo | Cambio | Task |
|---|---|---|
| `src/app/modules/propiedades/models.py` | 3 columnas nuevas | 1 |
| `src/alembic/versions/0012_superficies_propiedad.py` | nuevo | 1 |
| `src/app/modules/propiedades/schemas.py` | 3 campos en Base/Update/ListItem; `ReordenarMediosRequest` | 1, 2 |
| `src/app/modules/propiedades/service.py` | `crear_propiedad` pasa los campos nuevos; `reordenar_medios` | 1, 2 |
| `src/app/modules/propiedades/router.py` | `PUT /{id}/medios/orden` | 2 |
| `src/tests/test_propiedades_medidas.py` | nuevo | 1 |
| `src/tests/test_propiedades_medios_orden.py` | nuevo | 2 |
| `src/tests/test_propiedades_permisos.py` | caso del endpoint nuevo | 2 |
| `client/src/types/propiedad.ts` | 3 campos | 3 |
| `client/src/pages/admin/propiedades/Formulario.tsx` | medidas (3), drag & drop (4), características (5) | 3, 4, 5 |
| `client/src/pages/admin/propiedades/Formulario.css` | `.arrastrando`, grilla de características | 4, 5 |
| `client/src/pages/public/Detalle.tsx` | m2 nuevos (3), ✅ (5) | 3, 5 |
| `client/src/pages/public/Detalle.css` | modificador `--si` | 5 |
| `client/src/api/propiedades.ts` | `reordenarMedios` | 4 |
| `client/src/lib/propiedad.ts` | `CATALOGO_CARACTERISTICAS` | 5 |
| `client/src/pages/admin/propiedades/Formulario.medidas.test.tsx` | nuevo | 3 |
| `client/src/pages/admin/propiedades/Formulario.fotos.test.tsx` | nuevo | 4 |
| `client/src/pages/admin/propiedades/Formulario.caracteristicas.test.tsx` | nuevo | 5 |
| `client/src/pages/public/Detalle.test.tsx` | fixture + tests m2 y ✅ | 3, 5 |
| `client/src/components/PropiedadCard.test.tsx` | fixture (solo tipos) | 3 |

---

### Task 1: Backend — campos de superficie nuevos

**Files:**
- Modify: `src/app/modules/propiedades/models.py:93-96`
- Create: `src/alembic/versions/0012_superficies_propiedad.py`
- Modify: `src/app/modules/propiedades/schemas.py` (`PropiedadBase`, `PropiedadUpdate`, `PropiedadListItem`)
- Modify: `src/app/modules/propiedades/service.py:257-272` (`crear_propiedad`)
- Test: `src/tests/test_propiedades_medidas.py`

**Interfaces:**
- Produces: la API de propiedades acepta y devuelve `m2_terreno`, `m2_construidos`, `m2_propios` (Decimal serializado como string o número, `null` si no se cargó) en `POST /api/v1/propiedades`, `PUT /api/v1/propiedades/{id}`, `GET /api/v1/propiedades/{id}` y en cada ítem de `GET /api/v1/propiedades`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/tests/test_propiedades_medidas.py`:

```python
"""Los cinco campos de superficie: todos opcionales, se guardan y se devuelven tal cual."""

from decimal import Decimal

import pytest

CAMPOS_NUEVOS = ("m2_terreno", "m2_construidos", "m2_propios")


@pytest.fixture
def staff(crear_usuario, iniciar_sesion):
    crear_usuario(email="staff.medidas@mambo.com.ar", roles=("staff",))
    iniciar_sesion(email="staff.medidas@mambo.com.ar")


def test_crear_con_las_cinco_superficies_las_devuelve(client, staff):
    respuesta = client.post(
        "/api/v1/propiedades",
        json={
            "titulo": "Casa con terreno",
            "m2_terreno": 600,
            "m2_construidos": 250,
            "m2_cubiertos": 220,
            "m2_propios": 240,
            "m2_totales": 600,
        },
    )

    assert respuesta.status_code == 201, respuesta.text
    cuerpo = respuesta.json()
    assert Decimal(cuerpo["m2_terreno"]) == 600
    assert Decimal(cuerpo["m2_construidos"]) == 250
    assert Decimal(cuerpo["m2_cubiertos"]) == 220
    assert Decimal(cuerpo["m2_propios"]) == 240
    assert Decimal(cuerpo["m2_totales"]) == 600


def test_ninguna_superficie_es_obligatoria(client, staff):
    respuesta = client.post("/api/v1/propiedades", json={"titulo": "Depto sin medidas"})

    assert respuesta.status_code == 201, respuesta.text
    for campo in CAMPOS_NUEVOS:
        assert respuesta.json()[campo] is None


def test_editar_una_superficie_no_toca_las_demas(client, staff):
    creada = client.post(
        "/api/v1/propiedades",
        json={"titulo": "Casa", "m2_terreno": 500, "m2_propios": 180},
    ).json()

    respuesta = client.put(
        f"/api/v1/propiedades/{creada['id']}", json={"m2_construidos": 200}
    )

    assert respuesta.status_code == 200, respuesta.text
    cuerpo = respuesta.json()
    assert Decimal(cuerpo["m2_construidos"]) == 200
    assert Decimal(cuerpo["m2_terreno"]) == 500
    assert Decimal(cuerpo["m2_propios"]) == 180


def test_el_listado_trae_las_superficies_nuevas(client, staff):
    client.post("/api/v1/propiedades", json={"titulo": "Casa", "m2_terreno": 450})

    items = client.get("/api/v1/propiedades").json()

    assert Decimal(items[0]["m2_terreno"]) == 450
    assert items[0]["m2_construidos"] is None
    assert items[0]["m2_propios"] is None
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run (desde `src/`): `python -m pytest tests/test_propiedades_medidas.py -q`
Expected: FAIL — `KeyError: 'm2_terreno'` (el response no tiene el campo).

- [ ] **Step 3: Modelo**

En `src/app/modules/propiedades/models.py`, reemplazar las líneas de superficie (hoy `m2_cubiertos` y `m2_totales`, líneas ~95-96) por:

```python
    # Cinco superficies distintas, todas opcionales: no todas aplican a cualquier
    # tipo de propiedad (un depto no tiene terreno). "Construidos" y "cubiertos"
    # no son sinónimos: cubierto es lo que está bajo techo.
    m2_terreno = Column(Numeric(10, 2), nullable=True)
    m2_construidos = Column(Numeric(10, 2), nullable=True)
    m2_cubiertos = Column(Numeric(10, 2), nullable=True)
    m2_propios = Column(Numeric(10, 2), nullable=True)
    m2_totales = Column(Numeric(10, 2), nullable=True)
```

- [ ] **Step 4: Schemas**

En `src/app/modules/propiedades/schemas.py`, en **las tres** clases `PropiedadBase`, `PropiedadUpdate` y `PropiedadListItem`, reemplazar el par

```python
    m2_cubiertos: Decimal | None = None
    m2_totales: Decimal | None = None
```

por

```python
    m2_terreno: Decimal | None = None
    m2_construidos: Decimal | None = None
    m2_cubiertos: Decimal | None = None
    m2_propios: Decimal | None = None
    m2_totales: Decimal | None = None
```

(`PropiedadCreate` y `PropiedadResponse` heredan de `PropiedadBase`, no hay que tocarlas.)

- [ ] **Step 5: Service**

En `src/app/modules/propiedades/service.py`, dentro de `crear_propiedad`, el constructor `Propiedad(...)` pasa campo por campo. Reemplazar

```python
        m2_cubiertos=data.m2_cubiertos,
        m2_totales=data.m2_totales,
```

por

```python
        m2_terreno=data.m2_terreno,
        m2_construidos=data.m2_construidos,
        m2_cubiertos=data.m2_cubiertos,
        m2_propios=data.m2_propios,
        m2_totales=data.m2_totales,
```

(`actualizar_propiedad` usa `model_dump(exclude_unset=True)` + `setattr`, así que no necesita cambios.)

- [ ] **Step 6: Migración**

Crear `src/alembic/versions/0012_superficies_propiedad.py`:

```python
"""Superficies de terreno, construida y propia en propiedades

Se suman a `m2_cubiertos` y `m2_totales`. Nullable y sin backfill: ninguna
propiedad cargada tiene estos datos y ninguno es obligatorio.

Revision ID: 0012_superficies_propiedad
Revises: 0011_liquidaciones_anulacion
Create Date: 2026-09-28

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0012_superficies_propiedad"
down_revision: str | None = "0011_liquidaciones_anulacion"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COLUMNAS = ("m2_terreno", "m2_construidos", "m2_propios")


def upgrade() -> None:
    for columna in COLUMNAS:
        op.add_column("propiedades", sa.Column(columna, sa.Numeric(10, 2), nullable=True))


def downgrade() -> None:
    for columna in reversed(COLUMNAS):
        op.drop_column("propiedades", columna)
```

- [ ] **Step 7: Correr los tests y el chequeo de la cadena de migraciones**

Run (desde `src/`):
```
python -m pytest tests/test_propiedades_medidas.py -q
alembic heads
```
Expected: `4 passed`; `alembic heads` imprime `0012_superficies_propiedad (head)` (una sola cabeza). **No** correr `upgrade`/`check` (ver Global Constraints).

- [ ] **Step 8: Suite completa + lint**

Run (desde `src/`):
```
python -m pytest tests/ -q
ruff check .
ruff format --check app/modules/propiedades tests/test_propiedades_medidas.py alembic/versions/0012_superficies_propiedad.py
```
Expected: todo en verde. Si `ruff format --check` marca algo en los archivos tocados, correr `ruff format` sobre esos archivos puntuales.

- [ ] **Step 9: No commitear** — dejar los cambios en el working tree.

---

### Task 2: Backend — endpoint para reordenar fotos

**Files:**
- Modify: `src/app/modules/propiedades/schemas.py` (sección Medios)
- Modify: `src/app/modules/propiedades/service.py` (después de `eliminar_medio`)
- Modify: `src/app/modules/propiedades/router.py` (sección Medios)
- Modify: `src/tests/test_propiedades_permisos.py:55-78`
- Test: `src/tests/test_propiedades_medios_orden.py`

**Interfaces:**
- Produces: `PUT /api/v1/propiedades/{propiedad_id}/medios/orden`, body `{"orden": [int, ...]}` (todos los ids de medios de la propiedad, en el orden deseado). Responde `200` con `list[MedioResponse]` ordenada por `orden`; el primero tiene `es_principal: true` y el resto `false`. `400` si la lista no coincide exactamente con los medios de la propiedad; `404` si la propiedad no existe; `401`/`403` sin sesión/rol.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/tests/test_propiedades_medios_orden.py`:

```python
"""Reordenar fotos: persiste `orden` y la primera pasa a ser la principal."""

import pytest
from sqlalchemy.orm import Session as DBSession

from app.modules.propiedades.models import Propiedad, PropiedadMedio


@pytest.fixture
def staff(crear_usuario, iniciar_sesion):
    crear_usuario(email="staff.fotos@mambo.com.ar", roles=("staff",))
    iniciar_sesion(email="staff.fotos@mambo.com.ar")


def _propiedad_con_fotos(db: DBSession, titulo: str, cantidad: int) -> tuple[Propiedad, list[int]]:
    prop = Propiedad(titulo=titulo)
    db.add(prop)
    db.flush()
    medios = [
        PropiedadMedio(
            propiedad_id=prop.id,
            url=f"http://ejemplo.test/{titulo}-{i}.jpg",
            orden=i,
            es_principal=i == 0,
        )
        for i in range(cantidad)
    ]
    db.add_all(medios)
    db.commit()
    return prop, [m.id for m in medios]


def _ruta(propiedad_id: int) -> str:
    return f"/api/v1/propiedades/{propiedad_id}/medios/orden"


def test_reordenar_devuelve_el_nuevo_orden_y_la_primera_es_principal(client, db, staff):
    prop, (a, b, c) = _propiedad_con_fotos(db, "casa", 3)

    respuesta = client.put(_ruta(prop.id), json={"orden": [c, a, b]})

    assert respuesta.status_code == 200, respuesta.text
    cuerpo = respuesta.json()
    assert [m["id"] for m in cuerpo] == [c, a, b]
    assert [m["orden"] for m in cuerpo] == [0, 1, 2]
    assert [m["es_principal"] for m in cuerpo] == [True, False, False]


def test_el_orden_queda_persistido(client, db, staff):
    prop, (a, b, c) = _propiedad_con_fotos(db, "casa", 3)

    client.put(_ruta(prop.id), json={"orden": [b, c, a]})

    medios = client.get(f"/api/v1/propiedades/{prop.id}").json()["medios"]
    assert [m["id"] for m in medios] == [b, c, a]
    principal = [m["id"] for m in medios if m["es_principal"]]
    assert principal == [b]


def test_un_id_de_otra_propiedad_da_400(client, db, staff):
    prop, (a, b) = _propiedad_con_fotos(db, "casa", 2)
    _, (ajena,) = _propiedad_con_fotos(db, "otra", 1)

    respuesta = client.put(_ruta(prop.id), json={"orden": [a, b, ajena]})

    assert respuesta.status_code == 400


def test_si_falta_un_id_da_400_y_no_cambia_nada(client, db, staff):
    prop, (a, b, c) = _propiedad_con_fotos(db, "casa", 3)

    respuesta = client.put(_ruta(prop.id), json={"orden": [c, a]})

    assert respuesta.status_code == 400
    medios = client.get(f"/api/v1/propiedades/{prop.id}").json()["medios"]
    assert [m["id"] for m in medios] == [a, b, c]


def test_ids_duplicados_dan_400(client, db, staff):
    prop, (a, b) = _propiedad_con_fotos(db, "casa", 2)

    respuesta = client.put(_ruta(prop.id), json={"orden": [a, a, b]})

    assert respuesta.status_code == 400


def test_propiedad_inexistente_da_404(client, staff):
    assert client.put(_ruta(999999), json={"orden": []}).status_code == 404
```

Y en `src/tests/test_propiedades_permisos.py`, dentro de `_escrituras_de_propiedades`, agregar después de la tupla `("delete", f"/api/v1/propiedades/{propiedad_id}/medios/1", {}),`:

```python
        (
            "put",
            f"/api/v1/propiedades/{propiedad_id}/medios/orden",
            {"json": {"orden": []}},
        ),
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run (desde `src/`): `python -m pytest tests/test_propiedades_medios_orden.py tests/test_propiedades_permisos.py -q`
Expected: FAIL — los de orden con `405 Method Not Allowed` (la ruta no existe); en permisos, `PUT .../medios/orden quedó abierto` (405 ≠ 401).

- [ ] **Step 3: Schema**

En `src/app/modules/propiedades/schemas.py`, al final de la sección `# ── Medios ──` (después de `MedioResponse`):

```python
class ReordenarMediosRequest(BaseModel):
    # Todos los ids de medios de la propiedad, en el orden deseado. El primero
    # pasa a ser la foto principal.
    orden: list[int]
```

- [ ] **Step 4: Service**

En `src/app/modules/propiedades/service.py`, después de `eliminar_medio`:

```python
def reordenar_medios(db: Session, propiedad_id: int, orden: list[int]) -> list[PropiedadMedio]:
    """Asigna `orden` según la posición en la lista y marca la primera como principal.

    Exige la lista completa y sin repetidos: con un subconjunto no quedaría claro
    dónde van los medios que no se nombran.
    """
    obtener_propiedad(db, propiedad_id)

    medios = db.query(PropiedadMedio).filter(PropiedadMedio.propiedad_id == propiedad_id).all()
    por_id = {m.id: m for m in medios}

    if len(orden) != len(set(orden)) or set(orden) != set(por_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La lista de ids no coincide con los medios de la propiedad",
        )

    for posicion, medio_id in enumerate(orden):
        por_id[medio_id].orden = posicion
        por_id[medio_id].es_principal = posicion == 0

    db.commit()
    return [por_id[medio_id] for medio_id in orden]
```

- [ ] **Step 5: Router**

En `src/app/modules/propiedades/router.py`, agregar `ReordenarMediosRequest` al import de `app.modules.propiedades.schemas` (orden alfabético, entre `PropiedadUpdate` y el cierre del paréntesis) y, dentro de la sección `# ── Medios ──`, antes de `eliminar_medio`:

```python
@router.put(
    "/{propiedad_id}/medios/orden",
    response_model=list[MedioResponse],
    dependencies=SOLO_STAFF,
)
def reordenar_medios(
    propiedad_id: int, data: ReordenarMediosRequest, db: Session = Depends(get_db)
):
    """Guarda el orden de las fotos; la primera de la lista queda como principal."""
    return service.reordenar_medios(db, propiedad_id, data.orden)
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run (desde `src/`): `python -m pytest tests/test_propiedades_medios_orden.py tests/test_propiedades_permisos.py -q`
Expected: todos PASS.

- [ ] **Step 7: Suite completa + lint**

Run (desde `src/`):
```
python -m pytest tests/ -q
ruff check .
ruff format --check app/modules/propiedades tests/test_propiedades_medios_orden.py tests/test_propiedades_permisos.py
```
Expected: todo en verde.

- [ ] **Step 8: No commitear.**

---

### Task 3: Frontend — medidas en el formulario y en la ficha pública

**Files:**
- Modify: `client/src/types/propiedad.ts` (`PropiedadListItem`, `PropiedadCreatePayload`)
- Modify: `client/src/pages/admin/propiedades/Formulario.tsx` (FormState, INITIAL, carga, payload, sección "Medidas y ambientes")
- Modify: `client/src/pages/public/Detalle.tsx:172-187`
- Modify: `client/src/pages/public/Detalle.test.tsx` (fixture + tests)
- Modify: `client/src/components/PropiedadCard.test.tsx` (fixture)
- Test: `client/src/pages/admin/propiedades/Formulario.medidas.test.tsx`

**Interfaces:**
- Consumes: campos `m2_terreno`, `m2_construidos`, `m2_propios` de la API (Task 1).
- Produces: en `Formulario.tsx`, los cinco inputs de m2 con `id` y `<label htmlFor>` y textos exactos `m² terreno`, `m² construidos`, `m² cubiertos`, `m² propios`, `m² totales` (los tests de otros tasks no dependen de esto, pero no cambiar los textos).

- [ ] **Step 1: Tipos**

En `client/src/types/propiedad.ts`:

En `PropiedadListItem`, reemplazar
```ts
  m2_cubiertos: number | null
  m2_totales: number | null
```
por
```ts
  m2_terreno: number | null
  m2_construidos: number | null
  m2_cubiertos: number | null
  m2_propios: number | null
  m2_totales: number | null
```

En `PropiedadCreatePayload`, reemplazar
```ts
  m2_cubiertos?: number
  m2_totales?: number
```
por
```ts
  m2_terreno?: number
  m2_construidos?: number
  m2_cubiertos?: number
  m2_propios?: number
  m2_totales?: number
```

- [ ] **Step 2: Arreglar fixtures tipadas**

En `client/src/pages/public/Detalle.test.tsx`, en la función `propiedad()`, reemplazar
```ts
    m2_cubiertos: 140,
    m2_totales: 200,
```
por
```ts
    m2_terreno: null,
    m2_construidos: null,
    m2_cubiertos: 140,
    m2_propios: null,
    m2_totales: 200,
```

En `client/src/components/PropiedadCard.test.tsx`, junto a `m2_totales: 200,` (línea ~18) agregar las tres claves nuevas con `null`:
```ts
    m2_terreno: null,
    m2_construidos: null,
    m2_propios: null,
```

Run (desde `client/`): `npx tsc --noEmit -p .`
Expected: sin errores. Si aparece otro objeto tipado `PropiedadListItem`/`Propiedad` sin los campos, agregarle las tres claves en `null` de la misma forma.

- [ ] **Step 3: Escribir los tests que fallan**

Crear `client/src/pages/admin/propiedades/Formulario.medidas.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PropiedadFormulario from './Formulario'
import { propiedadesApi } from '../../../api/propiedades'
import type { Propiedad } from '../../../types/propiedad'
import { useAuth } from '../../../context/AuthContext'

vi.mock('../../../api/propiedades', () => ({
  propiedadesApi: {
    obtener: vi.fn(), crear: vi.fn(), actualizar: vi.fn(),
    subirMedio: vi.fn(), eliminarMedio: vi.fn(), reordenarMedios: vi.fn(),
    agregarCaracteristica: vi.fn(), eliminarCaracteristica: vi.fn(),
  },
}))
vi.mock('../../../context/AuthContext', () => ({ useAuth: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  // Sin rol beta: el form no muestra propietario ni documentos (menos mocks).
  vi.mocked(useAuth).mockReturnValue({
    usuario: { id: 1, email: 'a@mambo.com.ar', is_active: true, roles: ['admin'], person_id: null },
    cargando: false, login: vi.fn(), logout: vi.fn(),
  })
})

const PROPIEDAD = {
  id: 7, titulo: 'Casa', descripcion: null,
  tipo_propiedad: 'casa', tipo_operacion: 'venta', estado_comercial: 'disponible',
  moneda: 'ARS', precio: null, dormitorios: null, banos: null,
  m2_terreno: 600, m2_construidos: null, m2_cubiertos: null, m2_propios: 240, m2_totales: null,
  ubicacion: null, medios: [], caracteristicas: [],
  propietario: null, propietario_persona_id: null, contrato_vigente: null,
  creado_en: '', actualizado_en: '', eliminado_en: null,
} as unknown as Propiedad

function renderEn(ruta: string) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/admin/propiedades/nueva" element={<PropiedadFormulario />} />
        <Route path="/admin/propiedades/:id/editar" element={<PropiedadFormulario />} />
        <Route path="/admin/propiedades" element={<p>lista</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

it('al crear manda las superficies cargadas y deja afuera las vacías', async () => {
  const usuario = userEvent.setup()
  vi.mocked(propiedadesApi.crear).mockResolvedValue({ id: 10 } as never)
  vi.mocked(propiedadesApi.obtener).mockResolvedValue({ ...PROPIEDAD, id: 10 })
  renderEn('/admin/propiedades/nueva')

  await usuario.type(screen.getByPlaceholderText(/Casa 3 dormitorios/), 'Casa')
  await usuario.type(screen.getByLabelText('m² terreno'), '600')
  await usuario.type(screen.getByLabelText('m² construidos'), '250')
  await usuario.type(screen.getByLabelText('m² propios'), '240')
  await usuario.click(screen.getByRole('button', { name: 'Crear propiedad' }))

  await waitFor(() => expect(propiedadesApi.crear).toHaveBeenCalled())
  const payload = vi.mocked(propiedadesApi.crear).mock.lastCall![0]
  expect(payload).toMatchObject({ m2_terreno: 600, m2_construidos: 250, m2_propios: 240 })
  expect(payload.m2_cubiertos).toBeUndefined()
  expect(payload.m2_totales).toBeUndefined()
})

it('al editar precarga las superficies guardadas', async () => {
  vi.mocked(propiedadesApi.obtener).mockResolvedValue(PROPIEDAD)
  renderEn('/admin/propiedades/7/editar')

  expect(await screen.findByLabelText('m² terreno')).toHaveValue(600)
  expect(screen.getByLabelText('m² propios')).toHaveValue(240)
  expect(screen.getByLabelText('m² construidos')).toHaveValue(null)
})
```

Y en `client/src/pages/public/Detalle.test.tsx`, al final del archivo:

```tsx
describe('Detalle — superficies', () => {
  it('muestra solo las superficies cargadas', async () => {
    await renderDetalle({
      m2_terreno: 600, m2_construidos: 250, m2_cubiertos: null, m2_propios: null, m2_totales: 600,
    })

    expect(screen.getByText('m² terreno')).toBeInTheDocument()
    expect(screen.getByText('m² construidos')).toBeInTheDocument()
    expect(screen.getByText('m² totales')).toBeInTheDocument()
    expect(screen.queryByText('m² cubiertos')).not.toBeInTheDocument()
    expect(screen.queryByText('m² propios')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Correr los tests y verificar que fallan**

Run (desde `client/`): `npx vitest run --pool=threads src/pages/admin/propiedades/Formulario.medidas.test.tsx src/pages/public/Detalle.test.tsx`
Expected: FAIL — `Unable to find a label with the text of: m² terreno` y, en Detalle, `Unable to find an element with the text: m² terreno`.

- [ ] **Step 5: Formulario — estado, carga y payload**

En `client/src/pages/admin/propiedades/Formulario.tsx`:

`FormState` — reemplazar
```ts
  m2_cubiertos:    string
  m2_totales:      string
```
por
```ts
  m2_terreno:      string
  m2_construidos:  string
  m2_cubiertos:    string
  m2_propios:      string
  m2_totales:      string
```

`INITIAL` — reemplazar
```ts
  dormitorios: '', banos: '', m2_cubiertos: '', m2_totales: '',
```
por
```ts
  dormitorios: '', banos: '',
  m2_terreno: '', m2_construidos: '', m2_cubiertos: '', m2_propios: '', m2_totales: '',
```

En el `setForm({...})` del `useEffect` de carga, reemplazar
```ts
          m2_cubiertos:     p.m2_cubiertos?.toString() ?? '',
          m2_totales:       p.m2_totales?.toString() ?? '',
```
por
```ts
          m2_terreno:       p.m2_terreno?.toString() ?? '',
          m2_construidos:   p.m2_construidos?.toString() ?? '',
          m2_cubiertos:     p.m2_cubiertos?.toString() ?? '',
          m2_propios:       p.m2_propios?.toString() ?? '',
          m2_totales:       p.m2_totales?.toString() ?? '',
```

En `payload` de `handleSubmit`, reemplazar
```ts
      m2_cubiertos:     num(form.m2_cubiertos),
      m2_totales:       num(form.m2_totales),
```
por
```ts
      m2_terreno:       num(form.m2_terreno),
      m2_construidos:   num(form.m2_construidos),
      m2_cubiertos:     num(form.m2_cubiertos),
      m2_propios:       num(form.m2_propios),
      m2_totales:       num(form.m2_totales),
```

- [ ] **Step 6: Formulario — sección "Medidas y ambientes"**

Reemplazar todo el bloque `{/* ── Medidas ── */}` (el `div.admin-card` con dormitorios, baños, m² cubiertos y m² totales) por:

```tsx
        {/* ── Medidas ── */}
        <div className="admin-card form-section">
          <h2 className="form-section-title">Medidas y ambientes</h2>
          <div className="form-row">
            <div className="form-field">
              <label htmlFor="dormitorios">Dormitorios</label>
              <input id="dormitorios" type="number" min="0" value={form.dormitorios} onChange={e => set('dormitorios', e.target.value)} placeholder="—" />
            </div>
            <div className="form-field">
              <label htmlFor="banos">Baños</label>
              <input id="banos" type="number" min="0" value={form.banos} onChange={e => set('banos', e.target.value)} placeholder="—" />
            </div>
          </div>
          {/* Todas opcionales: se carga solo la que aplica a la propiedad. */}
          <div className="form-row">
            {([
              ['m2_terreno',     'm² terreno'],
              ['m2_construidos', 'm² construidos'],
              ['m2_cubiertos',   'm² cubiertos'],
              ['m2_propios',     'm² propios'],
              ['m2_totales',     'm² totales'],
            ] as const).map(([campo, etiqueta]) => (
              <div className="form-field" key={campo}>
                <label htmlFor={campo}>{etiqueta}</label>
                <input id={campo} type="number" min="0" step="0.01" value={form[campo]} onChange={e => set(campo, e.target.value)} placeholder="—" />
              </div>
            ))}
          </div>
        </div>
```

- [ ] **Step 7: Ficha pública**

En `client/src/pages/public/Detalle.tsx`, reemplazar el bloque `detalle-specs` completo (desde `{(prop.dormitorios != null || ...` hasta su `)}` de cierre) por:

```tsx
          {(() => {
            const superficies = ([
              [prop.m2_terreno,     'm² terreno'],
              [prop.m2_construidos, 'm² construidos'],
              [prop.m2_cubiertos,   'm² cubiertos'],
              [prop.m2_propios,     'm² propios'],
              [prop.m2_totales,     'm² totales'],
            ] as const).filter(([valor]) => valor != null)
            if (prop.dormitorios == null && prop.banos == null && superficies.length === 0) return null
            return (
              <div className="detalle-specs">
                {prop.dormitorios != null && (
                  <div className="detalle-spec"><span className="v">{prop.dormitorios}</span><span className="k">Dormitorios</span></div>
                )}
                {prop.banos != null && (
                  <div className="detalle-spec"><span className="v">{prop.banos}</span><span className="k">Baños</span></div>
                )}
                {superficies.map(([valor, etiqueta]) => (
                  <div key={etiqueta} className="detalle-spec"><span className="v">{formatSuperficie(valor!)}</span><span className="k">{etiqueta}</span></div>
                ))}
              </div>
            )
          })()}
```

Si `formatSuperficie` no acepta `number` directo (revisar su firma en `client/src/lib/propiedad.ts`), adaptar el cast igual que ya lo hacían las líneas reemplazadas.

- [ ] **Step 8: Correr los tests y verificar que pasan**

Run (desde `client/`):
```
npx vitest run --pool=threads src/pages/admin/propiedades src/pages/public/Detalle.test.tsx src/components/PropiedadCard.test.tsx
npx tsc --noEmit -p .
```
Expected: todos PASS, `tsc` sin errores.

- [ ] **Step 9: No commitear.**

---

### Task 4: Frontend — reordenar fotos arrastrando

**Files:**
- Modify: `client/src/api/propiedades.ts` (sección Medios)
- Modify: `client/src/pages/admin/propiedades/Formulario.tsx` (estado, handler, `fotos-grid`, texto de ayuda)
- Modify: `client/src/pages/admin/propiedades/Formulario.css`
- Test: `client/src/pages/admin/propiedades/Formulario.fotos.test.tsx`

**Interfaces:**
- Consumes: `PUT /api/v1/propiedades/{id}/medios/orden` (Task 2).
- Produces: `propiedadesApi.reordenarMedios(propiedadId: number, orden: number[]): Promise<Medio[]>`.

- [ ] **Step 1: Escribir el test que falla**

Crear `client/src/pages/admin/propiedades/Formulario.fotos.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PropiedadFormulario from './Formulario'
import { propiedadesApi } from '../../../api/propiedades'
import type { Medio, Propiedad } from '../../../types/propiedad'
import { useAuth } from '../../../context/AuthContext'

vi.mock('../../../api/propiedades', () => ({
  propiedadesApi: {
    obtener: vi.fn(), crear: vi.fn(), actualizar: vi.fn(),
    subirMedio: vi.fn(), eliminarMedio: vi.fn(), reordenarMedios: vi.fn(),
    agregarCaracteristica: vi.fn(), eliminarCaracteristica: vi.fn(),
  },
}))
vi.mock('../../../context/AuthContext', () => ({ useAuth: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAuth).mockReturnValue({
    usuario: { id: 1, email: 'a@mambo.com.ar', is_active: true, roles: ['admin'], person_id: null },
    cargando: false, login: vi.fn(), logout: vi.fn(),
  })
})

function medio(id: number, descripcion: string, orden: number): Medio {
  return {
    id, propiedad_id: 7, tipo_medio: 'imagen', url: `/media/${id}.jpg`,
    descripcion, orden, es_principal: orden === 0, variantes: null, creado_en: '',
  }
}

const FOTOS = [medio(1, 'Frente', 0), medio(2, 'Lavadero', 1), medio(3, 'Living', 2)]

const PROPIEDAD = {
  id: 7, titulo: 'Casa', descripcion: null,
  tipo_propiedad: 'casa', tipo_operacion: 'venta', estado_comercial: 'disponible',
  moneda: 'ARS', precio: null, dormitorios: null, banos: null,
  m2_terreno: null, m2_construidos: null, m2_cubiertos: null, m2_propios: null, m2_totales: null,
  ubicacion: null, medios: FOTOS, caracteristicas: [],
  propietario: null, propietario_persona_id: null, contrato_vigente: null,
  creado_en: '', actualizado_en: '', eliminado_en: null,
} as unknown as Propiedad

function renderEdicion() {
  return render(
    <MemoryRouter initialEntries={['/admin/propiedades/7/editar']}>
      <Routes>
        <Route path="/admin/propiedades/:id/editar" element={<PropiedadFormulario />} />
      </Routes>
    </MemoryRouter>,
  )
}

const item = (alt: string) => screen.getByAltText(alt).closest('.foto-item')!

function arrastrar(origen: string, destino: string) {
  fireEvent.dragStart(item(origen))
  fireEvent.dragOver(item(destino))
  fireEvent.drop(item(destino))
  fireEvent.dragEnd(item(origen))
}

it('soltar una foto sobre otra manda el nuevo orden completo', async () => {
  vi.mocked(propiedadesApi.obtener).mockResolvedValue(PROPIEDAD)
  vi.mocked(propiedadesApi.reordenarMedios).mockResolvedValue([FOTOS[0], FOTOS[2], FOTOS[1]])
  renderEdicion()
  await screen.findByAltText('Lavadero')

  arrastrar('Lavadero', 'Living')

  await waitFor(() => expect(propiedadesApi.reordenarMedios).toHaveBeenCalledWith(7, [1, 3, 2]))
  const alts = screen.getAllByRole('img').map(img => img.getAttribute('alt'))
  expect(alts).toEqual(['Frente', 'Living', 'Lavadero'])
})

it('la etiqueta Principal sigue a la foto que queda primera', async () => {
  vi.mocked(propiedadesApi.obtener).mockResolvedValue(PROPIEDAD)
  vi.mocked(propiedadesApi.reordenarMedios).mockResolvedValue([
    { ...FOTOS[2], orden: 0, es_principal: true },
    { ...FOTOS[0], orden: 1, es_principal: false },
    { ...FOTOS[1], orden: 2, es_principal: false },
  ])
  renderEdicion()
  await screen.findByAltText('Living')

  arrastrar('Living', 'Frente')

  await waitFor(() => expect(within(item('Living')).getByText('Principal')).toBeInTheDocument())
  expect(within(item('Frente')).queryByText('Principal')).not.toBeInTheDocument()
})

it('soltar una foto sobre sí misma no llama al backend', async () => {
  vi.mocked(propiedadesApi.obtener).mockResolvedValue(PROPIEDAD)
  renderEdicion()
  await screen.findByAltText('Frente')

  arrastrar('Frente', 'Frente')

  expect(propiedadesApi.reordenarMedios).not.toHaveBeenCalled()
})

it('si el backend falla muestra el error', async () => {
  vi.mocked(propiedadesApi.obtener).mockResolvedValue(PROPIEDAD)
  vi.mocked(propiedadesApi.reordenarMedios).mockRejectedValue(new Error('Sin conexión'))
  renderEdicion()
  await screen.findByAltText('Frente')

  arrastrar('Living', 'Frente')

  expect(await screen.findByText('Sin conexión')).toBeInTheDocument()
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run (desde `client/`): `npx vitest run --pool=threads src/pages/admin/propiedades/Formulario.fotos.test.tsx`
Expected: FAIL — `reordenarMedios` nunca se llama (los items no son arrastrables todavía).

- [ ] **Step 3: API**

En `client/src/api/propiedades.ts`, después de `eliminarMedio`:

```ts
  // Manda todos los ids en el orden nuevo; la primera foto queda como principal.
  reordenarMedios: (propiedadId: number, orden: number[]) =>
    api.put<Medio[]>(`${BASE}/${propiedadId}/medios/orden`, { orden }),
```

- [ ] **Step 4: Formulario — estado y handler**

En `client/src/pages/admin/propiedades/Formulario.tsx`, junto a `const [subiendo, setSubiendo] = useState(false)`:

```ts
  const [arrastrando, setArrastrando] = useState<number | null>(null)
```

Después de `borrarMedio`:

```ts
  // Se guarda al soltar, sin botón aparte. Optimista, como subir y borrar: la
  // grilla cambia en el acto y después se pisa con lo que devuelve el backend,
  // que es quien decide cuál queda como principal.
  const soltarSobre = async (destinoId: number) => {
    const origenId = arrastrando
    setArrastrando(null)
    if (!id || origenId === null || origenId === destinoId) return

    // La foto toma el lugar del destino: hacia adelante queda después de él,
    // hacia atrás queda antes. Así se puede mandar una foto al final o al principio.
    const desde = medios.findIndex(m => m.id === origenId)
    const hasta = medios.findIndex(m => m.id === destinoId)
    const nuevo = [...medios]
    const [movido] = nuevo.splice(desde, 1)
    nuevo.splice(hasta, 0, movido)
    setMedios(nuevo)

    try {
      setMedios(await propiedadesApi.reordenarMedios(Number(id), nuevo.map(m => m.id)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo reordenar las fotos')
    }
  }
```

- [ ] **Step 5: Formulario — grilla arrastrable**

En el `fotos-grid`, reemplazar la apertura del item

```tsx
                <div key={m.id} className="foto-item">
```

por

```tsx
                <div
                  key={m.id}
                  className={`foto-item${arrastrando === m.id ? ' arrastrando' : ''}`}
                  draggable
                  onDragStart={e => {
                    e.dataTransfer?.setData('text/plain', String(m.id))
                    setArrastrando(m.id)
                  }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault()
                    soltarSobre(m.id)
                  }}
                  onDragEnd={() => setArrastrando(null)}
                >
```

(`setData` es necesario para que Firefox inicie el arrastre; en jsdom `dataTransfer` puede venir `undefined`, de ahí el `?.`.)

Y cambiar el texto de ayuda de edición:

```tsx
              La primera foto se usa como principal. Se suben al instante al seleccionarlas.
```

por

```tsx
              La primera foto se usa como principal. Arrastralas para cambiar el orden; se guarda al soltar.
```

- [ ] **Step 6: CSS**

En `client/src/pages/admin/propiedades/Formulario.css`, después del bloque `.foto-item img { ... }`:

```css
.foto-item[draggable='true'] { cursor: grab; }
.foto-item.arrastrando { opacity: 0.4; }
```

- [ ] **Step 7: Correr los tests y verificar que pasan**

Run (desde `client/`):
```
npx vitest run --pool=threads src/pages/admin/propiedades
npx tsc --noEmit -p .
```
Expected: todos PASS, `tsc` sin errores.

- [ ] **Step 8: Prueba manual en el navegador** (lo pide el CLAUDE.md para cambios de UI): levantar backend (`uvicorn app.main:app --reload --port 8000` desde `src/`) y frontend (`npm run dev` desde `client/`), entrar al admin, editar una propiedad con 3+ fotos y verificar: arrastrar una foto al final la deja última; arrastrar una a la primera posición le pone la etiqueta "Principal"; recargar la página conserva el orden. **Ojo:** el `.env` local apunta a Supabase (producción) — usar una propiedad de prueba, no una real publicada. Si no hay una, avisar a Matías en vez de reordenar fotos de una propiedad real.

- [ ] **Step 9: No commitear.**

---

### Task 5: Frontend — checklist de características

**Files:**
- Modify: `client/src/lib/propiedad.ts` (constante nueva)
- Modify: `client/src/pages/admin/propiedades/Formulario.tsx` (estado, handlers, sección nueva)
- Modify: `client/src/pages/admin/propiedades/Formulario.css`
- Modify: `client/src/pages/public/Detalle.tsx:197-204`
- Modify: `client/src/pages/public/Detalle.css:129-130`
- Modify: `client/src/pages/public/Detalle.test.tsx`
- Test: `client/src/pages/admin/propiedades/Formulario.caracteristicas.test.tsx`

**Interfaces:**
- Consumes: `propiedadesApi.agregarCaracteristica(propiedadId, { clave, valor }): Promise<Caracteristica>` y `propiedadesApi.eliminarCaracteristica(propiedadId, caracteristicaId): Promise<void>` (ya existen).
- Produces: `CATALOGO_CARACTERISTICAS: readonly string[]` y `VALOR_TILDADO = 'si'` exportados desde `client/src/lib/propiedad.ts`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `client/src/pages/admin/propiedades/Formulario.caracteristicas.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PropiedadFormulario from './Formulario'
import { propiedadesApi } from '../../../api/propiedades'
import type { Caracteristica, Propiedad } from '../../../types/propiedad'
import { useAuth } from '../../../context/AuthContext'

vi.mock('../../../api/propiedades', () => ({
  propiedadesApi: {
    obtener: vi.fn(), crear: vi.fn(), actualizar: vi.fn(),
    subirMedio: vi.fn(), eliminarMedio: vi.fn(), reordenarMedios: vi.fn(),
    agregarCaracteristica: vi.fn(), eliminarCaracteristica: vi.fn(),
  },
}))
vi.mock('../../../context/AuthContext', () => ({ useAuth: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAuth).mockReturnValue({
    usuario: { id: 1, email: 'a@mambo.com.ar', is_active: true, roles: ['admin'], person_id: null },
    cargando: false, login: vi.fn(), logout: vi.fn(),
  })
})

function caract(id: number, clave: string, valor: string): Caracteristica {
  return { id, propiedad_id: 7, clave, valor, creado_en: '' }
}

function propiedad(caracteristicas: Caracteristica[]): Propiedad {
  return {
    id: 7, titulo: 'Casa', descripcion: null,
    tipo_propiedad: 'casa', tipo_operacion: 'venta', estado_comercial: 'disponible',
    moneda: 'ARS', precio: null, dormitorios: null, banos: null,
    m2_terreno: null, m2_construidos: null, m2_cubiertos: null, m2_propios: null, m2_totales: null,
    ubicacion: null, medios: [], caracteristicas,
    propietario: null, propietario_persona_id: null, contrato_vigente: null,
    creado_en: '', actualizado_en: '', eliminado_en: null,
  } as unknown as Propiedad
}

function renderEn(ruta: string) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/admin/propiedades/nueva" element={<PropiedadFormulario />} />
        <Route path="/admin/propiedades/:id/editar" element={<PropiedadFormulario />} />
      </Routes>
    </MemoryRouter>,
  )
}

it('muestra tildadas las del catálogo que ya tiene la propiedad', async () => {
  vi.mocked(propiedadesApi.obtener).mockResolvedValue(propiedad([caract(1, 'Piscina', 'si')]))
  renderEn('/admin/propiedades/7/editar')

  expect(await screen.findByRole('checkbox', { name: 'Piscina' })).toBeChecked()
  expect(screen.getByRole('checkbox', { name: 'Asador' })).not.toBeChecked()
})

it('tildar crea la característica con valor "si"', async () => {
  const usuario = userEvent.setup()
  vi.mocked(propiedadesApi.obtener).mockResolvedValue(propiedad([]))
  vi.mocked(propiedadesApi.agregarCaracteristica).mockResolvedValue(caract(9, 'Asador', 'si'))
  renderEn('/admin/propiedades/7/editar')

  await usuario.click(await screen.findByRole('checkbox', { name: 'Asador' }))

  expect(propiedadesApi.agregarCaracteristica).toHaveBeenCalledWith(7, { clave: 'Asador', valor: 'si' })
  await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Asador' })).toBeChecked())
})

it('destildar borra la fila correspondiente', async () => {
  const usuario = userEvent.setup()
  vi.mocked(propiedadesApi.obtener).mockResolvedValue(propiedad([caract(4, 'Terraza', 'si')]))
  vi.mocked(propiedadesApi.eliminarCaracteristica).mockResolvedValue(undefined)
  renderEn('/admin/propiedades/7/editar')

  await usuario.click(await screen.findByRole('checkbox', { name: 'Terraza' }))

  expect(propiedadesApi.eliminarCaracteristica).toHaveBeenCalledWith(7, 4)
  await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Terraza' })).not.toBeChecked())
})

it('agrega y quita una característica libre', async () => {
  const usuario = userEvent.setup()
  vi.mocked(propiedadesApi.obtener).mockResolvedValue(propiedad([]))
  vi.mocked(propiedadesApi.agregarCaracteristica).mockResolvedValue(caract(5, 'Orientación', 'Norte'))
  vi.mocked(propiedadesApi.eliminarCaracteristica).mockResolvedValue(undefined)
  renderEn('/admin/propiedades/7/editar')

  await usuario.type(await screen.findByLabelText('Otra característica'), 'Orientación')
  await usuario.type(screen.getByLabelText('Valor'), 'Norte')
  await usuario.click(screen.getByRole('button', { name: 'Agregar' }))

  expect(propiedadesApi.agregarCaracteristica).toHaveBeenCalledWith(7, { clave: 'Orientación', valor: 'Norte' })
  expect(await screen.findByText('Orientación: Norte')).toBeInTheDocument()

  await usuario.click(screen.getByRole('button', { name: 'Quitar Orientación' }))
  expect(propiedadesApi.eliminarCaracteristica).toHaveBeenCalledWith(7, 5)
  await waitFor(() => expect(screen.queryByText('Orientación: Norte')).not.toBeInTheDocument())
})

it('una libre sin valor se guarda como tildada', async () => {
  const usuario = userEvent.setup()
  vi.mocked(propiedadesApi.obtener).mockResolvedValue(propiedad([]))
  vi.mocked(propiedadesApi.agregarCaracteristica).mockResolvedValue(caract(6, 'Bodega', 'si'))
  renderEn('/admin/propiedades/7/editar')

  await usuario.type(await screen.findByLabelText('Otra característica'), 'Bodega')
  await usuario.click(screen.getByRole('button', { name: 'Agregar' }))

  expect(propiedadesApi.agregarCaracteristica).toHaveBeenCalledWith(7, { clave: 'Bodega', valor: 'si' })
  expect(await screen.findByText('Bodega')).toBeInTheDocument()
})

it('al crear no muestra la sección (la propiedad todavía no existe)', () => {
  renderEn('/admin/propiedades/nueva')

  expect(screen.queryByRole('checkbox', { name: 'Piscina' })).not.toBeInTheDocument()
})
```

Y en `client/src/pages/public/Detalle.test.tsx`, al final del archivo:

```tsx
describe('Detalle — características', () => {
  it('las tildadas se muestran solo con el nombre y ✅', async () => {
    await renderDetalle({
      caracteristicas: [{ id: 1, propiedad_id: 1, clave: 'Piscina', valor: 'si', creado_en: '' }],
    })

    expect(screen.getByText('✅ Piscina')).toBeInTheDocument()
    expect(screen.queryByText(/Piscina: si/)).not.toBeInTheDocument()
  })

  it('las de texto libre siguen como "clave: valor"', async () => {
    await renderDetalle({
      caracteristicas: [{ id: 2, propiedad_id: 1, clave: 'Orientación', valor: 'Norte', creado_en: '' }],
    })

    expect(screen.getByText('Orientación: Norte')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run (desde `client/`): `npx vitest run --pool=threads src/pages/admin/propiedades/Formulario.caracteristicas.test.tsx src/pages/public/Detalle.test.tsx`
Expected: FAIL — `Unable to find role="checkbox" and name "Piscina"`; en Detalle, `Unable to find an element with the text: ✅ Piscina`.

- [ ] **Step 3: Catálogo**

En `client/src/lib/propiedad.ts`, al final:

```ts
/** Valor con el que se guarda una característica tildada (sin dato extra). */
export const VALOR_TILDADO = 'si'

/**
 * Amenities que se ofrecen como checkbox en el formulario. Cada una tildada se
 * guarda como `{ clave: <ítem>, valor: 'si' }`. Dormitorios y baños no van acá:
 * son campos numéricos propios de la propiedad.
 */
export const CATALOGO_CARACTERISTICAS = [
  'Suite principal con vestidor',
  'Escritorio',
  'Sala de juegos',
  'Dependencia de servicio con baño',
  'Galería techada y quincho',
  'Asador',
  'Piscina',
  'Terraza',
  'Cochera',
  'Balcón',
  'Jardín',
  'Lavadero',
  'Placards empotrados',
  'Cocina equipada',
  'Aire acondicionado',
  'Calefacción central',
  'Portón eléctrico',
  'Living comedor',
] as const
```

- [ ] **Step 4: Formulario — estado, carga y handlers**

En `client/src/pages/admin/propiedades/Formulario.tsx`:

Imports: agregar `Caracteristica` al import de tipos de `'../../../types/propiedad'`, y `CATALOGO_CARACTERISTICAS, VALOR_TILDADO` al import de `'../../../lib/propiedad'`.

Estado, junto a `medios`:

```ts
  const [caracteristicas, setCaracteristicas] = useState<Caracteristica[]>([])
  const [nuevaClave, setNuevaClave] = useState('')
  const [nuevoValor, setNuevoValor] = useState('')
```

En el `.then(p => { ... })` de carga, después de `setMedios(...)`:

```ts
        setCaracteristicas(p.caracteristicas)
```

Handlers, después de `soltarSobre`:

```ts
  // ── Características ──
  // Igual que las fotos: cada cambio va al backend en el acto.
  const esDelCatalogo = (c: Caracteristica) =>
    c.valor === VALOR_TILDADO && (CATALOGO_CARACTERISTICAS as readonly string[]).includes(c.clave)

  const agregarCaracteristica = async (clave: string, valor: string) => {
    if (!id) return
    try {
      const nueva = await propiedadesApi.agregarCaracteristica(Number(id), { clave, valor })
      setCaracteristicas(prev => [...prev, nueva])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo agregar la característica')
    }
  }

  const quitarCaracteristica = async (caracteristicaId: number) => {
    if (!id) return
    try {
      await propiedadesApi.eliminarCaracteristica(Number(id), caracteristicaId)
      setCaracteristicas(prev => prev.filter(c => c.id !== caracteristicaId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo quitar la característica')
    }
  }

  const alternarDelCatalogo = (clave: string) => {
    const existente = caracteristicas.find(c => c.clave === clave && c.valor === VALOR_TILDADO)
    if (existente) quitarCaracteristica(existente.id)
    else agregarCaracteristica(clave, VALOR_TILDADO)
  }

  const agregarLibre = async () => {
    const clave = nuevaClave.trim()
    if (!clave) return
    await agregarCaracteristica(clave, nuevoValor.trim() || VALOR_TILDADO)
    setNuevaClave('')
    setNuevoValor('')
  }
```

- [ ] **Step 5: Formulario — sección "Características"**

Entre el bloque `{/* ── Ubicación ── */}` y `{/* ── Fotos ── */}`:

```tsx
        {/* ── Características ── */}
        {esEdicion && (
          <div className="admin-card form-section">
            <h2 className="form-section-title">Características</h2>
            <p className="form-hint">Se guardan al instante al tildarlas.</p>

            <div className="caract-grid">
              {CATALOGO_CARACTERISTICAS.map(item => (
                <label key={item} className="caract-check">
                  <input
                    type="checkbox"
                    checked={caracteristicas.some(c => c.clave === item && c.valor === VALOR_TILDADO)}
                    onChange={() => alternarDelCatalogo(item)}
                  />
                  {item}
                </label>
              ))}
            </div>

            {caracteristicas.some(c => !esDelCatalogo(c)) && (
              <div className="caract-libres">
                {caracteristicas.filter(c => !esDelCatalogo(c)).map(c => (
                  <span key={c.id} className="caract-chip">
                    {c.valor === VALOR_TILDADO ? c.clave : `${c.clave}: ${c.valor}`}
                    <button type="button" onClick={() => quitarCaracteristica(c.id)} aria-label={`Quitar ${c.clave}`}>×</button>
                  </span>
                ))}
              </div>
            )}

            <div className="form-row">
              <div className="form-field">
                <label htmlFor="caract-clave">Otra característica</label>
                <input id="caract-clave" value={nuevaClave} onChange={e => setNuevaClave(e.target.value)} placeholder="Ej: Orientación" />
              </div>
              <div className="form-field">
                <label htmlFor="caract-valor">Valor</label>
                <input id="caract-valor" value={nuevoValor} onChange={e => setNuevoValor(e.target.value)} placeholder="Ej: Norte (opcional)" />
              </div>
              <div className="form-field caract-agregar">
                <button type="button" className="btn btn-outline" onClick={agregarLibre} disabled={!nuevaClave.trim()}>
                  Agregar
                </button>
              </div>
            </div>
          </div>
        )}
```

- [ ] **Step 6: CSS del formulario**

En `client/src/pages/admin/propiedades/Formulario.css`, antes de `/* ── Fotos ── */`:

```css
/* ── Características ──────────────────────────────────────── */

.caract-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr));
  gap: 0.5rem 1rem;
}

.caract-check {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.88rem;
  cursor: pointer;
}

.caract-libres { display: flex; flex-wrap: wrap; gap: 0.5rem; }

.caract-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0.35rem 0.25rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  font-size: 0.82rem;
}

.caract-chip button {
  border: none;
  background: none;
  color: var(--text-muted);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
}

.caract-agregar { justify-content: flex-end; }
```

- [ ] **Step 7: Ficha pública**

En `client/src/pages/public/Detalle.tsx`, importar `VALOR_TILDADO` desde `'../../lib/propiedad'` (sumarlo al import existente de ese módulo) y reemplazar

```tsx
                {prop.caracteristicas.map(c => (
                  <span key={c.id} className="detalle-caract-item">{c.clave}: {c.valor}</span>
                ))}
```

por

```tsx
                {prop.caracteristicas.map(c => c.valor === VALOR_TILDADO
                  ? <span key={c.id} className="detalle-caract-item detalle-caract-item--si">{`✅ ${c.clave}`}</span>
                  : <span key={c.id} className="detalle-caract-item">{`${c.clave}: ${c.valor}`}</span>,
                )}
```

(Template literal para que el texto quede en un solo nodo y `getByText('✅ Piscina')` lo encuentre.)

En `client/src/pages/public/Detalle.css`, después de la regla `.detalle-caract-item::before { ... }`:

```css
/* Las tildadas ya llevan ✅: el punto de viñeta sobra. */
.detalle-caract-item--si::before { display: none; }
```

- [ ] **Step 8: Correr los tests y verificar que pasan**

Run (desde `client/`):
```
npm test
npx tsc --noEmit -p .
```
Expected: toda la suite PASS, `tsc` sin errores.

- [ ] **Step 9: Prueba manual en el navegador**: con backend y frontend levantados (ver Task 4, mismo aviso sobre Supabase), en una propiedad de prueba tildar/destildar "Piscina", agregar "Orientación: Norte", recargar y verificar que persiste; abrir la ficha pública y ver "✅ Piscina" y "Orientación: Norte".

- [ ] **Step 10: No commitear.**

---

## Cierre

Al terminar las 5 tasks, correr las dos suites completas (`python -m pytest tests/ -q` en `src/`, `npm test` en `client/`) y listarle a Matías los archivos tocados. Recordarle que **antes de desplegar** hay que correr `alembic upgrade head` contra Supabase (migración `0012_superficies_propiedad`), porque Render no corre migraciones en el deploy.
