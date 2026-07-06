# Rediseño del frontend — Sistema editorial refinado

**Fecha:** 2026-07-06
**Estado:** Diseño aprobado (mockups validados con companion visual)
**Alcance:** Sistema unificado — sitio público + panel admin

---

## 1. Objetivo y filosofía

Elevar el frontend de Mambo de "pantallas lindas sueltas" a un **sistema de diseño coherente**, manteniendo intacta la paleta y la identidad de marca existentes. La dirección es **editorial refinado**: evolución, no ruptura. Se profundiza la estética boutique/revista que ya existe (serif protagonista, mucho aire, foto grande, lujo sobrio) y se sube el **panel admin** al mismo nivel de terminación que el sitio público.

**Principios:**
- Misma paleta y tipografías (ver §2). El esfuerzo va en estructura, jerarquía y consistencia, no en colores nuevos.
- Un solo lenguaje visual compartido entre público y admin (misma marca, distinta densidad).
- El **card de propiedad** y el **Home** son las piezas de mayor impacto; el admin es la herramienta diaria y prioriza velocidad de escaneo.

## 2. Fundamentos del sistema (design tokens)

Se conservan tal cual están hoy en [client/src/index.css](client/src/index.css):

| Token | Valor | Uso |
|-------|-------|-----|
| `--pink` | `#DE1267` | Acento primario, CTAs, estado activo, badges de operación |
| `--pink-dark` | `#b80f54` | Hover de rosa |
| `--teal` | `#076766` | Color de marca, titulares de sección, precios, fondo de hero |
| `--teal-dark` | `#054e4e` | Sidebar admin, footer, hover de teal |
| `--gray` | `#E3E5EA` | Bordes, líneas divisorias, fondos sutiles |
| `--text` | `#111827` | Texto principal |
| `--text-muted` | `#6b7280` | Texto secundario |
| `--font-serif` | Cormorant Garamond | Titulares, precios, números de categoría |
| `--font-sans` | Inter | Cuerpo, labels, navegación, datos |

**A formalizar como parte del sistema** (hoy inconsistentes/ad-hoc):
- **Escala de espaciado** consistente (ej: 4/8/12/16/24/32/48/64px) aplicada en todo el frontend.
- **Escala tipográfica** definida (tamaños de h1/h2/h3/body/label con line-height y letter-spacing por rol).
- **Radios de borde** unificados (cards ~10px, botones ~2–4px, pills ~20px).
- **Sombras** unificadas (una sombra suave de reposo y una de hover teal-tintada: `0 14px 38px rgba(7,103,102,.13)`).

> Nota: el archivo [client/src/style.css](client/src/style.css) es scaffold sobrante de Vite (paleta violeta, no relacionado). Se elimina o vacía durante la implementación.

## 3. Sitio público

### 3.1 Home — composición

Orden de secciones validado (de arriba hacia abajo):

1. **Navbar** fija con blur — logo Mambo (serif) + links + botón Admin (teal).
2. **Hero "Split editorial"** (ver §3.2).
3. **Franja de valores** — fondo gris, texto centrado "Decisión · Orden · Claridad".
4. **Propiedades destacadas** *(sección nueva)* — franja con 3 propiedades **reales traídas de la API**, usando el card estándar (§3.4). Encabezado con eyebrow ("Selección") + título serif teal + link "Ver todas →". Es el cambio de mayor valor: el Home pasa a mostrar inventario real, no solo categorías abstractas.
5. **Categorías** — las 4 tarjetas de categoría (Lotes/Casas/Inversiones/Oportunidades) refinadas, sobre fondo gris suave.
6. **CTA** — sección rosa "Asesoramiento personalizado" con botón blanco.
7. **Footer** — teal oscuro.

### 3.2 Hero "Split editorial" (opción A)

Layout de dos columnas:
- **Izquierda (panel teal):** eyebrow con barrita rosa ("Tucumán, Argentina") → titular serif grande ("Oportunidades *inmobiliarias*", con la palabra en itálica y opacidad reducida) → subtítulo en mayúsculas espaciadas ("Lotes · Casas · Inversiones") → botón rosa "Ver propiedades". Círculo decorativo rosa sutil en la esquina.
- **Derecha (~42%):** **imagen de una casa, limpia, a sangre.** Sin tarjeta de precio ni overlay encima — solo la fotografía.
- Responsive: en mobile las columnas se apilan (texto arriba, foto abajo).

### 3.3 Ficha de detalle de propiedad

- **Breadcrumb** (Propiedades › Casas › [título]).
- **Galería tipo mosaico** *(decisión: mosaico, no carrusel)*: 1 foto grande a la izquierda + 4 miniaturas en grilla 2×2 a la derecha; la última muestra overlay "+N fotos" para abrir el resto.
- **Cuerpo en dos columnas:**
  - **Principal (izquierda):** badge de operación → título serif → ubicación → **specs destacados** (dormitorios, baños, m² cubiertos, m² totales) en serif teal grande dentro de una banda con líneas divisorias → descripción → características (grilla de bullets con punto rosa).
  - **Aside (derecha, sticky):** tarjeta con sombra suave que sigue el scroll — precio en serif teal grande → botón rosa **"Consultar por WhatsApp"** → botón outline **"Solicitar visita"** (formulario) → datos del asesor (avatar con iniciales + nombre + rol). *(Decisión: contacto por ambos canales — WhatsApp directo y formulario.)*
