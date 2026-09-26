# Contratos y documentos — Diseño

**Bloque 3** del [mapa de funcionalidades](2026-09-11-mapa-de-funcionalidades.md). Construye sobre el [Bloque 1](2026-09-11-crm-en-el-panel-design.md) (propiedades con propietario, personas, operaciones) y sobre el [2a](2026-09-16-alquileres-contratos-design.md) (contratos de alquiler). Estado: aprobado el 21/09/2026.

> **Regla de trabajo para quien implemente esto (humano o agente):** no hacer `git commit` ni `git push` de nada. Se deja todo en el working tree y Matías se encarga de commitear y pushear. Vale para el spec, el plan y cada tarea de implementación.

## 1. Objetivo

Que el staff pueda adjuntar documentos —boleto, reserva firmada, DNI, informe de dominio, anexo fotográfico— a una propiedad, una persona, una operación o un contrato de alquiler, y verlos desde la ficha de esa entidad con tipo, fecha y quién lo subió. Los archivos van a R2 en producción y al disco en desarrollo, reutilizando `app.storage` sin modificarlo.

## 2. Alcance

**Entra**
1. Tabla `documentos` con cuatro FKs nullable —`propiedad_id`, `persona_id`, `deal_id`, `contrato_id`— de las que exactamente una está cargada.
2. Catálogo fijo de tipos: `boleto`, `reserva_firmada`, `dni`, `informe_dominio`, `anexo_fotografico`, `otro`. `otro` es un valor cerrado más, sin texto libre asociado: existe para no bloquear un caso no previsto sin abrir la puerta a tipos inconsistentes.
3. Subir (multipart) y borrar. **Sin editar metadata**: si se cargó con el tipo equivocado, se borra y se vuelve a subir.
4. Un módulo `platform/documentos/` con un único endpoint de listado y uno de alta que sirven a las cuatro entidades, y un único componente `BloqueDocumentos` en el panel que se inserta en las cuatro pantallas.
5. Migración `0009_documentos`.

**No entra**
- Versionado (reemplazar un documento conservando el anterior).
- Firma electrónica ni flujo de aprobación.
- Reservas como quinta entidad: son de vida corta y hoy nadie pidió adjuntarles nada.
- Vista global "todos los documentos" fuera de cada ficha. Se accede siempre desde la entidad dueña.
- Otros formatos que no sean PDF e imagen (Word, Excel). Entran cuando alguien los necesite.
- Descarga por la API (proxy de bytes). El navegador abre `archivo_url` directo, igual que las fotos y el PDF del contrato.

## 3. Decisiones

