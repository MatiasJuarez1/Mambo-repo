# Contratos y documentos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adjuntar documentos (PDF/imagen) a propiedades, personas, operaciones y contratos de alquiler, con tipo, fecha y quién lo subió, visibles desde la ficha de cada entidad.

**Architecture:** Módulo nuevo `src/app/platform/documentos/` (models, schemas, service, router) dueño de la tabla `documentos`, con cuatro FKs nullable —exactamente una cargada, validado en el service— y endpoints planos `POST/GET /api/v1/documentos` + `DELETE /api/v1/documentos/{id}`. En el panel, un solo componente `BloqueDocumentos` que recibe la entidad como discriminated union y se inserta en las cuatro pantallas. Storage vía `app.storage.guardar_archivo` / `borrar_imagen` sin tocar ese módulo.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 + Alembic + pytest (SQLite en memoria) en `src/`; React + TypeScript + Vite + vitest + Testing Library en `client/`.

**Spec:** [docs/superpowers/specs/2026-09-21-contratos-documentos-design.md](../specs/2026-09-21-contratos-documentos-design.md)

## Global Constraints

- **No hacer `git commit` ni `git push`.** Todo queda en el working tree; Matías commitea. Los pasos "Commit" de este plan se reemplazan por "anotar los archivos tocados".
- Código, comentarios, docstrings y mensajes de API **en español**.
- Backend se ejecuta desde `src/` (`cd src`); `ruff check .` limpio en los archivos nuevos (line-length 100, reglas E/F/I/B/UP). `ruff format --check` solo sobre los archivos nuevos/tocados (hay archivos viejos que fallan y no son de este bloque).
- Frontend: los tests corren con `npx vitest run --pool=threads <ruta>` desde `client/` (el pool `forks` cuelga en Windows).
- Whitelist de archivos: `application/pdf`, `image/jpeg`, `image/png`, `image/heic`, `image/heif`; máximo `10 * 1024 * 1024` bytes.
- Catálogo de tipos: `boleto`, `reserva_firmada`, `dni`, `informe_dominio`, `anexo_fotografico`, `otro`.
- Clave de storage: `documentos/<propiedad|persona|deal|contrato>/<id>/<uuid4 hex><ext>`.
- Endpoints protegidos con `SOLO_STAFF = [Depends(require_role("staff", "admin"))]` por endpoint, no en el `APIRouter`.
- El componente `BloqueDocumentos` **no** renderiza `<form>` (vive adentro del `<form>` de `propiedades/Formulario.tsx`).

---

## Estructura de archivos

**Backend (crear):**
- `src/app/platform/documentos/__init__.py` — vacío.
- `src/app/platform/documentos/models.py` — `Documento`.
- `src/app/platform/documentos/schemas.py` — `TipoDocumento`, `DocumentoOut`.
- `src/app/platform/documentos/service.py` — `Entidad`, `resolver_entidad`, `subir`, `listar`, `obtener`, `borrar`.
- `src/app/platform/documentos/router.py` — `POST`, `GET`, `DELETE`.
- `src/alembic/versions/0009_documentos.py`.
- `src/tests/test_documentos.py`.

**Backend (modificar):**
- `src/app/main.py` — registrar el router.
- `src/alembic/env.py` — importar `documentos.models`.
- `src/tests/conftest.py` — importar `documentos.models`.
- `docs/despliegue.md` — nota de la migración 0009.

**Frontend (crear):**
- `client/src/types/documento.ts`
- `client/src/api/documentos.ts` + `client/src/api/documentos.test.ts`
- `client/src/components/crm/BloqueDocumentos/BloqueDocumentos.tsx`, `.css`, `.test.tsx`
- `client/src/pages/admin/propiedades/Formulario.documentos.test.tsx`

**Frontend (modificar):**
- `client/src/lib/formato.ts` + `formato.test.ts` — `formatearTamano`.
- `client/src/pages/admin/propiedades/Formulario.tsx`
- `client/src/pages/admin/personas/Ficha.tsx` + `Ficha.test.tsx`
- `client/src/pages/admin/operaciones/Ficha.tsx` + `Ficha.contrato.test.tsx`
- `client/src/pages/admin/alquileres/Ficha.tsx` + `Ficha.test.tsx`
- `client/src/pages/admin/propiedades/Formulario.propietario.test.tsx` (mock nuevo)

---

### Task 1: Modelo `Documento` y migración `0009_documentos`

**Files:**
- Create: `src/app/platform/documentos/__init__.py`
- Create: `src/app/platform/documentos/models.py`
- Create: `src/alembic/versions/0009_documentos.py`
- Modify: `src/alembic/env.py:20` (después del import de `people`)
- Modify: `src/tests/conftest.py:31` (después del import de `alquileres`)
- Test: `src/tests/test_documentos.py`

**Interfaces:**
- Produces: `app.platform.documentos.models.Documento` con columnas `id, tipo, propiedad_id, persona_id, deal_id, contrato_id, archivo_url, archivo_key, nombre_original, tamano_bytes, subido_por_user_id, created_at`, relación `usuario: User` y property `subido_por -> str`.

- [ ] **Step 1: Crear el paquete y el test que falla**

`src/app/platform/documentos/__init__.py`: archivo vacío.

`src/tests/test_documentos.py`:

```python
"""Bloque 3: documentos adjuntos a propiedad, persona, operación o contrato."""

from datetime import UTC, datetime

import pytest

from app.platform.documentos.models import Documento
from tests.helpers_crm import crear_propiedad


@pytest.fixture
def sesion(client, crear_usuario, iniciar_sesion, media_tmp):
    usuario = crear_usuario()
    iniciar_sesion()
    return usuario


def test_modelo_documento_se_persiste_con_una_fk(db, sesion):
    prop = crear_propiedad(db)
    doc = Documento(
        tipo="boleto",
        propiedad_id=prop.id,
        archivo_url="/media/documentos/propiedad/1/x.pdf",
        archivo_key="documentos/propiedad/1/x.pdf",
        nombre_original="boleto.pdf",
        tamano_bytes=10,
        subido_por_user_id=sesion.id,
        created_at=datetime.now(UTC),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    assert doc.id is not None
    assert doc.persona_id is None and doc.deal_id is None and doc.contrato_id is None
    assert doc.subido_por == sesion.name
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd src && python -m pytest tests/test_documentos.py -q`
Expected: `ModuleNotFoundError: No module named 'app.platform.documentos.models'`

- [ ] **Step 3: Escribir el modelo**

`src/app/platform/documentos/models.py`:

```python
"""Modelos ORM: documentos adjuntos.

Un documento cuelga de exactamente una entidad: propiedad, persona, operación
(deal) o contrato de alquiler. Se modela con cuatro FKs nullable en vez de una
FK polimórfica (`entity_type` + `entity_id`) para conservar la integridad
referencial: con `ondelete=CASCADE` la base borra la fila sola cuando se borra
la entidad dueña. La regla "exactamente una FK cargada" se valida en el
service, no con un CheckConstraint (criterio del resto del repo).
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Documento(Base):
    __tablename__ = "documentos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Catálogo: boleto | reserva_firmada | dni | informe_dominio | anexo_fotografico | otro.
    # Se valida en schemas.TipoDocumento; la base no lleva enum nativo.
    tipo: Mapped[str] = mapped_column(String(30), nullable=False)

    propiedad_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("propiedades.id", ondelete="CASCADE"), nullable=True, index=True
    )
    persona_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("people.id", ondelete="CASCADE"), nullable=True, index=True
    )
    deal_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("deals.id", ondelete="CASCADE"), nullable=True, index=True
    )
    contrato_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("alquileres_contratos.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    archivo_url: Mapped[str] = mapped_column(Text, nullable=False)
    # Lo que recibe `storage.borrar_imagen`; la URL es para el navegador.
    archivo_key: Mapped[str] = mapped_column(String(255), nullable=False)
    nombre_original: Mapped[str] = mapped_column(String(255), nullable=False)
    tamano_bytes: Mapped[int] = mapped_column(Integer, nullable=False)

    subido_por_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    usuario: Mapped[object] = relationship("User", foreign_keys=[subido_por_user_id], lazy="joined")

    @property
    def subido_por(self) -> str:
        return self.usuario.name
```

- [ ] **Step 4: Registrar el modelo en `conftest.py` y en `alembic/env.py`**

