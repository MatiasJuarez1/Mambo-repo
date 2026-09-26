# Publicaciones: pantalla del panel y descarga de material — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el placeholder de `/admin/publicaciones` por una pantalla real (listar, crear, editar, pausar/reactivar) y agregar un botón que le baje al agente un ZIP con las fotos de la propiedad y el texto de la publicación.

**Architecture:** El backend de `modules/publicaciones` ya tiene el CRUD completo; se le suma un endpoint `GET /publicaciones/{id}/descargar` que arma un ZIP en memoria leyendo las fotos por `storage.leer_archivo()` (las propias) o por HTTP (las de terceros del seed). El frontend construye dos pantallas siguiendo el molde de `reservas/Lista.tsx` y `reservas/Formulario.tsx`, y baja el ZIP con un `<a download>` directo, igual que `Reportes.tsx` con el CSV. Se aprovecha para arreglar un bug latente del sidebar (sin `overflow-y`, el nav largo queda inalcanzable).

**Tech Stack:** FastAPI + SQLAlchemy 2.0 + pytest (backend, desde `src/`); React 19 + React Router + Vitest + Testing Library (frontend, desde `client/`).

**Spec:** [2026-09-22-publicaciones-panel-design.md](../specs/2026-09-22-publicaciones-panel-design.md)

## Global Constraints

- **No commitear nada.** Matías commitea y pushea. Cada tarea termina dejando los archivos en el working tree y anotando cuáles se tocaron. Esto reemplaza el paso "Commit" que traen las skills.
- **El código se escribe en español** (comentarios, docstrings, mensajes de la API y textos de la UI), como el resto del repo.
- Comandos del backend desde `src/` con el venv activo; comandos del frontend desde `client/`.
- `ruff check .` tiene que pasar limpio sobre lo nuevo (line-length 100, reglas E/F/I/B/UP). **No** correr `ruff format --check .` sobre todo el repo: falla en 36 archivos viejos que no son de este trabajo; formatear solo los archivos tocados.
- Sin migración de Alembic: ningún modelo cambia en este plan.
- Frontend: `npm test` ya trae `--pool=threads`; no correr vitest a mano sin ese flag (en Windows el pool `forks` cuelga).
- No se toca `App.tsx`: las rutas `/admin/publicaciones`, `/nueva` y `/:id/editar` ya están registradas apuntando a los dos componentes que este plan rellena.

---

### Task 1: Suite del CRUD de publicaciones (cobertura que hoy no existe)

El módulo está en producción sin un solo test. Antes de sumarle un endpoint, se fija por escrito lo que ya hace: es la red que avisa si el trabajo de la Task 2 rompe algo de lo existente.

**Files:**
- Create: `src/tests/test_publicaciones.py`

**Interfaces:**
- Consumes: fixtures `db`, `client`, `crear_usuario`, `iniciar_sesion`, `media_tmp` de `src/tests/conftest.py`.
- Produces: fixtures `propiedad` y `staff` dentro de `test_publicaciones.py`, que la Task 2 reutiliza en el mismo archivo.

- [ ] **Step 1: Escribir la suite del CRUD**

Crear `src/tests/test_publicaciones.py`:

```python
"""Tests del módulo de publicaciones: CRUD, permisos y paquete de descarga.

El módulo llegó al repo sin cobertura. Acá se fija primero lo que ya hacía
(alta, listados público y de staff, activación, borrado lógico y permisos) y en
el mismo archivo viven después los tests del paquete de descarga.
"""

import pytest
from sqlalchemy.orm import Session as DBSession

from app.modules.propiedades.models import (
    EstadoComercial,
    Propiedad,
    TipoOperacion,
    TipoPropiedad,
)
from app.modules.publicaciones.models import Publicacion


@pytest.fixture
def propiedad(db: DBSession) -> Propiedad:
    prop = Propiedad(
        titulo="Casa en Rivadavia",
        tipo_propiedad=TipoPropiedad.casa,
        tipo_operacion=TipoOperacion.venta,
        estado_comercial=EstadoComercial.disponible,
        moneda="USD",
    )
    db.add(prop)
    db.commit()
    return prop


@pytest.fixture
def staff(client, crear_usuario, iniciar_sesion):
    """Sesión con rol `staff`: todo lo que no sea el listado público lo exige."""
    crear_usuario(email="staff.pub@mambo.com.ar", roles=("staff",))
    iniciar_sesion(email="staff.pub@mambo.com.ar")
    return client


def test_crear_publicacion_activa_la_deja_en_el_listado_publico(staff, propiedad):
    respuesta = staff.post(
        "/api/v1/publicaciones",
        json={
            "propiedad_id": propiedad.id,
            "titulo": "Casa 3 ambientes con jardín",
            "descripcion": "Luminosa, patio grande",
            "precio_publicado": 120000,
            "moneda_publicada": "USD",
        },
    )
    assert respuesta.status_code == 201, respuesta.text

    creada = respuesta.json()
    assert creada["estado"] == "activa"
    # Al nacer activa queda fechada: es lo que ordena el listado.
    assert creada["publicada_en"] is not None

    publicas = staff.get("/api/v1/publicaciones/publicas").json()
    assert [p["id"] for p in publicas] == [creada["id"]]


def test_una_pausada_no_sale_en_el_publico_pero_si_en_el_de_staff(staff, propiedad):
    creada = staff.post(
        "/api/v1/publicaciones",
        json={"propiedad_id": propiedad.id, "titulo": "Borrador", "estado": "pausada"},
    ).json()

    assert creada["publicada_en"] is None
    assert staff.get("/api/v1/publicaciones/publicas").json() == []
    assert [p["id"] for p in staff.get("/api/v1/publicaciones").json()] == [creada["id"]]


def test_activar_una_pausada_le_pone_fecha_de_publicacion(staff, propiedad):
    creada = staff.post(
        "/api/v1/publicaciones",
        json={"propiedad_id": propiedad.id, "titulo": "Borrador", "estado": "pausada"},
    ).json()

    actualizada = staff.put(
        f"/api/v1/publicaciones/{creada['id']}", json={"estado": "activa"}
    ).json()

    assert actualizada["estado"] == "activa"
    assert actualizada["publicada_en"] is not None


def test_eliminar_es_borrado_logico(staff, propiedad):
    creada = staff.post(
        "/api/v1/publicaciones",
        json={"propiedad_id": propiedad.id, "titulo": "Se va de circulación"},
    ).json()

    assert staff.delete(f"/api/v1/publicaciones/{creada['id']}").status_code == 204
    assert staff.get(f"/api/v1/publicaciones/{creada['id']}").status_code == 404
    assert staff.get("/api/v1/publicaciones").json() == []


def test_filtrar_por_propiedad(staff, db, propiedad):
    otra = Propiedad(
        titulo="Depto en el centro",
        tipo_propiedad=TipoPropiedad.depto,
        tipo_operacion=TipoOperacion.alquiler,
        estado_comercial=EstadoComercial.disponible,
        moneda="ARS",
    )
    db.add(otra)
    db.commit()

    de_la_casa = staff.post(
        "/api/v1/publicaciones",
        json={"propiedad_id": propiedad.id, "titulo": "Casa"},
    ).json()
    staff.post("/api/v1/publicaciones", json={"propiedad_id": otra.id, "titulo": "Depto"})

    filtradas = staff.get(f"/api/v1/publicaciones?propiedad_id={propiedad.id}").json()
    assert [p["id"] for p in filtradas] == [de_la_casa["id"]]


def test_el_listado_publico_es_anonimo_pero_el_de_staff_no(client, db, propiedad):
    db.add(Publicacion(propiedad_id=propiedad.id, titulo="Casa"))
    db.commit()

    assert client.get("/api/v1/publicaciones/publicas").status_code == 200
    assert client.get("/api/v1/publicaciones").status_code == 401
    assert (
        client.post(
            "/api/v1/publicaciones",
            json={"propiedad_id": propiedad.id, "titulo": "No debería entrar"},
        ).status_code
        == 401
    )


def test_un_usuario_sin_rol_no_puede_escribir(client, crear_usuario, iniciar_sesion, propiedad):
    crear_usuario(email="sinrol@mambo.com.ar", roles=())
    iniciar_sesion(email="sinrol@mambo.com.ar")

    respuesta = client.post(
        "/api/v1/publicaciones",
        json={"propiedad_id": propiedad.id, "titulo": "Tampoco"},
    )

    assert respuesta.status_code == 403
```