1. **Cuatro FKs nullable, no una FK polimórfica.** El stub de `notes/models.py` deja anotado "polimórfico por `entity_type` + `entity_id`", pero eso pierde la integridad referencial: borrar una propiedad dejaría documentos huérfanos que ningún `ondelete` limpia. Con una columna por entidad y `ondelete=CASCADE`, la base borra la fila sola, y es el mismo patrón que ya usa `activities` (`person_id`, `property_id`). Son exactamente cuatro entidades conocidas; una quinta es una migración de una columna.
2. **"Exactamente una entidad" se valida en la aplicación, no con `CheckConstraint`.** No hay ningún `CheckConstraint` en el repo; todas las reglas equivalentes (suma del reparto ≤ 100, `pct` vs `monto`) viven en Pydantic o en el `service`. Se sigue ese criterio: el `service` rechaza con 422 antes de insertar.
3. **Catálogo de tipos en Pydantic, columna `String` en la base.** Igual que `activity_type` y `estado` en el resto de los módulos: el `Literal` del schema es la única fuente del catálogo; la base no lleva enum nativo, que en Postgres es incómodo de migrar.
4. **Módulo propio `platform/documentos/`**, no un archivo dentro de cada dominio. Los documentos cruzan cuatro módulos; una sola implementación de subir/listar/borrar es más chica y más fácil de testear que cuatro. Mismo criterio que `reportes/`, con la diferencia de que acá sí hay `models.py` porque el módulo es dueño de la tabla.
5. **Endpoints planos bajo `/api/v1/documentos`, con la entidad como parámetro.** La alternativa (anidar `/propiedades/{id}/documentos`, `/people/{id}/documentos`, …) obliga a cuatro routers que llaman al mismo service. Con un `GET /documentos?deal_id=7` el frontend usa una sola función y el backend un solo endpoint.
6. **Misma whitelist y límite que los comprobantes de gastos**: PDF, JPG, PNG, HEIC/HEIF, 10 MB. Se copia el diccionario `EXTENSIONES` de `gastos.py` en vez de importarlo: son dos módulos sin relación de dominio y compartir la constante los acoplaría por un detalle.
7. **La clave de storage lleva la entidad**: `documentos/<propiedad|persona|deal|contrato>/<id>/<uuid>.<ext>`. Sirve para reconocer de quién es un objeto mirando el bucket, sin consultar la base. `app.storage` no cambia: `guardar_archivo` y `borrar_imagen` ya reciben la clave que quien llama decida.
8. **Se guarda `nombre_original` y `tamano_bytes`.** El nombre con el que se subió es lo que el staff reconoce en la lista ("boleto_lopez.pdf"), no el UUID; el tamaño se muestra al lado. Ninguno de los dos es derivable de la clave.
9. **Borrar el documento borra el archivo primero y la fila después, sin transacción entre ambos.** Igual que `borrar_imagen` en fotos: un archivo huérfano en el bucket es basura barata; una fila que apunta a un archivo que ya no existe es un link roto. Los errores del proveedor se tragan (así ya lo hace `borrar_imagen`).
10. **Al borrar la entidad dueña, la fila cae por `CASCADE` pero el archivo queda en el bucket.** Ninguno de los cuatro módulos dueños sabe que existen documentos, y hacerlos saber es acoplarlos. Se acepta el archivo huérfano: es el mismo trade-off de la decisión 9, y las propiedades ya usan soft delete (`deleted_at`), así que en la práctica el caso es raro.

## 4. Backend

### 4.1 Modelo (`documentos/models.py`, migración `0009_documentos`)

```python
class Documento(Base):
    __tablename__ = "documentos"

    id: int
    tipo: str                        # String(30) not null; catálogo validado en schemas, no en la DB

    propiedad_id: int | None         # FK propiedades.id ondelete CASCADE, index
    persona_id: int | None           # FK people.id ondelete CASCADE, index
    deal_id: int | None              # FK deals.id ondelete CASCADE, index
    contrato_id: int | None          # FK alquileres_contratos.id ondelete CASCADE, index

    archivo_url: str                 # Text not null
    archivo_key: str                 # String(255) not null; lo que recibe borrar_imagen
    nombre_original: str             # String(255) not null
    tamano_bytes: int                # Integer not null

    subido_por_user_id: int          # FK users.id ondelete RESTRICT, not null
    created_at: datetime             # DateTime(timezone=True) not null, default now UTC

    subido_por: User                 # relationship, lazy="joined"
```

Sin relaciones hacia las entidades dueñas ni `back_populates` desde ellas: los documentos se consultan siempre por la FK desde el endpoint de listado, y agregar `documentos: list[Documento]` a `Propiedad`, `Person`, `Deal` y `Contrato` sería tocar cuatro módulos para una relación que nadie recorre desde ese lado.

La migración crea la tabla con las cuatro FKs, sus índices y la de `subido_por_user_id`. `downgrade` borra la tabla. Sin backfill.

### 4.2 Contrato de interfaz (`documentos/schemas.py`)

```python
TipoDocumento = Literal[
    "boleto", "reserva_firmada", "dni", "informe_dominio", "anexo_fotografico", "otro"
]

class DocumentoOut(BaseModel):
    id: int
    tipo: TipoDocumento
    archivo_url: str
    nombre_original: str
    tamano_bytes: int
    subido_por: str                  # users.name
    created_at: datetime
```

