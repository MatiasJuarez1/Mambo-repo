# Publicaciones: pantalla del panel y descarga de material — Diseño

Cierra un agujero puntual, no un bloque nuevo del [mapa de funcionalidades](2026-09-11-mapa-de-funcionalidades.md): la fila "Propiedades venta / alquiler / temporal, fotos con variantes, publicaciones" está marcada ✅/✅ (backend y panel), pero el panel de publicaciones (`pages/admin/publicaciones/Lista.tsx` y `Formulario.tsx`) es un placeholder ("Próximamente...") sin ninguna llamada a la API. El backend (`modules/publicaciones`) sí está completo. Estado: aprobado el 22/09/2026.

> **Regla de trabajo para quien implemente esto (humano o agente):** no hacer `git commit` ni `git push` de nada. Se deja todo en el working tree y Matías se encarga de commitear y pushear. Vale para el spec, el plan y cada tarea de implementación.

## 1. Objetivo

Que el staff pueda gestionar publicaciones desde el panel (listar, crear, editar, pausar/reactivar) y que, desde ahí, un agente logueado pueda bajar un paquete con las fotos de la propiedad y el texto de la publicación para reutilizarlo en sus redes personales.

## 2. Alcance

**Entra**
1. Pantalla `/admin/publicaciones`: listado con filtro por estado, alta, edición, pausar/reactivar.
2. Endpoint `GET /publicaciones/{id}/descargar`: arma un ZIP con las fotos de la propiedad (originales, sin variantes) + un `.txt` con título, descripción y precio publicado.
3. Botón "Descargar material" en la lista, visible solo si el usuario tiene rol `staff` o `admin` — el "Agente" que pidió el cliente es el rol `staff` que ya existe, no un rol nuevo (aclarado con Matías: hoy el sistema solo tiene `staff` y `admin`).
4. Corrección de la celda del mapa de funcionalidades que da por hecho el panel de publicaciones.
5. Scroll propio del sidebar (`AdminLayout.css`): hoy `.admin-sidebar` es `position: fixed` a toda la altura sin `overflow-y`, así que si el menú crece o la ventana es baja, los últimos ítems del nav o el pie de sesión pueden quedar inalcanzables. Se corrige acá porque Publicaciones agrega ítem propio a "Inventario" y es la oportunidad de arreglarlo antes de que el menú siga creciendo.

**No entra**
- Rol "Agente" como fila nueva en `roles` — no hace falta: `staff` ya es "agente" a efectos de este sistema.
- Selección de qué fotos entran al ZIP o reordenarlas para el paquete — se manda todo lo que tenga la propiedad, en el orden de `orden`.
- Variantes redimensionadas en el ZIP — se manda el original de cada foto; para redes sociales conviene la mejor calidad disponible, no la miniatura de la web.
- Videos y documentos adjuntos a la propiedad (`tipo_medio` `video`/`documento`/`otro`) — el paquete es solo fotos (ver Decisión 10).
- Republicar/duplicar una publicación, o slug autogenerado desde el título — el campo `slug` queda como texto libre opcional, tal como ya lo expone el schema.
- Cualquier cambio al modelo de `Publicacion` o su schema: ya tienen todo lo que esta pantalla necesita.
- **Rediseño estético del panel de admin.** Se pidió una vista "más limpia" para todos los módulos (Propiedades, Personas, Reservas, Operaciones, Actividades, Alquileres, Reportes, Configuración, Dashboard), no solo Publicaciones. Es un proyecto transversal que primero necesita decidir el lenguaje visual (paleta, densidad, tratamiento de tablas) antes de tocar pantalla por pantalla — queda como spec aparte (ver §9). Publicaciones se construye con los componentes y clases ya existentes (`admin-card`, `tabla`, `form*`), sin inventar un estilo propio que quede desalineado del resto del panel apenas se apruebe el rediseño.

## 3. Decisiones