En `src/tests/conftest.py`, después de la línea `from app.platform.alquileres import models as alquileres_models  # noqa: F401`, agregar:

```python
from app.platform.documentos import models as documentos_models  # noqa: F401
```

En `src/alembic/env.py`, después de `from app.platform.deals import models as _deals_models  # noqa: F401`, agregar (respetando el orden alfabético que usa ruff/isort):

```python
from app.platform.documentos import models as _documentos_models  # noqa: F401
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `cd src && python -m pytest tests/test_documentos.py -q`
Expected: `1 passed`

- [ ] **Step 6: Escribir la migración**

`src/alembic/versions/0009_documentos.py`:

```python
"""Bloque 3: documentos adjuntos a propiedad, persona, deal o contrato

Una tabla con cuatro FKs nullable (exactamente una cargada, validado en la app)
y `ondelete=CASCADE` en las cuatro. Sin backfill: no hay documentos previos.

Revision ID: 0009_documentos
Revises: 0008_comisiones
Create Date: 2026-09-21

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0009_documentos"
down_revision: str | None = "0008_comisiones"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "documentos",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tipo", sa.String(30), nullable=False),
        sa.Column(
            "propiedad_id",
            sa.Integer(),
            sa.ForeignKey("propiedades.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "persona_id", sa.Integer(), sa.ForeignKey("people.id", ondelete="CASCADE"), nullable=True
        ),
        sa.Column(
            "deal_id", sa.Integer(), sa.ForeignKey("deals.id", ondelete="CASCADE"), nullable=True
        ),
        sa.Column(
            "contrato_id",
            sa.Integer(),
            sa.ForeignKey("alquileres_contratos.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("archivo_url", sa.Text(), nullable=False),
        sa.Column("archivo_key", sa.String(255), nullable=False),
        sa.Column("nombre_original", sa.String(255), nullable=False),
        sa.Column("tamano_bytes", sa.Integer(), nullable=False),
        sa.Column(
            "subido_por_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_documentos_propiedad_id", "documentos", ["propiedad_id"])
    op.create_index("ix_documentos_persona_id", "documentos", ["persona_id"])
    op.create_index("ix_documentos_deal_id", "documentos", ["deal_id"])
    op.create_index("ix_documentos_contrato_id", "documentos", ["contrato_id"])
    op.create_index("ix_documentos_subido_por_user_id", "documentos", ["subido_por_user_id"])


def downgrade() -> None:
    op.drop_table("documentos")
```

- [ ] **Step 7: Lint**

Run: `cd src && ruff check app/platform/documentos alembic/versions/0009_documentos.py alembic/env.py tests/conftest.py tests/test_documentos.py && ruff format --check app/platform/documentos alembic/versions/0009_documentos.py tests/test_documentos.py`
Expected: `All checks passed!` y `N files already formatted`. Si `format --check` falla, correr `ruff format` sobre esos mismos archivos.

- [ ] **Step 8: Anotar archivos tocados (sin commit)**

`src/app/platform/documentos/__init__.py`, `src/app/platform/documentos/models.py`, `src/alembic/versions/0009_documentos.py`, `src/alembic/env.py`, `src/tests/conftest.py`, `src/tests/test_documentos.py`.

---

### Task 2: Schemas, service y endpoints `POST` / `GET`

**Files:**
- Create: `src/app/platform/documentos/schemas.py`
- Create: `src/app/platform/documentos/service.py`
- Create: `src/app/platform/documentos/router.py`
- Modify: `src/app/main.py:14-23` (import) y `:61-70` (include_router)
- Test: `src/tests/test_documentos.py`

**Interfaces:**
- Consumes: `Documento` (Task 1); `app.storage.guardar_archivo(contenido: bytes, clave: str) -> ArchivoGuardado(url, clave)`; `app.modules.propiedades.service.obtener_propiedad(db, id)`, `app.platform.people.service.get_person_or_404(db, id)`, `app.platform.deals.service.get_deal_or_404(db, id)`, `app.platform.alquileres.service.obtener_contrato(db, id)` (todos levantan `HTTPException(404)`).
- Produces:
  - `schemas.TipoDocumento` (Literal), `schemas.DocumentoOut`.
  - `service.Entidad(columna: str, carpeta: str, id: int)`.
  - `service.resolver_entidad(db, *, propiedad_id, persona_id, deal_id, contrato_id) -> Entidad`.
  - `service.subir(db, *, tipo: str, entidad: Entidad, archivo: UploadFile, user_id: int) -> Documento`.
  - `service.listar(db, entidad: Entidad) -> list[Documento]`.
  - Rutas `POST /api/v1/documentos` (201) y `GET /api/v1/documentos`.

- [ ] **Step 1: Agregar los tests de API que fallan**

Agregar al final de `src/tests/test_documentos.py` (y sumar los imports que faltan arriba: `from app.platform.deals.models import Deal`, `from tests.helpers_crm import crear_contrato_de_prueba, crear_persona, etapa, pipeline_por_nombre`):

```python
API = "/api/v1/documentos"


def _pdf(nombre: str = "doc.pdf") -> dict:
    return {"archivo": (nombre, b"%PDF-1.4 contenido", "application/pdf")}


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


@pytest.mark.parametrize(
    "campo",
    ["propiedad_id", "persona_id", "deal_id", "contrato_id"],
)
def test_subir_a_cada_entidad(client, db, sesion, media_tmp, campo):
    ids = {
        "propiedad_id": lambda: crear_propiedad(db).id,
        "persona_id": lambda: crear_persona(db).id,
        "deal_id": lambda: _crear_deal(client, db),
        "contrato_id": lambda: crear_contrato_de_prueba(db, sesion.id).id,
    }
    entidad_id = ids[campo]()

    r = client.post(API, data={"tipo": "dni", campo: str(entidad_id)}, files=_pdf("dni_ana.pdf"))
    assert r.status_code == 201, r.text
    cuerpo = r.json()
    assert cuerpo["tipo"] == "dni"
    assert cuerpo["nombre_original"] == "dni_ana.pdf"
    assert cuerpo["tamano_bytes"] == len(b"%PDF-1.4 contenido")
    assert cuerpo["subido_por"] == sesion.name
    assert cuerpo["archivo_url"].endswith(".pdf")

    doc = db.get(Documento, cuerpo["id"])
    assert getattr(doc, campo) == entidad_id
    otras = {"propiedad_id", "persona_id", "deal_id", "contrato_id"} - {campo}
    assert all(getattr(doc, otra) is None for otra in otras)
    carpeta = campo.removesuffix("_id")
    assert doc.archivo_key.startswith(f"documentos/{carpeta}/{entidad_id}/")
    assert (media_tmp / doc.archivo_key).exists()


def test_sin_entidad_o_con_dos_422(client, db, sesion):
    prop = crear_propiedad(db)
    persona = crear_persona(db)

    r = client.post(API, data={"tipo": "dni"}, files=_pdf())
    assert r.status_code == 422
    assert "exactamente una entidad" in r.json()["detail"]

    r = client.post(
        API,
        data={"tipo": "dni", "propiedad_id": str(prop.id), "persona_id": str(persona.id)},
        files=_pdf(),
    )
    assert r.status_code == 422

    assert client.get(API).status_code == 422
    assert client.get(f"{API}?propiedad_id={prop.id}&persona_id={persona.id}").status_code == 422


def test_entidad_inexistente_404(client, db, sesion):
    r = client.post(API, data={"tipo": "dni", "propiedad_id": "9999"}, files=_pdf())
    assert r.status_code == 404
    assert r.json()["detail"] == "Propiedad no encontrada"

    r = client.post(API, data={"tipo": "dni", "persona_id": "9999"}, files=_pdf())
    assert r.status_code == 404
    assert r.json()["detail"] == "Persona no encontrada"

    r = client.post(API, data={"tipo": "dni", "deal_id": "9999"}, files=_pdf())
    assert r.status_code == 404
    assert r.json()["detail"] == "Deal no encontrado"

    r = client.post(API, data={"tipo": "dni", "contrato_id": "9999"}, files=_pdf())
    assert r.status_code == 404
    assert r.json()["detail"] == "Contrato no encontrado"


def test_deal_soft_deleted_404(client, db, sesion):
    deal_id = _crear_deal(client, db)
    assert client.delete(f"/api/v1/deals/{deal_id}").status_code == 204
    assert db.get(Deal, deal_id).deleted_at is not None

    r = client.post(API, data={"tipo": "boleto", "deal_id": str(deal_id)}, files=_pdf())
    assert r.status_code == 404


def test_tipo_fuera_del_catalogo_422(client, db, sesion):
    prop = crear_propiedad(db)
    r = client.post(API, data={"tipo": "escritura", "propiedad_id": str(prop.id)}, files=_pdf())
    assert r.status_code == 422


def test_archivo_invalido_422_y_grande_413(client, db, sesion):
    prop = crear_propiedad(db)
    r = client.post(
        API,
        data={"tipo": "otro", "propiedad_id": str(prop.id)},
        files={"archivo": ("a.txt", b"hola", "text/plain")},
    )
    assert r.status_code == 422
    assert r.json()["detail"] == "El documento debe ser PDF o imagen (JPG, PNG, HEIC)"

    grande = b"%PDF" + b"0" * (10 * 1024 * 1024 + 1)
    r = client.post(
        API,
        data={"tipo": "otro", "propiedad_id": str(prop.id)},
        files={"archivo": ("a.pdf", grande, "application/pdf")},
    )
    assert r.status_code == 413
    assert r.json()["detail"] == "El documento supera los 10 MB"


def test_listar_filtra_por_entidad_y_ordena_desc(client, db, sesion, media_tmp):
    prop_a = crear_propiedad(db, titulo="A")
    prop_b = crear_propiedad(db, titulo="B")
    client.post(API, data={"tipo": "boleto", "propiedad_id": str(prop_a.id)}, files=_pdf("1.pdf"))
    client.post(API, data={"tipo": "dni", "propiedad_id": str(prop_a.id)}, files=_pdf("2.pdf"))
    client.post(API, data={"tipo": "otro", "propiedad_id": str(prop_b.id)}, files=_pdf("3.pdf"))

    r = client.get(f"{API}?propiedad_id={prop_a.id}")
    assert r.status_code == 200
    nombres = [d["nombre_original"] for d in r.json()]
    assert nombres == ["2.pdf", "1.pdf"]

    assert [d["nombre_original"] for d in client.get(f"{API}?propiedad_id={prop_b.id}").json()] == [
        "3.pdf"
    ]


def test_anonimo_401(client, db):
    prop = crear_propiedad(db)
    assert client.get(f"{API}?propiedad_id={prop.id}").status_code == 401
    r = client.post(API, data={"tipo": "dni", "propiedad_id": str(prop.id)}, files=_pdf())
    assert r.status_code == 401
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd src && python -m pytest tests/test_documentos.py -q`
Expected: los tests nuevos fallan con `404 Not Found` en `/api/v1/documentos` (la ruta no existe); el de Task 1 sigue pasando.

- [ ] **Step 3: Escribir `schemas.py`**

`src/app/platform/documentos/schemas.py`:

```python
"""DTOs de documentos. El alta es multipart (sin schema de entrada JSON)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