No hay schema de entrada JSON: el alta es multipart. `tipo` llega como `Form` y se valida contra `TipoDocumento` con `Annotated[TipoDocumento, Form()]`, así FastAPI responde 422 solo con el catálogo.

### 4.3 Reglas de negocio (`documentos/service.py`)

```python
MAX_BYTES = 10 * 1024 * 1024
EXTENSIONES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/heic": ".heic",
    "image/heif": ".heif",
}

class Entidad(NamedTuple):
    columna: str      # "propiedad_id" | "persona_id" | "deal_id" | "contrato_id"
    carpeta: str      # "propiedad" | "persona" | "deal" | "contrato"
    id: int
```

**`resolver_entidad(db, *, propiedad_id, persona_id, deal_id, contrato_id) -> Entidad`** — cuenta cuántos vienen no nulos; si no es exactamente uno → 422 "Debe indicar exactamente una entidad: propiedad, persona, operación o contrato". Si es uno, verifica que exista **reutilizando el getter del módulo dueño**, que ya respeta su soft delete y ya tiene su mensaje de 404: `propiedades.service.obtener_propiedad` (filtra `eliminado_en`), `people.service.get_person_or_404` (filtra `deleted_at`), `deals.service.get_deal_or_404` (filtra `deleted_at`), `alquileres.service.obtener_contrato` (sin soft delete). Los mensajes son los de cada módulo ("Propiedad no encontrada", "Persona no encontrada", "Deal no encontrado", "Contrato no encontrado"); no se redefinen acá.

**`subir(db, *, tipo, entidad: Entidad, archivo: UploadFile, user_id) -> Documento`** — `EXTENSIONES.get(archivo.content_type)` o 422 "El documento debe ser PDF o imagen (JPG, PNG, HEIC)"; lee los bytes, si superan `MAX_BYTES` → 413 "El documento supera los 10 MB"; `guardar_archivo(contenido, f"documentos/{entidad.carpeta}/{entidad.id}/{uuid4().hex}{ext}")`; crea la fila con `**{entidad.columna: entidad.id}`, `nombre_original = archivo.filename or "documento" + ext`, `tamano_bytes = len(contenido)`; commit, refresh.

**`listar(db, entidad: Entidad) -> list[Documento]`** — `WHERE <columna> = id ORDER BY created_at DESC, id DESC`.

**`obtener(db, documento_id) -> Documento`** — 404 "Documento no encontrado".

**`borrar(db, documento_id) -> None`** — `obtener`, `borrar_imagen(doc.archivo_url, doc.archivo_key)`, `db.delete`, commit.

### 4.4 Endpoints (`documentos/router.py`, prefijo `/documentos`, montado bajo `/api/v1`, todos con `SOLO_STAFF`)

| Método | Ruta | Entrada | Respuesta |
|---|---|---|---|
| `POST` | `/api/v1/documentos` | multipart: `tipo` (Form), `archivo` (File), y uno de `propiedad_id` / `persona_id` / `deal_id` / `contrato_id` (Form, `int | None`) | 201 `DocumentoOut` |
| `GET` | `/api/v1/documentos` | query: uno de `propiedad_id` / `persona_id` / `deal_id` / `contrato_id` | `list[DocumentoOut]` |
| `DELETE` | `/api/v1/documentos/{documento_id}` | — | 204 |

El `POST` toma `user_id` del usuario autenticado (`get_current_user`), no de un campo del form. Se registra en `main.py` con `app.include_router(documentos_router, prefix="/api/v1")`.

### 4.5 Errores

| Caso | Código y mensaje |
|---|---|
| Ninguna o más de una entidad | 422 "Debe indicar exactamente una entidad: propiedad, persona, operación o contrato" |
| La entidad indicada no existe (o está soft-deleted) | 404 con el mensaje del módulo dueño: "Propiedad no encontrada" / "Persona no encontrada" / "Deal no encontrado" / "Contrato no encontrado" |
| `tipo` fuera del catálogo | 422 (FastAPI, por el `Literal`) |
| `content_type` no permitido | 422 "El documento debe ser PDF o imagen (JPG, PNG, HEIC)" |
| Archivo mayor a 10 MB | 413 "El documento supera los 10 MB" |
| `DELETE` de un documento inexistente | 404 "Documento no encontrado" |
| Anónimo | 401 |