1. **El ZIP se arma en memoria en cada pedido, no se cachea.** El material se genera bajo demanda; no hay expectativa de que dos agentes lo pidan en el mismo segundo, y cachear introduciría que invalidar cuando cambian las fotos o el texto.
2. **Lectura de fotos: por `storage_key` cuando existe, por HTTP a la `url` cuando no.** Reusa `storage.leer_archivo()` (funciona igual en local y R2) para las fotos propias; las del seed sin `storage_key` apuntan a URLs de terceros y se traen con `httpx.get()`, dependencia que el backend ya usa (`pyproject.toml`). No se resuelve la URL relativa de `local` (`/media/...`) por HTTP propio: para esas siempre hay `storage_key`, así que nunca caen en la rama HTTP.
3. **Una foto que falla al traerse se salta, no aborta el ZIP entero.** `storage.leer_archivo()` no traga errores por diseño (el llamador decide), y acá el llamador decide seguir: es mejor un paquete con 7 de 8 fotos que ningún paquete. Se loguea con `logging.warning` para poder auditar fallos recurrentes de R2 o de una URL de terceros caída.
4. **Sin fotos, el ZIP igual se genera** (con el `.txt` solo) — no es un error, es una publicación sin material gráfico todavía.
5. **Gating del botón es cosmético; el endpoint es la barrera real.** `GET /publicaciones/{id}/descargar` usa el mismo `SOLO_STAFF` que ya protege crear/editar/borrar en este router. El frontend solo evita mostrar un botón que devolvería 403.
6. **Descarga con `<a href download>`, no `fetch` + blob.** Mismo patrón que `reportesApi.urlCsv` en `Reportes.tsx`: la cookie de sesión viaja porque el pedido es first-party (proxy de Vercel), sin necesidad de manejar el binario en JS.
7. **"Pausar" y "reactivar" son la misma acción de UI** (`PUT` con `{ estado: 'pausada' | 'activa' }`), sin endpoint nuevo — `actualizar_publicacion` ya acepta cambios parciales de estado.
8. **Selector de propiedad solo en alta; en edición la propiedad es fija.** Cambiar la propiedad de una publicación ya creada no tiene un caso de uso claro y el schema `PublicacionUpdate` ni siquiera acepta `propiedad_id`.
9. **El scroll queda solo en `.admin-nav` (el listado de enlaces), no en todo el sidebar.** Logo y pie de sesión se quedan fijos arriba y abajo; solo la lista de grupos/enlaces del medio scrollea cuando no entra en el alto disponible. Es el patrón habitual de sidebar (header y footer siempre visibles, contenido scrolleable en el medio) y evita que "Salir" desaparezca de la vista cuando el nav es largo. Requiere `min-height: 0` en `.admin-nav` — sin eso un hijo `flex` no se achica por debajo de su contenido y el `overflow-y` nunca entra en juego.
10. **El ZIP solo incluye medios con `tipo_medio == imagen`.** `propiedades_medios` también guarda videos, documentos y "otro"; nada de eso sirve para un posteo en redes y un video adjunto podría hacer el pedido lento o pesado sin que el agente lo pidiera. Si el día de mañana hace falta llevarse un video, es una decisión de producto aparte (¿un ZIP separado? ¿mezclado?), no algo que este endpoint deba resolver ahora.

## 4. Backend

### 4.1 `modules/publicaciones/service.py`

```python
import logging
from io import BytesIO
from pathlib import PurePosixPath
from urllib.parse import urlsplit
from zipfile import ZipFile

import httpx

from app import storage
from app.modules.propiedades.models import TipoMedio

logger = logging.getLogger(__name__)


def generar_paquete_descarga(db: Session, publicacion_id: int) -> bytes:
    """ZIP con las fotos de la propiedad (originales) + un .txt con título/descripción/precio."""
    pub = obtener_publicacion(db, publicacion_id)

    fotos = [m for m in pub.propiedad.medios if m.tipo_medio == TipoMedio.imagen]

    buffer = BytesIO()
    with ZipFile(buffer, "w") as zf:
        for i, medio in enumerate(fotos, start=1):
            try:
                contenido = (
                    storage.leer_archivo(medio.storage_key)
                    if medio.storage_key
                    else httpx.get(medio.url, timeout=10).raise_for_status().content
                )
            except Exception:
                logger.warning("No se pudo traer la foto %s de la publicación %s", medio.id, pub.id)
                continue
            # `urlsplit` primero: las URLs de terceros traen query string y el
            # suffix se quedaría con ".jpg?token=abc", que no es nombre válido.
            extension = PurePosixPath(urlsplit(medio.url).path).suffix or ".jpg"
            zf.writestr(f"foto-{i:02d}{extension}", contenido)

        zf.writestr("descripcion.txt", _texto_descripcion(pub))

    return buffer.getvalue()


def _texto_descripcion(pub: Publicacion) -> str:
    lineas = [pub.titulo, ""]
    if pub.precio_publicado is not None:
        lineas.append(f"Precio: {pub.moneda_publicada} {pub.precio_publicado}")
    lineas.append("")
    lineas.append(pub.descripcion or "")
    return "\n".join(lineas)
```

