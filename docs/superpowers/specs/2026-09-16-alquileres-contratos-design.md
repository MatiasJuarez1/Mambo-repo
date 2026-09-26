# Administración de alquileres · 2a: Contratos y ajustes — Diseño

**Bloque 2a** del [mapa de funcionalidades](2026-09-11-mapa-de-funcionalidades.md). Estado: aprobado.

> **Regla de trabajo para quien implemente esto (humano o agente):** no hacer `git commit` ni `git push` de nada. Se deja todo en el working tree y Matías se encarga de commitear y pushear. Vale para el spec, el plan y cada tarea de implementación.

## 1. Objetivo

Que la inmobiliaria pueda cargar cada contrato de alquiler (partes, propiedad, plazo, monto, índice de ajuste, PDF firmado), ver cuándo toca cada ajuste y aplicarlo con un coeficiente, saber qué contratos vencen pronto y renovarlos — y que la propiedad quede `cerrada` mientras el contrato está vigente y vuelva a `disponible` cuando termina, sin que nadie tenga que acordarse.

Es la primera de tres partes del Bloque 2. Las otras dos se especifican después, sobre lo que se construye acá:

- **2b — Cobros, recibos y liquidaciones**: usa `dia_vencimiento`, `administrado`, `honorarios_pct` y el monto vigente de cada contrato.
- **2c — Recordatorios**: bandeja de "próximos 30 días" y email diario; usa los filtros `vence_en_dias` / `ajuste_en_dias` de la lista de contratos.

## 2. Alcance

**Entra**
1. Módulo `alquileres` en el backend: contratos, partes, calendario de ajustes. Migración `0005`.
2. Contrato creado desde un deal de Alquiler ganado **o** a mano (para los alquileres que ya existen y nunca pasaron por el pipeline).
3. Calendario de ajustes materializado al crear el contrato; aplicar u omitir cada ajuste con un coeficiente o porcentaje cargado a mano.
4. Finalizar, rescindir y renovar; la renovación crea un contrato nuevo enlazado al anterior.
5. PDF del contrato como archivo único en R2 (una columna), reusando `app.storage`.
6. Sincronización del estado de la propiedad con el ciclo de vida del contrato, en ambos sentidos.
7. Roles derivados de persona: `inquilino` también desde contratos vigentes; rol nuevo `garante`.
8. Panel: lista, alta, ficha, línea de tiempo de ajustes; enganches en deal, propiedad y persona; dos tiles en el dashboard.

**No entra**
- Cobros, pagos, punitorios, recibos, liquidaciones al propietario (2b).
- Bandeja de recordatorios y emails (2c). Acá solo hay dos contadores en el dashboard.
- Tabla de valores de índices o importación automática del BCRA. El coeficiente se carga a mano.
- Documentos genéricos (Bloque 3). El PDF del contrato es una columna; cuando llegue el Bloque 3 se migra a la tabla polimórfica.
- Portal de inquilino/propietario, Mercado Pago, facturación, WhatsApp.

## 3. Decisiones

1. **Origen doble.** El contrato puede referenciar un deal ganado del pipeline Alquiler (`deal_id` opcional) o nacer solo. Ganar el deal no crea el contrato: ofrece el botón "Crear contrato" con todo precargado.
2. **Calendario materializado.** Las fechas de ajuste se guardan como filas `pendiente` al crear el contrato (no se calculan al vuelo). Así "ajustes en los próximos 30 días" es una consulta SQL, cada fecha es editable y queda historial. El costo es regenerar las pendientes cuando cambian frecuencia, índice o fecha de fin.
3. **Coeficiente a mano.** El sistema no conoce el valor de ICL/IPC/UVA/Casa Propia. El staff carga el coeficiente (o el %) y el sistema calcula y registra el nuevo monto. Cubre además `porcentaje_fijo` y `sin_ajuste`.
4. **El monto vigente no se guarda.** Es el `monto_nuevo` del último ajuste aplicado o, si no hay, `monto_inicial`. Se expone calculado como `monto_vigente`.
5. **El contrato mueve la propiedad.** Contrato vigente → `cerrada`. Finalizado o rescindido sin otro vigente → `disponible`. Renovar no la toca. Extiende `EventoOperacion` con `contrato_activado` y `contrato_terminado`; coherente con lo que ya hacen reservas y deals.
6. **`administrado` y `honorarios_pct` se guardan sin comportamiento.** Son el enganche del 2b; el formulario los pide ya para no tener que volver a editar cada contrato.
7. **PDF único por contrato**, en `pdf_url`, subido por un endpoint propio que reusa `app.storage` (mismo esquema que el logo de la inmobiliaria: al reemplazar, se borra el anterior).