## 5. Frontend

### 5.1 Tipos y API

- `types/documento.ts`: `TipoDocumento` (union de los seis valores), `DocumentoOut`, `ETIQUETAS_TIPO_DOCUMENTO: Record<TipoDocumento, string>` ("Boleto", "Reserva firmada", "DNI", "Informe de dominio", "Anexo fotográfico", "Otro") y `EntidadDocumento`, un discriminated union `{ propiedadId: number } | { personaId: number } | { dealId: number } | { contratoId: number }` para que TypeScript obligue a pasar exactamente una.
- `api/documentos.ts`:
  - `listar(entidad: EntidadDocumento): Promise<DocumentoOut[]>` — traduce la entidad al query param (`propiedad_id`, …) con `construirQuery`.
  - `subir(entidad: EntidadDocumento, tipo: TipoDocumento, archivo: File): Promise<DocumentoOut>` — arma `FormData` con `tipo`, `archivo` y el campo de entidad; `fetch` con `credentials: 'include'` y **sin `Content-Type` manual** (el navegador pone el boundary). Mismo mecanismo que `propiedadesApi.subirMedio`.
  - `eliminar(documentoId: number): Promise<void>`.

### 5.2 Componente compartido (`components/crm/BloqueDocumentos/`)

`BloqueDocumentos.tsx`, prop única `entidad: EntidadDocumento`. Un solo componente para las cuatro pantallas. Carga la lista al montar (y cuando cambia la entidad) con `documentosApi.listar`.

Layout aprobado:

```text
┌─ Documentos ────────────────────────────────────────────────┐
│  Tipo       [ Informe de dominio  ▾ ]                        │
│  Archivo    [ Elegir archivo ]  sin elegir      [ Subir ]    │
│  ───────────────────────────────────────────────────────────  │
│  Tipo               Archivo            Subido por  Fecha      │
│  Informe de dominio dominio_av.pdf     Matías J.   18/09/2026 │
│                     1,2 MB                        [Ver][Borrar]│
│  DNI                dni_comprador.jpg  Ana P.      19/09/2026 │
│                     340 KB                        [Ver][Borrar]│
│  (vacío → "No hay documentos cargados")                       │
└──────────────────────────────────────────────────────────────┘
```

- El componente renderiza su propia `<section className="admin-card">` con el título "Documentos" (como `BloqueComision`), así se inserta con una línea en cada pantalla. **No usa `<form>`**: en `Formulario.tsx` queda adentro del `<form>` de la propiedad y un form anidado es HTML inválido; el botón Subir es `type="button"`.
- Formulario de carga: `<select>` de tipo (default `otro`), `<input type="file" accept="application/pdf,image/jpeg,image/png,image/heic,image/heif">`, botón **Subir** deshabilitado hasta que haya archivo. Al subir, agrega el resultado al principio de la lista y limpia el input. El error del backend (422/413) se muestra inline debajo del formulario, como en `ModalRegistrarPago`.
- Tabla: tipo (etiqueta), nombre original con el tamaño formateado debajo (`formatearTamano` en `lib/formato.ts`: `< 1024` → "B", `< 1 MB` → "KB", si no "MB", una decimal con coma), subido por, fecha (`formatearFecha`), **Ver** (`<a href={mediaUrl(archivo_url)} target="_blank" rel="noopener">`) y **Borrar** con `window.confirm`, que llama `documentosApi.eliminar` y saca la fila.
- Estados: "Cargando…", lista vacía, error de carga con botón "Reintentar".
- Sin CSS propio más allá de lo puntual del input de archivo; reutiliza `form-section-title` y las clases de tabla que ya usan `TablaGastos` y `TablaCobros`.