# Única fuente del catálogo: la base guarda un String(30) sin enum nativo.
TipoDocumento = Literal[
    "boleto", "reserva_firmada", "dni", "informe_dominio", "anexo_fotografico", "otro"
]


class DocumentoOut(BaseModel):
    id: int
    tipo: TipoDocumento
    archivo_url: str
    nombre_original: str
    tamano_bytes: int
    subido_por: str
    created_at: datetime

    model_config = {"from_attributes": True}
```

- [ ] **Step 4: Escribir `service.py`**

`src/app/platform/documentos/service.py`:

```python
"""Documentos adjuntos: subir, listar y borrar, para cualquiera de las cuatro entidades."""

from __future__ import annotations

import uuid
from typing import NamedTuple

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.modules.propiedades.service import obtener_propiedad
from app.platform.alquileres.service import obtener_contrato
from app.platform.deals.service import get_deal_or_404
from app.platform.documentos.models import Documento
from app.platform.people.service import get_person_or_404
from app.storage import borrar_imagen, guardar_archivo

MAX_BYTES = 10 * 1024 * 1024
# Misma whitelist que los comprobantes de gastos. HEIC entra por las fotos de iPhone.
EXTENSIONES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/heic": ".heic",
    "image/heif": ".heif",
}
CARPETA = "documentos"


class Entidad(NamedTuple):
    """La entidad dueña ya resuelta: qué columna de `Documento` se carga y con qué id."""

    columna: str
    carpeta: str
    id: int


# (columna, carpeta en storage, getter del módulo dueño que levanta su propio 404)
_ENTIDADES = (
    ("propiedad_id", "propiedad", obtener_propiedad),
    ("persona_id", "persona", get_person_or_404),
    ("deal_id", "deal", get_deal_or_404),
    ("contrato_id", "contrato", obtener_contrato),
)


def resolver_entidad(
    db: Session,
    *,
    propiedad_id: int | None,
    persona_id: int | None,
    deal_id: int | None,
    contrato_id: int | None,
) -> Entidad:
    """Exige exactamente una FK y verifica que la entidad exista (con su soft delete)."""
    valores = {
        "propiedad_id": propiedad_id,
        "persona_id": persona_id,
        "deal_id": deal_id,
        "contrato_id": contrato_id,
    }
    cargadas = [columna for columna, valor in valores.items() if valor is not None]
    if len(cargadas) != 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Debe indicar exactamente una entidad: propiedad, persona, operación o contrato",
        )
    columna = cargadas[0]
    _, carpeta, obtener = next(e for e in _ENTIDADES if e[0] == columna)
    entidad_id = valores[columna]
    assert entidad_id is not None
    obtener(db, entidad_id)
    return Entidad(columna=columna, carpeta=carpeta, id=entidad_id)


def subir(
    db: Session, *, tipo: str, entidad: Entidad, archivo: UploadFile, user_id: int
) -> Documento:
    extension = EXTENSIONES.get(archivo.content_type or "")
    if extension is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El documento debe ser PDF o imagen (JPG, PNG, HEIC)",
        )
    contenido = archivo.file.read()
    if len(contenido) > MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="El documento supera los 10 MB",
        )

    clave = f"{CARPETA}/{entidad.carpeta}/{entidad.id}/{uuid.uuid4().hex}{extension}"
    guardado = guardar_archivo(contenido, clave)

    doc = Documento(
        tipo=tipo,
        archivo_url=guardado.url,
        archivo_key=guardado.clave or clave,
        nombre_original=archivo.filename or f"documento{extension}",
        tamano_bytes=len(contenido),
        subido_por_user_id=user_id,
        **{entidad.columna: entidad.id},
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


def listar(db: Session, entidad: Entidad) -> list[Documento]:
    columna = getattr(Documento, entidad.columna)
    return (
        db.query(Documento)
        .filter(columna == entidad.id)
        .order_by(Documento.created_at.desc(), Documento.id.desc())
        .all()
    )


def obtener(db: Session, documento_id: int) -> Documento:
    doc = db.get(Documento, documento_id)
    if doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Documento no encontrado"
        )
    return doc


def borrar(db: Session, documento_id: int) -> None:
    """El archivo primero, la fila después; un huérfano en el bucket es basura barata."""
    doc = obtener(db, documento_id)
    borrar_imagen(doc.archivo_url, doc.archivo_key)
    db.delete(doc)
    db.commit()
