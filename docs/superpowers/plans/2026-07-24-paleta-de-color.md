# Paleta "Petróleo y tinta" — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la paleta del frontend por la definida en [el spec](../specs/2026-07-24-paleta-de-color-design.md), derivada del logo de Mambo Group, eliminando los tokens con nombres engañosos y los colores hardcodeados.

**Architecture:** Los tokens nuevos se agregan primero a `:root` conviviendo con los viejos (Tarea 1), después se migra archivo por archivo (Tareas 2-10), y recién al final se borran los viejos (Tarea 11). Así el sitio queda funcionando y revisable después de cada tarea, en lugar de romperse a mitad de camino.

**Tech Stack:** React 19 + TypeScript 5.8 + Vite 6, CSS plano con custom properties. Sin librería de estilos, sin preprocesador.

## Cómo se verifica (leer antes de empezar)

**Este repo no tiene suite de tests ni test runner** — está documentado en `CLAUDE.md`. Agregar uno está fuera del alcance de este spec. El ciclo TDD se sustituye por su equivalente verificable para una migración de CSS:

1. **La aserción que falla:** un `grep` que demuestra que el archivo todavía tiene tokens viejos.
2. **El cambio.**
3. **La aserción que pasa:** el mismo `grep` sin resultados.
4. **El build:** `npm run build` desde `client/`, que corre `tsc` y detecta cualquier error de tipos (relevante en las tareas 5 y 6, que tocan TSX).
5. **La revisión visual:** `npm run dev` y mirar la pantalla afectada.

Los `grep` se corren desde la raíz del repo (`c:\Users\matia\Mambo-repo`) en Git Bash. En PowerShell, usar `Select-String` con el mismo patrón.

## Global Constraints

**Mapeo de tokens.** Salvo las excepciones que cada tarea indica explícitamente, todo reemplazo sigue esta tabla:

| Token viejo | Token nuevo |
|---|---|
| `var(--teal)`, `var(--green)`, `var(--gold)` | `var(--petrol)` |
| `var(--teal-dark)`, `var(--green-dark)` | `var(--petrol-deep)` |
| `var(--gold-dark)` | `var(--text-muted)` |
| `var(--cream)` | `var(--bone)` |
| `var(--gray)` como borde o línea | `var(--line)` |
| `var(--gray)` como relleno o fondo | `var(--bone)` |
| `var(--pink)` | `var(--petrol)` **salvo los 5 casos de marca** |
| `var(--pink-dark)` | `var(--magenta-deep)` |

**Los únicos 5 lugares donde va magenta** (spec §4.1). Si una tarea propone poner magenta en otro lado, está mal:

1. `.btn-primary` — `index.css:474`
2. `.categoria-card:hover::before` — `index.css:611`
3. `.eyebrow::before` — `index.css:738`
4. `.detalle-btn-wsp` — `Detalle.css:123`
5. `.admin-nav-item.active` — `AdminLayout.css:71`

Más `.nosotros-valor-card:hover::before` (`Nosotros.css:175`), que es el mismo patrón visual que el caso 2.

**`--text` y `--text-muted` no se renombran.** Solo cambian de valor en la Tarea 1. Toda referencia `var(--text)` / `var(--text-muted)` que aparezca en un archivo se deja **intacta**.

**Regla de contraste.** `var(--magenta)` nunca sobre texto menor a 18px o no-bold; en ese caso va `var(--magenta-deep)`.

**Los números de línea de este plan corresponden al estado del repo al escribirlo.** Si una edición no matchea, buscar el selector por nombre en vez de confiar en la línea.

---

### Task 1: Definir la paleta nueva en `:root`

Agrega los tokens nuevos sin tocar los viejos. Al terminar, el sitio se ve casi igual: el único cambio visible es que el texto queda apenas más oscuro y el gris secundario apenas más cálido.

**Files:**
- Modify: `client/src/index.css:9-49`

**Interfaces:**
- Produces: los custom properties `--petrol`, `--petrol-deep`, `--petrol-soft`, `--magenta`, `--magenta-deep`, `--line`, `--bone`, `--estado-ok`, `--estado-ok-bg`, `--estado-espera`, `--estado-espera-bg`, `--estado-neutro`, `--estado-neutro-bg`, `--estado-baja`, `--estado-baja-bg`. Todas las tareas siguientes los consumen.

- [ ] **Step 1: Verificar que los tokens nuevos todavía no existen**

```bash
grep -c "petrol\|magenta\|estado-ok" client/src/index.css
```

Esperado: `0`

- [ ] **Step 2: Insertar el bloque de paleta nueva**

En `client/src/index.css`, reemplazar este bloque:

```css
  /* Alias de compatibilidad: el sitio se rediseñó de teal/rosa a verde/dorado.
     Se conservan los nombres para no reescribir cada regla del sistema. */
  --pink:       var(--gold);
  --pink-dark:  var(--gold-dark);
  --teal:       var(--green);
  --teal-dark:  var(--green-dark);

  --gray:       #E3E5EA;
  --white:      #ffffff;
  --text:       #111827;
  --text-muted: #6b7280;
```

por:

```css
  /* Alias de compatibilidad: el sitio se rediseñó de teal/rosa a verde/dorado.
     Se conservan los nombres para no reescribir cada regla del sistema.
     TEMPORAL: se eliminan en la última tarea de la migración de paleta. */
  --pink:       var(--gold);
  --pink-dark:  var(--gold-dark);
  --teal:       var(--green);
  --teal-dark:  var(--green-dark);
  --gray:       #E3E5EA;

  /* ── Paleta "Petróleo y tinta" ──────────────────────────────
     Derivada del logo de Mambo Group. Ver
     docs/superpowers/specs/2026-07-24-paleta-de-color-design.md */

  /* Neutros */
  --white:      #ffffff;
  --text:       #121212;  /* no es negro puro: el #000 sobre blanco vibra */
  --text-muted: #6A6969;  /* gris del logo (#747373) oscurecido 4% para pasar AA sobre --bone */
  --line:       #E2E1DF;
  --bone:       #F7F6F4;

  /* Campo oscuro */
  --petrol:      #0E3A3B;
  --petrol-deep: #071F20;
  --petrol-soft: #E8EFEF;

  /* Acento de marca — solo 5 usos en todo el sitio (spec §4.1) */
  --magenta:      #EE016A;
  --magenta-deep: #C10154;  /* obligatorio sobre texto < 18px: el puro da 4.33 */

  /* Escala semántica de estados del dato — nunca se mezcla con el acento */
  --estado-ok:         #0F7A5A;
  --estado-ok-bg:      #E4F2EC;
  --estado-espera:     #8A5A00;
  --estado-espera-bg:  #FBF0DC;
  --estado-neutro:     #5C5C5C;
  --estado-neutro-bg:  #EFEFEF;
  --estado-baja:       #B3261E;
  --estado-baja-bg:    #FBE9E7;
```

