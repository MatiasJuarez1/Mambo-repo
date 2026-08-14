# Barra de búsqueda funcional + sección Servicios

**Fecha:** 2026-08-05
**Estado:** aprobado, listo para implementar

---

## 1. Problema

La barra "Quick Search" del hero es maquetado muerto: los `<select>` no tienen estado, sus `value` son etiquetas (`"Venta"`, `"Lotes"`) que no coinciden con los enums del backend, y el botón Buscar es un `<Link to="/propiedades">` sin parámetros. El usuario elige tres filtros y aterriza en el listado completo.

Además, el negocio de la clienta no es solo compraventa y alquiler: ofrece cinco servicios de administración patrimonial que hoy no existen en ningún lado del sitio.

El filtrado real ya funciona: `Listado.tsx` lee `tipo_operacion`, `tipo_propiedad` y `ciudad` de la URL y el backend los soporta. **No hay que construir un motor de filtros — hay que conectar la barra al que ya existe.**

## 2. Alcance

Entra:

- Barra del hero funcional, con conmutador Propiedades / Servicios.
- Unificación de Venta y Alquiler en un solo concepto ("Propiedades") en la barra y en la navbar.
- Endpoint nuevo de zonas disponibles.
- Página `/servicios` con los cinco servicios.
- Tests unitarios (backend y frontend) e infraestructura para correrlos, que hoy no existe.

No entra:

- Tabla, API o ABM de servicios. Los cinco servicios son contenido estático del frontend.
- Filtro de precio en la barra del hero.
- Soporte multi-valor en `tipo_propiedad` (agrupar "Comercial" = local + oficina).
- Cambios en el panel de administración.

## 3. Decisiones tomadas

| Decisión | Elegido | Por qué |
|---|---|---|
| Dónde va el conmutador | Adentro de la píldora, reemplazando el rótulo "Quick Search", con la pestaña activa marcada por filete inferior (variante AB3) | El rótulo actual es decorativo. El filete evita un segundo bloque petróleo compitiendo con el botón Buscar. |
| Modelo de los servicios | Contenido estático en el frontend | Son cinco servicios fijos con texto rico, no un catálogo que la clienta carga. Una tabla y un ABM serían infraestructura sin uso. |
| Destino de la pestaña Servicios | `/servicios#<slug>` | Todo el contenido en una vista; el ancla posiciona el bloque elegido. |
| Opciones del campo Tipo | Los 5 tipos reales del enum | Cero cambios de backend y consistente con el menú de la navbar. "Comercial" agrupado exigiría multi-valor en la API. |
| Origen del campo Zona | Endpoint dinámico | Una lista fija ofrece zonas sin inventario y manda al usuario a un listado vacío. |
| Layout de `/servicios` | Índice lateral pegajoso + bloques numerados | Cinco propuestas densas y parecidas en formato; sin brújula el lector se pierde. El índice muestra las cinco de un vistazo, que es el argumento de la clienta. |

## 4. Backend

### 4.1 Endpoint de zonas

`GET /api/v1/propiedades/ciudades` → `["San Miguel de Tucumán", "Yerba Buena", ...]`

`service.listar_ciudades(db)` devuelve las ciudades distintas de `propiedades_ubicaciones`, con join a `propiedades`, filtrando:

- `Propiedad.eliminado_en IS NULL`
- `Propiedad.estado_comercial == disponible`
- `ciudad` no nula y no vacía

Ordenadas alfabéticamente. Así el desplegable nunca ofrece una zona que devolvería cero resultados.

**Restricción de ruteo:** la ruta debe declararse **antes** de `GET /{propiedad_id}`. Si va después, FastAPI intenta parsear `"ciudades"` como `int` y responde 422.

### 4.2 Tests

No hay suite de tests en el repo. Se agrega:

- `pytest` y `httpx` como dependencias dev en `src/pyproject.toml`.
- `src/tests/conftest.py` con una sesión SQLAlchemy sobre SQLite en memoria (`Base.metadata.create_all`) y un `TestClient` con `get_db` sobreescrito.
- `src/tests/test_propiedades_ciudades.py` cubriendo: lista vacía, ciudades distintas sin duplicados, orden alfabético, exclusión de propiedades borradas, exclusión de las no disponibles, exclusión de ciudad nula o vacía, y que la ruta resuelva a la lista y no al handler de `{propiedad_id}`.

Si algún tipo de columna no resuelve en SQLite, el fallback es testear `listar_ciudades` contra una sesión mockeada; la cobertura de casos no cambia.

## 5. Frontend

### 5.1 `BuscadorHero`

La barra sale de `Home.tsx` a `components/BuscadorHero.tsx` + `BuscadorHero.css`, adonde se mudan las reglas `.hero-search` y `.qs-*` que hoy viven en las 785 líneas de `index.css`. `Home.tsx` queda con `<BuscadorHero />`.

Estado local del componente: `modo` (`'propiedades' | 'servicios'`) más el valor de cada campo. El componente **no lee ni escribe la URL**: arma un destino y navega. Quien filtra sigue siendo `Listado.tsx`, cuya lógica no se toca.

**Modo Propiedades** — tres campos, opción vacía = sin filtro:

| Campo | Opciones | Param |
|---|---|---|
| Operación | Venta/Alquiler · Venta · Alquiler | `tipo_operacion` |
| Tipo | Todos los tipos · Casas · Departamentos · Lotes y terrenos · Locales comerciales · Oficinas | `tipo_propiedad` |
| Zona | Todo Tucumán · *(lo que devuelva el endpoint)* | `ciudad` |