### 5.3 Dónde se inserta

| Pantalla | Dónde | Entidad |
|---|---|---|
| `pages/admin/propiedades/Formulario.tsx` | Sección "Documentos" después de "Fotos", **solo si `id` existe** (misma condición que las fotos: hay que guardar la propiedad antes) | `{ propiedadId }` |
| `pages/admin/personas/Ficha.tsx` | Sección "Documentos" al final de la ficha | `{ personaId }` |
| `pages/admin/operaciones/Ficha.tsx` | Sección "Documentos" después de "Comisión" | `{ dealId }` |
| `pages/admin/alquileres/Ficha.tsx` | Sección "Documentos" al final. Es distinta del **PDF firmado del contrato** del 2a, que sigue siendo su propio campo; acá van DNI de las partes, informe de dominio, etc. | `{ contratoId }` |

## 6. Tests

Backend (`src/tests/test_documentos.py`, con los helpers de `helpers_crm.py` para crear propiedad, persona, deal y contrato):
- Subir a cada una de las cuatro entidades → 201, la FK correcta cargada y las otras tres en `None`, `subido_por` con el nombre del usuario logueado, `nombre_original` y `tamano_bytes` correctos.
- Sin entidad → 422; con dos entidades → 422.
- Entidad inexistente → 404 con el mensaje de esa entidad; propiedad soft-deleted → 404.
- `tipo` fuera del catálogo → 422.
- `content_type` no permitido → 422; archivo mayor a 10 MB → 413 (bytes generados en memoria).
- `GET` por cada entidad devuelve solo los suyos, orden `created_at desc`; `GET` sin entidad → 422.
- `DELETE` borra la fila y el archivo (con el fixture `media_tmp`, verificar que el archivo ya no está en `media_root`); segundo `DELETE` → 404.
- Borrar la entidad dueña con `db.delete` borra sus documentos por `CASCADE`, un test por entidad. SQLite **no** aplica FKs por defecto y el `engine` de `conftest.py` no lo activa; el test ejecuta `db.execute(text("PRAGMA foreign_keys=ON"))` en su propia sesión antes del borrado, en vez de activarlo globalmente y arriesgar el resto de la suite.
- Anónimo → 401 en los tres endpoints.

Frontend (`client/src/`):
- `BloqueDocumentos.test.tsx`: lista vacía muestra "No hay documentos cargados"; renderiza filas con etiqueta del tipo, tamaño formateado y nombre; subir envía `FormData` con los tres campos y agrega la fila sin recargar; borrar confirma y saca la fila; error del backend se muestra inline.
- `formato.test.ts`: `formatearTamano`.
- `Formulario.documentos.test.tsx` (propiedades): sin `id` no aparece la sección; con `id` aparece y llama `listar({ propiedadId })`.
- Un test en cada `Ficha.test.tsx` de personas, operaciones y alquileres que verifique que la sección aparece con la entidad correcta (mock de `documentosApi`).

## 7. Despliegue

Migración `0009_documentos` (una tabla, sin backfill). Se aplica con `alembic upgrade head` contra Supabase junto con las que falten en ese momento (hoy Supabase está en `0005`; faltan `0006`, `0007` y `0008`). Sin variables nuevas: usa el `STORAGE_BACKEND` ya configurado. Nota corta en `docs/despliegue.md`.

## 8. Después, si aparece la demanda

**URLs firmadas o un endpoint que sirva los bytes con sesión**: hoy el archivo queda en la URL pública del bucket (con `Cache-Control: public, immutable`), protegido solo por el UUID de la clave — el mismo trade-off ya aceptado para el PDF del contrato y los comprobantes de gastos, pero un DNI escaneado sube la apuesta respecto de una foto de propiedad; editar tipo sin volver a subir; reservas como quinta entidad; Word/Excel en la whitelist; vista global de documentos con filtro por tipo; vencimiento de documentos (un informe de dominio caduca) con recordatorio en la bandeja del 2c; descarga en lote (ZIP) de todos los documentos de una operación.
