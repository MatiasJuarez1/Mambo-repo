# Rediseño del frontend (sistema editorial refinado) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevar el frontend de Mambo a un sistema de diseño coherente (público + admin) manteniendo la paleta e identidad actuales, según [docs/superpowers/specs/2026-07-06-frontend-redesign-editorial-design.md](../specs/2026-07-06-frontend-redesign-editorial-design.md).

**Architecture:** Frontend React 19 + Vite 6 + react-router 7, CSS plano con custom properties. Se consolidan design tokens en `index.css`, se extraen componentes reutilizables (`PropiedadCard`, `StatTile`) y helpers compartidos (`lib/propiedad.ts`), y se re-estilizan las páginas existentes. No se cambia la lógica de datos ni se agregan dependencias.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, react-router-dom 7. Sin librería de UI/CSS nueva. Sin runner de tests (no existe en el proyecto).

## Global Constraints

- **Idioma:** todo el código, comentarios y texto de UI en **español** (coincidir con el codebase).
- **Paleta y tipografías fijas:** usar solo las custom properties existentes en `client/src/index.css` (`--pink #DE1267`, `--pink-dark #b80f54`, `--teal #076766`, `--teal-dark #054e4e`, `--gray #E3E5EA`, `--text #111827`, `--text-muted #6b7280`, `--font-serif` Cormorant Garamond, `--font-sans` Inter). **No** introducir colores ni fuentes nuevas.
- **Sin dependencias nuevas:** no correr `npm install <pkg>`. Solo React/router ya presentes.
- **Todos los comandos se corren desde `client/`** (ahí vive `package.json`).
- **Modelo de verificación (no hay tests unitarios):** este es un rediseño visual sin infraestructura de testing. La verificación de cada tarea es: (1) `npm run build` compila sin errores de TypeScript ni de Vite, y (2) verificación visual en `npm run dev` de la(s) ruta(s) afectada(s). No inventar un runner de tests ni instalar Vitest.
- **Commits frecuentes:** un commit al final de cada tarea, en español, prefijo `rediseño:`.
- **Rama:** trabajar en la rama actual `integracion-postgres` (o la worktree provista). No mergear a `main` en este plan.

---

## File Structure

**Crear:**
- `client/src/lib/propiedad.ts` — helpers compartidos de formato/labels de propiedades (formatPrecio, LABEL_OPERACION, LABEL_TIPO, imagenPrincipal).
- `client/src/components/PropiedadCard.tsx` + `PropiedadCard.css` — card estándar "editorial clean", reusada en Home destacadas y Listado.
- `client/src/config/contacto.ts` — número de WhatsApp y email de contacto + helper de link.
- `client/src/components/StatTile.tsx` + `StatTile.css` — tile de resumen reusado en Dashboard y lista admin.

**Modificar:**
- `client/src/index.css` — tokens de espaciado/tipografía/radio/sombra + utilidades compartidas + hero split + sección destacadas + refinamiento categorías.
- `client/src/pages/public/Home.tsx` — hero con foto limpia + sección "Propiedades destacadas".
- `client/src/pages/public/Listado.tsx` + `Listado.css` — usar `PropiedadCard`, quitar card duplicada.
- `client/src/pages/public/Detalle.tsx` + `Detalle.css` — galería mosaico, banda de specs, aside sticky con WhatsApp + formulario.
- `client/src/layouts/AdminLayout.tsx` + `AdminLayout.css` — navegación agrupada por secciones.
- `client/src/pages/admin/Dashboard.tsx` — tiles de resumen.
- `client/src/pages/admin/propiedades/Lista.tsx` + `Lista.css` — tiles de resumen + buscador + refinamiento de tabla.

**Eliminar:**
- `client/src/style.css` — scaffold sobrante de Vite (paleta violeta, no importado por nadie).

---

## Task 1: Design tokens y utilidades compartidas

Consolidar la base del sistema en `index.css`: escala de espaciado, radios, sombras y clases utilitarias reusadas por todas las páginas. No cambia nada visible todavía; habilita las tareas siguientes.

**Files:**
- Modify: `client/src/index.css` (bloque `:root`, líneas 9-20; y agregar utilidades tras el bloque de `.footer`)

**Interfaces:**
- Produces: custom properties CSS `--space-1..--space-8`, `--radius-sm/md/pill`, `--shadow-card`, `--shadow-hover`; clases `.eyebrow`, `.section-label`, `.u-serif`. Las tareas 2-7 las consumen por nombre.

- [ ] **Step 1: Agregar tokens al bloque `:root`**

En `client/src/index.css`, reemplazar el bloque `:root { ... }` (líneas 9-20) por:

```css
:root {
  --pink:       #DE1267;
  --pink-dark:  #b80f54;
  --teal:       #076766;
  --teal-dark:  #054e4e;
  --gray:       #E3E5EA;
  --white:      #ffffff;
  --text:       #111827;
  --text-muted: #6b7280;
  --font-serif: 'Cormorant Garamond', Georgia, serif;
  --font-sans:  'Inter', system-ui, sans-serif;

  /* Escala de espaciado */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;
  --space-8: 64px;

  /* Radios */
  --radius-sm: 4px;
  --radius-md: 10px;
  --radius-pill: 999px;

  /* Sombras del sistema */
  --shadow-card:  0 2px 14px rgba(17, 24, 39, 0.06);
  --shadow-hover: 0 14px 38px rgba(7, 103, 102, 0.13);
}
```

- [ ] **Step 2: Agregar clases utilitarias al final del archivo**

Al final de `client/src/index.css` (después de la regla `.footer p { ... }`), agregar:

```css
/* ── Utilidades del sistema ──────────────────────────────── */

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  font-family: var(--font-sans);
  font-size: 0.7rem;
  font-weight: 500;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.eyebrow::before {
  content: '';
  display: block;
  width: 2px;
  height: 1.1em;
  background: var(--pink);
}

.section-label {
  font-family: var(--font-sans);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--pink);
}

.u-serif { font-family: var(--font-serif); }
```

- [ ] **Step 3: Verificar build**

Run (desde `client/`): `npm run build`
Expected: compila sin errores; termina con la salida de `vite build` (archivos en `dist/`).

- [ ] **Step 4: Commit**

```bash
git add client/src/index.css
git commit -m "rediseño: tokens de espaciado/radio/sombra y utilidades base"
```

---

