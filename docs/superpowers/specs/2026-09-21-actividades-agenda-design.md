# Actividades y agenda — Diseño

**Bloque 5a** del [mapa de funcionalidades](2026-09-11-mapa-de-funcionalidades.md). Primero de tres sub-bloques del Bloque 5 (5a Actividades y agenda → 5b Notas por entidad → 5c Auditoría), partido así porque las tres piezas son independientes entre sí y `notes`/`audit` son stubs completos mientras que `activities` ya tiene su backend hecho. Construye sobre el [Bloque 1](2026-09-11-crm-en-el-panel-design.md) (personas, propiedades, operaciones). Estado: aprobado el 21/09/2026.

> **Regla de trabajo para quien implemente esto (humano o agente):** no hacer `git commit` ni `git push` de nada. Se deja todo en el working tree y Matías se encarga de commitear y pushear. Vale para el spec, el plan y cada tarea de implementación.

## 1. Objetivo

Que el staff tenga una agenda de tareas, llamadas y visitas —"qué hay que hacer"— vinculadas opcionalmente a una persona, una propiedad o una operación, con vencimiento y responsable, visible y gestionable desde una pantalla propia del panel. El backend de `activities` ya existe casi completo; falta cerrar un agujero de modelado (no hay vínculo a operación) y construir el panel.

## 2. Alcance

**Entra**
1. `deal_id` nuevo en `Activity`, para que una actividad pueda colgar de una operación además de (o en vez de) una persona o una propiedad.
2. Validación de existencia de las tres FKs opcionales (`person_id`, `property_id`, `deal_id`) al crear o editar — hoy no existe para ninguna de las dos que ya están.
3. Cobertura de tests completa del módulo `activities` — hoy no tiene ningún test, ni siquiera del CRUD que ya está en producción.
4. Pantalla `/admin/actividades`: filtros, alta, listado, marcar hecha, cancelar, borrar.
5. `SelectorOperacion`, componente de búsqueda de operaciones reutilizable (no existe hoy; `SelectorPersona` y `SelectorPropiedad` sí).
6. Migración `0010_activities_deal_id`.

**No entra**
- Bandeja de "próximos 30 días" en el Dashboard ni bloque embebido en las fichas de persona/propiedad/operación (se evaluó y se dejó para si hace falta; hoy la pantalla propia alcanza).
- `listing_id`: campo vestigial de `activities` que ningún módulo puebla (el de publicaciones no lo referencia). Queda en el modelo sin uso del panel.
- Recordatorios por email o notificaciones push de actividades vencidas — eso es el patrón ya resuelto en el Bloque 2c para alquileres; se replica a actividades cuando alguien lo pida.
- Repetición de tareas (recurrentes).
- Notas por entidad y auditoría: son 5b y 5c, specs aparte.

## 3. Decisiones

1. **`deal_id` con `ondelete=SET NULL`, no `CASCADE` como en `documentos`.** Una actividad tiene sentido propio aunque se borre la operación a la que estaba ligada ("llamar a Fernández" sigue siendo una tarea real); un documento sin su entidad dueña no significa nada. Mismo criterio que ya usan `person_id` y `property_id` en este modelo.
2. **Cualquier combinación de las tres FKs, no "exactamente una" como en `documentos`.** Una actividad puede no estar ligada a nada (tarea general, "renovar el seguro de la oficina"), a una sola entidad, o a varias a la vez (una visita liga persona *y* propiedad). No se valida cardinalidad, solo existencia de las que vengan cargadas.
3. **La validación de existencia reusa los `get_*_or_404` de cada módulo dueño**, mismo criterio que se usó en `documentos/service.py`: `people.service.get_person_or_404`, `modules.propiedades.service.obtener_propiedad`, `deals.service.get_deal_or_404`. Se agrega en `create_activity` y `update_activity`, antes de guardar.
4. **Se escribe la suite completa de `activities` ahora, no solo lo nuevo.** El módulo llegó al repo sin un solo test; tocarlo para sumar `deal_id` sin cubrir el resto deja la validación de `person_id`/`property_id` (que ya tenía el mismo agujero) sin verificar. Se cubre el CRUD, los cambios de estado y las tres validaciones en un único `test_activities.py` nuevo.
5. **`listing_id` no se toca ni se expone en el panel.** No hay ninguna referencia a él fuera de `activities/models.py` y `schemas.py`; sacarlo del modelo es un cambio no pedido y fuera de este bloque, pero tampoco se le da UI porque no hay nada del otro lado que lo llene.
6. **`SelectorOperacion` calca `SelectorPropiedad`, no `SelectorPersona`.** `deals` no tiene búsqueda por texto en el backend (igual que `propiedades`), así que se trae la lista completa una vez (`operacionesApi.listar({ limit: 500 })`) y se filtra client-side por título. Sin creación inline: a diferencia de una persona, crear una operación requiere pipeline/etapa/partes — no tiene sentido resolverlo desde un selector.
7. **Filas vencidas resaltadas con el mismo lenguaje visual que `BandejaRecordatorios`** (Badge rojo): una actividad `pendiente` con `due_at` pasado. No se define un estado nuevo en la base ("vencida") — se deriva en el frontend comparando contra la hora actual, igual que hace `BandejaRecordatorios` con los cobros.
8. **Sin filtro por defecto.** A diferencia de `documentos` (que siempre filtra por una entidad) o de un CRM con bandeja personal, acá la pantalla arranca mostrando todas las actividades de todos los agentes; el filtro por asignado queda como una opción más, no como estado inicial.