## 4. Backend

### 4.1 Módulo y montaje

`src/app/platform/alquileres/` con `models.py`, `schemas.py`, `service.py`, `router.py`. Router con `prefix="/alquileres"`, montado en `app/main.py` bajo `/api/v1` como el resto del CRM (el proxy de Vercel solo reenvía `/api/*` y `/auth/*`). Todos los endpoints con `SOLO_STAFF`.

Dependencia nueva en `pyproject.toml`: `python-dateutil` (para `relativedelta` al sumar meses).

### 4.2 Modelos (migración `0005_alquileres_contratos`)

**`alquileres_contratos`**

| Columna | Tipo | Notas |
|---|---|---|
| `id` | int PK | |
| `property_id` | FK `propiedades.id`, not null | |
| `deal_id` | FK `deals.id`, nullable, unique | Solo si nació del pipeline. Unique: un deal, a lo sumo un contrato. |
| `contrato_anterior_id` | FK `alquileres_contratos.id`, nullable | Lo llena la renovación. |
| `fecha_inicio`, `fecha_fin` | date, not null | `fecha_fin > fecha_inicio`. |
| `dia_vencimiento` | int, not null | 1–28. Día del mes en que vence el alquiler (lo usa el 2b). |
| `monto_inicial` | Numeric(14,2), not null | |
| `moneda` | String(3), not null, default `ARS` | `ARS` o `USD`, como `deals.currency`. |
| `indice` | enum `indice_ajuste` | `icl`, `ipc`, `uva`, `casa_propia`, `porcentaje_fijo`, `sin_ajuste`. |
| `frecuencia_meses` | int, nullable | Obligatoria salvo `sin_ajuste`; 1–24. |
| `porcentaje_fijo` | Numeric(6,2), nullable | Obligatorio si `indice = porcentaje_fijo`; en otro caso null. |
| `administrado` | bool, not null, default false | Sin comportamiento en 2a. |
| `honorarios_pct` | Numeric(5,2), nullable | Precargado desde `inmobiliaria.honorarios_alquiler_pct`. Sin comportamiento en 2a. |
| `estado` | enum `estado_contrato` | `vigente`, `finalizado`, `rescindido`. |
| `fecha_rescision`, `motivo_rescision` | date / Text, nullable | Solo con `rescindido`. |
| `pdf_url` | String(500), nullable | |
| `notas` | Text, nullable | |
| `created_by_user_id` | FK `users.id`, not null | |
| `created_at`, `updated_at` | datetime tz | |

Índices: `(property_id, estado)`, `(fecha_fin)`.

**`alquileres_contrato_partes`**

`id`, `contrato_id` (FK, cascade), `person_id` (FK `people.id`), `rol` enum `rol_parte_contrato` (`inquilino`, `propietario`, `garante`), `created_at`. Unique `(contrato_id, person_id, rol)`.

**`alquileres_ajustes`**

`id`, `contrato_id` (FK, cascade), `fecha_prevista` (date), `estado` enum `estado_ajuste` (`pendiente`, `aplicado`, `omitido`), `coeficiente` Numeric(10,6) nullable, `monto_anterior` y `monto_nuevo` Numeric(14,2) nullable, `aplicado_at` datetime nullable, `aplicado_por_user_id` FK `users.id` nullable, `notas` Text nullable. Índice `(contrato_id, fecha_prevista)`; índice `(estado, fecha_prevista)` para el filtro de "próximos ajustes".

Relaciones: `Contrato.propiedad`, `Contrato.deal`, `Contrato.partes`, `Contrato.ajustes` (ordenados por `fecha_prevista`), `Contrato.contrato_anterior`, `Contrato.renovacion` (backref uno a uno). `Propiedad.contratos` y `Deal.contrato`.

### 4.3 Reglas de negocio (`service.py`)

