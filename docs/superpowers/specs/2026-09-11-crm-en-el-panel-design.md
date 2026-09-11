# CRM en el panel — Diseño

**Bloque 1** del [mapa de funcionalidades](2026-09-11-mapa-de-funcionalidades.md). Estado: aprobado.

## 1. Objetivo

Que el staff pueda, desde el panel de administración, cargar personas (dueños, compradores, inquilinos, interesados), vincularlas a las propiedades, tomar reservas y seguir cada operación de venta o alquiler por etapas — y que el estado de cada propiedad refleje eso solo, sin que nadie tenga que acordarse de cambiarlo.

El backend de `people`, `reservations` y `deals` ya existe y **no se rediseña**: se le agregan las reglas que faltan y se le pone pantalla.

## 2. Alcance

**Entra**
1. Personas: lista con búsqueda y filtros, formulario, ficha con vínculos; contactos; etiquetas libres; roles derivados.
2. Propietario en la propiedad (formulario y lista).
3. Reservas: lista, alta desde la propiedad, cancelar / vencer / convertir.
4. Operaciones: tablero por etapas para los pipelines Venta y Alquiler, ficha con partes, alta.
5. Sincronización del estado de la propiedad con reservas y deals.
6. Configuración de la inmobiliaria (una fila) y su pantalla.
7. Infraestructura: CRM montado bajo `/api/v1`; claves foráneas que faltaban; pipelines base.

**No entra** (queda para bloques siguientes)
- Pantalla propia de actividades ("Mis tareas", agenda). En este bloque solo se listan dentro de la ficha de persona y de deal.
- Edición de pipelines y etapas desde la UI (la API ya existe).
- Notas, auditoría, documentos adjuntos, comisiones, contratos de alquiler.
- Drag & drop en el tablero.

## 3. Decisiones

| Decisión | Elegido | Alternativas descartadas |
|---|---|---|
| Rol de la persona | Derivado de sus relaciones + etiquetas libres | Campo `tipo` fijo (miente apenas cambia el rol; no admite dos roles) |
| Estado de la propiedad | Columna guardada; los servicios de reservas y deals la actualizan | Estado derivado (rompe `baja` y las cerradas cargadas a mano); módulo `operaciones` nuevo (rehace lo que existe antes de usarlo) |
| Pipelines | Dos: Venta y Alquiler, sembrados por migración | Uno genérico ("Oferta" no significa nada en un alquiler) |
| Mover de etapa | Selector en la tarjeta | Drag & drop (más trabajo, no anda en el celular, no habilita nada nuevo) |
| Rutas del CRM | Bajo `/api/v1` como el catálogo | Agregar reglas al proxy de Vercel por cada módulo |

## 4. Backend

### 4.1 Montaje bajo `/api/v1`

En `main.py`, `people`, `activities`, `reservations`, `deals`, `notes` y `audit-log` pasan de la raíz a `prefix="/api/v1"`. `/auth` se queda en la raíz (ya está proxiado y el frontend lo usa). Sin este cambio el CRM da 404 en producción: `client/vercel.json` solo reenvía `/api/*` y `/auth/*`.

Los tests existentes de esos módulos se actualizan a las rutas nuevas.

### 4.2 Migración `0004` — claves foráneas, etiquetas, inmobiliaria, pipelines base

Las columnas de referencia "lógica" nacieron sin FK por una limitación de MySQL (signed/unsigned) que en PostgreSQL no existe. Se formalizan:

| Columna | Referencia | ON DELETE |
|---|---|---|
| `propiedades.propietario_persona_id` | `people.id` | SET NULL |
| `reservations.property_id` | `propiedades.id` | RESTRICT |
| `deals.property_id` | `propiedades.id` | RESTRICT |
| `activities.property_id` | `propiedades.id` | SET NULL |

RESTRICT en reservas y deals: una propiedad con operaciones encima no se borra; se da de `baja`. La misma migración agrega `deals.stage_changed_at` (ver 4.5), inicializado con `updated_at` en las filas existentes. `Propiedad` gana las relaciones `propietario`, `reservas` y `deals` para poder cargarlas sin queries a mano.

Tabla nueva `people_tags`: `id`, `person_id` (FK CASCADE), `nombre` (String 60), único `(person_id, nombre)`. El nombre se guarda como se escribió, recortado; la unicidad y el filtro comparan sin distinguir mayúsculas.

Tabla nueva `inmobiliaria`: `id`, `nombre`, `logo_url` (nullable), `telefono`, `email`, `cuit`, `direccion`, `honorarios_venta_pct` (Numeric 5,2), `honorarios_alquiler_pct` (Numeric 5,2), `actualizado_en`. La migración inserta la fila `id=1` con nombre "Mambo Groups" y el resto vacío; el servicio siempre lee y escribe esa fila. Es el único lugar donde el nombre de la inmobiliaria aparece en el backend.

