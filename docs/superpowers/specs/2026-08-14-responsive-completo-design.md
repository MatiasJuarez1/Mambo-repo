# Responsive completo (sitio público + panel admin) + variantes de imagen

**Fecha:** 2026-08-14
**Estado:** aprobado, listo para implementar

---

## 1. Problema

El sitio no está pensado para pantallas chicas de punta a punta. No es una ausencia total —
el hero, `Nosotros`, `Servicios` y `Detalle` colapsan bien, hay `clamp()` en la tipografía y
grillas con `auto-fill`/`minmax`— pero hay agujeros concretos que van desde lo incómodo hasta
lo inutilizable:

1. **La navbar no tiene menú móvil.** [`Navbar.tsx`](../../../client/src/components/Navbar.tsx)
   renderiza logo + "Quiénes somos" + dos desplegables + pastilla "Contacto" + icono de cuenta
   en una sola fila flex con `gap: 2.25rem`. En 375px no entra.
2. **El panel admin no tiene una sola media query.**
   [`AdminLayout.css`](../../../client/src/layouts/AdminLayout.css) fija un sidebar de `220px`
   con `position: fixed` y le aplica `margin-left: 220px` al main. En un teléfono el contenido
   queda en ~150px de ancho útil. El panel es inusable en móvil.
3. **Targets táctiles por debajo del mínimo.** `.navbar-dropdown-toggle` tiene `padding: 0` y
   `font-size: 0.72rem` (~14px de alto). `.foto-quitar` mide 24×24. El mínimo es 44×44.
4. **Siete breakpoints ad-hoc sin declarar:** `520, 600, 620, 639, 640, 860, 900, 1023`.
5. **Seis archivos CSS con cero media queries:** `Listado.css`, `Login.css`,
   `admin/propiedades/Formulario.css`, `PersonaCard.css`, `StatTile.css`, `Badge.css`.
6. **La tabla del admin** tiene `overflow-x: auto`: no rompe, pero scrollear siete columnas en
   un teléfono es un mal patrón.
7. **Las fotos de R2 se sirven en un solo tamaño y sin `srcset`.** Un celular se baja la imagen
   a resolución completa (hasta 1920px de lado).

## 2. Alcance

Entra:

- Escala de breakpoints consolidada y documentada; los seis valores outlier migrados a ella.
- Menú móvil de la navbar pública (drawer con acordeones).
- Panel admin responsive: sidebar off-canvas + topbar, tabla en tarjetas, formulario y filtros.
- Media queries en los seis archivos que no tienen ninguna.
- Targets táctiles de 44×44 en los interactivos bajo 860px.
- Video del hero visible en móvil, con un encode liviano dedicado.
- Variantes de imagen (400/800/1600) generadas en el backend, expuestas por la API y
  consumidas con `srcset`/`sizes` en el frontend.
- Script de backfill para reprocesar las fotos ya subidas.
- Tests estructurales (Vitest, pytest) y una checklist de verificación manual.

No entra:

- **Conversión de las imágenes a WebP.** Daría ~30% más de ahorro y Pillow lo soporta, pero
  introduce extensiones y MIME nuevos en un pipeline que deduce el `ContentType` de
  `mimetypes.types_map`. Es una segunda mejora sobre esta, no parte de ella.
- **Tests visuales automatizados (Playwright).** Ver §3.
- Rediseño de ninguna pantalla. El objetivo es que lo que hay funcione en pantallas chicas,
  no que se vea distinto en escritorio.
- Reescritura mobile-first del CSS existente. Ver §3.

## 3. Decisiones tomadas