Buscar navega a `/propiedades?…` con **solo los params con valor**. "Venta/Alquiler" no manda `tipo_operacion`, así que trae todo — incluidas las `temporal`, que existen en el enum pero no se exponen en el hero.

**Modo Servicios** — un campo ancho ("¿Qué necesitás?", los cinco servicios) y el botón pasa a "Ver servicio" → `/servicios#<slug>`. Sin servicio elegido, va a `/servicios`.

Detalles:

- La barra es un `<form onSubmit>` con `<button type="submit">`, no un `<Link>`: así Enter funciona.
- Las pestañas van como `role="tablist"` / `role="tab"` con `aria-selected`, no como divs clickeables.
- Las zonas se piden en un `useEffect` al montar. Si la llamada falla, el select se queda con "Todo Tucumán" y la barra sigue usable.

### 5.2 Labels compartidos

`lib/propiedad.ts` ya exporta `LABEL_TIPO` (singular, para fichas) y `Navbar.tsx` tiene su propia `TIPOS_MENU` (plural, para menús). Se agrega a `lib/propiedad.ts` un `OPCIONES_TIPO` exportado —`{ valor, label }[]` en plural— que consumen navbar y buscador, y `Navbar.tsx` deja de tener lista propia. `LABEL_TIPO` se mantiene: es para otra cosa.

### 5.3 Página `/servicios`

- `pages/public/catalogo-servicios.ts` — los cinco servicios como dato: `{ slug, num, titulo, bajada, items[] }`. El nombre evita el choque con `Servicios.tsx`: en un filesystem insensible a mayúsculas (Windows), un `servicios.ts` al lado del componente hace que `import Servicios from './Servicios'` resuelva al módulo de datos y la página explote en runtime sin error de compilación.
- `pages/public/Servicios.tsx` + `Servicios.css`.
- Ruta `<Route path="servicios" element={<Servicios />} />` en `App.tsx`, dentro de `PublicLayout`.

Estructura: hero con el párrafo diferencial ("Más que vender propiedades, administramos patrimonio inmobiliario"), después una grilla de dos columnas — índice pegajoso a la izquierda, los cinco bloques a la derecha — y al final el CTA de contacto reusando el patrón `.cta-section` que ya existe.

Cada bloque: número (01–05), título, bajada y viñetas en dos columnas.

Comportamiento:

- El índice marca el servicio visible con un `IntersectionObserver` sobre las cinco secciones.
- El ancla de entrada se resuelve con `useLocation()`: un efecto sobre `location.hash` hace `scrollIntoView` del elemento. React Router no scrollea al hash por su cuenta.
- Las secciones llevan `scroll-margin-top` para no quedar tapadas por la navbar fija.
- En viewport angosto el índice pasa a una fila de chips horizontales pegada arriba.

Slugs: `activos-inmobiliarios`, `administracion-alquileres`, `puesta-en-valor`, `urbanizaciones`, `asesoria-financiera`.

### 5.4 Navbar

Hoy hay dos desplegables —Venta y Alquiler— con los mismos cinco tipos adentro. Se unifican en uno solo, **Propiedades**, con los cinco tipos y sin filtro de operación (`/propiedades?tipo_propiedad=casa`). La operación queda como decisión de la barra y de los filtros del listado, no de la navegación.

Se agrega un desplegable **Servicios** con los cinco servicios, cada uno a `/servicios#<slug>`, reusando el componente de desplegable y las clases CSS que ya existen.

### 5.5 Listado

El input de texto libre de ciudad se reemplaza por un select alimentado por el mismo endpoint de zonas. Hoy, llegando desde la barra con `ciudad=Yerba Buena`, la página muestra un input editable que el usuario puede romper tipeando; con el select, barra y listado ofrecen exactamente las mismas zonas. El resto de la lógica de `Listado.tsx` no se toca.

### 5.6 Tests

No hay runner de tests en `client/`. Se agrega `vitest`, `@testing-library/react`, `@testing-library/user-event` y `jsdom`, con script `npm test`.

Cobertura:

- `BuscadorHero`: arma la URL con los params correctos; omite los vacíos; cambia de modo y de campos al tocar las pestañas; el modo Servicios navega al ancla; sobrevive a que el endpoint de zonas falle.
- `catalogo-servicios.ts`: los cinco servicios están, los slugs son únicos y ninguno tiene lista de items vacía.
- `Servicios.tsx`: renderiza los cinco bloques con sus ids de ancla y el índice con las cinco entradas.
- `Navbar`: el desplegable Propiedades enlaza a los cinco tipos sin `tipo_operacion`; el de Servicios enlaza a los cinco anclas.

## 6. Riesgos

- **Zonas vacías.** Si la base no tiene ubicaciones cargadas, el select de zona muestra solo "Todo Tucumán". Es el comportamiento correcto —mejor que ofrecer zonas muertas— pero conviene saberlo al probar.
- **Solapamiento de contenido.** El servicio 1 incluye compra, venta, alquiler y tasaciones, que es lo mismo que ofrece la pestaña Propiedades. Son dos entradas al mismo negocio (buscar inventario vs. contratar acompañamiento) y el texto de cada pestaña tiene que dejarlo claro.
- **SQLite en los tests de backend.** Los modelos apuntan a MySQL. Si algún tipo no resuelve, se cae al fallback de la sección 4.2.