- [ ] **Step 3: Cambiar el tinte de la sombra de hover**

Reemplazar:

```css
  --shadow-hover: 0 14px 38px rgba(7, 103, 102, 0.13);
```

por:

```css
  --shadow-hover: 0 14px 38px rgba(14, 58, 59, 0.13);
```

- [ ] **Step 4: Verificar que los tokens existen y el build pasa**

```bash
grep -c "petrol\|magenta\|estado-ok" client/src/index.css
cd client && npm run build
```

Esperado: el `grep` devuelve un número mayor a `10`; el build termina con `✓ built in ...` sin errores.

- [ ] **Step 5: Commit**

```bash
git add client/src/index.css
git commit -m "paleta: definir tokens de petróleo, magenta y escala semántica"
```

---

### Task 2: Migrar la navbar y los desplegables

**Files:**
- Modify: `client/src/index.css:71-249`

**Interfaces:**
- Consumes: `--petrol`, `--line`, `--bone`, `--text-muted`, `--petrol-deep` (Tarea 1).

- [ ] **Step 1: Ver los tokens viejos que quedan en la región**

```bash
sed -n '60,250p' client/src/index.css | grep -n "var(--pink\|var(--gray\|var(--gold\|var(--teal\|var(--cream\|var(--green"
```

Esperado: 15 líneas de resultado.

- [ ] **Step 2: Aplicar los reemplazos**

Cada línea, con su selector para poder ubicarla si el número cambió:

| Selector | Antes | Después |
|---|---|---|
| `.navbar` | `border-bottom: 1px solid var(--gray);` | `border-bottom: 1px solid var(--line);` |
| `.navbar-quienes` | `border-left: 1px solid var(--gray);` | `border-left: 1px solid var(--line);` |
| `.navbar-quienes:hover` | `color: var(--pink);` | `color: var(--petrol);` |
| `.logo-mambo` | `color: var(--gold);` | `color: var(--petrol);` |
| `.logo-groups` | `color: var(--gold-dark);` | `color: var(--text-muted);` |
| `.navbar-links a:hover` | `color: var(--pink);` | `color: var(--petrol);` |
| `.navbar-admin-btn` | `border: 1px solid var(--teal);` | `border: 1px solid var(--petrol);` |
| `.navbar-admin-btn` | `color: var(--teal) !important;` | `color: var(--petrol) !important;` |
| `.navbar-admin-btn:hover` | `background: var(--teal) !important;` | `background: var(--petrol) !important;` |
| `.navbar-dropdown-toggle[aria-expanded='true']` | `color: var(--pink);` | `color: var(--petrol);` |
| `.navbar-dropdown-menu` | `border: 1px solid var(--gray);` | `border: 1px solid var(--line);` |
| `.navbar-dropdown-menu a:hover` | `background: var(--cream);` | `background: var(--bone);` |
| `.navbar-dropdown-menu a:hover` | `color: var(--green);` | `color: var(--petrol);` |
| `.navbar-account` | `color: var(--green);` | `color: var(--petrol);` |
| `.navbar-account:hover` | `color: var(--gold-dark);` | `color: var(--petrol-deep);` |

Los hovers de navegación van a petróleo y **no** a magenta: en versalita de 12px el magenta no llega al contraste mínimo (spec §4.2).

- [ ] **Step 3: Verificar que la región quedó limpia**

```bash
sed -n '60,250p' client/src/index.css | grep -n "var(--pink\|var(--gray\|var(--gold\|var(--teal\|var(--cream\|var(--green"
```

Esperado: sin resultados (exit code 1).

- [ ] **Step 4: Build y revisión visual**

```bash
cd client && npm run build && npm run dev
```

Abrir `http://localhost:5173`. Verificar: el logo se ve igual, los links del menú viran a petróleo oscuro al pasar el mouse, el botón "Administración" es una pastilla de contorno petróleo, y el desplegable de Venta abre con fondo hueso al hacer hover en un ítem.

- [ ] **Step 5: Commit**

```bash
git add client/src/index.css
git commit -m "paleta: migrar navbar y desplegables"
```

---

### Task 3: Migrar el hero y el buscador

**Files:**
- Modify: `client/src/index.css:262-449`

**Interfaces:**
- Consumes: `--petrol`, `--petrol-deep`, `--petrol-soft`, `--bone`, `--line` (Tarea 1).

- [ ] **Step 1: Ver los tokens y rgba viejos que quedan en la región**

```bash
sed -n '255,455p' client/src/index.css | grep -n "var(--pink\|var(--gray\|var(--gold\|var(--teal\|var(--cream\|var(--green\|rgba(194\|rgba(7,\|rgba(7, \|rgba(236\|rgba(21"
```

Esperado: 17 líneas de resultado.

- [ ] **Step 2: Aplicar los reemplazos de tokens**