| Decisión | Elegido | Por qué |
|---|---|---|
| Estrategia CSS | Desktop-first, tokens + parches quirúrgicos | Invertir ~2000 renglones de CSS a `min-width` produce un resultado visualmente idéntico con el sitio entero como superficie de riesgo, y sin un solo test que atrape la regresión. |
| Framework CSS | Ninguno (con escotilla de escape a Tailwind, §9) | Adoptar Tailwind implicaría descartar un sistema de diseño ya construido y documentado (ver `2026-07-24-paleta-de-color-design.md`). |
| Verificación | Tests estructurales + checklist manual | jsdom no calcula CSS: ningún test de Vitest puede detectar un desborde. Playwright lo haría, pero es un runner nuevo entero que el repo hoy no tiene. |
| Alternancia escritorio/móvil | CSS (`display: none`), no `matchMedia` | Sin parpadeo en la primera pintura y sin estado de JS que sincronizar. `display: none` ya saca el subárbol del árbol de accesibilidad. |
| Variantes de imagen | Columna JSON nullable + fallback a `url` | Las filas viejas quedan en `NULL` y el frontend cae al comportamiento actual. Nunca hay una foto rota, y el deploy se desacopla del reproceso. |
| Formato de las variantes | El mismo que el original | Ver "no entra". |
| Backfill | Script manual e idempotente | Si un backfill obligatorio falla a la mitad, deja fotos rotas en producción. |
| Video en móvil | Visible, con encode dedicado | Pedido explícito. Se mitiga el costo de datos, no se ignora. |

## 4. Fundaciones CSS

### 4.1 Escala de breakpoints

**Restricción real:** las custom properties de CSS **no funcionan dentro de `@media`**.
`@media (max-width: var(--bp-sm))` no es válido. La escala es por lo tanto una **convención
documentada**, no un conjunto de variables. Va en un bloque de comentario al tope de
`index.css`:

| Nombre | Valor | Uso |
|---|---|---|
| móvil | `max-width: 640px` | una columna, targets táctiles, tarjetas en vez de tabla |
| tablet | `max-width: 860px` | colapso de dos columnas a una; ya es el de facto en 5 archivos |

Los seis outliers migran a esa escala:

| Archivo | Actual | Pasa a |
|---|---|---|
| `Servicios.css` | `900` | `860` |
| `Servicios.css` | `640` | `640` (sin cambio) |
| `Nosotros.css` | `1023` | `860` |
| `Nosotros.css` | `639` | `640` |
| `Detalle.css` | `520` | `640` |
| `PropiedadCard.css` | `600` | `640` |

Este es el único cambio del spec que puede alterar algo que hoy se ve bien. Va en su propia
tarea y con revisión visual de las cinco secciones afectadas.

### 4.2 Tokens nuevos (estos sí son variables)

```css
:root {
  --navbar-h: 72px;
  --tap-min: 44px;   /* mínimo táctil, aplicado bajo 860px */
}

@media (max-width: 860px) {
  :root { --navbar-h: 60px; }
}
```

`--navbar-h` ya lo consumen `Listado.css` y `Detalle.css` como `padding-top`, así que se
ajustan solas.

### 4.3 Targets táctiles

Bajo 860px, todo interactivo llega a `min-height: var(--tap-min)`. Los conocidos:
`.navbar-dropdown-toggle` (hoy `padding: 0`), `.foto-quitar` (hoy 24×24), los `<select>` de
`.listado-filtros` y `.filtros-bar`, `.tabla-acciones` y los `.btn` del admin.

## 5. Navegación pública

### 5.1 Drawer móvil

Bajo 860px la navbar queda en **logo + botón hamburguesa**. El resto se va a un panel
`position: fixed` que entra desde la derecha, con overlay oscuro.

Los desplegables dejan de ser menús flotantes y pasan a **acordeones**: un menú absoluto
centrado con `transform: translateX(-50%)` no tiene dónde vivir en 375px.

**Contrato de comportamiento** (esto es lo que testean los tests):

- Cierra al navegar (`useLocation`), con `Escape`, y con clic en el overlay.
- Bloquea el scroll del `body` mientras está abierto, y lo restaura al cerrar.
- La hamburguesa lleva `aria-expanded` y `aria-controls`; el panel, `aria-label`.
- Al abrir, el foco va al primer enlace del panel.