- [ ] **Step 2: Correr la suite**

Desde `src/`:

```bash
python -m pytest tests/test_publicaciones.py -q
```

Esperado: **7 passed**. Estos tests describen comportamiento que ya existe, así que tienen que pasar sin tocar código de producción. Si alguno falla, es un bug real del módulo: anotarlo y avisar antes de seguir — no "arreglar" el test para que pase.

- [ ] **Step 3: Lint**

```bash
ruff check tests/test_publicaciones.py
ruff format tests/test_publicaciones.py
```

Esperado: `All checks passed!` y el archivo formateado.

- [ ] **Step 4: Dejar en el working tree**

Sin commit (ver Global Constraints). Archivo tocado: `src/tests/test_publicaciones.py` (nuevo).

---

### Task 2: Endpoint de descarga del paquete (ZIP con fotos + texto)

**Files:**
- Modify: `src/app/modules/publicaciones/service.py` (agrega imports arriba y tres funciones al final)
- Modify: `src/app/modules/publicaciones/router.py` (agrega `Response` al import de fastapi y un endpoint)
- Test: `src/tests/test_publicaciones.py` (se le suman tests al archivo de la Task 1)

**Interfaces:**
- Consumes: `service.obtener_publicacion(db, publicacion_id) -> Publicacion` (ya existe, tira 404 y filtra borradas); `storage.leer_archivo(clave: str) -> bytes`; `SOLO_STAFF` (constante ya definida en el router); fixtures `propiedad` y `staff` de la Task 1.
- Produces: `service.generar_paquete_descarga(db: Session, publicacion_id: int) -> bytes` y la ruta `GET /api/v1/publicaciones/{publicacion_id}/descargar`, que consume la Task 3 desde el frontend.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `src/tests/test_publicaciones.py`. También hay que ampliar los imports de arriba del archivo — dejarlos así:

```python
import io
from zipfile import ZipFile

import pytest
from sqlalchemy.orm import Session as DBSession

from app import storage
from app.modules.propiedades.models import (
    EstadoComercial,
    Propiedad,
    PropiedadMedio,
    TipoMedio,
    TipoOperacion,
    TipoPropiedad,
)
from app.modules.publicaciones.models import Publicacion
```

Y los tests nuevos:

```python
# ── Paquete de descarga ───────────────────────────────────────────────────────


@pytest.fixture
def publicacion_con_fotos(db: DBSession, propiedad: Propiedad, media_tmp) -> Publicacion:
    """Una publicación cuya propiedad tiene una foto y un video de verdad en disco.

    El video está a propósito: el paquete es solo de fotos y tiene que dejarlo afuera.
    """
    foto = storage.guardar_imagen(b"bytes-de-la-foto", ".jpg")
    video = storage.guardar_archivo(b"bytes-del-video", "propiedades/tour.mp4")

    db.add(
        PropiedadMedio(
            propiedad_id=propiedad.id,
            tipo_medio=TipoMedio.imagen,
            url=foto.url,
            storage_key=foto.clave,
            orden=1,
        )
    )
    db.add(
        PropiedadMedio(
            propiedad_id=propiedad.id,
            tipo_medio=TipoMedio.video,
            url=video.url,
            storage_key=video.clave,
            orden=2,
        )
    )

    pub = Publicacion(
        propiedad_id=propiedad.id,
        titulo="Casa 3 ambientes con jardín",
        descripcion="Luminosa, patio grande",
        precio_publicado=120000,
        moneda_publicada="USD",
    )
    db.add(pub)
    db.commit()
    return pub


def test_el_paquete_trae_las_fotos_y_el_texto(staff, publicacion_con_fotos):
    respuesta = staff.get(f"/api/v1/publicaciones/{publicacion_con_fotos.id}/descargar")

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.headers["content-type"] == "application/zip"
    assert (
        f'filename="publicacion-{publicacion_con_fotos.id}.zip"'
        in respuesta.headers["content-disposition"]
    )

    with ZipFile(io.BytesIO(respuesta.content)) as zf:
        # El video queda afuera: el paquete es material para redes, no el archivo
        # entero de la propiedad.
        assert zf.namelist() == ["foto-01.jpg", "descripcion.txt"]
        assert zf.read("foto-01.jpg") == b"bytes-de-la-foto"
        texto = zf.read("descripcion.txt").decode("utf-8")

    assert "Casa 3 ambientes con jardín" in texto
    assert "USD" in texto
    assert "120000" in texto
    assert "Luminosa, patio grande" in texto


def test_una_foto_de_un_tercero_se_baja_por_http(staff, db, propiedad, monkeypatch):
    """Los medios del seed no tienen `storage_key`: se traen por su URL pública."""

    class _RespuestaFalsa:
        content = b"bytes-de-un-tercero"

        def raise_for_status(self):
            return self

    monkeypatch.setattr(
        "app.modules.publicaciones.service.httpx.get",
        lambda url, timeout: _RespuestaFalsa(),
    )

    db.add(
        PropiedadMedio(
            propiedad_id=propiedad.id,
            tipo_medio=TipoMedio.imagen,
            url="https://fotos.example.com/casa.png",
            storage_key=None,
            orden=1,
        )
    )
    pub = Publicacion(propiedad_id=propiedad.id, titulo="Casa del seed")
    db.add(pub)
    db.commit()

    respuesta = staff.get(f"/api/v1/publicaciones/{pub.id}/descargar")

    assert respuesta.status_code == 200
    with ZipFile(io.BytesIO(respuesta.content)) as zf:
        assert zf.namelist() == ["foto-01.png", "descripcion.txt"]
        assert zf.read("foto-01.png") == b"bytes-de-un-tercero"


def test_una_foto_que_no_se_puede_leer_no_invalida_el_paquete(
    staff, publicacion_con_fotos, monkeypatch
):
    def explotar(clave):
        raise OSError("el archivo no está")

    monkeypatch.setattr("app.modules.publicaciones.service.storage.leer_archivo", explotar)

    respuesta = staff.get(f"/api/v1/publicaciones/{publicacion_con_fotos.id}/descargar")

    # Mejor un paquete con el texto que un 500: el agente igual se lleva algo.
    assert respuesta.status_code == 200
    with ZipFile(io.BytesIO(respuesta.content)) as zf:
        assert zf.namelist() == ["descripcion.txt"]


def test_una_publicacion_sin_fotos_igual_da_un_zip(staff, db, propiedad):
    pub = Publicacion(propiedad_id=propiedad.id, titulo="Todavía sin fotos")
    db.add(pub)
    db.commit()

    respuesta = staff.get(f"/api/v1/publicaciones/{pub.id}/descargar")

    assert respuesta.status_code == 200
    with ZipFile(io.BytesIO(respuesta.content)) as zf:
        assert zf.namelist() == ["descripcion.txt"]


def test_descargar_una_publicacion_que_no_existe_da_404(staff):
    assert staff.get("/api/v1/publicaciones/9999/descargar").status_code == 404


def test_descargar_exige_sesion_con_rol(client, crear_usuario, iniciar_sesion, db, propiedad):
    pub = Publicacion(propiedad_id=propiedad.id, titulo="Casa")
    db.add(pub)
    db.commit()

    assert client.get(f"/api/v1/publicaciones/{pub.id}/descargar").status_code == 401

    crear_usuario(email="sinrol.descarga@mambo.com.ar", roles=())
    iniciar_sesion(email="sinrol.descarga@mambo.com.ar")

    assert client.get(f"/api/v1/publicaciones/{pub.id}/descargar").status_code == 403
```

- [ ] **Step 2: Correr los tests nuevos y verificar que fallan**

```bash
python -m pytest tests/test_publicaciones.py -q -k descarg
```

Esperado: FAIL. La ruta no existe todavía, así que FastAPI responde 404 y los asserts de 200 se caen (`assert 404 == 200`).

- [ ] **Step 3: Implementar el armado del ZIP en el service**

En `src/app/modules/publicaciones/service.py`, reemplazar el bloque de imports de arriba del archivo por:

```python
import logging
from datetime import datetime
from io import BytesIO
from pathlib import PurePosixPath
from urllib.parse import urlsplit
from zipfile import ZipFile

import httpx
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app import storage
from app.modules.propiedades.models import TipoMedio
from app.modules.publicaciones.models import EstadoPublicacion, Publicacion
from app.modules.publicaciones.schemas import PublicacionCreate, PublicacionUpdate

logger = logging.getLogger(__name__)

# Las fotos de terceros (las del seed) viven en un servidor que no controlamos:
# si no contesta rápido se saltea esa foto en vez de hacer esperar al agente.
TIMEOUT_FOTO_EXTERNA = 10
```

Y agregar al final del archivo:

```python
def _bytes_de_foto(medio) -> bytes:
    """Trae los bytes del original de una foto.

    Por `storage_key` cuando el archivo es nuestro —funciona igual en local y en
    R2— y por HTTP cuando no lo es: los medios del seed apuntan a URLs de
    terceros y no tienen clave con la que buscarlos en el almacenamiento.
    """
    if medio.storage_key:
        return storage.leer_archivo(medio.storage_key)

    respuesta = httpx.get(medio.url, timeout=TIMEOUT_FOTO_EXTERNA)
    respuesta.raise_for_status()
    return respuesta.content


def _texto_descripcion(pub: Publicacion) -> str:
    """El .txt que acompaña a las fotos: lo que el agente pega en la red social."""
    lineas = [pub.titulo, ""]
    if pub.precio_publicado is not None:
        lineas.append(f"Precio: {pub.moneda_publicada} {pub.precio_publicado}")
        lineas.append("")
    lineas.append(pub.descripcion or "")
    return "\n".join(lineas)


def generar_paquete_descarga(db: Session, publicacion_id: int) -> bytes:
    """ZIP con las fotos originales de la propiedad y el texto de la publicación.

    Solo fotos: `propiedades_medios` también guarda videos y documentos, que no
    sirven para un posteo y harían el paquete pesado sin que nadie los pidiera.
    Se mandan los originales y no las variantes reducidas porque en redes se
    quiere la mejor calidad disponible, no la miniatura de la web.
    """
    pub = obtener_publicacion(db, publicacion_id)
    fotos = [m for m in pub.propiedad.medios if m.tipo_medio == TipoMedio.imagen]

    buffer = BytesIO()
    with ZipFile(buffer, "w") as zf:
        for numero, medio in enumerate(fotos, start=1):
            try:
                contenido = _bytes_de_foto(medio)
            except Exception:  # noqa: BLE001 — una foto perdida no invalida el paquete
                logger.warning(
                    "No se pudo traer la foto %s de la publicación %s", medio.id, pub.id
                )
                continue
            # `urlsplit` primero: las URLs de terceros traen query string y el
            # suffix se quedaría con ".jpg?token=abc", que no es nombre válido.
            extension = PurePosixPath(urlsplit(medio.url).path).suffix or ".jpg"
            zf.writestr(f"foto-{numero:02d}{extension}", contenido)

        zf.writestr("descripcion.txt", _texto_descripcion(pub))

    return buffer.getvalue()
```