| Selector | Antes | Después |
|---|---|---|
| `.hero-col-text` | `background: var(--teal);` | `background: var(--petrol);` |
| `.hero-col-photo` | `background: var(--gray) center / cover no-repeat;` | `background: var(--line) center / cover no-repeat;` |
| `.hero-sub` | `color: var(--gold);` | `color: var(--petrol-soft);` |
| `.btn-hero` | `color: var(--cream);` | `color: var(--bone);` |
| `.btn-hero:hover` | `background: var(--cream);` | `background: var(--bone);` |
| `.btn-hero:hover` | `color: var(--green);` | `color: var(--petrol);` |
| `.btn-hero:hover` | `border-color: var(--cream);` | `border-color: var(--bone);` |
| `.hero-search` | `background: var(--cream);` | `background: var(--bone);` |
| `.hero-search__label` | `color: var(--green);` | `color: var(--petrol);` |
| `.qs-ico` | `color: var(--green);` | `color: var(--petrol);` |
| `.qs-buscar` | `background: var(--green);` | `background: var(--petrol);` |
| `.qs-buscar:hover` | `background: var(--green-dark);` | `background: var(--petrol-deep);` |

`.hero-sub` ("Lotes · Casas · Inversiones") va a `--petrol-soft` y **no** a magenta: el magenta sobre petróleo da 2.88 de contraste, muy por debajo del mínimo.

- [ ] **Step 3: Aplicar los reemplazos de tintes rgba**

En `.hero-col-text::before` (el círculo decorativo):

```css
  background: rgba(194, 168, 120, 0.12);
```

pasa a:

```css
  background: rgba(232, 239, 239, 0.10);
```

En `.hero-col-photo::before` (el degradado que funde la foto):

```css
  background: linear-gradient(
    90deg,
    rgba(7, 103, 102, 0.38) 0%,
    rgba(7, 103, 102, 0.10) 22%,
    transparent 45%
  );
```

pasa a:

```css
  background: linear-gradient(
    90deg,
    rgba(14, 58, 59, 0.38) 0%,
    rgba(14, 58, 59, 0.10) 22%,
    transparent 45%
  );
```

En `.btn-hero`:

```css
  border: 1px solid rgba(236, 228, 211, 0.55);
```

pasa a:

```css
  border: 1px solid rgba(247, 246, 244, 0.55);
```

En `.hero-search`:

```css
  box-shadow: 0 18px 44px rgba(21, 42, 36, 0.22);
```

pasa a:

```css
  box-shadow: 0 18px 44px rgba(7, 31, 32, 0.22);
```

- [ ] **Step 4: Verificar que la región quedó limpia**

```bash
sed -n '255,455p' client/src/index.css | grep -n "var(--pink\|var(--gray\|var(--gold\|var(--teal\|var(--cream\|var(--green\|rgba(194\|rgba(7,\|rgba(7, \|rgba(236\|rgba(21"
```

Esperado: sin resultados.

- [ ] **Step 5: Build y revisión visual**

```bash
cd client && npm run build && npm run dev
```

En el Home: el panel del hero es verde petróleo profundo, el degradado sobre la foto no tiene halo verdoso viejo, y la barra de búsqueda flotante es hueso cálido en vez de crema.

- [ ] **Step 6: Commit**

```bash
git add client/src/index.css
git commit -m "paleta: migrar hero y buscador"
```

---

### Task 4: Migrar secciones, CTA, footer y utilidades

Acá aparecen 3 de los 5 usos de magenta de todo el sitio.

**Files:**
- Modify: `client/src/index.css:474-747`

**Interfaces:**
- Consumes: `--petrol`, `--petrol-deep`, `--magenta`, `--magenta-deep`, `--line`, `--bone` (Tarea 1).

- [ ] **Step 1: Ver lo que queda en la región**

```bash
sed -n '460,750p' client/src/index.css | grep -n "var(--pink\|var(--gray\|var(--gold\|var(--teal\|var(--cream\|var(--green\|rgba(7,103"
```

Esperado: 17 líneas de resultado.

- [ ] **Step 2: Aplicar los tres usos de magenta**

| Selector | Antes | Después |
|---|---|---|
| `.btn-primary` | `background: var(--pink);` | `background: var(--magenta);` |
| `.btn-primary:hover` | `background: var(--pink-dark);` | `background: var(--magenta-deep);` |
| `.categoria-card:hover::before` | `background: var(--pink);` | `background: var(--magenta);` |
| `.eyebrow::before` | `background: var(--pink);` | `background: var(--magenta);` |

- [ ] **Step 3: Aplicar el resto de los reemplazos**

| Selector | Antes | Después |
|---|---|---|
| `.values` | `background: var(--gray);` | `background: var(--bone);` |
| `.values p` | `color: var(--teal);` | `color: var(--petrol);` |
| `.destacadas-header h2` | `color: var(--teal);` | `color: var(--petrol);` |
| `.destacadas-header .destacadas-link` | `color: var(--pink);` | `color: var(--petrol);` |
| `.section-header h2` | `color: var(--teal);` | `color: var(--petrol);` |
| `.categoria-card` | `border: 1px solid var(--gray);` | `border: 1px solid var(--line);` |
| `.categoria-card::before` | `background: var(--teal);` | `background: var(--petrol);` |
| `.cat-num` | `color: var(--gray);` | `color: var(--line);` |
| `.cta-section` | `background: var(--green);` | `background: var(--petrol);` |
| `.btn-white` | `color: var(--green);` | `color: var(--petrol);` |
| `.footer` | `background: var(--teal-dark);` | `background: var(--petrol-deep);` |
| `.section-label` | `color: var(--pink);` | `color: var(--petrol);` |

En `.categoria-card:hover`:

```css
  box-shadow: 0 10px 36px rgba(7,103,102,0.1);
```

pasa a:

```css
  box-shadow: 0 10px 36px rgba(14, 58, 59, 0.1);
```

- [ ] **Step 4: Verificar que la región quedó limpia**

```bash
sed -n '460,750p' client/src/index.css | grep -n "var(--pink\|var(--gray\|var(--gold\|var(--teal\|var(--cream\|var(--green\|rgba(7,103"
```

Esperado: sin resultados.

- [ ] **Step 5: Build y revisión visual**

```bash
cd client && npm run build && npm run dev
```

En el Home: la franja de valores es hueso, las tarjetas de categoría muestran la línea magenta **solo** al pasar el mouse, el CTA es petróleo, el footer petróleo profundo, y la barrita del eyebrow ("Tucumán, Argentina") es magenta.

- [ ] **Step 6: Commit**

```bash
git add client/src/index.css
git commit -m "paleta: migrar secciones, CTA, footer y utilidades"
```