Todas las funciones reciben `Session` primero y hacen su propio commit, como en el resto del repo. Los cambios de propiedad van dentro de la misma transacción vía `aplicar_evento_de_operacion` (que no commitea).

**`crear_contrato(db, datos, user)`**
- Partes: al menos un `inquilino` y un `propietario`; `garante` 0..n; no repetir `(person_id, rol)`. Las personas deben existir.
- `fecha_fin > fecha_inicio`. `dia_vencimiento` 1–28.
- Coherencia del ajuste: `sin_ajuste` ⇒ `frecuencia_meses` y `porcentaje_fijo` null; `porcentaje_fijo` ⇒ ambos obligatorios; los demás índices ⇒ frecuencia obligatoria, porcentaje null. Todo esto es 422 (validador Pydantic).
- Si viene `deal_id`: el deal debe existir, ser del pipeline "Alquiler", estar `is_won`, no tener ya un contrato, y su `property_id` debe ser igual al del contrato. Si no, 409.
- La propiedad no puede tener otro contrato `vigente` (409) ni estar `baja` (409, lo levanta `aplicar_evento_de_operacion`).
- En la misma transacción: inserta contrato y partes, `generar_ajustes`, `aplicar_evento_de_operacion(db, property_id, contrato_activado)` → `cerrada`.

**`generar_ajustes(contrato) -> list[Ajuste]`** (pura, sin sesión)
- `sin_ajuste` → `[]`.
- Fechas `fecha_inicio + k·frecuencia_meses` (`relativedelta(months=...)`) para `k ≥ 1` mientras `fecha < fecha_fin`. Todas `pendiente`.

**`aplicar_ajuste(db, contrato_id, ajuste_id, datos, user)`**
- Contrato `vigente`, ajuste `pendiente`; si no, 409.
- No puede haber otro ajuste `pendiente` del mismo contrato con `fecha_prevista` anterior (409: "Hay un ajuste anterior sin resolver").
- `datos` trae **exactamente uno** de `coeficiente` o `porcentaje` (422 si vienen ambos o ninguno). `porcentaje` se convierte en `coeficiente = 1 + porcentaje/100`. Si el índice del contrato es `porcentaje_fijo`, el frontend precarga ese porcentaje, pero el backend acepta lo que venga.
- `monto_anterior = monto_vigente(contrato)`; `monto_nuevo = (monto_anterior × coeficiente)` redondeado a 2 decimales (`ROUND_HALF_UP`). Guarda coeficiente, montos, `aplicado_at`, `aplicado_por_user_id`, `notas`; estado `aplicado`.

**`omitir_ajuste(db, contrato_id, ajuste_id, datos, user)`** — mismas precondiciones de estado (contrato vigente, ajuste pendiente), sin la regla de orden. Estado `omitido`, guarda `notas`, `aplicado_at`, `aplicado_por_user_id`.

**`monto_vigente(contrato) -> Decimal`** — `monto_nuevo` del ajuste `aplicado` con mayor `fecha_prevista`, o `monto_inicial`.

**`actualizar_contrato(db, contrato_id, datos)`** (PATCH parcial)
- Editables siempre: `dia_vencimiento`, `administrado`, `honorarios_pct`, `notas`, `moneda`, partes (se reemplazan completas con las mismas validaciones del alta).
- Si cambia `fecha_fin`, `frecuencia_meses`, `indice` o `porcentaje_fijo`: se borran los ajustes `pendiente` y se regeneran desde la fecha del último ajuste resuelto (aplicado u omitido) — o desde `fecha_inicio` si no hay ninguno — hasta la nueva `fecha_fin`. Los resueltos no se tocan. Las validaciones de coherencia índice/frecuencia/porcentaje se aplican sobre el resultado final del merge.
- `monto_inicial`, `fecha_inicio` y `property_id`: editables solo si el contrato no tiene ningún ajuste `aplicado` (409 si lo tiene). Cambiar `fecha_inicio` también regenera pendientes. Cambiar `property_id` mueve el estado: `contrato_terminado` sobre la vieja, `contrato_activado` sobre la nueva (con las mismas guardas del alta).
- `deal_id` y `contrato_anterior_id` no se editan.
- Solo sobre contratos `vigente` (409 si no).