`obtener_publicacion` ya filtra `eliminado_en.is_(None)` y da 404 si no existe — el endpoint de descarga hereda ese comportamiento sin código nuevo.

### 4.2 `modules/publicaciones/router.py`

```python
@router.get("/{publicacion_id}/descargar", dependencies=SOLO_STAFF)
def descargar_publicacion(publicacion_id: int, db: Session = Depends(get_db)):
    contenido = service.generar_paquete_descarga(db, publicacion_id)
    return Response(
        content=contenido,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="publicacion-{publicacion_id}.zip"'},
    )
```

Mismo estilo que `reportes/exportar.py::csv_response`.

### 4.3 Errores

| Caso | Código y mensaje |
|---|---|
| Publicación inexistente o eliminada | 404 "Publicación no encontrada" (ya existe en `obtener_publicacion`) |
| `slug` ya usado por otra publicación | 409, validado en el service antes de guardar. Sin esto el `unique=True` de la columna reventaba con `IntegrityError` → 500 en texto plano, y el panel mostraba un error de parseo de JSON en vez de una explicación. El slug de una publicación borrada **sigue ocupado**: el borrado es lógico y la fila conserva el UNIQUE real de la base |
| `titulo` > 255 o `slug` > 300 caracteres | 422 vía `max_length` en los schemas, calcado de las columnas. Sin eso pasaba la validación, pasaba los tests (SQLite no valida el largo de `varchar`) y daba 500 en Postgres |
| Anónimo o sin rol staff/admin en `/descargar` | 401/403 vía `require_role` |
| Una foto puntual no se puede traer | se omite del ZIP, sin romper el pedido (ver Decisión 3) |
| Propiedad sin fotos | ZIP con solo `descripcion.txt` |

## 5. Frontend

### 5.1 API (`api/publicaciones.ts`)

Se agrega junto a los métodos existentes:

```ts
urlDescarga: (id: number) => `${BASE_URL}${BASE}/${id}/descargar`,
```

(mismo patrón que `reportesApi.urlCsv`, usando el `BASE_URL` que ya exporta `api/client.ts`).

### 5.2 `pages/admin/publicaciones/Lista.tsx`

Calca el esqueleto de `reservas/Lista.tsx`: filtro por estado, tabla en `admin-card`/`tabla`, estados de carga/error/vacío.

```text
┌─ Publicaciones ────────────────────────────────────────── + Nueva publicación ─┐
│ Estado[▾: Todas/Activa/Pausada]                                                │
│ ──────────────────────────────────────────────────────────────────────────────│
│ Propiedad        Título              Precio        Publicada  Estado  Acciones │
│ Casa en Rivad.   Casa 3 amb. jardín  U$D 120.000   20/09/26   Activa  [Editar] │
│                                                                [Pausar]         │
│                                                        [Descargar material]* │
│ (* solo si usuario.roles incluye 'staff' o 'admin')                            │
│ (vacío → "No hay publicaciones.")                                              │
└─────────────────────────────────────────────────────────────────────────────────┘
```