---

### Task 5: Escala semántica en Badge

Este es el cambio de fondo del spec: el color de marca deja de comunicar estados del dato.

**Files:**
- Modify: `client/src/components/Badge.css:12-17`
- Modify: `client/src/components/Badge.tsx:3-19`

**Interfaces:**
- Consumes: `--estado-ok`, `--estado-ok-bg`, `--estado-espera`, `--estado-espera-bg`, `--estado-neutro`, `--estado-neutro-bg`, `--estado-baja`, `--estado-baja-bg`, `--petrol`, `--white` (Tarea 1).
- Produces: el tipo `Color = 'ok' | 'espera' | 'neutro' | 'baja' | 'operacion'` exportado implícitamente vía la prop `color?: Color` de `Badge`. Ningún call site actual pasa `color` explícitamente, así que no hay consumidores que romper.

- [ ] **Step 1: Confirmar que ningún call site pasa `color` a mano**

```bash
grep -rn "<Badge" client/src --include=*.tsx
```

Esperado: 3 resultados en `Lista.tsx`, todos de la forma `<Badge value={...} />` sin prop `color`. Si alguno pasara `color="teal"`, hay que actualizarlo también.

- [ ] **Step 2: Reemplazar las clases de color en `Badge.css`**

Reemplazar las 6 líneas:

```css
.badge-teal   { background: #d1faf4; color: #076766; }
.badge-pink   { background: #fde8f0; color: #b80f54; }
.badge-yellow { background: #fef9c3; color: #854d0e; }
.badge-gray   { background: #f1f5f9; color: #64748b; }
.badge-red    { background: #fee2e2; color: #991b1b; }
.badge-blue   { background: #dbeafe; color: #1e40af; }
```

por:

```css
/* Escala semántica: comunica el estado del dato, nunca la marca. */
.badge-ok     { background: var(--estado-ok-bg);     color: var(--estado-ok); }
.badge-espera { background: var(--estado-espera-bg); color: var(--estado-espera); }
.badge-neutro { background: var(--estado-neutro-bg); color: var(--estado-neutro); }
.badge-baja   { background: var(--estado-baja-bg);   color: var(--estado-baja); }

/* Tipo de operación: no es un estado, se distingue por la etiqueta. */
.badge-operacion { background: var(--petrol); color: var(--white); }
```

- [ ] **Step 3: Actualizar el tipo y el mapa en `Badge.tsx`**

Reemplazar:

```tsx
type Color = 'teal' | 'pink' | 'yellow' | 'gray' | 'red' | 'blue'

const colorMap: Record<string, Color> = {
  // estado_comercial
  disponible: 'teal',
  reservada:  'pink',
  cerrada:    'gray',
  baja:       'red',
  // tipo_operacion
  venta:      'pink',
  alquiler:   'blue',
  temporal:   'yellow',
  // estado_publicacion
  activa:     'teal',
  pausada:    'yellow',
  eliminada:  'red',
}
```

por:

```tsx
type Color = 'ok' | 'espera' | 'neutro' | 'baja' | 'operacion'

const colorMap: Record<string, Color> = {
  // estado_comercial
  disponible: 'ok',
  reservada:  'espera',
  cerrada:    'neutro',
  baja:       'baja',
  // tipo_operacion — todas en petróleo: el tipo lo dice la etiqueta, no el color
  venta:      'operacion',
  alquiler:   'operacion',
  temporal:   'operacion',
  // estado_publicacion
  activa:     'ok',
  pausada:    'espera',
  eliminada:  'baja',
}
```

- [ ] **Step 4: Corregir el fallback**

En la línea:

```tsx
  const c = color ?? colorMap[value] ?? 'gray'
```

reemplazar `'gray'` por `'neutro'`:

```tsx
  const c = color ?? colorMap[value] ?? 'neutro'
```

Este fallback es el que usan los tipos de propiedad (`casa`, `depto`, `terreno`…), que no están en `colorMap`.

- [ ] **Step 5: Build**

```bash
cd client && npm run build
```

Esperado: `✓ built in ...`. Si `tsc` falla con "Type '\"teal\"' is not assignable to type 'Color'", quedó un call site pasando el valor viejo — corregirlo.

- [ ] **Step 6: Revisión visual**

```bash
cd client && npm run dev
```

Ir a `http://localhost:5173/admin/propiedades`. En la tabla: la columna Operación muestra pastillas petróleo sólidas, la columna Estado muestra verde apagado para Disponible y ámbar para Reservada, y la columna Tipo muestra gris neutro.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/Badge.css client/src/components/Badge.tsx
git commit -m "paleta: separar escala semántica de estados del acento de marca"
```

---

### Task 6: Escala semántica en StatTile

**Files:**
- Modify: `client/src/components/StatTile.css:3,25-26`
- Modify: `client/src/components/StatTile.tsx:6`
- Modify: `client/src/pages/admin/Dashboard.tsx:28-29`
- Modify: `client/src/pages/admin/propiedades/Lista.tsx:84-85`

**Interfaces:**
- Consumes: `--line`, `--estado-ok`, `--estado-espera` (Tarea 1).
- Produces: la prop `tono?: 'ok' | 'espera'` de `StatTile`. Los cuatro call sites se actualizan en esta misma tarea; no queda ninguno pendiente.

- [ ] **Step 1: Confirmar los call sites**

```bash
grep -rn "StatTile label" client/src --include=*.tsx
```

Esperado: 6 resultados — 3 en `Dashboard.tsx`, 3 en `Lista.tsx`. Cuatro de ellos pasan `tono`.

- [ ] **Step 2: Actualizar `StatTile.css`**

Reemplazar:

```css
  border: 1px solid var(--gray);
```

por:

```css
  border: 1px solid var(--line);
```

Y reemplazar las dos últimas líneas:

```css
.stat-tile-valor.tono-teal { color: var(--teal); }
.stat-tile-valor.tono-pink { color: var(--pink); }
```

por:

```css
.stat-tile-valor.tono-ok     { color: var(--estado-ok); }
.stat-tile-valor.tono-espera { color: var(--estado-espera); }
```

- [ ] **Step 3: Actualizar el tipo en `StatTile.tsx`**

Reemplazar:

```tsx
  tono?: 'teal' | 'pink'