**`finalizar_contrato(db, contrato_id)`**
- Solo `vigente` y solo si `hoy >= fecha_fin` (409 si falta; para cortar antes está rescindir).
- Estado `finalizado`; ajustes `pendiente` → `omitido` con nota "Contrato finalizado"; `aplicar_evento_de_operacion(..., contrato_terminado)`.

**`rescindir_contrato(db, contrato_id, datos)`**
- Solo `vigente`. `datos`: `fecha_rescision` (entre `fecha_inicio` y `fecha_fin`, 422 si no) y `motivo` obligatorio.
- Estado `rescindido`; pendientes → `omitido` con nota "Contrato rescindido"; `contrato_terminado`.

**`renovar_contrato(db, contrato_id, datos, user)`**
- Sobre `vigente` o `finalizado` que **no tenga ya una renovación** (409).
- Construye el payload del nuevo con estos defaults, todos sobreescribibles por `datos`: misma propiedad y partes; `fecha_inicio = fecha_fin anterior + 1 día`; `fecha_fin` obligatoria en `datos`; `monto_inicial = monto_vigente(anterior)`; `moneda`, `indice`, `frecuencia_meses`, `porcentaje_fijo`, `dia_vencimiento`, `administrado`, `honorarios_pct` iguales al anterior; `deal_id` null; `contrato_anterior_id = anterior.id`.
- Si el anterior estaba `vigente`, pasa a `finalizado` con sus pendientes omitidos ("Renovado"). La propiedad **no** cambia: sigue `cerrada` (el nuevo la activa; como ya está `cerrada`, `contrato_activado` es idempotente).
- La validación "no puede haber otro contrato vigente sobre la propiedad" se evalúa después de finalizar el anterior, dentro de la misma transacción.

**`listar_contratos(db, filtros)`**
- Filtros: `estado` (default: sin filtro; el panel manda `vigente`), `property_id`, `person_id` (cualquier rol), `vence_en_dias` (vigentes con `fecha_fin` entre hoy y hoy + N), `ajuste_en_dias` (vigentes con algún ajuste `pendiente` con `fecha_prevista` entre hoy y hoy + N), `q` (ILIKE sobre título de la propiedad y nombre de las partes). Paginación `skip`/`limit` con `total` en la respuesta, como `people`.
- Cada fila trae `PropiedadBrief`, partes con nombre, `monto_vigente`, `proximo_ajuste` (fecha del primer pendiente o null).

### 4.4 Cambios en módulos existentes

**`modules/propiedades/service.py`**
- `EventoOperacion` suma `contrato_activado` (→ `cerrada`; 409 si `baja`; si estaba `reservada`, también pasa a `cerrada` — la reserva la resuelve el deal, no el contrato) y `contrato_terminado` (→ `disponible` solo si estaba `cerrada`; si estaba `baja` no la toca).
- `_verificar_liberacion_manual`: además de reserva activa y deal ganado, un contrato `vigente` bloquea poner `disponible` a mano (409: "La propiedad tiene un contrato de alquiler vigente").
- `GET /api/v1/propiedades/{id}` suma `contrato_vigente: {id, fecha_fin, monto_vigente, moneda} | null`.

**`platform/deals`**
- `GET /api/v1/deals/{id}/contrato` → el contrato asociado (respuesta completa) o 404.
- Reabrir un deal ganado que ya tiene contrato: 409 ("El deal tiene un contrato de alquiler; rescindilo primero"). Evita que `deal_reabierto` ponga `disponible` una propiedad con contrato vigente.

**`platform/people/service.py`**
- `ROLES` suma `garante`. `inquilino` cuenta deals ganados como hoy **más** contratos `vigente` donde la persona es `inquilino` (sin duplicar cuando el contrato nació del deal: se cuenta por `property_id` distinto). `propietario` sigue saliendo de `propiedades.propietario_persona_id` y suma contratos vigentes como `propietario` (misma deduplicación por propiedad). `garante` cuenta contratos vigentes.
- `vinculos` suma `contratos: [{id, rol, propiedad: PropiedadBrief, estado, fecha_fin, monto_vigente}]`.

### 4.5 Endpoints