## Task 2: Helpers compartidos + componente PropiedadCard

Extraer los helpers duplicados (formato de precio, labels, imagen principal) a `lib/propiedad.ts`, crear el componente `PropiedadCard` con el estilo "editorial clean" aprobado, y hacer que `Listado` lo use en lugar de su card interna.

**Files:**
- Create: `client/src/lib/propiedad.ts`
- Create: `client/src/components/PropiedadCard.tsx`
- Create: `client/src/components/PropiedadCard.css`
- Modify: `client/src/pages/public/Listado.tsx` (quitar helpers y la función `PropiedadCard` interna, importar el componente)
- Modify: `client/src/pages/public/Listado.css` (quitar reglas `.prop-card*` migradas al componente)

**Interfaces:**
- Produces:
  - `lib/propiedad.ts`: `formatPrecio(precio: number | null, moneda: string): string`, `LABEL_OPERACION: Record<TipoOperacion, string>`, `LABEL_TIPO: Record<TipoPropiedad, string>`, `imagenPrincipal(p: PropiedadListItem): string | null`.
  - `components/PropiedadCard.tsx`: `default function PropiedadCard({ propiedad }: { propiedad: PropiedadListItem }): JSX.Element`.
- Consumes: `propiedadesApi`/tipos existentes de `types/propiedad.ts`.

- [ ] **Step 1: Crear `lib/propiedad.ts`**

Crear `client/src/lib/propiedad.ts` con:

```ts
import type {
  PropiedadListItem,
  TipoPropiedad,
  TipoOperacion,
} from '../types/propiedad'

/** Formatea el precio en es-AR según moneda. Devuelve 'Consultar' si es null. */
export function formatPrecio(precio: number | null, moneda: string): string {
  if (precio === null) return 'Consultar'
  const n = precio.toLocaleString('es-AR')
  return moneda === 'USD' ? `U$D ${n}` : `$ ${n}`
}

export const LABEL_OPERACION: Record<TipoOperacion, string> = {
  venta: 'Venta',
  alquiler: 'Alquiler',
  temporal: 'Temporal',
}

export const LABEL_TIPO: Record<TipoPropiedad, string> = {
  casa: 'Casa',
  depto: 'Departamento',
  local: 'Local',
  terreno: 'Terreno',
  oficina: 'Oficina',
  otro: 'Otro',
}

/** URL de la imagen principal (o la primera), o null si no hay medios. */
export function imagenPrincipal(p: PropiedadListItem): string | null {
  const m = p.medios.find(x => x.es_principal) ?? p.medios[0]
  return m?.url ?? null
}
```

- [ ] **Step 2: Crear `PropiedadCard.css`**

Crear `client/src/components/PropiedadCard.css` con:

```css
.prop-card {
  background: var(--white);
  text-decoration: none;
  color: inherit;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--gray);
  border-radius: var(--radius-md);
  overflow: hidden;
  transition: box-shadow 0.25s, transform 0.25s;
}

.prop-card:hover {
  box-shadow: var(--shadow-hover);
  transform: translateY(-4px);
}

.prop-card-img {
  position: relative;
  height: 190px;
  overflow: hidden;
  background: var(--gray);
}

.prop-card-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s ease;
}

.prop-card:hover .prop-card-img img { transform: scale(1.04); }

.prop-card-img-empty {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, var(--gray) 0%, #d1d5db 100%);
}

.prop-card-badge {
  position: absolute;
  top: 0.75rem;
  left: 0.75rem;
  padding: 0.35rem 0.7rem;
  font-family: var(--font-sans);
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--white);
  border-radius: var(--radius-sm);
  background: var(--pink);
}

.prop-card-body {
  padding: 1.15rem 1.25rem 1.4rem;
  display: flex;
  flex-direction: column;
  flex: 1;
}

.prop-card-tipo {
  font-size: 0.6rem;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.prop-card-titulo {
  font-family: var(--font-serif);
  font-size: 1.3rem;
  font-weight: 600;
  color: var(--text);
  line-height: 1.15;
  margin: 0.35rem 0 0.2rem;
}

.prop-card-loc {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.prop-card-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--text);
  margin: 1rem 0;
  padding: 0.9rem 0;
  border-top: 1px solid var(--gray);
  border-bottom: 1px solid var(--gray);
}

.prop-card-precio {
  font-family: var(--font-serif);
  font-size: 1.4rem;
  font-weight: 600;
  color: var(--teal);
  margin-top: auto;
}
```

- [ ] **Step 3: Crear `PropiedadCard.tsx`**

Crear `client/src/components/PropiedadCard.tsx` con:

```tsx
import { Link } from 'react-router-dom'
import type { PropiedadListItem } from '../types/propiedad'
import { formatPrecio, imagenPrincipal, LABEL_OPERACION, LABEL_TIPO } from '../lib/propiedad'
import './PropiedadCard.css'

export default function PropiedadCard({ propiedad: p }: { propiedad: PropiedadListItem }) {
  const img = imagenPrincipal(p)
  const loc = [p.ubicacion?.ciudad, p.ubicacion?.provincia].filter(Boolean).join(', ')

  return (
    <Link to={`/propiedades/${p.id}`} className="prop-card">
      <div className="prop-card-img">
        {img
          ? <img src={img} alt={p.titulo} loading="lazy" />
          : <div className="prop-card-img-empty" />
        }
        <span className="prop-card-badge">{LABEL_OPERACION[p.tipo_operacion]}</span>
      </div>

      <div className="prop-card-body">
        <p className="prop-card-tipo">{LABEL_TIPO[p.tipo_propiedad]}</p>
        <h3 className="prop-card-titulo">{p.titulo}</h3>
        {loc && <p className="prop-card-loc">{loc}</p>}

        <div className="prop-card-stats">
          {p.dormitorios != null && <span>{p.dormitorios} dorm.</span>}
          {p.banos != null && <span>{p.banos} baño{p.banos !== 1 ? 's' : ''}</span>}
          {p.m2_cubiertos != null && <span>{p.m2_cubiertos} m²</span>}
          {p.m2_totales != null && p.m2_cubiertos == null && <span>{p.m2_totales} m² tot.</span>}
        </div>

        <p className="prop-card-precio">{formatPrecio(p.precio, p.moneda)}</p>
      </div>
    </Link>
  )
}
```

- [ ] **Step 4: Refactorizar `Listado.tsx` para usar el componente**