Pipelines base, insertados solo si la tabla `pipelines` está vacía:

- **Venta**: Consulta (1) → Visita (2) → Oferta (3) → Ganada (4, `is_won`) → Perdida (5, `is_lost`)
- **Alquiler**: Consulta (1) → Visita (2) → Reserva (3) → Contrato firmado (4, `is_won`) → Perdida (5, `is_lost`)

`remove_stage` rechaza con 409 borrar una etapa `is_won` o `is_lost`, y borrar una etapa con deals abiertos.

### 4.3 Personas: etiquetas, roles, vínculos

**Etiquetas**
- `PUT /api/v1/people/{id}/tags` con `{"tags": ["inversor", "zona norte"]}` reemplaza el conjunto entero. Devuelve la persona.
- `GET /api/v1/people/tags` devuelve las etiquetas distintas en uso, con su cantidad, ordenadas por uso. Sirve para autocompletar.
- `GET /api/v1/people?tag=inversor` filtra.
- `PersonOut` y `PersonListOut` incluyen `tags: list[str]`.

**Roles derivados** — `PersonOut` y `PersonListOut` incluyen:

```json
"roles": {"propietario": 2, "comprador": 0, "vendedor": 1, "inquilino": 0, "interesado": 1}
```

| Rol | Se cuenta cuando la persona… |
|---|---|
| `propietario` | figura en `propiedades.propietario_persona_id` (propiedades no eliminadas) |
| `comprador` | es parte con rol `comprador` en un deal ganado del pipeline Venta |
| `vendedor` | es parte con rol `vendedor` en un deal ganado del pipeline Venta |
| `inquilino` | es parte con rol `inquilino` en un deal ganado del pipeline Alquiler |
| `interesado` | es parte con cualquier rol en un deal abierto, o tiene una reserva activa |

`GET /api/v1/people?rol=propietario` filtra por rol con cantidad > 0. Los roles del listado se calculan con una consulta agregada por página, no una por persona.

`PartyRole` suma `inquilino` y `garante`. Queda: comprador, vendedor, inquilino, propietario, garante, interesado, otro.

**Vínculos** — `GET /api/v1/people/{id}/vinculos`:

```json
{
  "propiedades": [{"id", "titulo", "tipo_operacion", "estado_comercial", "foto_principal"}],
  "reservas":    [{"id", "status", "amount", "currency", "expires_at", "propiedad": {"id", "titulo"}}],
  "deals":       [{"id", "title", "pipeline", "stage", "is_won", "is_lost", "amount", "currency", "role", "propiedad": {"id", "titulo"} | null}],
  "actividades": [{"id", "activity_type", "status", "title", "due_at"}]
}
```

Ordenados por fecha de creación descendente. Las actividades solo las pendientes. Una sola llamada carga la ficha.

### 4.4 Propietario en la propiedad

`PropiedadResponse` y el ítem de listado suman `propietario: {"id", "full_name"} | null`. Crear o editar con un `propietario_persona_id` inexistente responde 404 con "La persona {id} no existe". El listado del panel puede filtrar por `propietario_persona_id`.

### 4.5 Sincronización del estado de la propiedad

Una función en `modules/propiedades/service.py`:

```python
def aplicar_evento_de_operacion(db, propiedad_id, evento) -> Propiedad
```

con `evento` en `reserva_creada | reserva_liberada | deal_ganado | deal_perdido | deal_reabierto`. No hace commit: corre dentro de la transacción del servicio que la llama, para que reserva y propiedad cambien juntas o no cambie nada.

| Evento | Quién lo dispara | Estado antes | Estado después |
|---|---|---|---|
| `reserva_creada` | `create_reservation` | `disponible`, o `reservada` sin reserva activa (reserva "de palabra" cargada a mano) | `reservada` |
| `reserva_creada` | `create_reservation` | `cerrada` o `baja` | **409**: "La propiedad no está disponible (estado: …)" |
| `reserva_liberada` | `change_status` a `cancelada` o `vencida` | `reservada` | `disponible` |
| `reserva_liberada` | ídem | otro | sin cambio |
| `deal_ganado` | `move_stage` a etapa `is_won` (deal con propiedad) | cualquiera salvo `baja` | `cerrada`; la reserva activa de esa propiedad pasa a `convertida` |
| `deal_ganado` | ídem | `baja` | **409**: "La propiedad está dada de baja" |
| `deal_perdido` | `move_stage` a etapa `is_lost` | `reservada` con reserva activa | reserva → `cancelada`, propiedad → `disponible` |
| `deal_perdido` | ídem | otro | sin cambio |
| `deal_reabierto` | `move_stage` desde `is_won`/`is_lost` a etapa abierta | `cerrada` | `disponible` |