Escritorio y móvil coexisten en el DOM y se alternan con `display: none`.

### 5.2 Reorganización de archivos

`Navbar.tsx` tiene 121 renglones y el drawer le sumaría ~130. Se parte en `components/navbar/`:

| Archivo | Responsabilidad |
|---|---|
| `Navbar.tsx` | Cáscara: logo, `<ul>` de escritorio, botón hamburguesa, estado del drawer |
| `NavbarDropdown.tsx` | Desplegable flotante (solo escritorio) |
| `NavbarDrawer.tsx` | Panel móvil + acordeones |
| `entradas.ts` | `ENTRADAS_PROPIEDADES` / `ENTRADAS_SERVICIOS`, compartidas por ambos |

Obliga a actualizar los imports de `Navbar.test.tsx`.

### 5.3 Video del hero en móvil

Hoy está oculto a propósito ([`index.css`](../../../client/src/index.css) §hero, breakpoint
860). El comentario dice "3 MB"; el archivo real (`client/public/hero.mp4`) pesa **5.4MB**.

- Se genera `client/public/hero-mobile.mp4` desde `client/fotos-originales/hero-original.mp4`
  (9.3MB) con ffmpeg: 720px de ancho, `-crf 30`, `-an` (la pista de audio no se usa: el
  elemento está `muted`), `-movflags +faststart`. **Objetivo: < 1.5MB.** Si no baja de ~2MB
  con calidad aceptable, se reporta en vez de commitear un archivo pesado por default.
- Se elige con `<source media="(max-width: 860px)" src="/hero-mobile.mp4">` antes del
  `<source>` de escritorio. **Salvedad:** el atributo `media` en `<source>` se evalúa solo al
  cargar, no al redimensionar. Para este caso es irrelevante.
- `.hero-col-photo` sube de `height: 260px` a `45vh` (mín. 260px): en una banda de 260px el
  video no se lee, que era la otra mitad del argumento original.
- **`prefers-reduced-motion: reduce` lo sigue ocultando.** Es una regla de accesibilidad, no
  de tamaño de pantalla.

### 5.4 Resto del sitio público

- **`Listado.css`** (cero media queries): bajo 640, los tres `<select>` de `min-width: 180px`
  pasan a ancho completo apilados; el padding lateral baja de `2rem` a `1rem`; la grilla
  `minmax(300px, 1fr)` pasa a `minmax(min(100%, 280px), 1fr)` para no desbordar a 320px.
- **`Login.css`, `PersonaCard.css`, `StatTile.css`, `Badge.css`:** padding y `min-width`
  revisados bajo 640.
- **`BuscadorHero.css`:** ya tiene su query en 860; se verifican los targets táctiles.

## 6. Panel de administración

### 6.1 Shell (`AdminLayout`)

Bajo 860px:

- El sidebar sale de pantalla y entra desde la izquierda como drawer, con overlay.
- Aparece una topbar con hamburguesa + título de sección.
- `.admin-main` pierde el `margin-left: 220px`; el padding baja de `2.5rem` a `1rem`.

Mismo contrato de comportamiento que §5.1. Los dos drawers son código separado —el del admin
es izquierda + topbar, el público es derecha sin topbar— pero comparten la checklist; quien
implemente el segundo lee el primero.

### 6.2 Tabla de propiedades

Bajo 640px la tabla pasa a **tarjetas apiladas** (foto, título, precio, estado, acciones).
Se hace **con CSS sobre el mismo markup**: `display: block` en `thead`/`tbody`/`tr`/`td`, el
`thead` oculto con clip, y cada `td` mostrando su rótulo vía `::before { content: attr(data-label) }`.
El único cambio de JSX es agregar `data-label` a cada `<td>`. No hay render duplicado.

### 6.3 Formulario y filtros