En `client/src/pages/public/Listado.tsx`:
1. Reemplazar las importaciones de arriba por:

```tsx
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { propiedadesApi } from '../../api/propiedades'
import type { PropiedadListItem } from '../../types/propiedad'
import PropiedadCard from '../../components/PropiedadCard'
import './Listado.css'
```

2. Borrar del archivo los helpers `formatPrecio`, `imagenPrincipal`, `LABEL_OPERACION`, `LABEL_TIPO` (líneas 9-29 del original) y la función `PropiedadCard` interna del final (líneas 144-193 del original).
3. La grilla ya usa `<PropiedadCard key={p.id} propiedad={p} />` — mantener esa llamada tal cual (ahora resuelve al componente importado).

- [ ] **Step 5: Limpiar `Listado.css`**

En `client/src/pages/public/Listado.css`, borrar todas las reglas de card duplicadas ahora en el componente: desde `/* ── Card ─────... */` hasta el final del archivo (bloque `.prop-card` … `.prop-card-precio`, líneas 102-217 del original), **y** las tres reglas `.badge-venta/.badge-alquiler/.badge-temporal` si estuvieran ahí. Conservar todo lo anterior (hero, filtros, cuerpo, grid `.propiedades-grid`).

- [ ] **Step 6: Verificar build**

Run (desde `client/`): `npm run build`
Expected: compila sin errores. No debe quedar ningún import sin usar (TypeScript falla si `Link` u otros quedan huérfanos en `Listado.tsx`).

- [ ] **Step 7: Verificación visual**

Run: `npm run dev`. Abrir `http://localhost:5173/propiedades`.
Expected: la grilla muestra las cards con título en serif, badge rosa arriba-izquierda, stats entre líneas finas y precio en serif teal. Hover eleva la card.

- [ ] **Step 8: Commit**

```bash
git add client/src/lib/propiedad.ts client/src/components/PropiedadCard.tsx client/src/components/PropiedadCard.css client/src/pages/public/Listado.tsx client/src/pages/public/Listado.css
git commit -m "rediseño: componente PropiedadCard reusable + helpers de propiedad"
```

---

## Task 3: Home — hero split editorial + propiedades destacadas

Cambiar el hero a layout de dos columnas (texto teal a la izquierda, foto de casa limpia a la derecha) y agregar la sección "Propiedades destacadas" con datos reales de la API usando `PropiedadCard`.

**Files:**
- Modify: `client/src/index.css` (reemplazar bloque `.hero`, agregar bloque `.destacadas`)
- Modify: `client/src/pages/public/Home.tsx` (markup del hero + nueva sección con fetch)

**Interfaces:**
- Consumes: `PropiedadCard` (Task 2), `propiedadesApi.listar` (existente), tokens (Task 1).
- Nota de datos: "destacadas" = primeras 3 propiedades disponibles (`estado_comercial: 'disponible', limit: 3`). El tipo `PropiedadListItem` no tiene flag `destacada`, así que este es el criterio definitivo.

- [ ] **Step 1: Reemplazar el bloque `.hero` en `index.css`**

En `client/src/index.css`, reemplazar TODO el bloque del hero (desde `/* ── Hero ──... */` hasta el fin de `.hero-sub { ... }`, líneas 112-195 del original) por:

```css
/* ── Hero (split editorial) ─────────────────────────────── */

.hero {
  display: flex;
  min-height: 88vh;
  padding-top: 72px; /* navbar fija */
}

.hero-col-text {
  flex: 1;
  background: var(--teal);
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: var(--space-8) var(--space-7);
  position: relative;
  overflow: hidden;
}

.hero-col-text::before {
  content: '';
  position: absolute;
  top: -140px;
  right: -140px;
  width: 420px;
  height: 420px;
  border-radius: 50%;
  background: rgba(222, 18, 103, 0.10);
  pointer-events: none;
}

.hero-col-photo {
  width: 42%;
  background: var(--gray) center / cover no-repeat;
}

.hero .eyebrow { color: rgba(255, 255, 255, 0.55); margin-bottom: 1.75rem; }

.hero h1 {
  font-family: var(--font-serif);
  font-size: clamp(2.8rem, 5.5vw, 5rem);
  font-weight: 600;
  color: var(--white);
  line-height: 1.04;
  margin-bottom: 1.5rem;
  position: relative;
}

.hero h1 em { font-style: italic; color: rgba(255, 255, 255, 0.72); }

.hero-sub {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.5);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  margin-bottom: 2.5rem;
  position: relative;
}

.hero .btn-primary { position: relative; align-self: flex-start; }

@media (max-width: 860px) {
  .hero { flex-direction: column; min-height: auto; }
  .hero-col-photo { width: 100%; height: 260px; order: 2; }
  .hero-col-text { order: 1; padding: var(--space-7) var(--space-5); }
}
```

- [ ] **Step 2: Agregar el bloque `.destacadas` en `index.css`**

Justo antes del bloque `/* ── Categorías ──... */` en `client/src/index.css`, insertar:

```css
/* ── Propiedades destacadas ─────────────────────────────── */

.destacadas { padding: var(--space-8) var(--space-5); background: var(--white); }

.destacadas-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: var(--space-6);
  gap: 1rem;
}

.destacadas-header h2 {
  font-family: var(--font-serif);
  font-size: clamp(1.9rem, 3.5vw, 2.6rem);
  font-weight: 600;
  color: var(--teal);
  line-height: 1.1;
  margin-top: 0.4rem;
}

.destacadas-header .destacadas-link {
  font-family: var(--font-sans);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--pink);
  text-decoration: none;
  white-space: nowrap;
}

.destacadas-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-5);
}

.destacadas-estado { color: var(--text-muted); font-size: 0.9rem; padding: 2rem 0; }
```

- [ ] **Step 3: Reescribir `Home.tsx`**

Reemplazar el contenido de `client/src/pages/public/Home.tsx` por:

```tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { propiedadesApi } from '../../api/propiedades'
import type { PropiedadListItem } from '../../types/propiedad'
import PropiedadCard from '../../components/PropiedadCard'
import hero from '../../assets/hero.png'

const categorias = [
  { num: '01', label: 'Lotes',         desc: 'Terrenos estratégicamente ubicados en las mejores zonas de Tucumán.' },
  { num: '02', label: 'Casas',         desc: 'Residencias diseñadas para adaptarse a tu estilo de vida y presupuesto.' },
  { num: '03', label: 'Inversiones',   desc: 'Opciones de alto rendimiento para hacer crecer tu capital inmobiliario.' },
  { num: '04', label: 'Oportunidades', desc: 'Ofertas exclusivas del mercado local con condiciones únicas.' },
]

export default function Home() {
  const [destacadas, setDestacadas] = useState<PropiedadListItem[]>([])
  const [cargando, setCargando]     = useState(true)

  useEffect(() => {
    propiedadesApi
      .listar({ estado_comercial: 'disponible', limit: 3 })
      .then(setDestacadas)
      .catch(() => setDestacadas([]))
      .finally(() => setCargando(false))
  }, [])

  return (
    <>
      {/* ── Hero split editorial ── */}
      <section className="hero">
        <div className="hero-col-text">
          <span className="eyebrow">Tucumán, Argentina</span>
          <h1>
            Oportunidades<br />
            <em>inmobiliarias</em>
          </h1>
          <p className="hero-sub">
            Lotes&nbsp;·&nbsp;Casas&nbsp;·&nbsp;Inversiones
          </p>
          <Link to="/propiedades" className="btn-primary">
            Ver propiedades
          </Link>
        </div>
        <div className="hero-col-photo" style={{ backgroundImage: `url(${hero})` }} />
      </section>

      {/* ── Values strip ── */}
      <div className="values">
        <p>Decisión &nbsp;·&nbsp; Orden &nbsp;·&nbsp; Claridad</p>
      </div>

      {/* ── Propiedades destacadas ── */}
      <section className="destacadas">
        <div className="section-container">
          <div className="destacadas-header">
            <div>
              <span className="section-label">Selección</span>
              <h2>Propiedades destacadas</h2>
            </div>
            <Link to="/propiedades" className="destacadas-link">Ver todas →</Link>
          </div>

          {cargando && <p className="destacadas-estado">Cargando propiedades...</p>}
          {!cargando && destacadas.length === 0 && (
            <p className="destacadas-estado">Pronto vas a ver acá nuestras propiedades destacadas.</p>
          )}
          {!cargando && destacadas.length > 0 && (
            <div className="destacadas-grid">
              {destacadas.map(p => <PropiedadCard key={p.id} propiedad={p} />)}
            </div>
          )}
        </div>
      </section>

      {/* ── Categorías ── */}
      <section className="categorias" id="propiedades">
        <div className="section-container">
          <div className="section-header">
            <h2>¿Qué estás buscando?</h2>
            <p>Encontrá la oportunidad que se adapta a tus objetivos.</p>
          </div>
          <div className="categorias-grid">
            {categorias.map((cat) => (
              <div key={cat.num} className="categoria-card">
                <span className="cat-num">{cat.num}</span>
                <h3>{cat.label}</h3>
                <p>{cat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="cta-section" id="contacto">
        <h2>Asesoramiento personalizado</h2>
        <p>
          Nuestro equipo te acompaña en cada paso de tu decisión
          inmobiliaria, con claridad y sin vueltas.
        </p>
        <a href="mailto:info@mambogroups.com" className="btn-white">
          Contactanos
        </a>
      </section>
    </>
  )
}
```

Nota: `client/src/assets/hero.png` ya existe (verificado en el árbol). Si al compilar el import fallara, reemplazar la línea `import hero ...` por una URL de foto y usar esa en `backgroundImage`.

- [ ] **Step 4: Verificar build**

Run (desde `client/`): `npm run build`
Expected: compila sin errores.

- [ ] **Step 5: Verificación visual**

Run: `npm run dev`. Abrir `http://localhost:5173/`.
Expected: hero en dos columnas (texto teal izquierda, foto derecha sin tarjeta de precio); debajo, franja de valores; luego "Propiedades destacadas" con hasta 3 cards reales (o mensaje de vacío si la API no devuelve nada); luego categorías y CTA. En pantalla angosta el hero se apila.

- [ ] **Step 6: Commit**

```bash
git add client/src/index.css client/src/pages/public/Home.tsx
git commit -m "rediseño: hero split editorial y sección de propiedades destacadas"
```

---

## Task 4: Ficha de detalle — galería mosaico + contacto sticky (WhatsApp + formulario)

Rehacer la ficha: galería mosaico (1 foto grande + miniaturas), banda de specs en serif teal, y aside sticky con precio, botón de WhatsApp y formulario "Solicitar visita".

**Files:**
- Create: `client/src/config/contacto.ts`
- Modify: `client/src/pages/public/Detalle.tsx`
- Modify: `client/src/pages/public/Detalle.css`

**Interfaces:**
- Create `config/contacto.ts`: `WHATSAPP_NUMERO: string`, `EMAIL_CONTACTO: string`, `linkWhatsApp(mensaje: string): string`.
- Consumes: `lib/propiedad.ts` (formatPrecio, LABEL_OPERACION, LABEL_TIPO — Task 2), tokens (Task 1).

- [ ] **Step 1: Crear `config/contacto.ts`**

Crear `client/src/config/contacto.ts` con:

```ts
// Datos de contacto de Mambo Groups.
// TODO: reemplazar WHATSAPP_NUMERO por el número real (formato internacional sin +, ej. 549381...).
export const WHATSAPP_NUMERO = '5493810000000'
export const EMAIL_CONTACTO  = 'info@mambogroups.com'

/** Construye un link de WhatsApp con mensaje prellenado. */
export function linkWhatsApp(mensaje: string): string {
  return `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensaje)}`
}
```

- [ ] **Step 2: Reescribir `Detalle.tsx`**

Reemplazar el contenido de `client/src/pages/public/Detalle.tsx` por:

```tsx
import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { propiedadesApi } from '../../api/propiedades'
import type { Propiedad } from '../../types/propiedad'
import { formatPrecio, LABEL_OPERACION, LABEL_TIPO } from '../../lib/propiedad'
import { EMAIL_CONTACTO, linkWhatsApp } from '../../config/contacto'
import './Detalle.css'

export default function Detalle() {
  const { id } = useParams()
  const [prop, setProp]       = useState<Propiedad | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [imgIdx, setImgIdx]   = useState(0)
  const [mostrarForm, setMostrarForm] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    propiedadesApi.obtener(Number(id))
      .then(p => {
        p.medios.sort((a, b) => {
          if (a.es_principal && !b.es_principal) return -1
          if (!a.es_principal && b.es_principal) return 1
          return a.orden - b.orden
        })
        setProp(p)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return <main className="detalle-page"><p className="detalle-estado">Cargando...</p></main>
  }

  if (error || !prop) {
    return (
      <main className="detalle-page">
        <p className="detalle-estado detalle-error">{error ?? 'Propiedad no encontrada.'}</p>
        <div style={{ textAlign: 'center' }}>
          <Link to="/propiedades" className="btn-primary">← Volver al listado</Link>
        </div>
      </main>
    )
  }

  const imagenes = prop.medios.filter(m => m.tipo_medio === 'imagen')
  const ubicStr = [prop.ubicacion?.direccion, prop.ubicacion?.ciudad, prop.ubicacion?.provincia]
    .filter(Boolean).join(' · ')
  const mensajeWsp = `Hola! Me interesa la propiedad "${prop.titulo}" (${window.location.href})`

  return (
    <main className="detalle-page">
      {/* Breadcrumb */}
      <div className="detalle-breadcrumb">
        <div className="section-container">
          <Link to="/propiedades">Propiedades</Link>
          <span>›</span>
          <span>{LABEL_TIPO[prop.tipo_propiedad]}</span>
          <span>›</span>
          <span className="detalle-breadcrumb-actual">{prop.titulo}</span>
        </div>
      </div>

      {/* Galería mosaico */}
      <div className="section-container">
        {imagenes.length > 0 ? (
          <div className="detalle-galeria">
            <button
              className="detalle-gal-principal"
              onClick={() => setImgIdx(0)}
              style={{ backgroundImage: `url(${imagenes[imgIdx]?.url ?? imagenes[0].url})` }}
            >
              <span className="detalle-badge">{LABEL_OPERACION[prop.tipo_operacion]}</span>
            </button>
            <div className="detalle-gal-thumbs">
              {imagenes.slice(1, 5).map((m, i) => {
                const esUltima = i === 3 && imagenes.length > 5
                return (
                  <button
                    key={m.id}
                    className="detalle-gal-thumb"
                    onClick={() => setImgIdx(i + 1)}
                    style={{ backgroundImage: `url(${m.url})` }}
                  >
                    {esUltima && <span className="detalle-gal-mas">+{imagenes.length - 5} fotos</span>}
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="detalle-galeria"><div className="detalle-img-empty" /></div>
        )}
      </div>

      {/* Cuerpo 2 columnas */}
      <div className="section-container detalle-layout">
        <div className="detalle-main">
          <span className="detalle-badge-inline">{LABEL_OPERACION[prop.tipo_operacion]}</span>
          <h1 className="detalle-titulo">{prop.titulo}</h1>
          {ubicStr && <p className="detalle-ubicacion">{ubicStr}</p>}

          {(prop.dormitorios != null || prop.banos != null ||
            prop.m2_cubiertos != null || prop.m2_totales != null) && (
            <div className="detalle-specs">
              {prop.dormitorios != null && (
                <div className="detalle-spec"><span className="v">{prop.dormitorios}</span><span className="k">Dormitorios</span></div>
              )}
              {prop.banos != null && (
                <div className="detalle-spec"><span className="v">{prop.banos}</span><span className="k">Baños</span></div>
              )}
              {prop.m2_cubiertos != null && (
                <div className="detalle-spec"><span className="v">{prop.m2_cubiertos}</span><span className="k">m² cubiertos</span></div>
              )}
              {prop.m2_totales != null && (
                <div className="detalle-spec"><span className="v">{prop.m2_totales}</span><span className="k">m² totales</span></div>
              )}
            </div>
          )}

          {prop.descripcion && (
            <div className="detalle-seccion">
              <h2 className="detalle-seccion-titulo">Descripción</h2>
              <p className="detalle-descripcion">{prop.descripcion}</p>
            </div>
          )}

          {prop.caracteristicas.length > 0 && (
            <div className="detalle-seccion">
              <h2 className="detalle-seccion-titulo">Características</h2>
              <div className="detalle-caract-grid">
                {prop.caracteristicas.map(c => (
                  <span key={c.id} className="detalle-caract-item">{c.clave}: {c.valor}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Aside sticky */}
        <aside className="detalle-aside">
          <p className="detalle-precio">{formatPrecio(prop.precio, prop.moneda)}</p>
          <p className="detalle-precio-k">Precio de {LABEL_OPERACION[prop.tipo_operacion].toLowerCase()}</p>

          <a className="detalle-btn-wsp" href={linkWhatsApp(mensajeWsp)} target="_blank" rel="noopener noreferrer">
            Consultar por WhatsApp
          </a>
          <button className="detalle-btn-visita" onClick={() => setMostrarForm(v => !v)}>
            Solicitar visita
          </button>

          {mostrarForm && (
            <form
              className="detalle-form"
              onSubmit={e => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                const cuerpo = `Nombre: ${fd.get('nombre')}\nTeléfono: ${fd.get('telefono')}\nMensaje: ${fd.get('mensaje')}\n\nPropiedad: ${prop.titulo} (${window.location.href})`
                window.location.href =
                  `mailto:${EMAIL_CONTACTO}?subject=${encodeURIComponent('Solicitud de visita: ' + prop.titulo)}&body=${encodeURIComponent(cuerpo)}`
              }}
            >
              <input name="nombre" placeholder="Tu nombre" required />
              <input name="telefono" placeholder="Teléfono" required />
              <textarea name="mensaje" placeholder="¿Cuándo te gustaría visitarla?" rows={3} />
              <button type="submit" className="detalle-btn-enviar">Enviar solicitud</button>
            </form>
          )}
        </aside>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Reescribir `Detalle.css`**

Reemplazar el contenido de `client/src/pages/public/Detalle.css` por:

```css
.detalle-page { padding-top: 72px; min-height: 100vh; background: #f8f9fb; padding-bottom: var(--space-8); }
.detalle-estado { text-align: center; color: var(--text-muted); font-size: 0.9rem; padding: 4rem 0; }
.detalle-error { color: #dc2626; }

/* Breadcrumb */
.detalle-breadcrumb { background: var(--white); border-bottom: 1px solid var(--gray); padding: 0.75rem var(--space-5); }
.detalle-breadcrumb .section-container { display: flex; align-items: center; gap: 0.5rem; font-size: 0.78rem; color: var(--text-muted); flex-wrap: wrap; }
.detalle-breadcrumb a { color: var(--teal); text-decoration: none; font-weight: 500; }
.detalle-breadcrumb a:hover { text-decoration: underline; }
.detalle-breadcrumb-actual { color: var(--text); font-weight: 500; }

/* Galería mosaico */
.detalle-galeria {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: var(--space-2);
  padding-top: var(--space-5);
}
.detalle-gal-principal {
  position: relative;
  height: 420px;
  border: none;
  padding: 0;
  cursor: pointer;
  border-radius: var(--radius-md);
  background: var(--gray) center / cover no-repeat;
}
.detalle-gal-thumbs { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: var(--space-2); }
.detalle-gal-thumb {
  position: relative;
  border: none;
  padding: 0;
  cursor: pointer;
  border-radius: var(--radius-md);
  background: var(--gray) center / cover no-repeat;
  min-height: 100px;
}
.detalle-gal-mas {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(5, 78, 78, 0.55);
  color: var(--white);
  font-family: var(--font-sans);
  font-size: 0.8rem;
  font-weight: 600;
  border-radius: var(--radius-md);
}
.detalle-img-empty { height: 420px; margin-top: var(--space-5); background: linear-gradient(135deg, var(--gray) 0%, #d1d5db 100%); border-radius: var(--radius-md); }
.detalle-badge {
  position: absolute; top: 1rem; left: 1rem;
  padding: 0.35rem 0.8rem; font-family: var(--font-sans); font-size: 0.65rem;
  font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--white); background: var(--pink); border-radius: var(--radius-sm);
}

@media (max-width: 860px) {
  .detalle-galeria { grid-template-columns: 1fr; }
  .detalle-gal-principal { height: 280px; }
  .detalle-gal-thumbs { grid-template-rows: 90px; grid-template-columns: repeat(4, 1fr); }
}

/* Layout 2 columnas */
.detalle-layout {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: var(--space-7);
  padding-top: var(--space-6);
  align-items: start;
}
@media (max-width: 860px) { .detalle-layout { grid-template-columns: 1fr; } }

/* Main */
.detalle-badge-inline {
  display: inline-block;
  padding: 0.35rem 0.8rem; font-size: 0.62rem; font-weight: 600;
  letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--white); background: var(--pink); border-radius: var(--radius-sm);
  margin-bottom: 0.9rem;
}
.detalle-titulo { font-family: var(--font-serif); font-size: clamp(1.8rem, 3vw, 2.4rem); font-weight: 600; color: var(--text); line-height: 1.1; margin-bottom: 0.35rem; }
.detalle-ubicacion { font-size: 0.85rem; color: var(--text-muted); margin-bottom: var(--space-5); }

.detalle-specs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
  gap: var(--space-4);
  margin: var(--space-5) 0;
  padding: var(--space-5) 0;
  border-top: 1px solid var(--gray);
  border-bottom: 1px solid var(--gray);
}
.detalle-spec { display: flex; flex-direction: column; gap: 0.3rem; }
.detalle-spec .v { font-family: var(--font-serif); font-size: 1.7rem; font-weight: 600; color: var(--teal); line-height: 1; }
.detalle-spec .k { font-size: 0.62rem; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); }