- `usePublicaciones` no hace falta como hook aparte: se sigue el patrón inline de `reservas/Lista.tsx` (`useState` + `useEffect` + función `cargar`).
- Columna "Propiedad" linkea a `/admin/propiedades/{propiedad_id}/editar` (mismo criterio que `reservas/Lista.tsx`).
- Acción "Pausar" (si `estado === 'activa'`) / "Reactivar" (si `estado === 'pausada'`): `publicacionesApi.actualizar(id, { estado: ... })` y recarga la lista, con manejo de error igual a `accion()` en `reservas/Lista.tsx`.
- Acción "Descargar material": `<a href={publicacionesApi.urlDescarga(id)} download className="btn btn-outline">Descargar material</a>`, solo si `usuario?.roles.includes('staff') || usuario?.roles.includes('admin')`.

### 5.3 `pages/admin/publicaciones/Formulario.tsx`

Alta y edición en un solo componente, distinguiendo por `useParams().id`.

- **Alta**: `SelectorPropiedad` (ya existe en `components/crm/SelectorPropiedad`) para elegir `propiedad_id`, obligatorio.
- **Edición**: carga la publicación con `publicacionesApi.obtener(id)`; la propiedad se muestra de solo lectura (nombre + link), no se puede cambiar. **Guardar queda deshabilitado hasta que la publicación cargó**: como en edición los campos vacíos viajan como `null` explícito (ver abajo), guardar sobre el formulario todavía vacío borraría descripción, precio y slug de verdad.
- Campos comunes: `titulo` (texto, obligatorio), `descripcion` (textarea), `estado` (select: activa/pausada), `precio_publicado` + `moneda_publicada` (número + select ARS/USD, igual que en `propiedades/Formulario.tsx`), `slug` (texto libre, opcional).
- Guardar: `crear()` en alta, `actualizar()` en edición; ambas navegan a `/admin/publicaciones` al terminar. Error de validación del backend se muestra igual que en el resto de los formularios del panel (mensaje debajo del form, sin cambiar de pantalla).
- **Los campos opcionales vacíos viajan distinto según el modo**: en alta como `undefined` (para que el backend aplique sus defaults) y en edición como `null` explícito. `JSON.stringify` borra del body las claves con `undefined`, y `actualizar_publicacion` usa `model_dump(exclude_unset=True)`: sin el `null`, vaciar una descripción ya cargada no la borra y la pantalla navega como si hubiera guardado. `PublicacionUpdatePayload` se tipa para admitir `null` en `descripcion`, `precio_publicado` y `slug`.

### 5.4 Navegación

Ya está: `AdminLayout.tsx` ya tiene `{ to: '/admin/publicaciones', label: 'Publicaciones' }`. No se toca el componente.

### 5.5 Scroll del sidebar (`AdminLayout.css`)

Único cambio a un archivo compartido por todo el panel — se justifica acá porque es chico, puntual y hoy es un bug latente (ver Decisión 9), no una pieza del futuro rediseño estético.

```css
.admin-sidebar {
  /* ya existente: width, flex-shrink, background, position, inset */
  display: flex;
  flex-direction: column;
  /* sin cambios arriba de esta línea */
}

.admin-nav {
  /* ya existente: display, flex-direction, gap, padding */
  flex: 1;
  min-height: 0;       /* nuevo: permite que el hijo flex se achique y el overflow entre en juego */
  overflow-y: auto;    /* nuevo */
  overscroll-behavior: contain; /* nuevo: el scroll del nav no se escapa hacia el body detrás */
}
```

`.admin-sidebar-logo` y `.admin-sidebar-footer` no cambian: al no tener `flex` quedan con su alto de contenido y no se comprimen, así que actúan como header/footer fijos por construcción. Sin cambios en el breakpoint de 860px: el drawer móvil hereda el mismo `.admin-nav` y también gana el scroll ahí, que es donde más falta hace (pantallas más bajas).

## 6. Tests

Backend (`src/tests/test_publicaciones.py` — no existe hoy, se crea):
- CRUD existente (crear, listar activas/todas, obtener, actualizar, soft-delete) — hoy sin cobertura, se agrega junto con lo nuevo para no dejar el módulo con huecos.
- `GET /descargar`: devuelve `application/zip` con las fotos esperadas + `descripcion.txt` (se abre el ZIP en el test y se valida el listado de nombres y el contenido del `.txt`).
- Una foto cuyo `leer_archivo` lanza excepción (mock) se omite del ZIP sin que el endpoint falle.
- Publicación sin fotos: ZIP con un solo archivo (`descripcion.txt`).
- Propiedad con un medio `tipo_medio == video` además de fotos: el ZIP no lo incluye.
- Permisos: anónimo y usuario sin rol `staff`/`admin` reciben 401/403 en `/descargar` y en crear/editar/borrar; los `GET` de listado siguen abiertos como hoy.