| Método | Ruta | Cuerpo / query | Respuesta |
|---|---|---|---|
| `GET` | `/api/v1/alquileres/contratos` | filtros de 4.3 | `Paginado[ContratoEnLista]` |
| `POST` | `/api/v1/alquileres/contratos` | `ContratoCrear` | `ContratoDetalle` 201 |
| `GET` | `/api/v1/alquileres/contratos/{id}` | | `ContratoDetalle` |
| `PATCH` | `/api/v1/alquileres/contratos/{id}` | `ContratoActualizar` | `ContratoDetalle` |
| `POST` | `/api/v1/alquileres/contratos/{id}/finalizar` | — | `ContratoDetalle` |
| `POST` | `/api/v1/alquileres/contratos/{id}/rescindir` | `{fecha_rescision, motivo}` | `ContratoDetalle` |
| `POST` | `/api/v1/alquileres/contratos/{id}/renovar` | `ContratoRenovar` | `ContratoDetalle` del nuevo, 201 |
| `PUT` | `/api/v1/alquileres/contratos/{id}/pdf` | multipart `archivo`, solo `application/pdf`, ≤ 10 MB | `ContratoDetalle` |
| `DELETE` | `/api/v1/alquileres/contratos/{id}/pdf` | — | `ContratoDetalle` |
| `POST` | `/api/v1/alquileres/contratos/{id}/ajustes/{ajuste_id}/aplicar` | `{coeficiente}` ó `{porcentaje}`, `notas?` | `ContratoDetalle` |
| `POST` | `/api/v1/alquileres/contratos/{id}/ajustes/{ajuste_id}/omitir` | `{notas?}` | `ContratoDetalle` |
| `GET` | `/api/v1/deals/{id}/contrato` | | `ContratoDetalle` o 404 |

`ContratoDetalle` = todos los campos + `monto_vigente` + `propiedad: PropiedadBrief` + `partes: [{person_id, nombre, rol}]` + `ajustes: [Ajuste]` + `contrato_anterior: {id, fecha_inicio, fecha_fin} | null` + `renovacion: {id, fecha_inicio, fecha_fin} | null` + `deal: {id, title} | null` + `pdf_url`.

Las acciones de ajuste devuelven el contrato completo (no el ajuste solo) para que el panel refresque la línea de tiempo y el monto vigente con una sola respuesta.

## 5. Frontend

Patrón del Bloque 1: `client/src/types/alquileres.ts`, `client/src/api/alquileres.ts`, `client/src/pages/admin/alquileres/`, componentes nuevos bajo `client/src/components/crm/<Nombre>/`.

### 5.1 Navegación y dashboard
- Entrada "Alquileres" en el menú del panel.
- Dos tiles nuevos en el dashboard: "Contratos que vencen en 90 días" y "Ajustes en los próximos 30 días". Cada uno pide `GET /contratos?vence_en_dias=90` / `?ajuste_en_dias=30` con `limit=1` y muestra `total`; linkea a la lista con ese filtro.

### 5.2 Lista — `/admin/alquileres`
- Columnas: propiedad, inquilino(s), monto vigente + moneda, próximo ajuste, vence, estado. A 400px, tarjetas.
- Filtros: estado (default `vigente`, opción "Todos"), "Vencen en ≤ N días", "Ajuste en ≤ N días", búsqueda `q`. Los filtros viven en la query string para que los tiles puedan linkear.
- Botón "Nuevo contrato".

### 5.3 Alta — `/admin/alquileres/nuevo`
Formulario en un solo paso (`FormularioContrato`):
- **Propiedad**: `SelectorPropiedad` con búsqueda (se reusa si ya existe algo equivalente en el panel; si no, se crea siguiendo `SelectorPersona`). Precargada y bloqueada si viene `?deal_id`; precargada si viene `?property_id`.
- **Partes**: `SelectorPersona` para inquilino y propietario (obligatorios; permite más de uno), botón "Agregar garante". Con `?deal_id` se precargan desde las partes del deal (roles `inquilino`, `propietario`, `garante`); si la propiedad tiene `propietario_persona_id` y no hay propietario cargado, se precarga.
- **Plazo**: `fecha_inicio`, `fecha_fin`, `dia_vencimiento` (default 10).
- **Monto**: `monto_inicial`, `moneda` (default: la del deal si hay, si no `ARS`). Con `?deal_id`, `monto_inicial` se precarga con `deal.amount`.
- **Ajuste**: `indice`; `frecuencia_meses` se oculta con `sin_ajuste`; `porcentaje_fijo` aparece solo con ese índice.
- **Administración**: `administrado` (switch) y `honorarios_pct` (precargado desde `GET /inmobiliaria`).
- `notas`.
- **Vista previa del calendario**: lista de fechas de ajuste calculada en el cliente con la misma regla que el backend (`inicio + k·frecuencia < fin`). Se actualiza al cambiar cualquiera de los tres campos.
- Guardar → `POST /contratos` → redirige a la ficha. Los 409 se muestran arriba del formulario con el `detail` del backend.