- `.form-actions` (hoy `justify-content: flex-end`): bajo 640, botones a ancho completo apilados.
- `.foto-quitar`: 24×24 → 44×44 bajo 860.
- `.filtros-bar`: los `<select>` de `min-width: 160px` y el buscador de `220px` pasan a ancho
  completo bajo 640.
- `.fotos-grid`: `minmax(140px, 1fr)` → `minmax(min(100%, 120px), 1fr)`.

## 7. Variantes de imagen (backend)

### 7.1 Generación

[`_procesar_imagen`](../../../src/app/modules/propiedades/service.py) ya hace
`thumbnail((1920, 1920))` con el criterio correcto ("solo reduce, nunca agranda"). Se extiende
para producir además:

```python
ANCHOS_VARIANTES = (400, 800, 1600)
```

**Se saltean los anchos ≥ que el original.** Una foto de 600px genera solo la de 400, no tres
copias del mismo archivo. El `url` principal sigue siendo el de 1920: sin cambios.

Las variantes mantienen el formato y el `ContentType` del original.

### 7.2 Esquema

Una columna nueva en `propiedades_medios`:

```
variantes  JSON  NULL
-- {"400": "https://...", "800": "...", "1600": "..."}
```

`NULL` en las filas existentes → el frontend cae al `url` de siempre. `sqlalchemy.JSON`
funciona igual en PostgreSQL y en SQLite, así que la suite en memoria la cubre sin
adaptaciones nuevas en `conftest.py`.

Va con su migración Alembic. **`alembic check` antes de mergear** — es exactamente el riesgo
que `CLAUDE.md` marca como vivo hoy (cambiar un modelo y olvidar la revisión).

`MedioOut` (Pydantic) gana `variantes: dict[str, str] | None = None`.

### 7.3 Claves y borrado

Las keys de variante se derivan por convención del `storage_key` base:
`propiedades/<hex>.jpg` → `propiedades/<hex>_800.jpg`. No se guardan aparte.

`borrar_imagen` intenta borrarlas **solo cuando `variantes` no es `NULL`**, apoyándose en el
comportamiento que ya tiene documentado: los errores del proveedor se tragan, porque un
archivo huérfano en el bucket es basura barata comparada con una fila que no se pudo borrar.

### 7.4 Backfill

`python -m scripts.regenerar_variantes`, con el mismo patrón que `crear_admin`: se corre como
módulo porque importa `app.main` para registrar todos los modelos antes de tocar la base.

Baja el original del almacenamiento, regenera, escribe la columna. **Idempotente:** saltea las
filas que ya tienen `variantes` salvo que se le pase `--forzar`.

### 7.5 Consumo en el frontend

Helper nuevo `client/src/lib/imagen.ts`: devuelve el `srcset` armado, o `undefined` si el medio
no tiene variantes (y entonces el `<img>` sale con `src` a secas, como hoy).

El `sizes` es distinto por contexto y se escribe a mano en cada uno:

| Contexto | `sizes` |
|---|---|
| `PropiedadCard` en grilla | `(max-width: 640px) 100vw, (max-width: 860px) 50vw, 33vw` |
| Galería de `Detalle` | `(max-width: 860px) 100vw, 60vw` |
| `.tabla-thumb` del admin (48×48) | sin `srcset`: consume la variante de 400 directo |

Más `loading="lazy"` y `width`/`height` explícitos, para que la página no salte mientras cargan.

## 8. Tests y verificación

### 8.1 Automatizados

**Frontend (Vitest, estructurales):**
- La hamburguesa renderiza y alterna `aria-expanded`.
- El drawer cierra al navegar, con `Escape` y con clic en overlay.
- El scroll del `body` se bloquea al abrir y se restaura al cerrar.
- Los acordeones abren y cierran de forma independiente.
- `imagen.ts`: arma el `srcset` correcto; devuelve `undefined` sin variantes.