## 4. Backend

### 4.1 Modelo (`activities/models.py`, migración `0010_activities_deal_id`)

```python
class Activity(Base):
    __tablename__ = "activities"
    # ... columnas existentes sin cambios ...

    deal_id: int | None         # FK deals.id ondelete SET NULL, index

    deal: Mapped[object | None] = relationship("Deal", foreign_keys=[deal_id])
```

La migración agrega la columna y su índice (`op.add_column` + `op.create_index`); `downgrade` los quita. Sin backfill: `activities` está vacía en Supabase hoy (verificado el 21/09), así que no hay filas previas que requieran completarse.

### 4.2 Contrato de interfaz (`activities/schemas.py`)

Se agrega `deal_id: int | None = None` a `ActivityCreate` y `ActivityUpdate`, y a `ActivityOut`:

```python
class DealBrief(BaseModel):
    id: int
    title: str
    model_config = {"from_attributes": True}

class ActivityOut(BaseModel):
    # ... campos existentes ...
    deal: DealBrief | None
```

Y como filtro de listado en `list_activities` / `GET /activities?deal_id=`.

### 4.3 Reglas de negocio (`activities/service.py`)

**`create_activity`** y **`update_activity`** validan, antes de guardar, cada una de `person_id`, `property_id`, `deal_id` que venga no-`None` en el payload, reusando:

```python
from app.modules.propiedades.service import obtener_propiedad
from app.platform.deals.service import get_deal_or_404
from app.platform.people.service import get_person_or_404
```

Si alguna no existe (o está soft-deleted en los módulos que lo tienen), la excepción 404 de ese módulo se propaga tal cual — mismo patrón que `documentos.service.resolver_entidad`, sin redefinir mensajes acá.

`list_activities` suma el filtro `deal_id: int | None = None` → `q.filter(Activity.deal_id == deal_id)`.

### 4.4 Endpoints (`activities/router.py`)

Sin cambios de forma: se agrega `deal_id` como `Query` opcional en `GET /activities` y llega dentro del body de `POST`/`PATCH` vía los schemas ya extendidos. Rutas existentes sin tocar:

| Método | Ruta | Rol |
|---|---|---|
| `GET` | `/api/v1/activities` | cualquier usuario logueado (`get_current_user`, sin `require_role`) |
| `GET` | `/api/v1/activities/{id}` | cualquier usuario logueado |
| `POST` | `/api/v1/activities` | staff/admin |
| `PATCH` | `/api/v1/activities/{id}` | staff/admin |
| `DELETE` | `/api/v1/activities/{id}` | staff/admin |
| `PATCH` | `/api/v1/activities/{id}/done` | staff/admin |
| `PATCH` | `/api/v1/activities/{id}/cancel` | staff/admin |

### 4.5 Errores

| Caso | Código y mensaje |
|---|---|
| `person_id`/`property_id`/`deal_id` no existen | 404, mensaje del módulo dueño ("Persona no encontrada" / "Propiedad no encontrada" / "Deal no encontrado") |
| Editar una actividad `hecha` | 409 "No se puede editar una actividad ya completada" (ya existe) |
| Marcar hecha una ya hecha | 409 "La actividad ya está completada" (ya existe) |
| Cancelar una que no está `pendiente` | 409 "Solo se pueden cancelar actividades pendientes" (ya existe) |
| Actividad inexistente | 404 "Actividad no encontrada" (ya existe) |
| Anónimo en escritura | 401/403 vía `require_role` |

## 5. Frontend

### 5.1 Tipos y API

- `types/actividad.ts`: `TipoActividad` (`'llamada' | 'visita' | 'tarea' | 'whatsapp' | 'email' | 'otro'`), `EstadoActividad` (`'pendiente' | 'hecha' | 'cancelada'`), `ETIQUETAS_TIPO_ACTIVIDAD`, `Actividad` (respuesta), `ActividadCreatePayload`, `ActividadUpdatePayload`.
- `api/actividades.ts`:
  - `listar(params): Promise<{ total, items }>` — `person_id`, `property_id`, `deal_id`, `assigned_to_user_id`, `status`, `type`, `skip`, `limit`, vía `construirQuery`.
  - `crear(data: ActividadCreatePayload): Promise<Actividad>`.
  - `marcarHecha(id): Promise<Actividad>`, `cancelar(id): Promise<Actividad>`, `eliminar(id): Promise<void>`.