- [ ] **Step 4: Agregar el endpoint**

En `src/app/modules/publicaciones/router.py`, cambiar la primera línea de imports de fastapi:

```python
from fastapi import APIRouter, Depends, Query, Response, status
```

Y agregar el endpoint justo después de `obtener_publicacion` (antes de `crear_publicacion`):

```python
@router.get("/{publicacion_id}/descargar", dependencies=SOLO_STAFF)
def descargar_material(publicacion_id: int, db: Session = Depends(get_db)):
    """Paquete para que el agente publique en sus redes: fotos + texto.

    Va detrás de `SOLO_STAFF` como el resto de las operaciones no públicas: el
    material de una publicación pausada es trabajo interno, no contenido abierto.
    """
    contenido = service.generar_paquete_descarga(db, publicacion_id)
    return Response(
        content=contenido,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="publicacion-{publicacion_id}.zip"'
        },
    )
```

- [ ] **Step 5: Correr toda la suite del módulo**

```bash
python -m pytest tests/test_publicaciones.py -q
```

Esperado: **13 passed** (las 7 de la Task 1 más las 6 nuevas).

- [ ] **Step 6: Correr la suite completa del backend**

```bash
python -m pytest tests/ -q
```

Esperado: todo verde. Si algo de otro módulo se rompió, es por los imports nuevos en `service.py` — revisar que no haya import circular antes de seguir.

- [ ] **Step 7: Lint**

```bash
ruff check app/modules/publicaciones/ tests/test_publicaciones.py
ruff format app/modules/publicaciones/service.py app/modules/publicaciones/router.py tests/test_publicaciones.py
```

Esperado: `All checks passed!`.

- [ ] **Step 8: Dejar en el working tree**

Sin commit. Archivos tocados: `src/app/modules/publicaciones/service.py`, `src/app/modules/publicaciones/router.py`, `src/tests/test_publicaciones.py`.

---

### Task 3: URL de descarga en el cliente de API

**Files:**
- Modify: `client/src/api/publicaciones.ts`
- Test: `client/src/api/publicaciones.test.ts` (nuevo)

**Interfaces:**
- Consumes: `BASE_URL` exportado por `client/src/api/client.ts`; la ruta `GET /api/v1/publicaciones/{id}/descargar` de la Task 2.
- Produces: `publicacionesApi.urlDescarga(id: number): string`, que usan las Tasks 4 y 5.

- [ ] **Step 1: Escribir el test que falla**

Crear `client/src/api/publicaciones.test.ts`:

```ts
import { publicacionesApi } from './publicaciones'

it('urlDescarga apunta al endpoint del ZIP de esa publicación', () => {
  expect(publicacionesApi.urlDescarga(12)).toMatch(/\/api\/v1\/publicaciones\/12\/descargar$/)
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Desde `client/`:

```bash
npm test -- src/api/publicaciones.test.ts
```

Esperado: FAIL con `publicacionesApi.urlDescarga is not a function`.

- [ ] **Step 3: Agregar el método**

En `client/src/api/publicaciones.ts`, cambiar la primera línea:

```ts
import { api, BASE_URL } from './client'
```

Y agregar al final del objeto `publicacionesApi`, después de `eliminar`:

```ts
  /**
   * URL absoluta del ZIP con las fotos y el texto. Se abre con un `<a download>`
   * en vez de `fetch`: la cookie de sesión viaja igual porque el pedido es
   * first-party (el proxy de Vercel), y así no hay que manejar el binario en JS.
   */
  urlDescarga: (id: number) => `${BASE_URL}${BASE}/${id}/descargar`,
```

- [ ] **Step 4: Correr el test**

```bash
npm test -- src/api/publicaciones.test.ts
```

Esperado: PASS (1 test).

- [ ] **Step 5: Dejar en el working tree**

Sin commit. Archivos tocados: `client/src/api/publicaciones.ts`, `client/src/api/publicaciones.test.ts` (nuevo).

---

### Task 4: Pantalla de listado de publicaciones

**Files:**
- Modify: `client/src/pages/admin/publicaciones/Lista.tsx` (hoy es un placeholder de 12 líneas: se reemplaza entero)
- Test: `client/src/pages/admin/publicaciones/Lista.test.tsx` (nuevo)

**Interfaces:**
- Consumes: `publicacionesApi.listar({ estado?, propiedad_id?, skip?, limit? })`, `publicacionesApi.actualizar(id, payload)` y `publicacionesApi.urlDescarga(id)` (Task 3); `useAuth()` de `context/AuthContext` (devuelve `{ usuario, cargando, login, logout }`, con `usuario.roles: string[]`); `Badge` (ya mapea `activa`/`pausada`/`eliminada`); `formatearMonto`, `formatearFecha` de `lib/formato`.
- Produces: el componente `PublicacionesLista` por default export, que `App.tsx` ya importa.

- [ ] **Step 1: Escribir el test que falla**

Crear `client/src/pages/admin/publicaciones/Lista.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PublicacionesLista from './Lista'
import { publicacionesApi } from '../../../api/publicaciones'
import { useAuth } from '../../../context/AuthContext'
import type { PublicacionListItem } from '../../../types/publicacion'

vi.mock('../../../api/publicaciones', () => ({
  publicacionesApi: {
    listar: vi.fn(),
    actualizar: vi.fn(),
    urlDescarga: (id: number) => `http://api.test/api/v1/publicaciones/${id}/descargar`,
  },
}))

vi.mock('../../../context/AuthContext', () => ({ useAuth: vi.fn() }))

const PUBLICACION: PublicacionListItem = {
  id: 3,
  propiedad_id: 7,
  titulo: 'Casa 3 ambientes con jardín',
  descripcion: 'Luminosa',
  estado: 'activa',
  precio_publicado: 120000,
  moneda_publicada: 'USD',
  slug: null,
  publicada_en: '2026-09-20T10:00:00Z',
  creado_en: '2026-09-20T10:00:00Z',
  propiedad: { id: 7, titulo: 'Casa en Rivadavia' } as never,
}