- Responsive: el aside pasa a fluir debajo del contenido en pantallas chicas.

### 3.4 Card de propiedad (opción A — "Editorial clean")

El componente que se repite en Destacadas y en todo el Listado.

- Contenedor con **borde gris fino** y radio ~10px; hover eleva con sombra teal-tintada.
- **Imagen** arriba (~170px) con **badge de operación** (rosa, mayúsculas) arriba a la izquierda.
- **Cuerpo:** tipo de propiedad (label mayúscula muted) → título en **serif** → ubicación muted.
- **Stats** (dorm./baños/m²) en una banda separada por **líneas finas** arriba y abajo.
- **Precio** abajo, en **serif teal** prominente. Formato: `U$D 185.000` / `$ 320.000` según moneda; "Consultar" si es null.

### 3.5 Listado

- Hero corto de sección ("Propiedades" + título serif).
- Barra de **filtros** (operación, tipo, ciudad) — ya existe funcionalmente; se re-estiliza acorde al sistema.
- Grilla responsive del card estándar (§3.4) con contador de resultados y estados de carga/error/vacío.

## 4. Panel admin

Misma marca que el público, densidad orientada al trabajo diario.

- **Sidebar (teal oscuro):** logo Mambo + "Admin" → navegación **agrupada por secciones** (Inventario: Propiedades, Publicaciones · CRM: Contactos, Consultas) → ítem activo en **rosa** → footer con usuario + cerrar sesión.
- **Área principal (fondo gris muy claro):**
  - **Header** con eyebrow + título serif teal + botón de acción primaria (rosa, ej. "+ Nueva propiedad").
  - **Tiles de resumen** (fila de 4): Total, Disponibles (teal), Reservadas (rosa), Publicadas — con delta opcional ("+6 este mes").
  - **Panel de tabla** con borde y radio: barra superior de **buscador + filtros**; tabla densa con **miniatura + título + subtítulo** por fila, columnas (Operación, Precio en serif teal, Estado en **pill de color**, Publicada) y acciones al final. Pills: Disponible (teal), Reservada (rosa), Borrador (gris).
- **Formularios** (alta/edición de propiedades y publicaciones): se re-estilizan con los mismos tokens (inputs, labels, botones `.btn-teal`/`.btn-pink`/`.btn-outline` ya existentes en [client/src/layouts/AdminLayout.css](client/src/layouts/AdminLayout.css)).

## 5. Arquitectura de componentes

Objetivo: extraer las piezas repetidas a componentes reutilizables en lugar de estilar cada página por separado.

Componentes/estilos compartidos a crear o consolidar:
- `PropiedadCard` — card estándar (§3.4), usado en Home destacadas y Listado.
- Primitivas de UI: `Badge`/`Pill` (ya existe [client/src/components/Badge.tsx](client/src/components/Badge.tsx) — extender), botones, tiles de stat, banda de specs.
- Estructura CSS: hoy los estilos viven en `index.css` (público) y CSS por página. Se mantiene el enfoque de CSS plano con custom properties, consolidando tokens y utilidades compartidas; no se introduce un framework CSS nuevo.

## 6. Datos y comportamiento

- **Propiedades destacadas (Home):** requiere traer un subconjunto de propiedades. Se usa el endpoint de listado existente (`propiedadesApi.listar`) con `estado_comercial: 'disponible'` y un límite; criterio de "destacada" a definir (por ahora: primeras N disponibles, o flag `destacada` si el backend lo soporta — **confirmar en implementación**).
- **Galería de detalle:** usa `medios` de la propiedad (ya presentes en los tipos); la miniatura "+N" abre un lightbox/visor con el resto.
- **Contacto:** WhatsApp abre `wa.me` con mensaje prellenado (título + URL de la propiedad); "Solicitar visita" abre un formulario (endpoint de consultas a definir; si no existe aún, queda como stub visual que no rompe el flujo).
- Filtros del Listado y ABM del admin **ya funcionan** contra la API; el rediseño es visual y no altera la lógica de datos existente.

## 7. Fuera de alcance (YAGNI)

- **Dark mode** — no se implementa en esta iteración.
- Nuevos módulos CRM (contactos/consultas como features completas): en el admin aparecen en la navegación como estructura, pero su implementación funcional es trabajo aparte.
- Cambios de paleta o de tipografías.
- Migración a un framework de UI/CSS (Tailwind, MUI, etc.).

## 8. Criterios de éxito

- Public y admin comparten tokens, espaciado y componentes; se ve un solo sistema.
- El Home muestra propiedades reales en "Destacadas".
- El card de propiedad es un componente reutilizado (no CSS duplicado por página).
- La ficha de detalle tiene galería mosaico, specs destacados y contacto sticky (WhatsApp + formulario).
- El admin tiene sidebar agrupada, tiles de resumen y tabla densa con pills de estado.
- Se mantiene la paleta y la identidad; nada se ve "de otra marca".

## 9. Referencias

Mockups validados (persistidos localmente, no versionados):
`.superpowers/brainstorm/1462-1783360449/content/` — `home-hero.html`, `home-full.html`, `property-card.html`, `detalle.html`, `admin.html`.