```

por:

```tsx
  tono?: 'ok' | 'espera'
```

- [ ] **Step 4: Actualizar los cuatro call sites**

En `client/src/pages/admin/Dashboard.tsx`, reemplazar:

```tsx
        <StatTile label="Disponibles" valor={disponibles} tono="teal" />
        <StatTile label="Reservadas" valor={reservadas} tono="pink" />
```

por:

```tsx
        <StatTile label="Disponibles" valor={disponibles} tono="ok" />
        <StatTile label="Reservadas" valor={reservadas} tono="espera" />
```

En `client/src/pages/admin/propiedades/Lista.tsx`, reemplazar:

```tsx
        <StatTile label="Disponibles" valor={disponibles} tono="teal" />
        <StatTile label="Reservadas" valor={reservadas} tono="pink" />
```

por:

```tsx
        <StatTile label="Disponibles" valor={disponibles} tono="ok" />
        <StatTile label="Reservadas" valor={reservadas} tono="espera" />
```

- [ ] **Step 5: Build**

```bash
cd client && npm run build
```

Esperado: `✓ built in ...`. Un error de `tsc` acá significa que quedó un `tono="teal"` sin actualizar.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/StatTile.css client/src/components/StatTile.tsx client/src/pages/admin/Dashboard.tsx client/src/pages/admin/propiedades/Lista.tsx
git commit -m "paleta: tiles de resumen con escala semántica"
```

---

### Task 7: Migrar PropiedadCard

Acá está el cambio más visible del listado: el badge de operación deja de ser rosa.

**Files:**
- Modify: `client/src/components/PropiedadCard.css:7,22,37,52,93,94,101`

**Interfaces:**
- Consumes: `--line`, `--bone`, `--petrol` (Tarea 1).

- [ ] **Step 1: Ver lo que hay**

```bash
grep -n "var(--gray)\|var(--pink)\|var(--teal)\|#d1d5db" client/src/components/PropiedadCard.css
```

Esperado: 7 líneas.

- [ ] **Step 2: Aplicar los reemplazos**

| Selector | Antes | Después |
|---|---|---|
| `.prop-card` | `border: 1px solid var(--gray);` | `border: 1px solid var(--line);` |
| `.prop-card-img` | `background: var(--gray);` | `background: var(--bone);` |
| `.prop-card-img-empty` | `background: linear-gradient(135deg, var(--gray) 0%, #d1d5db 100%);` | `background: linear-gradient(135deg, var(--bone) 0%, var(--line) 100%);` |
| `.prop-card-badge` | `background: var(--pink);` | `background: var(--petrol);` |
| `.prop-card-specs` | `border-top: 1px solid var(--gray);` | `border-top: 1px solid var(--line);` |
| `.prop-card-specs` | `border-bottom: 1px solid var(--gray);` | `border-bottom: 1px solid var(--line);` |
| `.prop-card-precio` | `color: var(--teal);` | `color: var(--petrol);` |

- [ ] **Step 3: Verificar**

```bash
grep -n "var(--gray)\|var(--pink)\|var(--teal)\|#d1d5db" client/src/components/PropiedadCard.css
```

Esperado: sin resultados.

- [ ] **Step 4: Build y revisión visual**

```bash
cd client && npm run build && npm run dev
```

Ir a `http://localhost:5173/propiedades`. Las cards muestran el badge de operación en petróleo sólido sobre la foto y el precio en serif petróleo. Con varias cards juntas la grilla se ve calmada, sin repetición de rosa.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/PropiedadCard.css
git commit -m "paleta: migrar card de propiedad"
```

---

### Task 8: Migrar la ficha de detalle

Acá está el cuarto uso de magenta: el botón de WhatsApp.

**Files:**
- Modify: `client/src/pages/public/Detalle.css` (líneas 1, 3, 6, 8, 26, 35, 44, 51, 56, 80, 92, 93, 96, 100, 104, 110, 114, 123-126, 128, 131, 134-136)

**Interfaces:**
- Consumes: `--bone`, `--line`, `--petrol`, `--petrol-deep`, `--magenta`, `--magenta-deep`, `--estado-baja` (Tarea 1).

- [ ] **Step 1: Ver lo que hay**

```bash
grep -n "var(--gray)\|var(--pink\|var(--teal\|#f8f9fb\|#dc2626\|#d1d5db\|rgba(5, 78, 78" client/src/pages/public/Detalle.css
```

Esperado: 26 líneas.

- [ ] **Step 2: Aplicar el uso de magenta**

| Selector | Antes | Después |
|---|---|---|
| `.detalle-btn-wsp` | `background: var(--pink);` | `background: var(--magenta);` |
| `.detalle-btn-wsp:hover` | `background: var(--pink-dark);` | `background: var(--magenta-deep);` |

- [ ] **Step 3: Aplicar el resto de los reemplazos**

| Selector | Antes | Después |
|---|---|---|
| `.detalle-page` | `background: #f8f9fb;` | `background: var(--bone);` |
| `.detalle-error` | `color: #dc2626;` | `color: var(--estado-baja);` |
| `.detalle-breadcrumb` | `border-bottom: 1px solid var(--gray);` | `border-bottom: 1px solid var(--line);` |
| `.detalle-breadcrumb a` | `color: var(--teal);` | `color: var(--petrol);` |
| `.detalle-gal-principal` | `background: var(--gray) center / cover no-repeat;` | `background: var(--bone) center / cover no-repeat;` |
| `.detalle-gal-thumb` | `background: var(--gray) center / cover no-repeat;` | `background: var(--bone) center / cover no-repeat;` |
| `.detalle-img-empty` | `linear-gradient(135deg, var(--gray) 0%, #d1d5db 100%)` | `linear-gradient(135deg, var(--bone) 0%, var(--line) 100%)` |
| `.detalle-badge` (línea 56) | `background: var(--pink);` | `background: var(--petrol);` |
| `.detalle-badge-inline` (línea 80) | `background: var(--pink);` | `background: var(--petrol);` |
| `.detalle-specs` | `border-top: 1px solid var(--gray);` | `border-top: 1px solid var(--line);` |
| `.detalle-specs` | `border-bottom: 1px solid var(--gray);` | `border-bottom: 1px solid var(--line);` |
| `.detalle-spec .v` | `color: var(--teal);` | `color: var(--petrol);` |
| `.detalle-seccion-titulo` | `color: var(--teal);` | `color: var(--petrol);` |
| `.detalle-caract-item::before` | `background: var(--pink);` | `background: var(--petrol);` |
| `.detalle-aside` | `border: 1px solid var(--gray);` | `border: 1px solid var(--line);` |
| `.detalle-precio` | `color: var(--teal);` | `color: var(--petrol);` |
| `.detalle-btn-visita` | `color: var(--teal); border: 1px solid var(--teal);` | `color: var(--petrol); border: 1px solid var(--petrol);` |
| `.detalle-btn-visita:hover` | `background: var(--teal);` | `background: var(--petrol);` |
| `.detalle-form` | `border-top: 1px solid var(--gray);` | `border-top: 1px solid var(--line);` |
| `.detalle-form input, .detalle-form textarea` | `border: 1px solid var(--gray);` | `border: 1px solid var(--line);` |
| `.detalle-form input:focus` | `border-color: var(--teal);` | `border-color: var(--petrol);` |
| `.detalle-btn-enviar` | `background: var(--teal);` | `background: var(--petrol);` |
| `.detalle-btn-enviar:hover` | `background: var(--teal-dark);` | `background: var(--petrol-deep);` |