Frontend (`client/src/`):
- `api/publicaciones.test.ts` (si no existe, se crea): `urlDescarga` arma la URL esperada.
- `pages/admin/publicaciones/Lista.test.tsx`: vacío, filtro por estado dispara refetch, pausar/reactivar actualizan la fila, botón "Descargar material" visible con rol staff/admin y ausente sin él, link de descarga apunta a la URL correcta.
- `pages/admin/publicaciones/Formulario.test.tsx`: alta exige propiedad + título, edición precarga los campos y no muestra el selector de propiedad, envío llama a `crear`/`actualizar` según corresponda.
El scroll del sidebar **no lleva test automatizado**: es CSS puro y jsdom no calcula layout, el mismo criterio que ya dejó escrito `AdminLayout.test.tsx` ("jsdom no calcula CSS […] eso va a la checklist manual") y §8.2 del [spec de responsive](2026-08-14-responsive-completo-design.md). Se verifica a mano: con la ventana a 600px de alto, el nav scrollea y el logo y el bloque de sesión con "Salir" siguen visibles, en escritorio y con el drawer móvil abierto.

## 7. Despliegue

Sin migración: no se toca ningún modelo. Sin variables nuevas. No requiere nota en `docs/despliegue.md`.

## 8. Documentación

Se corrige la fila de la tabla en [2026-09-11-mapa-de-funcionalidades.md](2026-09-11-mapa-de-funcionalidades.md#1-punto-de-partida): "Propiedades venta / alquiler / temporal, fotos con variantes, publicaciones" pasa a reflejar el panel de publicaciones como pendiente hasta este trabajo, no como hecho.

## 9. Deuda conocida (del review final del 23/09/2026)

Dos cosas que se dejaron a propósito, para que no se redescubran en producción:

1. **La descarga no da ninguna señal de progreso.** El `<a download>` no se deshabilita ni cambia de texto, y el backend baja las fotos de R2 de a una, secuencialmente. Con 25 fotos y el servicio de Render recién despertado pueden pasar 15-30 segundos sin nada visible, y lo esperable es que el agente vuelva a hacer clic — cada clic arma el ZIP entero de nuevo. Paliativo barato: deshabilitar el link unos segundos con un "Preparando…". Si además hiciera falta bajar la latencia, las lecturas de R2 son paralelizables con un `ThreadPoolExecutor` sin cambiar el contrato.
2. **Con la sesión vencida, la descarga baja el cuerpo del 401 como archivo.** El `<a href download>` no pasa por `request()` de `api/client.ts`, así que no dispara el manejador global de 401 que limpia la sesión y manda al login: el agente se queda con un archivo basura y el panel sigue mostrándose logueado hasta la próxima llamada por `fetch`. **Es un defecto heredado del mismo patrón que usa `reportesApi.urlCsv`**, no introducido acá; si se arregla, conviene arreglarlo para los dos.

## 10. Después, si aparece la demanda

Rol "Agente" propio en `roles` si algún día necesita permisos distintos de `staff` (por ejemplo, ver solo sus propias publicaciones asignadas). Selección de fotos para el paquete. Miniatura de cada publicación en la lista. Slug autogenerado desde el título.

**Spec aparte, ya acordado con Matías (22/09/2026):** rediseño estético de todo el panel de admin — Propiedades, Personas, Reservas, Operaciones, Actividades, Alquileres, Reportes, Configuración y Dashboard — con una vista más limpia y prolija acorde a una inmobiliaria. Antes de tocar pantallas conviene resolver el lenguaje visual (paleta, densidad, tratamiento de tablas vs. tarjetas) con mockups, no en texto. Esta pantalla de Publicaciones se construye mientras tanto con los componentes actuales (`admin-card`, `tabla`, `form*`) para no quedar desalineada cuando ese rediseño se apruebe.