Convertir una reserva (`change_status` a `convertida`) no toca la propiedad: queda `reservada` hasta que el deal la gane. Un deal sin `property_id` no dispara nada.

**Guarda del cambio manual**: `PUT /api/v1/propiedades/{id}` con `estado_comercial=disponible` responde 409 si la propiedad tiene una reserva activa o un deal ganado no eliminado, indicando cuál (`"La propiedad tiene la reserva 12 activa"`). Cualquier otro cambio manual sigue permitido: `baja`, `cerrada` (venta por afuera), `reservada` (reserva de palabra).

`ReservationOut` y `DealOut` suman `propiedad: {"id", "titulo", "estado_comercial"} | null` para que las pantallas no pidan cada propiedad aparte. `DealOut` suma `parties` embebidas y `dias_en_etapa` (desde el último cambio de etapa; se agrega `stage_changed_at` al modelo, que se setea al crear y al mover).

### 4.6 Configuración de la inmobiliaria

Módulo nuevo `platform/inmobiliaria/` con el patrón de cuatro archivos. `GET /api/v1/inmobiliaria` (cualquier usuario autenticado) y `PUT /api/v1/inmobiliaria` (solo `admin`). El logo se sube con `POST /api/v1/inmobiliaria/logo` reutilizando `app.storage` como las fotos, sin variantes.

## 5. Frontend

Estructura como la existente: `pages/admin/<módulo>/`, `api/<módulo>.ts`, `types/<módulo>.ts`. El menú del panel suma **Personas**, **Reservas**, **Operaciones** y **Configuración**.

### 5.1 Personas

- **Lista** `/admin/personas` — tabla: nombre, contacto principal, chips de rol (solo los > 0, con la cantidad), etiquetas. Buscador (`search`), filtro por rol y por etiqueta. Botón "Nueva persona". Paginada.
- **Formulario** `/admin/personas/nueva` y `/:id/editar` — nombre, apellido, tipo y número de documento, notas; contactos como lista editable (tipo, valor, principal); etiquetas con autocompletado desde `/people/tags` y creación libre.
- **Ficha** `/admin/personas/:id` — cabecera con nombre, contactos (el teléfono linkea a `tel:` y a WhatsApp), chips y etiquetas, botón editar. Debajo, en dos columnas en escritorio y apiladas en móvil: Propiedades (como dueño), Reservas, Operaciones (con el rol de la persona), Actividades pendientes. Cada ítem linkea. Un bloque vacío dice "Sin propiedades" en vez de desaparecer, para que la ficha siempre tenga la misma forma.

### 5.2 `SelectorPersona`

Componente reutilizable: input con búsqueda mientras se tipea (debounce 250 ms contra `/people?search=`), resultados con nombre y contacto principal, y al final "Crear a «lo tipeado»" que despliega un mini-formulario inline (nombre, apellido, teléfono) y crea la persona sin salir de la pantalla. Emite la persona elegida `{id, full_name}`. Se usa en el formulario de propiedad, en el alta de reserva y en las partes de un deal.

### 5.3 Propietario en la propiedad

El formulario de propiedad suma el campo "Propietario" con `SelectorPersona` (opcional, con botón para quitar). La lista de propiedades del panel muestra una columna "Propietario" que linkea a la ficha.

### 5.4 Reservas

- **Lista** `/admin/reservas` — filtro por estado (por defecto `activa`); columnas propiedad, persona, monto, vence, estado. Vencidas o que vencen en menos de 3 días con el tono "espera" de la paleta. Botón "Nueva reserva".
- **Alta** — modal o página `/admin/reservas/nueva?propiedad=ID`: propiedad (preseleccionada si viene de la ficha; si no, buscador de propiedades disponibles), persona (`SelectorPersona`), monto y moneda de la seña, vencimiento, notas. El 409 del backend ("ya tiene una reserva activa" / "no está disponible") se muestra tal cual.
- **Acciones** en la fila: Cancelar, Marcar vencida, Convertir. Convertir llama a `/convert` y abre el alta de deal ya cargado con propiedad, persona (rol `comprador` o `inquilino` según el `tipo_operacion` de la propiedad) y pipeline correspondiente, en la etapa Oferta (Venta) o Reserva (Alquiler).
- En la lista de propiedades del panel, cada fila `disponible` tiene un botón "Reservar".

### 5.5 Operaciones