```

- [ ] **Step 5: Escribir `router.py` con `POST` y `GET`**

`src/app/platform/documentos/router.py`:

```python
"""Router documentos: alta multipart, listado por entidad y borrado. Solo staff."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.platform.auth.dependencies import get_current_user, require_role
from app.platform.auth.models import User
from app.platform.documentos import service
from app.platform.documentos.schemas import DocumentoOut, TipoDocumento

router = APIRouter(prefix="/documentos", tags=["documentos"])

# Por endpoint y no en el APIRouter, siguiendo el criterio del resto de los módulos.
SOLO_STAFF = [Depends(require_role("staff", "admin"))]


@router.post(
    "", response_model=DocumentoOut, status_code=status.HTTP_201_CREATED, dependencies=SOLO_STAFF
)
def subir_documento(
    tipo: Annotated[TipoDocumento, Form()],
    archivo: Annotated[UploadFile, File()],
    propiedad_id: Annotated[int | None, Form()] = None,
    persona_id: Annotated[int | None, Form()] = None,
    deal_id: Annotated[int | None, Form()] = None,
    contrato_id: Annotated[int | None, Form()] = None,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_current_user),
) -> DocumentoOut:
    entidad = service.resolver_entidad(
        db,
        propiedad_id=propiedad_id,
        persona_id=persona_id,
        deal_id=deal_id,
        contrato_id=contrato_id,
    )
    doc = service.subir(db, tipo=tipo, entidad=entidad, archivo=archivo, user_id=usuario.id)
    return DocumentoOut.model_validate(doc)


@router.get("", response_model=list[DocumentoOut], dependencies=SOLO_STAFF)
def listar_documentos(
    propiedad_id: int | None = Query(default=None),
    persona_id: int | None = Query(default=None),
    deal_id: int | None = Query(default=None),
    contrato_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[DocumentoOut]:
    entidad = service.resolver_entidad(
        db,
        propiedad_id=propiedad_id,
        persona_id=persona_id,
        deal_id=deal_id,
        contrato_id=contrato_id,
    )
    return [DocumentoOut.model_validate(d) for d in service.listar(db, entidad)]
```

- [ ] **Step 6: Registrar el router en `main.py`**

En `src/app/main.py`, en el bloque de imports de plataforma (orden alfabético), después de `from app.platform.deals.router import router as deals_router`:

```python
from app.platform.documentos.router import router as documentos_router
```

Y después de `app.include_router(reportes_router, prefix="/api/v1")`:

```python
app.include_router(documentos_router, prefix="/api/v1")
```

- [ ] **Step 7: Correr los tests**

Run: `cd src && python -m pytest tests/test_documentos.py -q`
Expected: todos pasan (`test_subir_a_cada_entidad` corre 4 veces por el parametrize). `DELETE /api/v1/deals/{id}` existe en `deals/router.py:258` y hace soft delete con 204.

- [ ] **Step 8: Lint**

Run: `cd src && ruff check app/platform/documentos app/main.py tests/test_documentos.py && ruff format --check app/platform/documentos tests/test_documentos.py`
Expected: limpio.

- [ ] **Step 9: Anotar archivos tocados (sin commit)**

`src/app/platform/documentos/schemas.py`, `service.py`, `router.py`, `src/app/main.py`, `src/tests/test_documentos.py`.

---

### Task 3: `DELETE`, borrado en cascada y nota de despliegue

**Files:**
- Modify: `src/app/platform/documentos/router.py` (agregar `DELETE`)
- Modify: `docs/despliegue.md` (nota corta)
- Test: `src/tests/test_documentos.py`

**Interfaces:**
- Consumes: `service.obtener`, `service.borrar` (Task 2).
- Produces: `DELETE /api/v1/documentos/{documento_id}` → 204.

- [ ] **Step 1: Tests que fallan**

Agregar al final de `src/tests/test_documentos.py` (sumar `from sqlalchemy import text` a los imports, y `from app.platform.alquileres.models import Contrato`, `from app.modules.propiedades.models import Propiedad`, `from app.platform.people.models import Person`):

```python
def test_borrar_quita_fila_y_archivo(client, db, sesion, media_tmp):
    prop = crear_propiedad(db)
    r = client.post(API, data={"tipo": "boleto", "propiedad_id": str(prop.id)}, files=_pdf())
    doc_id = r.json()["id"]
    clave = db.get(Documento, doc_id).archivo_key
    assert (media_tmp / clave).exists()

    assert client.delete(f"{API}/{doc_id}").status_code == 204
    assert db.get(Documento, doc_id) is None
    assert not (media_tmp / clave).exists()

    r = client.delete(f"{API}/{doc_id}")
    assert r.status_code == 404
    assert r.json()["detail"] == "Documento no encontrado"


def test_borrar_anonimo_401(client, db):
    assert client.delete(f"{API}/1").status_code == 401


def _subir_y_obtener(client, db, campo: str, entidad_id: int) -> Documento:
    r = client.post(API, data={"tipo": "otro", campo: str(entidad_id)}, files=_pdf())
    assert r.status_code == 201, r.text
    return db.get(Documento, r.json()["id"])


def _borrar_con_fks(db, fila) -> None:
    """SQLite no aplica FKs por defecto y el engine de conftest no lo activa.
    Se activa solo en esta sesión, fuera de transacción, para probar el CASCADE."""
    db.commit()
    db.execute(text("PRAGMA foreign_keys=ON"))
    db.delete(fila)
    db.commit()


def test_cascade_propiedad(client, db, sesion, media_tmp):
    prop = crear_propiedad(db)
    doc = _subir_y_obtener(client, db, "propiedad_id", prop.id)
    _borrar_con_fks(db, db.get(Propiedad, prop.id))
    assert db.get(Documento, doc.id) is None


def test_cascade_persona(client, db, sesion, media_tmp):
    persona = crear_persona(db)
    doc = _subir_y_obtener(client, db, "persona_id", persona.id)
    _borrar_con_fks(db, db.get(Person, persona.id))
    assert db.get(Documento, doc.id) is None


def test_cascade_deal(client, db, sesion, media_tmp):
    deal_id = _crear_deal(client, db)
    doc = _subir_y_obtener(client, db, "deal_id", deal_id)
    _borrar_con_fks(db, db.get(Deal, deal_id))
    assert db.get(Documento, doc.id) is None


def test_cascade_contrato(client, db, sesion, media_tmp):
    contrato = crear_contrato_de_prueba(db, sesion.id)
    doc = _subir_y_obtener(client, db, "contrato_id", contrato.id)
    _borrar_con_fks(db, db.get(Contrato, contrato.id))
    assert db.get(Documento, doc.id) is None
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd src && python -m pytest tests/test_documentos.py -q -k "borrar or cascade"`
Expected: `test_borrar_quita_fila_y_archivo` y `test_borrar_anonimo_401` fallan con 405 (Method Not Allowed). Los de cascade pueden pasar ya (la FK está desde Task 1) — está bien; confirman el `ondelete=CASCADE`.

Si algún `test_cascade_*` falla con `IntegrityError` por otra FK (`RESTRICT`) de la entidad dueña —por ejemplo, un deal con `deal_parties` o `deal_stage_history`—, eso no es un bug de este módulo: el `CASCADE` de `documentos` sí funcionó pero otra tabla bloquea el borrado. En ese caso, en el test borrar primero esas filas hijas con `db.query(Modelo).filter(...).delete()` antes de `_borrar_con_fks`, o borrar con `db.execute(text("DELETE FROM deals WHERE id = :id"), {"id": deal_id})` después de activar el PRAGMA. Documentarlo en un comentario del test.

- [ ] **Step 3: Agregar el `DELETE` al router**

Al final de `src/app/platform/documentos/router.py`:

```python
@router.delete(
    "/{documento_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=SOLO_STAFF
)
def borrar_documento(documento_id: int, db: Session = Depends(get_db)) -> None:
    service.borrar(db, documento_id)
```

- [ ] **Step 4: Correr toda la suite del módulo**

Run: `cd src && python -m pytest tests/test_documentos.py -q`
Expected: todos pasan.

- [ ] **Step 5: Correr la suite completa del backend**

Run: `cd src && python -m pytest tests/ -q`
Expected: todo verde. Si algo ajeno falla por el `PRAGMA foreign_keys` (no debería: es por conexión y `StaticPool` comparte una sola conexión *por test*, cada test crea su engine), revisar que `_borrar_con_fks` solo se llame en los tests de cascade.

- [ ] **Step 6: Nota en `docs/despliegue.md`**

Buscar en `docs/despliegue.md` la sección donde se describen las migraciones pendientes (la que menciona `0008_comisiones` / "Supabase está en 0005"). Agregar debajo una línea:

```markdown
- `0009_documentos` (Bloque 3): una tabla nueva `documentos`, sin backfill ni variables nuevas. Usa el `STORAGE_BACKEND` ya configurado; en Render tiene que ser `r2` como el resto.
```

Si la sección no existe con ese formato, agregar la nota al final del apartado de migraciones con el mismo tono que las anteriores.

- [ ] **Step 7: Lint**

Run: `cd src && ruff check app/platform/documentos tests/test_documentos.py && ruff format --check app/platform/documentos tests/test_documentos.py`
Expected: limpio.

- [ ] **Step 8: Anotar archivos tocados (sin commit)**

`src/app/platform/documentos/router.py`, `src/tests/test_documentos.py`, `docs/despliegue.md`.

---

### Task 4: Tipos, API y `formatearTamano` en el frontend

**Files:**
- Create: `client/src/types/documento.ts`
- Create: `client/src/api/documentos.ts`
- Create: `client/src/api/documentos.test.ts`
- Modify: `client/src/lib/formato.ts` (agregar al final)
- Modify: `client/src/lib/formato.test.ts` (agregar al final)

**Interfaces:**
- Consumes: `api` de `client/src/api/client.ts` (`api.get<T>(path)`, `api.post<T>(path, FormData)`, `api.delete<void>(path)`), `construirQuery` de `client/src/lib/query.ts`.
- Produces:
  - `types/documento.ts`: `TipoDocumento`, `TIPOS_DOCUMENTO: TipoDocumento[]`, `ETIQUETAS_TIPO_DOCUMENTO: Record<TipoDocumento, string>`, `DocumentoOut`, `EntidadDocumento`.
  - `api/documentos.ts`: `documentosApi.listar(entidad)`, `documentosApi.subir(entidad, tipo, archivo)`, `documentosApi.eliminar(id)`, y el helper exportado `paramsDeEntidad(entidad): Record<string, number>`.
  - `lib/formato.ts`: `formatearTamano(bytes: number): string`.

- [ ] **Step 1: Test de `formatearTamano` que falla**

Agregar al final de `client/src/lib/formato.test.ts`:

```ts
import { formatearTamano } from './formato'

describe('formatearTamano', () => {
  it('bytes, KB y MB con una decimal y coma', () => {
    expect(formatearTamano(0)).toBe('0 B')
    expect(formatearTamano(512)).toBe('512 B')
    expect(formatearTamano(1024)).toBe('1 KB')
    expect(formatearTamano(348_160)).toBe('340 KB')
    expect(formatearTamano(1_258_291)).toBe('1,2 MB')
    expect(formatearTamano(10 * 1024 * 1024)).toBe('10 MB')
  })
})
```

(Si el archivo ya importa desde `./formato` arriba, sumar `formatearTamano` a ese import en vez de repetirlo.)

- [ ] **Step 2: Correr y ver que falla**

Run: `cd client && npx vitest run --pool=threads src/lib/formato.test.ts`
Expected: FAIL — `formatearTamano is not a function` / no exportado.

- [ ] **Step 3: Implementar `formatearTamano`**

Agregar al final de `client/src/lib/formato.ts`:

```ts
/** `1258291` → "1,2 MB". Una decimal como máximo; sin decimales si es entero. */
export function formatearTamano(bytes: number): string {
  const formato = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 1 })
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${formato(bytes / 1024)} KB`
  return `${formato(bytes / (1024 * 1024))} MB`
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `cd client && npx vitest run --pool=threads src/lib/formato.test.ts`
Expected: PASS.

- [ ] **Step 5: Tipos**

`client/src/types/documento.ts`:

```ts
export type TipoDocumento =
  | 'boleto'
  | 'reserva_firmada'
  | 'dni'
  | 'informe_dominio'
  | 'anexo_fotografico'
  | 'otro'

export const TIPOS_DOCUMENTO: TipoDocumento[] = [
  'boleto', 'reserva_firmada', 'dni', 'informe_dominio', 'anexo_fotografico', 'otro',
]

export const ETIQUETAS_TIPO_DOCUMENTO: Record<TipoDocumento, string> = {
  boleto: 'Boleto',
  reserva_firmada: 'Reserva firmada',
  dni: 'DNI',
  informe_dominio: 'Informe de dominio',
  anexo_fotografico: 'Anexo fotográfico',
  otro: 'Otro',
}

export interface DocumentoOut {
  id: number
  tipo: TipoDocumento
  archivo_url: string
  nombre_original: string
  tamano_bytes: number
  subido_por: string
  created_at: string
}

/** Exactamente una entidad dueña; TypeScript impide pasar dos. */
export type EntidadDocumento =
  | { propiedadId: number }
  | { personaId: number }
  | { dealId: number }
  | { contratoId: number }
```

- [ ] **Step 6: Test de la API que falla**

`client/src/api/documentos.test.ts`:

```ts
import { documentosApi, paramsDeEntidad } from './documentos'
import { api } from './client'

vi.mock('./client', () => ({ api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }))

beforeEach(() => vi.clearAllMocks())

it('paramsDeEntidad traduce cada variante a su query param', () => {
  expect(paramsDeEntidad({ propiedadId: 7 })).toEqual({ propiedad_id: 7 })
  expect(paramsDeEntidad({ personaId: 3 })).toEqual({ persona_id: 3 })
  expect(paramsDeEntidad({ dealId: 9 })).toEqual({ deal_id: 9 })
  expect(paramsDeEntidad({ contratoId: 2 })).toEqual({ contrato_id: 2 })
})

it('listar pega al endpoint con el filtro de la entidad', async () => {
  vi.mocked(api.get).mockResolvedValue([])
  await documentosApi.listar({ dealId: 9 })
  expect(api.get).toHaveBeenCalledWith('/api/v1/documentos?deal_id=9')
})

it('subir manda FormData con tipo, archivo y la entidad', async () => {
  vi.mocked(api.post).mockResolvedValue({})
  const archivo = new File(['x'], 'dni.pdf', { type: 'application/pdf' })
  await documentosApi.subir({ personaId: 3 }, 'dni', archivo)
  const [ruta, body] = vi.mocked(api.post).mock.calls[0]
  expect(ruta).toBe('/api/v1/documentos')
  expect(body).toBeInstanceOf(FormData)
  const fd = body as FormData
  expect(fd.get('tipo')).toBe('dni')
  expect(fd.get('persona_id')).toBe('3')
  expect(fd.get('archivo')).toBe(archivo)
})

it('eliminar pega al DELETE por id', async () => {
  vi.mocked(api.delete).mockResolvedValue(undefined)
  await documentosApi.eliminar(12)
  expect(api.delete).toHaveBeenCalledWith('/api/v1/documentos/12')
})
```

- [ ] **Step 7: Correr y ver que falla**

Run: `cd client && npx vitest run --pool=threads src/api/documentos.test.ts`
Expected: FAIL — no existe `./documentos`.

- [ ] **Step 8: Implementar la API**

`client/src/api/documentos.ts`:

```ts
import { api } from './client'
import { construirQuery } from '../lib/query'
import type { DocumentoOut, EntidadDocumento, TipoDocumento } from '../types/documento'

const BASE = '/api/v1/documentos'

/** La entidad como la espera el backend: exactamente un `<entidad>_id`. */
export function paramsDeEntidad(entidad: EntidadDocumento): Record<string, number> {
  if ('propiedadId' in entidad) return { propiedad_id: entidad.propiedadId }
  if ('personaId' in entidad) return { persona_id: entidad.personaId }
  if ('dealId' in entidad) return { deal_id: entidad.dealId }
  return { contrato_id: entidad.contratoId }
}

export const documentosApi = {
  listar: (entidad: EntidadDocumento) =>
    api.get<DocumentoOut[]>(`${BASE}${construirQuery(paramsDeEntidad(entidad))}`),

  // FormData: `api.post` deja que el navegador ponga el Content-Type con el boundary.
  subir: (entidad: EntidadDocumento, tipo: TipoDocumento, archivo: File) => {
    const fd = new FormData()
    fd.append('tipo', tipo)
    fd.append('archivo', archivo)
    Object.entries(paramsDeEntidad(entidad)).forEach(([k, v]) => fd.append(k, String(v)))
    return api.post<DocumentoOut>(BASE, fd)
  },

  eliminar: (documentoId: number) => api.delete<void>(`${BASE}/${documentoId}`),
}
```

- [ ] **Step 9: Correr y ver que pasa**

Run: `cd client && npx vitest run --pool=threads src/api/documentos.test.ts src/lib/formato.test.ts`
Expected: PASS.

- [ ] **Step 10: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 11: Anotar archivos tocados (sin commit)**

`client/src/types/documento.ts`, `client/src/api/documentos.ts`, `client/src/api/documentos.test.ts`, `client/src/lib/formato.ts`, `client/src/lib/formato.test.ts`.

---

### Task 5: Componente `BloqueDocumentos`

**Files:**
- Create: `client/src/components/crm/BloqueDocumentos/BloqueDocumentos.tsx`
- Create: `client/src/components/crm/BloqueDocumentos/BloqueDocumentos.css`
- Create: `client/src/components/crm/BloqueDocumentos/BloqueDocumentos.test.tsx`

**Interfaces:**
- Consumes: `documentosApi` (Task 4), `formatearFecha`, `formatearTamano` (`lib/formato.ts`), `mediaUrl` (`lib/propiedad.ts`), `ETIQUETAS_TIPO_DOCUMENTO`, `TIPOS_DOCUMENTO`, `DocumentoOut`, `EntidadDocumento`, `TipoDocumento` (`types/documento.ts`).
- Produces: `export default function BloqueDocumentos({ entidad }: { entidad: EntidadDocumento })` que renderiza su propia `<section className="admin-card">` con `<h2 className="form-section-title">Documentos</h2>`.

- [ ] **Step 1: Test que falla**

`client/src/components/crm/BloqueDocumentos/BloqueDocumentos.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BloqueDocumentos from './BloqueDocumentos'
import { documentosApi } from '../../../api/documentos'
import type { DocumentoOut } from '../../../types/documento'

vi.mock('../../../api/documentos', () => ({
  documentosApi: { listar: vi.fn(), subir: vi.fn(), eliminar: vi.fn() },
}))

const DOCS: DocumentoOut[] = [
  {
    id: 1, tipo: 'informe_dominio', archivo_url: 'https://r2/dominio.pdf', nombre_original: 'dominio_av.pdf',
    tamano_bytes: 1_258_291, subido_por: 'Matías J.', created_at: '2026-09-18T12:00:00Z',
  },
  {
    id: 2, tipo: 'dni', archivo_url: '/media/documentos/persona/3/x.jpg', nombre_original: 'dni_comprador.jpg',
    tamano_bytes: 348_160, subido_por: 'Ana P.', created_at: '2026-09-19T12:00:00Z',
  },
]

beforeEach(() => vi.clearAllMocks())

it('lista vacía muestra el aviso', async () => {
  vi.mocked(documentosApi.listar).mockResolvedValue([])
  render(<BloqueDocumentos entidad={{ propiedadId: 7 }} />)
  expect(await screen.findByText('No hay documentos cargados')).toBeInTheDocument()
  expect(documentosApi.listar).toHaveBeenCalledWith({ propiedadId: 7 })
})

it('renderiza filas con etiqueta del tipo, nombre, tamaño, autor, fecha y link Ver', async () => {
  vi.mocked(documentosApi.listar).mockResolvedValue(DOCS)
  render(<BloqueDocumentos entidad={{ personaId: 3 }} />)
  expect(await screen.findByText('Informe de dominio')).toBeInTheDocument()
  expect(screen.getByText('dominio_av.pdf')).toBeInTheDocument()
  expect(screen.getByText('1,2 MB')).toBeInTheDocument()
  expect(screen.getByText('Matías J.')).toBeInTheDocument()
  expect(screen.getByText('18/09/2026')).toBeInTheDocument()
  const links = screen.getAllByRole('link', { name: 'Ver' })
  expect(links[0]).toHaveAttribute('href', 'https://r2/dominio.pdf')
  // La URL relativa (storage local) se resuelve contra el host de la API.
  expect(links[1]).toHaveAttribute('href', expect.stringContaining('/media/documentos/persona/3/x.jpg'))
})

it('subir manda entidad, tipo y archivo, y agrega la fila sin recargar', async () => {
  const usuario = userEvent.setup()
  vi.mocked(documentosApi.listar).mockResolvedValue([])
  vi.mocked(documentosApi.subir).mockResolvedValue(DOCS[1])
  render(<BloqueDocumentos entidad={{ dealId: 9 }} />)
  await screen.findByText('No hay documentos cargados')

  const boton = screen.getByRole('button', { name: 'Subir' })
  expect(boton).toBeDisabled()

  await usuario.selectOptions(screen.getByLabelText('Tipo'), 'dni')
  const archivo = new File(['x'], 'dni_comprador.jpg', { type: 'image/jpeg' })
  await usuario.upload(screen.getByLabelText('Archivo'), archivo)
  expect(boton).toBeEnabled()
  await usuario.click(boton)

  await waitFor(() => expect(documentosApi.subir).toHaveBeenCalledWith({ dealId: 9 }, 'dni', archivo))
  expect(await screen.findByText('dni_comprador.jpg')).toBeInTheDocument()
  expect(documentosApi.listar).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Subir' })).toBeDisabled()
})

it('muestra el error del backend al subir', async () => {
  const usuario = userEvent.setup()
  vi.mocked(documentosApi.listar).mockResolvedValue([])
  vi.mocked(documentosApi.subir).mockRejectedValue(new Error('El documento supera los 10 MB'))
  render(<BloqueDocumentos entidad={{ contratoId: 2 }} />)
  await screen.findByText('No hay documentos cargados')
  await usuario.upload(screen.getByLabelText('Archivo'), new File(['x'], 'a.pdf', { type: 'application/pdf' }))
  await usuario.click(screen.getByRole('button', { name: 'Subir' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('El documento supera los 10 MB')
})

it('borrar pide confirmación y saca la fila', async () => {
  const usuario = userEvent.setup()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.mocked(documentosApi.listar).mockResolvedValue(DOCS)
  vi.mocked(documentosApi.eliminar).mockResolvedValue(undefined)
  render(<BloqueDocumentos entidad={{ propiedadId: 7 }} />)
  await screen.findByText('dominio_av.pdf')

  await usuario.click(screen.getAllByRole('button', { name: 'Borrar' })[0])
  expect(window.confirm).toHaveBeenCalledWith('¿Borrar el documento "dominio_av.pdf"?')
  await waitFor(() => expect(documentosApi.eliminar).toHaveBeenCalledWith(1))
  await waitFor(() => expect(screen.queryByText('dominio_av.pdf')).not.toBeInTheDocument())
  expect(screen.getByText('dni_comprador.jpg')).toBeInTheDocument()
})

it('si cancela la confirmación no borra', async () => {
  const usuario = userEvent.setup()
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  vi.mocked(documentosApi.listar).mockResolvedValue(DOCS)
  render(<BloqueDocumentos entidad={{ propiedadId: 7 }} />)
  await screen.findByText('dominio_av.pdf')
  await usuario.click(screen.getAllByRole('button', { name: 'Borrar' })[0])
  expect(documentosApi.eliminar).not.toHaveBeenCalled()
})

it('error al cargar ofrece reintentar', async () => {
  const usuario = userEvent.setup()
  vi.mocked(documentosApi.listar)
    .mockRejectedValueOnce(new Error('Error 500'))
    .mockResolvedValue(DOCS)
  render(<BloqueDocumentos entidad={{ propiedadId: 7 }} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Error 500')
  await usuario.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByText('dominio_av.pdf')).toBeInTheDocument()
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd client && npx vitest run --pool=threads src/components/crm/BloqueDocumentos`
Expected: FAIL — no existe `./BloqueDocumentos`.

- [ ] **Step 3: CSS**

`client/src/components/crm/BloqueDocumentos/BloqueDocumentos.css`:

```css
.bloque-documentos-alta { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--space-3); margin-bottom: var(--space-4); }
.bloque-documentos-alta .form-field { margin: 0; }
.bloque-documentos-alta input[type="file"] { max-width: 100%; }
.bloque-documentos-nombre { display: block; }
.bloque-documentos-tamano { display: block; color: var(--text-muted); font-size: 0.85em; }
```

- [ ] **Step 4: Componente**

`client/src/components/crm/BloqueDocumentos/BloqueDocumentos.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { documentosApi } from '../../../api/documentos'
import type { DocumentoOut, EntidadDocumento, TipoDocumento } from '../../../types/documento'
import { ETIQUETAS_TIPO_DOCUMENTO, TIPOS_DOCUMENTO } from '../../../types/documento'
import { formatearFecha, formatearTamano } from '../../../lib/formato'
import { mediaUrl } from '../../../lib/propiedad'
import './BloqueDocumentos.css'

export const TIPOS_ARCHIVO_DOCUMENTO = 'application/pdf,image/jpeg,image/png,image/heic,image/heif'

interface Props {
  entidad: EntidadDocumento
}

/**
 * Sección "Documentos" de una propiedad, persona, operación o contrato. Un solo
 * componente para las cuatro; la entidad va como discriminated union.
 *
 * No renderiza `<form>`: en `propiedades/Formulario.tsx` vive adentro del form de
 * la propiedad, y un form anidado es HTML inválido.
 */
export default function BloqueDocumentos({ entidad }: Props) {
  const [documentos, setDocumentos] = useState<DocumentoOut[] | null>(null)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [tipo, setTipo] = useState<TipoDocumento>('otro')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputArchivo = useRef<HTMLInputElement>(null)

  // La entidad se compara por su JSON: es un objeto nuevo en cada render del padre.
  const claveEntidad = JSON.stringify(entidad)

  const cargar = useCallback(() => {
    setErrorCarga(null)
    setDocumentos(null)
    documentosApi.listar(entidad)
      .then(setDocumentos)
      .catch((e: unknown) => setErrorCarga(e instanceof Error ? e.message : 'No se pudieron cargar los documentos'))
  }, [claveEntidad]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(cargar, [cargar])

  const subir = async () => {
    if (!archivo) return
    setError(null)
    setSubiendo(true)
    try {
      const nuevo = await documentosApi.subir(entidad, tipo, archivo)
      setDocumentos(prev => [nuevo, ...(prev ?? [])])
      setArchivo(null)
      if (inputArchivo.current) inputArchivo.current.value = ''
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo subir el documento')
    } finally {
      setSubiendo(false)
    }
  }

  const borrar = async (doc: DocumentoOut) => {
    if (!window.confirm(`¿Borrar el documento "${doc.nombre_original}"?`)) return
    setError(null)
    try {
      await documentosApi.eliminar(doc.id)
      setDocumentos(prev => (prev ?? []).filter(d => d.id !== doc.id))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo borrar el documento')
    }
  }

  return (
    <section className="admin-card">
      <h2 className="form-section-title">Documentos</h2>

      <div className="bloque-documentos-alta">
        <div className="form-field">
          <label htmlFor="documento-tipo">Tipo</label>
          <select id="documento-tipo" value={tipo} onChange={e => setTipo(e.target.value as TipoDocumento)}>
            {TIPOS_DOCUMENTO.map(t => <option key={t} value={t}>{ETIQUETAS_TIPO_DOCUMENTO[t]}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="documento-archivo">Archivo</label>
          <input
            id="documento-archivo"
            ref={inputArchivo}
            type="file"
            accept={TIPOS_ARCHIVO_DOCUMENTO}
            onChange={e => setArchivo(e.target.files?.[0] ?? null)}
          />
        </div>
        <button type="button" className="btn btn-outline" disabled={!archivo || subiendo} onClick={subir}>
          {subiendo ? 'Subiendo...' : 'Subir'}
        </button>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      {errorCarga && (
        <p className="form-error" role="alert">
          {errorCarga}{' '}
          <button type="button" className="btn btn-outline btn-chico" onClick={cargar}>Reintentar</button>
        </p>
      )}
      {!errorCarga && documentos === null && <p className="lista-estado">Cargando...</p>}
      {documentos !== null && documentos.length === 0 && <p className="lista-estado">No hay documentos cargados</p>}

      {documentos !== null && documentos.length > 0 && (
        <div className="tabla-wrapper">
          <table className="tabla tabla-documentos">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Archivo</th>
                <th>Subido por</th>
                <th>Fecha</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {documentos.map(d => (
                <tr key={d.id}>
                  <td data-label="Tipo">{ETIQUETAS_TIPO_DOCUMENTO[d.tipo]}</td>
                  <td data-label="Archivo">
                    <span className="bloque-documentos-nombre">{d.nombre_original}</span>
                    <span className="bloque-documentos-tamano">{formatearTamano(d.tamano_bytes)}</span>
                  </td>
                  <td data-label="Subido por">{d.subido_por}</td>
                  <td data-label="Fecha">{formatearFecha(d.created_at)}</td>
                  <td data-label="Acciones">
                    <div className="tabla-acciones">
                      <a className="btn btn-outline btn-chico" href={mediaUrl(d.archivo_url)} target="_blank" rel="noreferrer">Ver</a>
                      <button type="button" className="btn btn-outline btn-chico" onClick={() => void borrar(d)}>Borrar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 5: Correr y ver que pasa**

Run: `cd client && npx vitest run --pool=threads src/components/crm/BloqueDocumentos`
Expected: 7 tests PASS. Si el test de `Ver` con URL relativa falla por el host, verificar que `mediaUrl` esté importado desde `lib/propiedad` y no reimplementado.

- [ ] **Step 6: Typecheck**

Run: `cd client && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Anotar archivos tocados (sin commit)**

`client/src/components/crm/BloqueDocumentos/BloqueDocumentos.tsx`, `.css`, `.test.tsx`.

---

### Task 6: Insertar el bloque en las cuatro pantallas

**Files:**
- Modify: `client/src/pages/admin/propiedades/Formulario.tsx:405` (después del `</div>` que cierra la sección Fotos, antes de `{/* ── Acciones ── */}`)
- Modify: `client/src/pages/admin/propiedades/Formulario.propietario.test.tsx:9-17` (mock nuevo)
- Create: `client/src/pages/admin/propiedades/Formulario.documentos.test.tsx`
- Modify: `client/src/pages/admin/personas/Ficha.tsx:118` (después del `</div>` de `ficha-grilla`) y `Ficha.test.tsx`
- Modify: `client/src/pages/admin/operaciones/Ficha.tsx:154` (después de `BloqueComision`) y `Ficha.contrato.test.tsx`
- Modify: `client/src/pages/admin/alquileres/Ficha.tsx:348` (después del bloque administrado/no administrado, antes de `{pagando && ...}`) y `Ficha.test.tsx`

**Interfaces:**
- Consumes: `BloqueDocumentos` (Task 5).

- [ ] **Step 1: Test de la propiedad que falla**

`client/src/pages/admin/propiedades/Formulario.documentos.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PropiedadFormulario from './Formulario'
import { propiedadesApi } from '../../../api/propiedades'
import { documentosApi } from '../../../api/documentos'
import type { Propiedad } from '../../../types/propiedad'

vi.mock('../../../api/propiedades', () => ({
  propiedadesApi: {
    obtener: vi.fn(), crear: vi.fn(), actualizar: vi.fn(),
    subirMedio: vi.fn(), eliminarMedio: vi.fn(),
  },
}))
vi.mock('../../../api/personas', () => ({
  personasApi: { listar: vi.fn().mockResolvedValue({ total: 0, items: [] }), crear: vi.fn() },
}))
vi.mock('../../../api/documentos', () => ({
  documentosApi: { listar: vi.fn(), subir: vi.fn(), eliminar: vi.fn() },
}))

const PROPIEDAD = {
  id: 7, titulo: 'Casa', descripcion: null,
  tipo_propiedad: 'casa', tipo_operacion: 'venta', estado_comercial: 'disponible',
  moneda: 'ARS', precio: null, dormitorios: null, banos: null, m2_cubiertos: null, m2_totales: null,
  ubicacion: null, medios: [], caracteristicas: [],
  propietario: null, propietario_persona_id: null,
  creado_en: '', actualizado_en: '', eliminado_en: null,
} as unknown as Propiedad

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

beforeEach(() => vi.clearAllMocks())

it('al crear no muestra la sección Documentos (todavía no hay id)', async () => {
  renderEn('/admin/propiedades/nueva')
  expect(await screen.findByRole('heading', { name: 'Fotos' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Documentos' })).not.toBeInTheDocument()
  expect(documentosApi.listar).not.toHaveBeenCalled()
})

it('al editar muestra Documentos y lista los de la propiedad', async () => {
  vi.mocked(propiedadesApi.obtener).mockResolvedValue(PROPIEDAD)
  vi.mocked(documentosApi.listar).mockResolvedValue([])
  renderEn('/admin/propiedades/7/editar')
  expect(await screen.findByRole('heading', { name: 'Documentos' })).toBeInTheDocument()
  expect(await screen.findByText('No hay documentos cargados')).toBeInTheDocument()
  expect(documentosApi.listar).toHaveBeenCalledWith({ propiedadId: 7 })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `cd client && npx vitest run --pool=threads src/pages/admin/propiedades/Formulario.documentos.test.tsx`
Expected: el segundo test falla (no hay heading "Documentos").

- [ ] **Step 3: Insertar en `Formulario.tsx`**

Agregar el import junto a los otros componentes (arriba del archivo):

```tsx
import BloqueDocumentos from '../../../components/crm/BloqueDocumentos/BloqueDocumentos'
```

Y en el JSX, inmediatamente después del `</div>` que cierra `{/* ── Fotos ── */}` (línea ~405) y antes de `{/* ── Acciones ── */}`:

```tsx
        {/* ── Documentos ── */}
        {esEdicion && <BloqueDocumentos entidad={{ propiedadId: Number(id) }} />}
```

- [ ] **Step 4: Agregar el mock a `Formulario.propietario.test.tsx`**

Debajo del `vi.mock('../../../api/personas', ...)` (línea ~17) agregar:

```tsx
vi.mock('../../../api/documentos', () => ({
  documentosApi: { listar: vi.fn().mockResolvedValue([]), subir: vi.fn(), eliminar: vi.fn() },
}))
```

- [ ] **Step 5: Correr los tests de propiedades**

Run: `cd client && npx vitest run --pool=threads src/pages/admin/propiedades`
Expected: PASS.

- [ ] **Step 6: Persona — test que falla**

En `client/src/pages/admin/personas/Ficha.test.tsx`, debajo del `vi.mock('../../../api/personas', ...)`:

```tsx
vi.mock('../../../api/documentos', () => ({
  documentosApi: { listar: vi.fn(), subir: vi.fn(), eliminar: vi.fn() },
}))
```

Sumar el import `import { documentosApi } from '../../../api/documentos'`, en el `beforeEach` agregar `vi.mocked(documentosApi.listar).mockResolvedValue([])`, y al final del archivo:

```tsx
it('muestra la sección Documentos de la persona', async () => {
  renderFicha()
  expect(await screen.findByRole('heading', { name: 'Documentos' })).toBeInTheDocument()
  expect(documentosApi.listar).toHaveBeenCalledWith({ personaId: 1 })
})
```

Run: `cd client && npx vitest run --pool=threads src/pages/admin/personas/Ficha.test.tsx`
Expected: el test nuevo falla.

- [ ] **Step 7: Insertar en `personas/Ficha.tsx`**

Import:

```tsx
import BloqueDocumentos from '../../../components/crm/BloqueDocumentos/BloqueDocumentos'
```

En el JSX, después del `</div>` que cierra `className="ficha-grilla"` (línea ~118) y antes del `</div>` final:

```tsx
      <BloqueDocumentos entidad={{ personaId: persona.id }} />
```

Run: `cd client && npx vitest run --pool=threads src/pages/admin/personas`
Expected: PASS.

- [ ] **Step 8: Operación — test que falla**

En `client/src/pages/admin/operaciones/Ficha.contrato.test.tsx`, junto a los otros `vi.mock` (línea ~14):

```tsx
vi.mock('../../../api/documentos', () => ({
  documentosApi: { listar: vi.fn().mockResolvedValue([]), subir: vi.fn(), eliminar: vi.fn() },
}))
```

Sumar `import { documentosApi } from '../../../api/documentos'` y, al final del archivo, un test que reutilice el helper `renderFicha()` ya definido en la línea 35 (renderiza `/admin/operaciones/9`):

```tsx
it('muestra la sección Documentos de la operación', async () => {
  renderFicha()
  expect(await screen.findByRole('heading', { name: 'Documentos' })).toBeInTheDocument()
  expect(documentosApi.listar).toHaveBeenCalledWith({ dealId: 9 })
})
```

(El `DEAL` del archivo tiene `id: 9`.)

Run: `cd client && npx vitest run --pool=threads src/pages/admin/operaciones/Ficha.contrato.test.tsx`
Expected: el test nuevo falla.

- [ ] **Step 9: Insertar en `operaciones/Ficha.tsx`**

Import:

```tsx
import BloqueDocumentos from '../../../components/crm/BloqueDocumentos/BloqueDocumentos'
```

Después de `{op.is_won && <BloqueComision operacion={op} usuarios={usuarios} />}` (línea ~154):

```tsx
        <BloqueDocumentos entidad={{ dealId: op.id }} />
```

Run: `cd client && npx vitest run --pool=threads src/pages/admin/operaciones`
Expected: PASS.

- [ ] **Step 10: Contrato — test que falla**

En `client/src/pages/admin/alquileres/Ficha.test.tsx`, junto a `vi.mock('../../../api/inmobiliaria', ...)` (línea ~19):

```tsx
vi.mock('../../../api/documentos', () => ({
  documentosApi: { listar: vi.fn().mockResolvedValue([]), subir: vi.fn(), eliminar: vi.fn() },
}))
```

Sumar `import { documentosApi } from '../../../api/documentos'` y al final:

```tsx
it('muestra la sección Documentos del contrato', async () => {
  renderFicha()
  expect(await screen.findByRole('heading', { name: 'Documentos' })).toBeInTheDocument()
  expect(documentosApi.listar).toHaveBeenCalledWith({ contratoId: 3 })
})
```

(`renderFicha()` está definido en la línea 67 y renderiza `/admin/alquileres/3`; el `CONTRATO` tiene `id: 3`.)

Run: `cd client && npx vitest run --pool=threads src/pages/admin/alquileres/Ficha.test.tsx`
Expected: el test nuevo falla.

- [ ] **Step 11: Insertar en `alquileres/Ficha.tsx`**

Import:

```tsx
import BloqueDocumentos from '../../../components/crm/BloqueDocumentos/BloqueDocumentos'
```

Después del bloque ternario `{contrato.administrado ? (...) : (<p ...>Contrato no administrado...</p>)}` (cierra en la línea ~348) y antes de `{pagando && (`:

```tsx
      <BloqueDocumentos entidad={{ contratoId: contrato.id }} />
```

Run: `cd client && npx vitest run --pool=threads src/pages/admin/alquileres`
Expected: PASS.

- [ ] **Step 12: Suite completa del frontend y typecheck**

Run: `cd client && npm test && npx tsc --noEmit`
Expected: todo verde, sin errores de tipos. Si algún test de página ajeno falla con "documentosApi.listar is not a function" o con un fetch real, es una página que ahora renderiza `BloqueDocumentos` sin mock: agregarle el mismo `vi.mock('../../../api/documentos', ...)`.

- [ ] **Step 13: Anotar archivos tocados (sin commit)**

`client/src/pages/admin/propiedades/Formulario.tsx`, `Formulario.propietario.test.tsx`, `Formulario.documentos.test.tsx`, `client/src/pages/admin/personas/Ficha.tsx`, `Ficha.test.tsx`, `client/src/pages/admin/operaciones/Ficha.tsx`, `Ficha.contrato.test.tsx`, `client/src/pages/admin/alquileres/Ficha.tsx`, `Ficha.test.tsx`.

---

### Task 7: Verificación final

**Files:** ninguno nuevo.

- [ ] **Step 1: Backend completo**

Run: `cd src && python -m pytest tests/ -q && ruff check .`
Expected: todo verde; `ruff check` limpio (si marca archivos viejos ajenos a este bloque, ignorarlos y reportarlos).

- [ ] **Step 2: Frontend completo**

Run: `cd client && npm test && npm run build`
Expected: tests verdes y build OK.

- [ ] **Step 3: Migración vs modelos**

Si hay una base local con `DATABASE_URL` configurada: `cd src && alembic upgrade head && alembic check`. Expected: `No new upgrade operations detected.` Si no hay base local, dejarlo anotado para que Matías lo corra antes de aplicar en Supabase.

- [ ] **Step 4: Prueba manual (si hay backend y frontend levantados)**

Con `uvicorn app.main:app --reload --port 8000` en `src/` y `npm run dev` en `client/`: entrar a una propiedad existente en edición, subir un PDF como "Boleto", verificar que aparece en la tabla con nombre, tamaño, autor y fecha; abrir "Ver"; borrar. Repetir en una persona, una operación y un contrato. Probar un `.txt` (debe rechazar con el mensaje del backend).

- [ ] **Step 5: Reporte final**

Listar todos los archivos creados/modificados (backend, frontend, docs) para que Matías los revise y commitee. Recordar la migración `0009_documentos` pendiente en Supabase.