.detalle-seccion { margin-top: var(--space-6); }
.detalle-seccion-titulo { font-size: 0.72rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--teal); margin-bottom: 0.9rem; }
.detalle-descripcion { font-size: 0.92rem; color: #4b5563; line-height: 1.75; }
.detalle-caract-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
.detalle-caract-item { font-size: 0.85rem; color: var(--text); display: flex; align-items: center; gap: 0.5rem; }
.detalle-caract-item::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: var(--pink); flex-shrink: 0; }
@media (max-width: 520px) { .detalle-caract-grid { grid-template-columns: 1fr; } }

/* Aside sticky */
.detalle-aside {
  position: sticky; top: 88px; align-self: start;
  background: var(--white); border: 1px solid var(--gray);
  border-radius: var(--radius-md); padding: var(--space-5);
  box-shadow: var(--shadow-card);
}
.detalle-precio { font-family: var(--font-serif); font-size: 2.1rem; font-weight: 600; color: var(--teal); line-height: 1; }
.detalle-precio-k { font-size: 0.62rem; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); margin-top: 0.4rem; }

.detalle-btn-wsp, .detalle-btn-visita, .detalle-btn-enviar {
  display: block; width: 100%; text-align: center; cursor: pointer;
  font-family: var(--font-sans); font-size: 0.78rem; font-weight: 600;
  letter-spacing: 0.05em; text-transform: uppercase; padding: 0.85rem;
  border-radius: var(--radius-sm); transition: background 0.2s, color 0.2s;
}
.detalle-btn-wsp { background: var(--pink); color: var(--white); text-decoration: none; margin-top: var(--space-5); border: none; }
.detalle-btn-wsp:hover { background: var(--pink-dark); }
.detalle-btn-visita { background: transparent; color: var(--teal); border: 1px solid var(--teal); margin-top: 0.6rem; }
.detalle-btn-visita:hover { background: var(--teal); color: var(--white); }

.detalle-form { display: flex; flex-direction: column; gap: 0.6rem; margin-top: var(--space-4); padding-top: var(--space-4); border-top: 1px solid var(--gray); }
.detalle-form input, .detalle-form textarea {
  font-family: var(--font-sans); font-size: 0.85rem; padding: 0.6rem 0.75rem;
  border: 1px solid var(--gray); border-radius: var(--radius-sm); outline: none;
  color: var(--text); resize: vertical;
}
.detalle-form input:focus, .detalle-form textarea:focus { border-color: var(--teal); }
.detalle-btn-enviar { background: var(--teal); color: var(--white); border: none; }
.detalle-btn-enviar:hover { background: var(--teal-dark); }
```

- [ ] **Step 4: Verificar build**

Run (desde `client/`): `npm run build`
Expected: compila sin errores.

- [ ] **Step 5: Verificación visual**

Run: `npm run dev`. Abrir una propiedad (`/propiedades` → clic en una card).
Expected: galería mosaico (foto grande + hasta 4 miniaturas, con "+N fotos" si hay más de 5); specs en serif teal en banda con líneas; a la derecha tarjeta sticky con precio, botón rosa de WhatsApp y "Solicitar visita" que despliega el formulario. Clic en WhatsApp abre `wa.me`; enviar el formulario abre el cliente de mail.

- [ ] **Step 6: Commit**

```bash
git add client/src/config/contacto.ts client/src/pages/public/Detalle.tsx client/src/pages/public/Detalle.css
git commit -m "rediseño: ficha de detalle con galería mosaico y contacto (WhatsApp + formulario)"
```

---

## Task 5: Panel admin — sidebar agrupada por secciones

Reorganizar la navegación del sidebar en grupos (Inventario / CRM) con encabezados, manteniendo la marca teal y el activo en rosa.

**Files:**
- Modify: `client/src/layouts/AdminLayout.tsx`
- Modify: `client/src/layouts/AdminLayout.css` (agregar estilo `.admin-nav-group`)

**Interfaces:**
- Consumes: tokens/estilos existentes de AdminLayout.
- Nota: los ítems de CRM (Contactos, Consultas) son **estructura visual**; apuntan a rutas aún no implementadas, por eso se renderizan como texto no-navegable (no `NavLink`) para no romper el router.

- [ ] **Step 1: Reescribir `AdminLayout.tsx`**

Reemplazar el contenido de `client/src/layouts/AdminLayout.tsx` por:

```tsx
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import './AdminLayout.css'