- [ ] **Step 4: Aplicar el tinte rgba del overlay de la galería**

En el overlay que muestra "+N fotos":

```css
  background: rgba(5, 78, 78, 0.55);
```

pasa a:

```css
  background: rgba(7, 31, 32, 0.55);
```

- [ ] **Step 5: Verificar**

```bash
grep -n "var(--gray)\|var(--pink\|var(--teal\|#f8f9fb\|#dc2626\|#d1d5db\|rgba(5, 78, 78" client/src/pages/public/Detalle.css
```

Esperado: sin resultados.

- [ ] **Step 6: Build y revisión visual**

```bash
cd client && npm run build && npm run dev
```

Entrar a una propiedad desde el listado. Verificar: fondo de página hueso, precio y specs en petróleo, badge de operación petróleo, y **el botón "Consultar por WhatsApp" en magenta** — es el único elemento magenta de la pantalla.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/public/Detalle.css
git commit -m "paleta: migrar ficha de detalle"
```

---

### Task 9: Migrar Listado y Nosotros

**Files:**
- Modify: `client/src/pages/public/Listado.css:8,38,54,65,72,83`
- Modify: `client/src/pages/public/Nosotros.css:10,24,77,95,107,129,137,154,165,171,175,215,216,223`

**Interfaces:**
- Consumes: `--petrol`, `--bone`, `--line`, `--magenta`, `--text-muted`, `--estado-baja` (Tarea 1).

- [ ] **Step 1: Ver lo que hay**

```bash
grep -n "var(--gray)\|var(--pink)\|var(--teal)\|var(--cream)\|var(--green)\|var(--gold-dark)\|#f8f9fb\|#dc2626\|rgba(194\|rgba(7, 103" client/src/pages/public/Listado.css client/src/pages/public/Nosotros.css
```

Esperado: 20 líneas.

- [ ] **Step 2: Migrar `Listado.css`**

| Selector | Antes | Después |
|---|---|---|
| `.listado-hero` | `background: var(--teal);` | `background: var(--petrol);` |
| `.listado-filtros-wrap` | `border-bottom: 1px solid var(--gray);` | `border-bottom: 1px solid var(--line);` |
| `.listado-filtros input` | `border: 1px solid var(--gray);` | `border: 1px solid var(--line);` |
| `.listado-filtros select:focus, .listado-filtros input:focus` | `border-color: var(--teal);` | `border-color: var(--petrol);` |
| `.listado-body` | `background: #f8f9fb;` | `background: var(--bone);` |
| `.listado-error` | `color: #dc2626;` | `color: var(--estado-baja);` |

- [ ] **Step 3: Migrar `Nosotros.css`**

| Selector | Antes | Después |
|---|---|---|
| `.nosotros-hero` | `background: var(--teal);` | `background: var(--petrol);` |
| `.nosotros-historia-texto h2` | `color: var(--teal);` | `color: var(--petrol);` |
| `.nosotros-historia-foto` | `background: var(--gray) center / cover no-repeat;` | `background: var(--bone) center / cover no-repeat;` |
| `.nosotros-cifras` | `background: var(--cream);` | `background: var(--bone);` |
| `.nosotros-cifra-valor` | `color: var(--green);` | `color: var(--petrol);` |
| `.nosotros-cifra-label` | `color: var(--gold-dark);` | `color: var(--text-muted);` |
| `.nosotros-valor-card` | `border: 1px solid var(--gray);` | `border: 1px solid var(--line);` |
| `.nosotros-valor-card::before` | `background: var(--teal);` | `background: var(--petrol);` |
| `.nosotros-valor-card:hover::before` | `background: var(--pink);` | `background: var(--magenta);` |
| `.nosotros-persona-foto` | `background: var(--cream);` | `background: var(--bone);` |
| `.nosotros-persona-foto` | `border: 1px solid var(--gray);` | `border: 1px solid var(--line);` |
| `.nosotros-persona h3` | `color: var(--teal);` | `color: var(--petrol);` |

En `.nosotros-hero::before`:

```css
  background: rgba(194, 168, 120, 0.12);
```

pasa a:

```css
  background: rgba(232, 239, 239, 0.10);
```

En `.nosotros-valor-card:hover`:

```css
  box-shadow: 0 10px 36px rgba(7, 103, 102, 0.1);
```

pasa a:

```css
  box-shadow: 0 10px 36px rgba(14, 58, 59, 0.1);
```

- [ ] **Step 4: Verificar**