### 5.2 `SelectorOperacion` (`components/crm/SelectorOperacion/`)

Mismo contrato que `SelectorPropiedad`: `{ valor: { id, title } | null, onChange, label?, bloqueada? }`. Trae `operacionesApi.listar({ limit: 500 })` una vez (sin filtro de `is_closed`: una tarea puede ligarse a una operación ya cerrada), filtra client-side por `title` o por id.

### 5.3 Página (`pages/admin/actividades/Lista.tsx`)

```text
┌─ Actividades ──────────────────────────────────────────────────────┐
│ Estado[▾] Tipo[▾] Asignado[▾] Persona[Selector] Propiedad[Selector] │
│ Operación[Selector]                                                 │
│ ───────────────────────────────────────────────────────────────────│
│ ▸ Nueva actividad                                                   │
│   Título[____] Tipo[▾] Vencimiento[fecha] Asignado[▾]                │
│   Persona[Selector] Propiedad[Selector] Operación[Selector] [Crear] │
│ ───────────────────────────────────────────────────────────────────│
│ Vence      Tipo    Título              Vinculada a   Asignado Estado│
│ 22/09 10hs Visita  Mostrar depto Rivad. Fam. Gómez    Ana P.  ●     │  ← vencida, Badge rojo
│                                          [Hecha][Cancelar][Borrar]  │
│ (vacío → "No hay actividades")                                      │
└───────────────────────────────────────────────────────────────────┘
```

- Filtros como controlados independientes; cada cambio dispara `actividadesApi.listar` (patrón ya usado en `personas/Lista.tsx`).
- Formulario de alta plegable (`<details>` o toggle, como en `reservas`), no obliga a cargar persona/propiedad/operación — las tres son opcionales.
- Tabla ordenada por vencimiento ascendente (así responde el backend). Columna "Vinculada a" muestra hasta tres chips con link a la ficha de persona/propiedad/operación que estén cargadas; ninguna cargada → "—".
- Fila `pendiente` con `due_at` pasado: `Badge` rojo "Vencida" al lado del estado.
- Acciones por fila: **Hecha** (`marcarHecha`, saca la fila de "pendiente" y la re-renderiza con el badge de estado), **Cancelar** (con `window.confirm`), **Borrar** (con `window.confirm`). Actividad `hecha` o `cancelada`: sin botones de Hecha/Cancelar, solo Borrar.
- Estados: "Cargando…", lista vacía, error con "Reintentar" — mismo patrón que el resto de las listas del panel.

### 5.4 Navegación

`AdminLayout.tsx`: ítem `{ to: '/admin/actividades', label: 'Actividades' }` en el grupo de CRM, junto a Personas/Reservas/Operaciones.

## 6. Tests

Backend (`src/tests/test_activities.py`, nuevo — cubre lo existente y lo nuevo):
- CRUD: crear (con y sin cada FK opcional), obtener, editar, borrar, 404 de actividad inexistente.
- Validación de existencia: `person_id`/`property_id`/`deal_id` inexistente → 404 con el mensaje de ese módulo, en `create` y en `update`.
- Cambios de estado: marcar hecha (y que una segunda vez da 409), cancelar (y que una ya hecha da 409 al cancelar), editar una `hecha` da 409.
- Listado: filtros por `person_id`, `property_id`, `deal_id`, `assigned_to_user_id`, `status`, `type`, combinados; orden por `due_at` ascendente con nulls al final.
- Permisos: anónimo 401 en lectura y en escritura (lectura exige sesión pero no rol de staff; escritura exige `staff`/`admin`) — se verifica el comportamiento actual, no se cambia.

Frontend (`client/src/`):
- `api/actividades.test.ts`: cada método pega a la URL/verbo esperado con los params correctos.
- `SelectorOperacion.test.tsx`: sin texto no busca; filtra por título; elegir invoca `onChange`; `bloqueada` oculta "Quitar".
- `pages/admin/actividades/Lista.test.tsx`: vacío, filtros disparan refetch, alta agrega fila, marcar hecha/cancelar/borrar actualizan la lista sin recargar, fila vencida muestra el badge, error de carga muestra "Reintentar".

## 7. Despliegue

Migración `0010_activities_deal_id` (una columna + índice, sin backfill). Se aplica con `alembic upgrade head` contra Supabase. Sin variables nuevas. Nota corta en `docs/despliegue.md`, mismo formato que la de `0009_documentos`.

## 8. Después, si aparece la demanda

Bandeja de actividades en el Dashboard (mismo patrón que `BandejaRecordatorios`) y bloque embebido en las fichas de persona/propiedad/operación; recordatorio por email de actividades vencidas; tareas recurrentes; vista "Mis tareas" con el usuario logueado precargado como filtro; quitar `listing_id` del modelo si se confirma que no lo usa nadie.