const grupos = [
  {
    titulo: 'Inventario',
    items: [
      { to: '/admin/propiedades',   label: 'Propiedades' },
      { to: '/admin/publicaciones', label: 'Publicaciones' },
    ],
  },
]

export default function AdminLayout() {
  const navigate = useNavigate()

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-logo" onClick={() => navigate('/admin')}>
          <span className="logo-mambo">Mambo</span>
          <span className="logo-groups">Groups · Admin</span>
        </div>

        <nav className="admin-nav">
          <NavLink to="/admin" end className={({ isActive }) => `admin-nav-item${isActive ? ' active' : ''}`}>
            Dashboard
          </NavLink>

          {grupos.map(g => (
            <div key={g.titulo}>
              <p className="admin-nav-group">{g.titulo}</p>
              {g.items.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) => `admin-nav-item${isActive ? ' active' : ''}`}
                >
                  {label}
                </NavLink>
              ))}
            </div>
          ))}

          <p className="admin-nav-group">CRM</p>
          <span className="admin-nav-item admin-nav-item-soon">Contactos</span>
          <span className="admin-nav-item admin-nav-item-soon">Consultas</span>
        </nav>

        <div className="admin-sidebar-footer">
          <NavLink to="/" className="admin-nav-item">← Ver sitio</NavLink>
        </div>
      </aside>

      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Agregar estilos de grupo en `AdminLayout.css`**

En `client/src/layouts/AdminLayout.css`, después de la regla `.admin-nav-item.active { ... }` (línea 73 del original), agregar:

```css
.admin-nav-group {
  font-size: 0.6rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.3);
  padding: 1.1rem 0.85rem 0.4rem;
}

.admin-nav-item-soon {
  color: rgba(255, 255, 255, 0.35);
  cursor: default;
}

.admin-nav-item-soon:hover { background: transparent; color: rgba(255, 255, 255, 0.35); }
```

- [ ] **Step 3: Verificar build**

Run (desde `client/`): `npm run build`
Expected: compila sin errores.

- [ ] **Step 4: Verificación visual**

Run: `npm run dev`. Abrir `http://localhost:5173/admin`.
Expected: sidebar con "Dashboard" arriba, encabezado "Inventario" sobre Propiedades/Publicaciones, encabezado "CRM" sobre Contactos/Consultas (grises, no clickeables). El ítem activo se resalta en rosa.

- [ ] **Step 5: Commit**

```bash
git add client/src/layouts/AdminLayout.tsx client/src/layouts/AdminLayout.css
git commit -m "rediseño: sidebar admin con navegación agrupada por secciones"
```

---

## Task 6: Panel admin — tiles de resumen y refinamiento de la lista

Crear el componente `StatTile`, mostrar tiles de resumen en la lista de propiedades (Total/Disponibles/Reservadas/Publicadas calculadas de los datos) y agregar un buscador de texto. El Dashboard también usa los tiles.

**Files:**
- Create: `client/src/components/StatTile.tsx`
- Create: `client/src/components/StatTile.css`
- Modify: `client/src/pages/admin/Dashboard.tsx`
- Modify: `client/src/pages/admin/propiedades/Lista.tsx`
- Modify: `client/src/pages/admin/propiedades/Lista.css`

**Interfaces:**
- Create `StatTile.tsx`: `default function StatTile({ label, valor, tono }: { label: string; valor: number | string; tono?: 'teal' | 'pink' }): JSX.Element`.
- Consumes: `propiedadesApi.listar` (existente), `Badge` (existente, para estados), tokens (Task 1).

- [ ] **Step 1: Crear `StatTile.css`**

Crear `client/src/components/StatTile.css` con:

```css
.stat-tile {
  background: var(--white);
  border: 1px solid var(--gray);
  border-radius: var(--radius-md);
  padding: 1rem 1.15rem;
}

.stat-tile-label {
  font-size: 0.6rem;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.stat-tile-valor {
  font-family: var(--font-serif);
  font-size: 1.9rem;
  font-weight: 600;
  color: var(--text);
  margin-top: 0.5rem;
  line-height: 1;
}

.stat-tile-valor.tono-teal { color: var(--teal); }
.stat-tile-valor.tono-pink { color: var(--pink); }
```

- [ ] **Step 2: Crear `StatTile.tsx`**

Crear `client/src/components/StatTile.tsx` con:

```tsx
import './StatTile.css'

interface Props {
  label: string
  valor: number | string
  tono?: 'teal' | 'pink'
}

export default function StatTile({ label, valor, tono }: Props) {
  return (
    <div className="stat-tile">
      <div className="stat-tile-label">{label}</div>
      <div className={`stat-tile-valor${tono ? ` tono-${tono}` : ''}`}>{valor}</div>
    </div>
  )
}
```

- [ ] **Step 3: Actualizar `Dashboard.tsx`**

Reemplazar el contenido de `client/src/pages/admin/Dashboard.tsx` por:

```tsx
import { useEffect, useState } from 'react'
import { propiedadesApi } from '../../api/propiedades'
import type { PropiedadListItem } from '../../types/propiedad'
import StatTile from '../../components/StatTile'

export default function Dashboard() {
  const [props, setProps] = useState<PropiedadListItem[]>([])

  useEffect(() => {
    propiedadesApi.listar({ limit: 500 }).then(setProps).catch(() => setProps([]))
  }, [])

  const total       = props.length
  const disponibles = props.filter(p => p.estado_comercial === 'disponible').length
  const reservadas  = props.filter(p => p.estado_comercial === 'reservada').length

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <span className="section-label">Panel</span>
          <h1>Dashboard</h1>
        </div>
      </div>

      <div className="admin-stats-grid">
        <StatTile label="Propiedades" valor={total} />
        <StatTile label="Disponibles" valor={disponibles} tono="teal" />
        <StatTile label="Reservadas" valor={reservadas} tono="pink" />
      </div>

      <div className="admin-card" style={{ marginTop: '1.25rem' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Bienvenido al panel de administración de Mambo Groups.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Agregar grid de stats y buscador en `Lista.css`**

En `client/src/pages/admin/propiedades/Lista.css`, agregar al inicio del archivo:

```css
.admin-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0.9rem;
  margin-bottom: 1.25rem;
}

.filtros-bar .filtros-buscar {
  flex: 1;
  min-width: 220px;
}
```

- [ ] **Step 5: Agregar tiles + buscador en `Lista.tsx`**

En `client/src/pages/admin/propiedades/Lista.tsx`:

1. Agregar el import tras la línea de `Badge`:

```tsx
import StatTile from '../../../components/StatTile'
```

2. Agregar estado de búsqueda dentro del componente, después de la declaración de `filtros`:

```tsx
  const [busqueda, setBusqueda] = useState('')
```

3. Calcular métricas y lista filtrada antes del `return` (después de `handleEliminar`):

```tsx
  const total       = propiedades.length
  const disponibles = propiedades.filter(p => p.estado_comercial === 'disponible').length
  const reservadas  = propiedades.filter(p => p.estado_comercial === 'reservada').length

  const visibles = propiedades.filter(p =>
    p.titulo.toLowerCase().includes(busqueda.toLowerCase()) ||
    (p.ubicacion?.ciudad ?? '').toLowerCase().includes(busqueda.toLowerCase())
  )
```

4. Insertar la grilla de tiles justo después del `admin-page-header` (antes del `admin-card filtros-bar`):

```tsx
      <div className="admin-stats-grid">
        <StatTile label="Total" valor={total} />
        <StatTile label="Disponibles" valor={disponibles} tono="teal" />
        <StatTile label="Reservadas" valor={reservadas} tono="pink" />
      </div>
```

5. Dentro de `div.admin-card.filtros-bar`, agregar como primer hijo el input de búsqueda:

```tsx
        <input
          type="text"
          className="filtros-buscar"
          placeholder="Buscar por título o ciudad..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
        />
```

6. En el `<tbody>`, cambiar `propiedades.map(...)` por `visibles.map(...)` (el resto del cuerpo de la fila queda igual). El estado vacío que usa `propiedades.length === 0` se mantiene.

- [ ] **Step 6: Verificar build**

Run (desde `client/`): `npm run build`
Expected: compila sin errores (verificar que `busqueda`/`StatTile`/`visibles` se usan y no queda ningún símbolo sin referenciar).

- [ ] **Step 7: Verificación visual**

Run: `npm run dev`. Abrir `http://localhost:5173/admin` y `http://localhost:5173/admin/propiedades`.
Expected: en Dashboard, 3 tiles con conteos reales. En Propiedades, fila de tiles arriba, buscador que filtra la tabla en vivo por título/ciudad, y estados mostrados como pills de color (Badge existente). Editar/Baja siguen funcionando.

- [ ] **Step 8: Commit**

```bash
git add client/src/components/StatTile.tsx client/src/components/StatTile.css client/src/pages/admin/Dashboard.tsx client/src/pages/admin/propiedades/Lista.tsx client/src/pages/admin/propiedades/Lista.css
git commit -m "rediseño: tiles de resumen y buscador en el panel admin"
```

---

## Task 7: Limpieza — eliminar scaffold sobrante

Quitar `style.css` (leftover de Vite, no importado por nadie) y confirmar que el build final del sistema completo pasa.

**Files:**
- Delete: `client/src/style.css`

- [ ] **Step 1: Confirmar que no está referenciado**

Run (desde `client/`): `git grep -n "style.css" -- src` 
Expected: sin resultados (ya verificado; `main.tsx` importa solo `index.css`).

- [ ] **Step 2: Eliminar el archivo**

```bash
git rm client/src/style.css
```

- [ ] **Step 3: Verificar build final**

Run (desde `client/`): `npm run build`
Expected: compila sin errores; sistema completo funcionando.

- [ ] **Step 4: Commit**

```bash
git commit -m "rediseño: eliminar style.css sobrante del scaffold"
```

---

## Self-Review (completado por el autor del plan)

**1. Cobertura del spec:**
- §2 tokens → Task 1. §3.1 composición Home → Task 3. §3.2 hero split (foto limpia) → Task 3. §3.3 detalle (mosaico, specs, contacto sticky WhatsApp+form) → Task 4. §3.4 card editorial clean → Task 2. §3.5 listado usa card → Task 2. §4 admin (sidebar agrupada, tiles, tabla con pills, buscador) → Tasks 5 y 6. §5 componentes reutilizables (PropiedadCard, StatTile, helpers) → Tasks 2 y 6. §6 datos: destacadas via listar+limit → Task 3; galería usa `medios` → Task 4; contacto WhatsApp+mailto → Task 4. §7 fuera de alcance (dark mode, CRM funcional, cambios de paleta) → respetado. §2 nota `style.css` leftover → Task 7.
- Sin brechas detectadas.

**2. Placeholders:** No hay "TODO/TBD" de plan. El único `TODO` de código (número de WhatsApp real en `config/contacto.ts`) es dato de negocio configurable, con valor por defecto funcional — no es un placeholder de plan.

**3. Consistencia de tipos:** `PropiedadCard({ propiedad })`, `StatTile({ label, valor, tono })`, `formatPrecio/imagenPrincipal/LABEL_*` en `lib/propiedad.ts`, `linkWhatsApp(mensaje)` en `config/contacto.ts` — nombres usados de forma idéntica en las tareas que los consumen (Listado/Home usan `PropiedadCard`; Detalle usa `lib/propiedad` + `config/contacto`; Dashboard/Lista usan `StatTile`).