### 5.4 Ficha — `/admin/alquileres/:id`
- **Cabecera**: propiedad (link), estado (chip), monto vigente, vence el …, "Deal #n" si lo hay. Acciones según estado:
  - `vigente`: Editar, Subir/Reemplazar PDF, Rescindir (modal con fecha y motivo), Finalizar (solo habilitado si `hoy >= fecha_fin`), Renovar.
  - `finalizado`: Renovar (si no tiene renovación), ver PDF.
  - `rescindido`: solo lectura, ver PDF, motivo visible.
- **Partes**: `ChipsRol` por rol, cada persona linkea a su ficha.
- **Línea de tiempo de ajustes** (`TablaAjustes`): una fila por ajuste con fecha, estado, monto anterior → nuevo, coeficiente, notas. Las `pendiente` del contrato vigente muestran "Aplicar" (solo la más antigua pendiente lo tiene habilitado; las siguientes muestran el tooltip "Resolvé primero el ajuste anterior") y "Omitir".
- **`ModalAplicarAjuste`**: toggle "Coeficiente / Porcentaje"; con `porcentaje_fijo` viene precargado el % del contrato. Muestra "Monto actual → Monto nuevo" calculado en vivo antes de confirmar. Envía exactamente uno de los dos campos.
- **Renovaciones**: "Renueva a #anterior" / "Renovado por #siguiente" con links. "Renovar" abre `FormularioContrato` en modo renovación (`/admin/alquileres/:id/renovar`), precargado con los defaults de 4.3 y con `fecha_fin` vacía y obligatoria.
- **Editar** (`/admin/alquileres/:id/editar`): el mismo `FormularioContrato` en modo edición; los campos bloqueados por tener ajustes aplicados se muestran deshabilitados con un aviso. Si cambian `fecha_fin`/`frecuencia`/`indice`, un aviso explica que los ajustes pendientes se regeneran.

### 5.5 Enganches en pantallas existentes
- **Ficha del deal**: si es del pipeline Alquiler y está ganado, botón "Crear contrato" (→ `/admin/alquileres/nuevo?deal_id=`) o "Ver contrato" según `GET /deals/{id}/contrato`.
- **Ficha de propiedad**: bloque "Contrato de alquiler" con monto vigente, vence, link a la ficha; si no hay, botón "Cargar contrato" (→ `/admin/alquileres/nuevo?property_id=`). Si la propiedad está `cerrada` por contrato, el select de estado manual muestra el 409 del backend tal como hoy con reservas.
- **Ficha de persona**: `BloqueVinculos` suma la sección "Contratos" (rol, propiedad, estado, vence, monto vigente); `ChipsRol` muestra `garante`.

## 6. Manejo de errores

- 404: contrato, ajuste, deal o propiedad inexistentes.
- 409: toda regla de estado — propiedad con contrato vigente o `baja`; deal no ganado / de otro pipeline / con contrato / con propiedad distinta; ajuste anterior pendiente; contrato no vigente para editar, aplicar u omitir; editar monto/inicio/propiedad con ajustes aplicados; finalizar antes de `fecha_fin`; renovar un contrato ya renovado; poner `disponible` a mano con contrato vigente; reabrir un deal con contrato.
- 422: validaciones de forma (fechas invertidas, coherencia índice/frecuencia/porcentaje, `dia_vencimiento` fuera de 1–28, coeficiente y porcentaje juntos o ninguno, PDF que no es PDF o > 10 MB, partes sin inquilino o propietario).
- Mensajes en castellano; el panel muestra el `detail` del backend en un aviso arriba del formulario o en el modal, como hace hoy con reservas.