```bash
grep -n "var(--gray)\|var(--pink)\|var(--teal)\|var(--cream)\|var(--green)\|var(--gold-dark)\|#f8f9fb\|#dc2626\|rgba(194\|rgba(7, 103" client/src/pages/public/Listado.css client/src/pages/public/Nosotros.css
```

Esperado: sin resultados.

- [ ] **Step 5: Build y revisión visual**

```bash
cd client && npm run build && npm run dev
```

Revisar `/propiedades` y `/nosotros`. En Nosotros: hero petróleo, franja de cifras en hueso, y las tarjetas de "Cómo trabajamos" con la línea superior magenta **solo** en hover.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/public/Listado.css client/src/pages/public/Nosotros.css
git commit -m "paleta: migrar listado y nosotros"
```

---

### Task 10: Migrar el panel admin

Acá está el quinto y último uso de magenta: el ítem activo del sidebar. También se elimina `.btn-teal`, que es CSS muerto.

**Files:**
- Modify: `client/src/layouts/AdminLayout.css:11,71,101,119,124,142-176`
- Modify: `client/src/pages/admin/propiedades/Lista.css:26,36,46,57,58,74,81,98`
- Modify: `client/src/pages/admin/propiedades/Formulario.css:13,15,50,61,74,75,101,102,123,138,154,163,164`
- Modify: `client/src/pages/admin/propiedades/Formulario.tsx:354`
- Modify: `client/src/pages/admin/propiedades/Lista.tsx:77`

**Interfaces:**
- Consumes: `--petrol`, `--petrol-deep`, `--petrol-soft`, `--magenta`, `--magenta-deep`, `--line`, `--bone`, `--white`, `--estado-baja`, `--estado-baja-bg` (Tarea 1).
- Produces: la clase CSS `.btn-magenta` en reemplazo de `.btn-pink`. La clase `.btn-teal` deja de existir.

- [ ] **Step 1: Confirmar que `.btn-teal` no se usa**

```bash
grep -rn "btn-teal" client/src --include=*.tsx
```

Esperado: sin resultados. Eso confirma que es CSS muerto y se puede borrar. **Si aparece algún resultado, no borrarla**: migrarla a `--petrol` como cualquier otra regla y anotarlo al reportar la tarea.

- [ ] **Step 2: Migrar `AdminLayout.css`**

| Selector | Antes | Después |
|---|---|---|
| `.admin-sidebar` | `background: var(--teal-dark);` | `background: var(--petrol-deep);` |
| `.admin-nav-item.active` | `background: var(--pink);` | `background: var(--magenta);` |
| `.admin-main` | `background: #f8f9fb;` | `background: var(--bone);` |
| `.admin-page-header h1` | `color: var(--teal);` | `color: var(--petrol);` |
| `.admin-card` | `border: 1px solid var(--gray);` | `border: 1px solid var(--line);` |

- [ ] **Step 3: Reemplazar el bloque de botones de `AdminLayout.css`**

Reemplazar:

```css
.btn-teal {
  background: var(--teal);
  color: var(--white);
}

.btn-teal:hover { background: var(--teal-dark); }

.btn-pink {
  background: var(--pink);
  color: var(--white);
}

.btn-pink:hover { background: var(--pink-dark); }

.btn-outline {
  background: transparent;
  color: var(--teal);
  border: 1px solid var(--teal);
}

.btn-outline:hover {
  background: var(--teal);
  color: var(--white);
}

.btn-danger {
  background: transparent;
  color: #dc2626;
  border: 1px solid #dc2626;
}

.btn-danger:hover {
  background: #dc2626;
  color: var(--white);
}
```

por:

```css
/* Acción primaria del admin — uno de los 5 usos de magenta del sistema. */
.btn-magenta {
  background: var(--magenta);
  color: var(--white);
}

.btn-magenta:hover { background: var(--magenta-deep); }

.btn-outline {
  background: transparent;
  color: var(--petrol);
  border: 1px solid var(--petrol);
}

.btn-outline:hover {
  background: var(--petrol);
  color: var(--white);
}

.btn-danger {
  background: transparent;
  color: var(--estado-baja);
  border: 1px solid var(--estado-baja);
}

.btn-danger:hover {
  background: var(--estado-baja);
  color: var(--white);
}
```

`.btn-teal` se elimina por no tener consumidores.

- [ ] **Step 4: Actualizar los dos usos de `.btn-pink` en TSX**

En `client/src/pages/admin/propiedades/Formulario.tsx`:

```tsx
          <button type="submit" className="btn btn-pink" disabled={saving}>
```

pasa a:

```tsx
          <button type="submit" className="btn btn-magenta" disabled={saving}>
```

En `client/src/pages/admin/propiedades/Lista.tsx`:

```tsx
        <Link to="/admin/propiedades/nueva" className="btn btn-pink">
```

pasa a:

```tsx
        <Link to="/admin/propiedades/nueva" className="btn btn-magenta">
```

- [ ] **Step 5: Migrar `Lista.css` del admin**

| Selector | Antes | Después |
|---|---|---|
| `.filtros-bar input` | `border: 1px solid var(--gray);` | `border: 1px solid var(--line);` |
| `.filtros-bar select:focus, .filtros-bar input:focus` | `border-color: var(--teal);` | `border-color: var(--petrol);` |
| `.lista-error` | `color: #dc2626;` | `color: var(--estado-baja);` |
| `.tabla thead` | `background: #f8f9fb;` | `background: var(--bone);` |
| `.tabla thead` | `border-bottom: 2px solid var(--gray);` | `border-bottom: 2px solid var(--line);` |
| `.tabla td` | `border-bottom: 1px solid var(--gray);` | `border-bottom: 1px solid var(--line);` |
| `.tabla tbody tr:hover` | `background: #f8f9fb;` | `background: var(--petrol-soft);` |
| `.tabla-thumb-empty` | `background: var(--gray);` | `background: var(--bone);` |

El hover de fila pasa a `--petrol-soft` y no a `--bone`: el fondo del `thead` ya es hueso, y si el hover fuera del mismo color no se distinguiría.

- [ ] **Step 6: Migrar `Formulario.css`**