function sesionCon(roles: string[]) {
  vi.mocked(useAuth).mockReturnValue({
    usuario: { id: 1, email: 'staff@mambo.com.ar', is_active: true, roles, person_id: null },
    cargando: false,
    login: vi.fn(),
    logout: vi.fn(),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  sesionCon(['staff'])
  vi.mocked(publicacionesApi.listar).mockResolvedValue([PUBLICACION])
  vi.mocked(publicacionesApi.actualizar).mockResolvedValue({ ...PUBLICACION, estado: 'pausada' } as never)
})

function renderLista() {
  return render(
    <MemoryRouter initialEntries={['/admin/publicaciones']}>
      <Routes>
        <Route path="/admin/publicaciones" element={<PublicacionesLista />} />
      </Routes>
    </MemoryRouter>,
  )
}

it('lista las publicaciones con su propiedad y su precio', async () => {
  renderLista()

  expect(await screen.findByText('Casa 3 ambientes con jardín')).toBeInTheDocument()
  expect(screen.getByText('Casa en Rivadavia')).toBeInTheDocument()
  expect(screen.getByText('USD 120.000')).toBeInTheDocument()
})

it('filtrar por estado vuelve a pedir el listado', async () => {
  const usuario = userEvent.setup()
  renderLista()
  await screen.findByText('Casa 3 ambientes con jardín')

  await usuario.selectOptions(screen.getByLabelText('Estado'), 'pausada')

  await waitFor(() =>
    expect(publicacionesApi.listar).toHaveBeenCalledWith(
      expect.objectContaining({ estado: 'pausada' }),
    ),
  )
})

it('pausar manda el estado nuevo y recarga la lista', async () => {
  const usuario = userEvent.setup()
  renderLista()

  await usuario.click(await screen.findByRole('button', { name: 'Pausar' }))

  await waitFor(() => expect(publicacionesApi.actualizar).toHaveBeenCalledWith(3, { estado: 'pausada' }))
  expect(publicacionesApi.listar).toHaveBeenCalledTimes(2)
})

it('el agente logueado ve el botón de descargar apuntando al ZIP', async () => {
  renderLista()

  const link = await screen.findByRole('link', { name: 'Descargar material' })
  expect(link).toHaveAttribute('href', 'http://api.test/api/v1/publicaciones/3/descargar')
  expect(link).toHaveAttribute('download')
})

it('un usuario sin rol no ve el botón de descargar', async () => {
  sesionCon([])
  renderLista()
  await screen.findByText('Casa 3 ambientes con jardín')

  expect(screen.queryByRole('link', { name: 'Descargar material' })).not.toBeInTheDocument()
})

it('muestra el mensaje del backend si una acción falla', async () => {
  const usuario = userEvent.setup()
  vi.mocked(publicacionesApi.actualizar).mockRejectedValue(new Error('Publicación no encontrada'))
  renderLista()

  await usuario.click(await screen.findByRole('button', { name: 'Pausar' }))

  expect(await screen.findByText('Publicación no encontrada')).toBeInTheDocument()
})

it('avisa cuando no hay publicaciones', async () => {
  vi.mocked(publicacionesApi.listar).mockResolvedValue([])
  renderLista()

  expect(await screen.findByText('No hay publicaciones.')).toBeInTheDocument()
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
npm test -- src/pages/admin/publicaciones/Lista.test.tsx
```

Esperado: FAIL — el componente actual solo renderiza "Próximamente...", así que no encuentra ni el título ni los botones.

- [ ] **Step 3: Escribir la pantalla**

Reemplazar todo el contenido de `client/src/pages/admin/publicaciones/Lista.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { publicacionesApi } from '../../../api/publicaciones'
import { useAuth } from '../../../context/AuthContext'
import type { EstadoPublicacion, PublicacionListItem } from '../../../types/publicacion'
import Badge from '../../../components/Badge'
import { formatearFecha, formatearMonto } from '../../../lib/formato'

// `eliminada` no se ofrece: es el resultado del borrado lógico, no un estado que
// alguien quiera filtrar desde el panel.
const ESTADOS: { valor: EstadoPublicacion; label: string }[] = [
  { valor: 'activa', label: 'Activa' },
  { valor: 'pausada', label: 'Pausada' },
]

export default function PublicacionesLista() {
  const { usuario } = useAuth()
  const [estado, setEstado] = useState<EstadoPublicacion | ''>('')
  const [publicaciones, setPublicaciones] = useState<PublicacionListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = () => {
    setLoading(true)
    setError(null)
    publicacionesApi.listar({ estado: estado || undefined, limit: 100 })
      .then(setPublicaciones)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(cargar, [estado]) // eslint-disable-line

  // El botón se le muestra a quien el backend va a dejar pasar (`SOLO_STAFF` en
  // el router): esto es cosmético, la barrera real es el endpoint.
  const puedeDescargar = Boolean(
    usuario?.roles.includes('staff') || usuario?.roles.includes('admin'),
  )

  const cambiarEstado = async (p: PublicacionListItem, nuevo: EstadoPublicacion) => {
    setError(null)
    try {
      await publicacionesApi.actualizar(p.id, { estado: nuevo })
      cargar()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el estado')
    }
  }

  return (
    <div>
      <div className="admin-page-header">
        <h1>Publicaciones</h1>
        <Link to="/admin/publicaciones/nueva" className="btn btn-magenta">+ Nueva publicación</Link>
      </div>

      <div className="admin-card filtros-bar">
        <label className="filtros-label">
          Estado
          <select value={estado} onChange={e => setEstado(e.target.value as EstadoPublicacion | '')}>
            <option value="">Todas</option>
            {ESTADOS.map(e => <option key={e.valor} value={e.valor}>{e.label}</option>)}
          </select>
        </label>
      </div>

      {loading && <p className="lista-estado">Cargando...</p>}
      {error   && <p className="lista-estado lista-error" role="alert">{error}</p>}

      {!loading && (
        publicaciones.length === 0
          ? <p className="lista-estado">No hay publicaciones.</p>
          : (
            <div className="admin-card tabla-wrapper">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Propiedad</th>
                    <th>Título</th>
                    <th>Precio</th>
                    <th>Publicada</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {publicaciones.map(p => (
                    <tr key={p.id}>
                      <td data-label="Propiedad">
                        <Link to={`/admin/propiedades/${p.propiedad_id}/editar`}>
                          {p.propiedad?.titulo ?? `#${p.propiedad_id}`}
                        </Link>
                      </td>
                      <td data-label="Título" className="tabla-titulo">{p.titulo}</td>
                      <td data-label="Precio" className="tabla-precio">
                        {formatearMonto(p.precio_publicado, p.moneda_publicada)}
                      </td>
                      <td data-label="Publicada">{formatearFecha(p.publicada_en)}</td>
                      <td data-label="Estado"><Badge value={p.estado} /></td>
                      <td data-label="Acciones">
                        <div className="tabla-acciones">
                          <Link to={`/admin/publicaciones/${p.id}/editar`} className="btn btn-outline btn-chico">
                            Editar
                          </Link>
                          {p.estado === 'activa' && (
                            <button className="btn btn-outline btn-chico" onClick={() => cambiarEstado(p, 'pausada')}>
                              Pausar
                            </button>
                          )}
                          {p.estado === 'pausada' && (
                            <button className="btn btn-outline btn-chico" onClick={() => cambiarEstado(p, 'activa')}>
                              Reactivar
                            </button>
                          )}
                          {puedeDescargar && (
                            <a
                              href={publicacionesApi.urlDescarga(p.id)}
                              download
                              className="btn btn-magenta btn-chico"
                            >
                              Descargar material
                            </a>
                          )}
                        </div>
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

- [ ] **Step 4: Correr el test**

```bash
npm test -- src/pages/admin/publicaciones/Lista.test.tsx
```

Esperado: PASS (7 tests). Si el assert de `USD 120.000` falla, revisar qué devuelve `formatearMonto` con `toLocaleString('es-AR')` en el entorno de test y ajustar **el assert** al formato real, no la función (la usan todas las listas del panel).

- [ ] **Step 5: Dejar en el working tree**

Sin commit. Archivos tocados: `client/src/pages/admin/publicaciones/Lista.tsx`, `client/src/pages/admin/publicaciones/Lista.test.tsx` (nuevo).

---

### Task 5: Pantalla de alta y edición de publicaciones

**Files:**
- Modify: `client/src/pages/admin/publicaciones/Formulario.tsx` (placeholder de 12 líneas: se reemplaza entero)
- Test: `client/src/pages/admin/publicaciones/Formulario.test.tsx` (nuevo)

**Interfaces:**
- Consumes: `publicacionesApi.obtener(id)`, `publicacionesApi.crear(payload)`, `publicacionesApi.actualizar(id, payload)`; `SelectorPropiedad` (default export de `components/crm/SelectorPropiedad/SelectorPropiedad`, props `{ valor: PropiedadElegida | null, onChange, label?, bloqueada? }`, y trae el listado con `propiedadesApi.listar({ limit: 500 })`).
- Produces: el componente `PublicacionFormulario` por default export, que `App.tsx` ya importa para `/nueva` y `/:id/editar`.

- [ ] **Step 1: Escribir el test que falla**

Crear `client/src/pages/admin/publicaciones/Formulario.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PublicacionFormulario from './Formulario'
import { publicacionesApi } from '../../../api/publicaciones'
import { propiedadesApi } from '../../../api/propiedades'

vi.mock('../../../api/publicaciones', () => ({
  publicacionesApi: { obtener: vi.fn(), crear: vi.fn(), actualizar: vi.fn() },
}))
vi.mock('../../../api/propiedades', () => ({
  propiedadesApi: { listar: vi.fn() },
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(propiedadesApi.listar).mockResolvedValue([
    { id: 7, titulo: 'Casa en Rivadavia', estado_comercial: 'disponible' },
  ] as never)
  vi.mocked(publicacionesApi.crear).mockResolvedValue({ id: 3 } as never)
  vi.mocked(publicacionesApi.actualizar).mockResolvedValue({ id: 3 } as never)
  vi.mocked(publicacionesApi.obtener).mockResolvedValue({
    id: 3,
    propiedad_id: 7,
    titulo: 'Casa 3 ambientes',
    descripcion: 'Luminosa',
    estado: 'activa',
    precio_publicado: 120000,
    moneda_publicada: 'USD',
    slug: 'casa-3-ambientes',
    publicada_en: '2026-09-20T10:00:00Z',
    creado_en: '2026-09-20T10:00:00Z',
    actualizado_en: '2026-09-20T10:00:00Z',
    eliminado_en: null,
    propiedad: { id: 7, titulo: 'Casa en Rivadavia' },
  } as never)
})

function renderAlta() {
  return render(
    <MemoryRouter initialEntries={['/admin/publicaciones/nueva']}>
      <Routes>
        <Route path="/admin/publicaciones/nueva" element={<PublicacionFormulario />} />
        <Route path="/admin/publicaciones" element={<p>listado</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

function renderEdicion() {
  return render(
    <MemoryRouter initialEntries={['/admin/publicaciones/3/editar']}>
      <Routes>
        <Route path="/admin/publicaciones/:id/editar" element={<PublicacionFormulario />} />
        <Route path="/admin/publicaciones" element={<p>listado</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

it('no deja crear sin elegir la propiedad', async () => {
  const usuario = userEvent.setup()
  renderAlta()

  await usuario.type(screen.getByLabelText('Título'), 'Casa 3 ambientes')
  await usuario.click(screen.getByRole('button', { name: 'Crear publicación' }))

  expect(await screen.findByText('Elegí la propiedad que se va a publicar')).toBeInTheDocument()
  expect(publicacionesApi.crear).not.toHaveBeenCalled()
})

it('crea la publicación con la propiedad elegida y vuelve al listado', async () => {
  const usuario = userEvent.setup()
  renderAlta()

  await usuario.type(screen.getByRole('combobox', { name: 'Propiedad' }), 'Casa')
  await usuario.click(await screen.findByText('Casa en Rivadavia'))
  await usuario.type(screen.getByLabelText('Título'), 'Casa 3 ambientes')
  await usuario.type(screen.getByLabelText('Precio publicado'), '120000')
  await usuario.click(screen.getByRole('button', { name: 'Crear publicación' }))

  await waitFor(() =>
    expect(publicacionesApi.crear).toHaveBeenCalledWith(
      expect.objectContaining({
        propiedad_id: 7,
        titulo: 'Casa 3 ambientes',
        precio_publicado: 120000,
        estado: 'activa',
      }),
    ),
  )
  expect(await screen.findByText('listado')).toBeInTheDocument()
})

it('en edición precarga los campos y no deja cambiar la propiedad', async () => {
  renderEdicion()

  expect(await screen.findByDisplayValue('Casa 3 ambientes')).toBeInTheDocument()
  expect(screen.getByDisplayValue('Luminosa')).toBeInTheDocument()
  expect(screen.getByDisplayValue('casa-3-ambientes')).toBeInTheDocument()
  expect(screen.getByText('Casa en Rivadavia')).toBeInTheDocument()
  // `bloqueada`: la propiedad de una publicación ya creada no se cambia.
  expect(screen.queryByRole('button', { name: 'Quitar' })).not.toBeInTheDocument()
})

it('guardar en edición manda solo los campos editables', async () => {
  const usuario = userEvent.setup()
  renderEdicion()
  await screen.findByDisplayValue('Casa 3 ambientes')

  await usuario.click(screen.getByRole('button', { name: 'Guardar cambios' }))

  await waitFor(() =>
    expect(publicacionesApi.actualizar).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ titulo: 'Casa 3 ambientes', moneda_publicada: 'USD' }),
    ),
  )
  expect(publicacionesApi.crear).not.toHaveBeenCalled()
})

it('muestra el error del backend sin cambiar de pantalla', async () => {
  const usuario = userEvent.setup()
  vi.mocked(publicacionesApi.actualizar).mockRejectedValue(new Error('El slug ya está en uso'))
  renderEdicion()
  await screen.findByDisplayValue('Casa 3 ambientes')

  await usuario.click(screen.getByRole('button', { name: 'Guardar cambios' }))

  expect(await screen.findByText('El slug ya está en uso')).toBeInTheDocument()
  expect(screen.queryByText('listado')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
npm test -- src/pages/admin/publicaciones/Formulario.test.tsx
```

Esperado: FAIL — el componente actual es el placeholder "Próximamente...".

- [ ] **Step 3: Escribir la pantalla**

Reemplazar todo el contenido de `client/src/pages/admin/publicaciones/Formulario.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { publicacionesApi } from '../../../api/publicaciones'
import SelectorPropiedad from '../../../components/crm/SelectorPropiedad/SelectorPropiedad'
import type { PropiedadElegida } from '../../../components/crm/SelectorPropiedad/SelectorPropiedad'
import type { EstadoPublicacion } from '../../../types/publicacion'

export default function PublicacionFormulario() {
  const navigate = useNavigate()
  const { id } = useParams()
  const editando = Boolean(id)

  const [propiedad, setPropiedad]     = useState<PropiedadElegida | null>(null)
  const [titulo, setTitulo]           = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [estado, setEstado]           = useState<EstadoPublicacion>('activa')
  const [precio, setPrecio]           = useState('')
  const [moneda, setMoneda]           = useState('ARS')
  const [slug, setSlug]               = useState('')
  const [guardando, setGuardando]     = useState(false)
  const [error, setError]             = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    publicacionesApi.obtener(Number(id))
      .then(p => {
        setTitulo(p.titulo)
        setDescripcion(p.descripcion ?? '')
        // Una publicación borrada no se edita (el backend la esconde con 404), así
        // que el select solo maneja los dos estados vivos.
        setEstado(p.estado === 'eliminada' ? 'pausada' : p.estado)
        setPrecio(p.precio_publicado === null ? '' : String(p.precio_publicado))
        setMoneda(p.moneda_publicada)
        setSlug(p.slug ?? '')
        setPropiedad(p.propiedad ? { id: p.propiedad.id, titulo: p.propiedad.titulo } : null)
      })
      .catch(e => setError(e.message))
  }, [id])

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editando && !propiedad) {
      setError('Elegí la propiedad que se va a publicar')
      return
    }

    setGuardando(true)
    setError(null)
    try {
      // Edición y alta arman el payload distinto para los campos opcionales
      // (descripción, slug, precio) porque `undefined` desaparece al serializar el
      // body: el backend recibe la clave ausente y no puede distinguir "no lo toques"
      // de "vacialo". En alta eso es lo que queremos (que aplique sus defaults), pero
      // en edición vaciar un campo que ya tenía valor necesita un `null` explícito.
      if (editando) {
        await publicacionesApi.actualizar(Number(id), {
          titulo,
          descripcion: descripcion || null,
          estado,
          precio_publicado: precio ? Number(precio) : null,
          moneda_publicada: moneda,
          slug: slug || null,
        })
      } else if (propiedad) {
        await publicacionesApi.crear({
          propiedad_id: propiedad.id,
          titulo,
          descripcion: descripcion || undefined,
          estado,
          precio_publicado: precio ? Number(precio) : undefined,
          moneda_publicada: moneda,
          slug: slug || undefined,
        })
      }
      navigate('/admin/publicaciones')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div>
      <div className="admin-page-header">
        <h1>{editando ? 'Editar publicación' : 'Nueva publicación'}</h1>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      <form onSubmit={guardar} className="admin-card form">
        <div className="form-field full">
          {/* En edición va bloqueada: mover una publicación de propiedad no tiene
              caso de uso y `PublicacionUpdate` ni siquiera acepta `propiedad_id`. */}
          <SelectorPropiedad valor={propiedad} onChange={setPropiedad} bloqueada={editando} />
        </div>

        <div className="form-field full">
          <label htmlFor="titulo">Título</label>
          <input id="titulo" required value={titulo} onChange={e => setTitulo(e.target.value)} />
        </div>

        <div className="form-field full">
          <label htmlFor="descripcion">Descripción</label>
          <textarea
            id="descripcion"
            rows={6}
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
          />
        </div>

        <div className="form-row">
          <div className="form-field" style={{ maxWidth: 140 }}>
            <label htmlFor="estado">Estado</label>
            <select
              id="estado"
              value={estado}
              onChange={e => setEstado(e.target.value as EstadoPublicacion)}
            >
              <option value="activa">Activa</option>
              <option value="pausada">Pausada</option>
            </select>
          </div>
          <div className="form-field" style={{ maxWidth: 100 }}>
            <label htmlFor="moneda">Moneda</label>
            <select id="moneda" value={moneda} onChange={e => setMoneda(e.target.value)}>
              <option>ARS</option>
              <option>USD</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="precio">Precio publicado</label>
            <input
              id="precio"
              type="number"
              min={0}
              value={precio}
              onChange={e => setPrecio(e.target.value)}
            />
          </div>
        </div>

        <div className="form-field full">
          <label htmlFor="slug">Slug</label>
          <input id="slug" value={slug} onChange={e => setSlug(e.target.value)} />
          <p className="form-hint">Opcional: define la URL amigable del aviso en el sitio público.</p>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={() => navigate(-1)}>Cancelar</button>
          <button type="submit" className="btn btn-magenta" disabled={guardando}>
            {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear publicación'}
          </button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Correr el test**

```bash
npm test -- src/pages/admin/publicaciones/Formulario.test.tsx
```

Esperado: PASS (5 tests).

- [ ] **Step 5: Correr toda la suite del frontend**

```bash
npm test
```

Esperado: todo verde, incluido `App.test.tsx` (que renderiza las rutas y hasta ahora veía los placeholders).

- [ ] **Step 6: Verificar tipos y build**

```bash
npm run build
```

Esperado: compila sin errores de TypeScript.

- [ ] **Step 7: Dejar en el working tree**

Sin commit. Archivos tocados: `client/src/pages/admin/publicaciones/Formulario.tsx`, `client/src/pages/admin/publicaciones/Formulario.test.tsx` (nuevo).

---

### Task 6: Scroll propio del sidebar del panel

**Files:**
- Modify: `client/src/layouts/AdminLayout.css` (regla `.admin-nav`, alrededor de la línea 91)

**Interfaces:**
- Consumes: la estructura que ya monta `AdminLayout.tsx` — `.admin-sidebar` (flex column) con tres hijos: `.admin-sidebar-logo`, `.admin-nav` y `.admin-sidebar-footer`.
- Produces: nada que consuma otra tarea. Es CSS aislado.

**Sin test automatizado:** jsdom no calcula layout, así que ningún test de Vitest puede detectar un desborde. Es el criterio que ya dejó escrito `AdminLayout.test.tsx` ("jsdom no calcula CSS […] eso va a la checklist manual") y §8.2 del spec de responsive. La verificación es el Step 3.

- [ ] **Step 1: Aplicar el cambio**

En `client/src/layouts/AdminLayout.css`, reemplazar la regla `.admin-nav` actual:

```css
.admin-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 0.75rem;
  flex: 1;
}
```

por:

```css
/* El scroll vive acá y no en `.admin-sidebar`: así el logo y el pie de sesión
   quedan fijos arriba y abajo, y solo la lista de enlaces se desplaza. Sin esto
   —el sidebar es `position: fixed` a toda la altura— un menú más largo que la
   ventana dejaba los últimos ítems y el botón "Salir" fuera de alcance, sin
   ninguna barra que permitiera llegar a ellos.
   El `min-height: 0` es lo que lo hace funcionar: un hijo flex arranca con
   `min-height: auto` y se niega a achicarse por debajo de su contenido, así que
   sin él el `overflow-y` nunca entra en juego. */
.admin-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 0.75rem;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  /* El scroll del nav no se propaga al contenido de atrás al llegar al final. */
  overscroll-behavior: contain;
}
```

- [ ] **Step 2: Levantar el dev server**

Desde `client/`:

```bash
npm run dev
```

Entrar a `http://localhost:5173/admin` con la sesión iniciada (backend arriba con `uvicorn app.main:app --reload --port 8000` desde `src/`).

- [ ] **Step 3: Verificación manual (obligatoria, reemplaza al test)**

Con la ventana del navegador achicada a **~600px de alto**, comprobar los cuatro puntos:

1. **Escritorio (ancho > 860px):** la lista de enlaces scrollea con la rueda del mouse.
2. El logo "MAMBO / Group · Admin" queda fijo arriba y no se desplaza con el nav.
3. El bloque de sesión (email + botón **Salir**) y el enlace "← Ver sitio" quedan fijos abajo y siguen clickeables.
4. **Móvil (ancho < 860px):** abrir el drawer con la hamburguesa y repetir 1-3 adentro del drawer.

Si alguno falla, el problema casi siempre es el `min-height: 0`: sin él el nav no se achica y el scroll no aparece.

- [ ] **Step 4: Dejar en el working tree**

Sin commit. Archivo tocado: `client/src/layouts/AdminLayout.css`.

---

### Task 7: Corregir el mapa de funcionalidades

La tabla del mapa da por hecho el panel de publicaciones desde el 11/09 y no lo estaba. Se corrige ahora que sí lo está, y se deja anotado el spec del rediseño estético que quedó acordado.

**Files:**
- Modify: `docs/superpowers/specs/2026-09-11-mapa-de-funcionalidades.md` (tabla de §1, línea 21; y el bloque de estado del encabezado)

**Interfaces:** ninguna — es documentación.

- [ ] **Step 1: Corregir la fila de la tabla**

En `docs/superpowers/specs/2026-09-11-mapa-de-funcionalidades.md`, reemplazar la línea:

```markdown
| Propiedades venta / alquiler / temporal, fotos con variantes, publicaciones | ✅ | ✅ |
```

por:

```markdown
| Propiedades venta / alquiler / temporal, fotos con variantes | ✅ | ✅ |
| Publicaciones (avisos) | ✅ | ✅ desde el 22/09/2026 — la pantalla era un placeholder hasta [su spec](2026-09-22-publicaciones-panel-design.md) |
```

- [ ] **Step 2: Anotar el rediseño pendiente en el encabezado**

En el mismo archivo, después de la línea `**Siguiente:** Bloque 5 — Actividades y agenda.`, agregar:

```markdown
**Pendiente sin bloque asignado (acordado el 22/09/2026):** rediseño estético del panel de admin, transversal a todos los módulos. Necesita su propio spec, con mockups antes de tocar pantallas.
```

- [ ] **Step 3: Verificar el resultado**

Abrir el archivo y confirmar que la tabla sigue bien formada (seis filas de datos, todas con tres columnas) y que el enlace al spec de publicaciones resuelve a un archivo que existe en `docs/superpowers/specs/`.

- [ ] **Step 4: Dejar en el working tree**

Sin commit. Archivo tocado: `docs/superpowers/specs/2026-09-11-mapa-de-funcionalidades.md`.

---

## Cierre

Con las siete tareas hechas, correr todo junto y reportarle a Matías la lista completa de archivos tocados para que él commitee:

```bash
cd src    && python -m pytest tests/ -q && ruff check .
cd ../client && npm test && npm run build
```

Esperado: backend y frontend en verde, y el build sin errores de tipos. Sin `alembic upgrade`: este trabajo no toca modelos ni agrega migraciones.

Archivos del working tree al terminar:

- `src/app/modules/publicaciones/service.py` (modificado)
- `src/app/modules/publicaciones/router.py` (modificado)
- `src/tests/test_publicaciones.py` (nuevo)
- `client/src/api/publicaciones.ts` (modificado)
- `client/src/api/publicaciones.test.ts` (nuevo)
- `client/src/pages/admin/publicaciones/Lista.tsx` (reescrito)
- `client/src/pages/admin/publicaciones/Lista.test.tsx` (nuevo)
- `client/src/pages/admin/publicaciones/Formulario.tsx` (reescrito)
- `client/src/pages/admin/publicaciones/Formulario.test.tsx` (nuevo)
- `client/src/layouts/AdminLayout.css` (modificado)
- `docs/superpowers/specs/2026-09-11-mapa-de-funcionalidades.md` (modificado)
- `docs/superpowers/specs/2026-09-22-publicaciones-panel-design.md` (el spec, ya escrito)
- `docs/superpowers/plans/2026-09-22-publicaciones-panel.md` (este plan)