**Backend (pytest, con `STORAGE_BACKEND=local`):**
- Subir una imagen de 2000px genera las tres variantes y llena `variantes`.
- Subir una de 600px genera solo la de 400 (no agranda).
- Borrar el medio borra también los archivos de variante.
- Una fila con `variantes = NULL` sigue serializándose sin romper.
- El script de backfill es idempotente.

### 8.2 Manual — la red de verdad

jsdom no calcula CSS: **ningún test automatizado de este repo puede detectar un desborde
horizontal.** La checklist manual no es un extra, es la verificación principal.

Anchos a revisar: **320, 375, 414, 768, 1024, 1440**.

En cada uno, para cada pantalla (`/`, `/propiedades`, `/propiedades/:id`, `/nosotros`,
`/servicios`, `/admin`, `/admin/propiedades`, `/admin/propiedades/nueva`, login):

1. No hay scroll horizontal (`document.documentElement.scrollWidth === clientWidth`).
2. Ningún texto se corta ni se superpone.
3. Todo lo que se toca mide al menos 44×44.
4. Los drawers abren, cierran y no dejan el `body` bloqueado.

## 9. Escotilla de escape a Tailwind

Adoptar Tailwind **a medias** —unos componentes con utilidades y otros con el CSS actual—
suele salir peor que cualquiera de los dos extremos puros: quedan dos sistemas de cascada
compitiendo. Por eso no es un plan B difuso sino una salida con gatillo explícito:

- **Gatillo:** una tarea necesita un `!important` nuevo, o lleva más de dos rondas peleando
  especificidad para funcionar.
- **Radio de daño:** se adopta para **ese componente**, no globalmente. Vite ya está; el
  plugin es una línea de config.
- **Preservación del aspecto:** la paleta "Petróleo y tinta" y la escala de espaciado se
  cargan como `theme` de Tailwind, así que los valores son idénticos y nada cambia visualmente.
- **Visibilidad:** si se dispara, se reporta como decisión tomada, no se descubre después.

## 10. Riesgos

1. **Consolidar los seis breakpoints outlier puede mover algo que hoy se ve bien.** Mitigación:
   tarea aislada, revisión visual de las cinco secciones afectadas.
2. **Los dos drawers pueden divergir.** Mitigación: contrato de comportamiento escrito en §5.1
   y tests que lo verifican en ambos.
3. **jsdom no mide layout.** Mitigación: la checklist de §8.2 es obligatoria, no opcional.
4. **El video en móvil gasta datos del visitante.** Mitigación: encode dedicado < 1.5MB. Se
   reduce, no se elimina.
5. **La migración no corre sola en el deploy.** Render free no tiene pre-deploy hook. Hay que
   correr `alembic upgrade head` a mano contra Supabase usando el *session pooler* (el host de
   conexión directa es IPv6-only y Render no tiene egress IPv6). Va al runbook de
   [`docs/despliegue.md`](../../despliegue.md).

## 11. Orden de implementación

Las tareas se agrupan en olas por conflicto de archivos, no por dependencia lógica.

**Ola 1** (archivos disjuntos, en paralelo)
- A — Fundaciones CSS: tokens + consolidación de outliers (§4)
- B — Shell del admin: sidebar off-canvas + topbar (§6.1)
- C — Contenido del admin: tabla en tarjetas, formulario, filtros (§6.2, §6.3)
- D — Público menor: `Listado`, `Login`, `PersonaCard`, `StatTile`, `Badge` (§5.4)
- E — Backend: variantes, migración, borrado, tests (§7.1–7.3)

**Ola 2**
- F — Navbar móvil (§5.1, §5.2) — toca `index.css`, por eso va después de A
- G — Script de backfill (§7.4) — depende de E
- H — `srcset` en el frontend (§7.5) — depende de E, y de C por `Lista.tsx`

**Ola 3**
- I — Video del hero en móvil (§5.3) — toca `index.css`, por eso va después de A y F

**Cierre:** `npm test`, `npm run build`, `pytest`, `ruff check`, `alembic check`, y la
checklist manual de §8.2.