| Selector | Antes | Después |
|---|---|---|
| `.form-section-title` | `color: var(--teal);` | `color: var(--petrol);` |
| `.form-section-title` | `border-bottom: 1px solid var(--gray);` | `border-bottom: 1px solid var(--line);` |
| `.form-field input, select, textarea` | `border: 1px solid var(--gray);` | `border: 1px solid var(--line);` |
| `.form-field input:focus, select:focus, textarea:focus` | `border-color: var(--teal);` | `border-color: var(--petrol);` |
| `.form-error` | `background: #fee2e2;` | `background: var(--estado-baja-bg);` |
| `.form-error` | `color: #991b1b;` | `color: var(--estado-baja);` |
| `.foto-item` | `border: 1px solid var(--gray);` | `border: 1px solid var(--line);` |
| `.foto-item` | `background: var(--gray);` | `background: var(--bone);` |
| `.foto-principal` | `background: var(--teal);` | `background: var(--petrol);` |
| `.foto-quitar` | `color: #fff;` | `color: var(--white);` |
| `.foto-agregar` | `border: 1.5px dashed var(--gray);` | `border: 1.5px dashed var(--line);` |
| `.foto-agregar:hover` | `border-color: var(--teal);` | `border-color: var(--petrol);` |
| `.foto-agregar:hover` | `color: var(--teal);` | `color: var(--petrol);` |

- [ ] **Step 7: Verificar los tres archivos**

```bash
grep -n "var(--gray)\|var(--pink\|var(--teal\|#f8f9fb\|#dc2626\|#fee2e2\|#991b1b\|#fff;" client/src/layouts/AdminLayout.css client/src/pages/admin/propiedades/Lista.css client/src/pages/admin/propiedades/Formulario.css
grep -rn "btn-pink" client/src
```

Esperado: sin resultados en ninguno de los dos.

- [ ] **Step 8: Build y revisión visual**

```bash
cd client && npm run build && npm run dev
```

Ir a `http://localhost:5173/admin/propiedades`. Verificar: sidebar petróleo profundo con el ítem activo en magenta, botón "+ Nueva propiedad" en magenta, fondo de contenido hueso, hover de fila apenas verdoso, y el botón de eliminar en rojo apagado.

- [ ] **Step 9: Commit**

```bash
git add client/src/layouts/AdminLayout.css client/src/pages/admin/propiedades/Lista.css client/src/pages/admin/propiedades/Formulario.css client/src/pages/admin/propiedades/Formulario.tsx client/src/pages/admin/propiedades/Lista.tsx
git commit -m "paleta: migrar panel admin y renombrar btn-pink a btn-magenta"
```

---

### Task 11: Eliminar los tokens viejos y verificar el criterio de terminado

**Files:**
- Modify: `client/src/index.css:9-24`

**Interfaces:**
- Consumes: nada nuevo. Esta tarea solo borra.

- [ ] **Step 1: Confirmar que ya no queda ninguna referencia**

```bash
grep -rn "var(--pink\|var(--teal\|var(--green\|var(--gold\|var(--cream\|var(--gray)" client/src
```

Esperado: sin resultados. **Si aparece alguno, esta tarea no puede avanzar** — hay que volver a la tarea del archivo correspondiente y terminarla.

- [ ] **Step 2: Borrar el bloque de tokens viejos**

En `client/src/index.css`, eliminar por completo estas líneas:

```css
  /* Identidad: verde bosque + dorado (rediseño 2026) */
  --green:      #1f3d34;
  --green-dark: #152a24;
  --gold:       #c2a878;
  --gold-dark:  #a98c5f;
  --cream:      #ece4d3;

  /* Alias de compatibilidad: el sitio se rediseñó de teal/rosa a verde/dorado.
     Se conservan los nombres para no reescribir cada regla del sistema.
     TEMPORAL: se eliminan en la última tarea de la migración de paleta. */
  --pink:       var(--gold);
  --pink-dark:  var(--gold-dark);
  --teal:       var(--green);
  --teal-dark:  var(--green-dark);
  --gray:       #E3E5EA;
```

El bloque `:root` debe arrancar directamente con el comentario `/* ── Paleta "Petróleo y tinta" ── ... */`.

- [ ] **Step 3: Verificar que no quedan hexadecimales fuera de `:root`**

```bash
grep -rn "#[0-9a-fA-F]\{6\}\|#[0-9a-fA-F]\{3\}[^0-9a-fA-F]" client/src --include=*.css | grep -v "^client/src/index.css:[1-6][0-9]:"
```

Esperado: sin resultados. (El filtro excluye las líneas del bloque `:root`, que sí deben tener hexadecimales.)

- [ ] **Step 4: Verificar que no quedan rgba de marca**

```bash
grep -rn "rgba(" client/src --include=*.css | grep -v "rgba(255\|rgba(0, *0, *0\|rgba(17, 24, 39\|rgba(14, 58, 59\|rgba(7, 31, 32\|rgba(232, 239, 239\|rgba(247, 246, 244"
```

Esperado: sin resultados.

- [ ] **Step 5: Build final**

```bash
cd client && npm run build
```

Esperado: `✓ built in ...` sin errores ni warnings nuevos.

- [ ] **Step 6: Revisión visual de las seis pantallas**

```bash
cd client && npm run dev
```

Recorrer y confirmar que ninguna tiene restos de verde/dorado ni rosa fuera de los 5 lugares permitidos:

1. `/` — Home
2. `/propiedades` — Listado
3. `/propiedades/:id` — Detalle (entrar desde el listado)
4. `/nosotros` — Nosotros
5. `/admin` — Dashboard
6. `/admin/propiedades` — Lista admin

- [ ] **Step 7: Commit**

```bash
git add client/src/index.css
git commit -m "paleta: eliminar tokens de la paleta anterior"
```

---

## Notas de alcance

**Fuera de alcance** (spec §7): tipografías, estructura, layout, modo oscuro, y el logo en negativo para el footer — este último requiere un archivo de imagen que todavía no existe.

**Deuda conocida que este plan NO resuelve:** el footer sigue mostrando el texto "Mambo Group" en serif en vez del logo, porque no hay una versión en negativo del PNG. Queda para cuando exista el archivo.