## 7. Tests

### Backend (`src/tests/`, SQLite en memoria, fixtures de `conftest.py` y `helpers_crm.py`)
- `test_alquileres_contratos.py`: alta válida (propiedad → `cerrada`, ajustes generados, partes guardadas); sin inquilino / sin propietario / persona repetida (422); fechas invertidas (422); índice incoherente (422); propiedad `baja` (409); segundo contrato vigente sobre la misma propiedad (409); `deal_id` de pipeline Venta, no ganado, con propiedad distinta o ya con contrato (409); `deal_id` válido precarga OK y `GET /deals/{id}/contrato` lo devuelve; reabrir deal con contrato (409); lista con cada filtro (`estado`, `property_id`, `person_id`, `vence_en_dias`, `ajuste_en_dias`, `q`).
- `test_alquileres_ajustes.py`: `generar_ajustes` con frecuencia 3, 6, 12 y con `sin_ajuste`; el último ajuste siempre `< fecha_fin`; aplicar con coeficiente y con porcentaje; redondeo `ROUND_HALF_UP`; 422 con ambos o ninguno; 409 con anterior pendiente; omitir; `monto_vigente` sigue al último aplicado; PATCH que cambia `fecha_fin`/`frecuencia`/`indice` regenera solo pendientes; PATCH de `monto_inicial` con ajuste aplicado (409); aplicar sobre contrato no vigente (409).
- `test_alquileres_ciclo.py`: finalizar antes de `fecha_fin` (409) y después (OK: pendientes omitidos, propiedad `disponible`); rescindir (fecha fuera de rango 422; OK → propiedad `disponible`); renovar (nuevo enlazado, anterior `finalizado`, propiedad sigue `cerrada`, defaults correctos, 409 si ya renovado); `PATCH propiedades/{id}` a `disponible` con contrato vigente (409); `contrato_terminado` no toca una propiedad `baja`.
- `test_alquileres_pdf.py`: subir, reemplazar (borra el anterior en storage, como `test_inmobiliaria`), quitar, rechazo de `image/png` y de > 10 MB.
- Extensiones en tests existentes: roles derivados suman `inquilino` desde contrato sin duplicar el del deal, y `garante`; `vinculos` trae `contratos`; `propiedades/{id}` trae `contrato_vigente`.
- `alembic check` limpio tras la `0005`.

### Frontend (`client/`, vitest + Testing Library, `--pool=threads`)
- `FormularioContrato`: campos condicionales por índice; vista previa del calendario; validación de partes; precarga desde `?deal_id` y `?property_id`; modo edición deshabilita los campos bloqueados.
- `TablaAjustes`: solo la pendiente más antigua tiene "Aplicar" habilitado; estados renderizados.
- `ModalAplicarAjuste`: cálculo en vivo; envía solo coeficiente o solo porcentaje; precarga con `porcentaje_fijo`.
- Lista: filtros en query string, render de filas, tarjetas a 400px.
- Ficha: acciones según estado; 409 mostrado.
- Ficha del deal: "Crear contrato" vs. "Ver contrato".
- Dashboard: los dos tiles muestran `total` y linkean con el filtro.

## 8. Verificación antes de dar por terminado

1. `cd src && python -m pytest tests/ -q && ruff check app tests && alembic check` (con `DATABASE_URL` apuntando a una base local migrada a `head`).
2. `cd client && npm test && npx tsc --noEmit && npm run build`.
3. A mano, con backend y frontend levantados: ganar un deal de Alquiler → "Crear contrato" (partes y propiedad precargadas) → la propiedad queda `cerrada` → aplicar el primer ajuste con un coeficiente y ver el monto nuevo → rescindir → la propiedad vuelve a `disponible`. Después, alta manual desde una propiedad sin deal, subir el PDF, renovar y ver la cadena. Probar el 409 al poner `disponible` a mano una propiedad con contrato vigente.
4. Panel a 400px: lista en tarjetas, formulario en una columna, línea de tiempo legible.
5. Agregar a `docs/despliegue.md` la nota de la migración `0005` (correr `alembic upgrade head` contra Supabase antes de desplegar el frontend).
6. **No commitear ni pushear**: dejar los cambios en el working tree y avisar a Matías qué archivos se tocaron.