- **Tablero** `/admin/operaciones` — selector Venta / Alquiler (recordado en `localStorage`). Columnas por etapa abierta con tarjetas: título, propiedad, monto, partes (nombres), días en la etapa. Cada tarjeta tiene un selector de etapa; cambiarlo llama a `/deals/{id}/stage` y la tarjeta se mueve. Ganada y Perdida se muestran como columnas colapsadas con el conteo; al expandirlas se ven las últimas 20. En móvil las columnas se apilan con scroll horizontal, como una fila de tarjetas por etapa.
- **Ficha** `/admin/operaciones/:id` — título, pipeline y etapa (editable), propiedad (link), monto y moneda, asignado a, notas, partes (persona + rol, agregar con `SelectorPersona` + rol, quitar), actividades pendientes.
- **Alta** `/admin/operaciones/nueva` — pipeline, propiedad (buscador; opcional), título (se autocompleta con el de la propiedad), monto y moneda (se autocompletan con el precio), asignado a, partes iniciales. Acepta query params para venir precargada desde una reserva convertida.
- Un 409 al mover de etapa (propiedad dada de baja) se muestra sin mover la tarjeta.

### 5.6 Dashboard y configuración

- Dashboard: tiles "Reservas activas", "Operaciones abiertas", "Vencen esta semana" (reservas), además de los existentes.
- `/admin/configuracion` — formulario de la inmobiliaria: nombre, logo (subida), teléfono, email, CUIT, dirección, honorarios de venta y alquiler en %. Solo visible para `admin`.

## 6. Manejo de errores

- El backend responde `409` en toda violación de regla de negocio (propiedad no disponible, reserva activa duplicada, cambio manual bloqueado, borrar etapa ganada) con `detail` en castellano que nombra la entidad implicada. El frontend muestra ese `detail` tal cual en un aviso junto al formulario o acción; no lo traduce ni lo tapa.
- `404` en referencias a personas o propiedades inexistentes.
- Una transacción que toca reserva + propiedad, o deal + reserva + propiedad, se confirma entera o se revierte entera: los servicios llaman `aplicar_evento_de_operacion` antes del único `commit`.
- `SelectorPersona`: si la búsqueda falla, muestra "No se pudo buscar" y deja crear igual.
- El tablero recarga la columna afectada tras un error al mover, para no quedar con una tarjeta en un estado que el backend rechazó.

## 7. Tests

**Backend** (pytest + SQLite en memoria, fixtures existentes `db`, `client`, `crear_usuario`, `iniciar_sesion`):
- Rutas: cada módulo del CRM responde bajo `/api/v1/...` y ya no en la raíz.
- Etiquetas: reemplazo total, unicidad sin distinguir mayúsculas, filtro por etiqueta, listado con conteo.
- Roles derivados: cada fila de la tabla de 4.3 con un caso; una persona con dos roles; filtro `?rol=`.
- `vinculos`: devuelve las cuatro listas con la forma acordada; actividades solo pendientes.
- Estado de la propiedad: cada fila de la tabla de 4.5 con un caso, incluidas las que no cambian nada y los 409. Reserva sobre propiedad `reservada` → 409 y no se crea la fila (atomicidad). Deal ganado convierte la reserva activa. Deal sin propiedad no toca nada.
- Guarda manual: `PUT` a `disponible` con reserva activa → 409; sin reserva → 200.
- Pipelines base: existen tras la migración (se replica el seed en una fixture); no se borra la etapa ganada.
- Inmobiliaria: `GET` autenticado, `PUT` solo admin (staff → 403).
- `alembic check` limpio tras los cambios de modelo.

**Frontend** (vitest + Testing Library, `--pool=threads`):
- `SelectorPersona`: busca con debounce, muestra resultados, crea inline y emite la persona.
- Lista de personas: chips de rol solo cuando > 0; filtros arman la query correcta.
- Ficha de persona: renderiza los cuatro bloques, incluidos los vacíos.
- Tablero: agrupa por etapa, cambiar el selector llama a `/stage`, un 409 deja la tarjeta donde estaba.
- Alta de reserva: preselección por query param; muestra el `detail` del 409.
- Convertir reserva: navega al alta de deal con los params correctos según `tipo_operacion`.

## 8. Verificación antes de dar por terminado

```bash
cd src && python -m pytest tests/ -q && ruff check . && alembic check
cd client && npm test && npx tsc --noEmit
```

Más una pasada manual en el navegador: crear persona → cargarla como dueña de una propiedad → reservar esa propiedad (queda `reservada`) → convertir → ganar el deal (queda `cerrada`, la reserva `convertida`) → en la ficha de la persona aparecen los chips "Propietaria 1" y "Compradora 1".
