# Página Nosotros — el equipo de Mambo Group

Fecha: 2026-08-04
Estado: aprobado, pendiente de plan de implementación

## 1. Objetivo

Rediseñar `/nosotros` para que el equipo sea el centro de la página, con las seis
biografías reales y sus retratos.

Hoy la página existe pero es andamiaje: el grid de equipo son tres círculos vacíos con
nombres `Nombre Apellido`, y las secciones de cifras y valores tienen datos inventados
marcados con `TODO`. Ahora hay material real —seis bios escritas y seis fotos— y la
página tiene que dejar de ser un placeholder.

## 2. Punto de partida

`client/src/pages/public/Nosotros.tsx` (commit `e2b84ff`) tiene seis secciones: hero,
historia, cifras, valores, equipo y CTA. De esas, tres arrastran `TODO`:

| Sección | Estado hoy | Destino |
|---|---|---|
| Hero | Copy genérico usable | Se conserva, ajustando el nombre de la marca |
| Historia | `TODO: reemplazar por la historia real` | Se reescribe con material real |
| Cifras | `+10 años`, `+200 operaciones` — inventadas | **Se elimina** |
| Valores | `Claridad / Orden / Decisión` — inventados | **Se elimina** |
| Equipo | Tres círculos vacíos | Se reescribe: 6 personas reales |
| CTA | Funciona | Se conserva |

Las cifras se eliminan porque son afirmaciones falsas sobre una empresa real en una
página pública. Vuelven cuando Sandra confirme los números.

## 3. Decisiones

1. **La página se rediseña entera**, no solo la sección de equipo. Las bios son el
   contenido más fuerte que tiene el sitio y merecen ser la estructura, no un apéndice.
2. **Sandra va destacada**, en una fila propia. No es una jerarquía inventada: es la
   fundadora y su bio tiene el doble de texto que las demás (una cita más dos párrafos).
   Meterla en el grid obligaría a recortarla o a inflar a las otras cinco.
3. **Las fotos se recortan al sujeto** y se sirven sin el logo estampado.
4. **Sin datos de contacto por persona.** No hay mails ni teléfonos individuales
   confirmados. El WhatsApp que aparece estampado en la foto de Agustina es un número
   personal extraído de una imagen y no se usa.
5. **Fotos en color, sin filtro global.** Cinco de las seis son de la misma sesión de
   estudio y ya combinan.

## 4. Contenido

Seis personas. El texto es el que pasó el cliente, con dos ajustes de forma: todas las
frases se unifican como cita (en el original solo la de Sandra venía entrecomillada), y
se corrige `Mambo Groups` → `Mambo Group`.

### 4.1 Sandra Lestard — destacada

- **Rol:** Fundadora · Asesora Inmobiliaria
- **Cita:** «Las propiedades son solo el escenario. La verdadera historia siempre son las personas.»
- **Bio (dos párrafos):**
  > Con más de veinte años de experiencia liderando empresas y equipos de trabajo, Sandra
  > decidió llevar esa visión de gestión al mercado inmobiliario y fundó Mambo Group. Desde
  > donde impulsa una forma distinta de hacer inmobiliaria: más humana, cercana y
  > comprometida con las personas.
  >
  > Su liderazgo se basa en la convicción de que la confianza se construye con
  > transparencia, capacitación permanente y un acompañamiento genuino antes, durante y
  > después de cada operación, de cada negocio. Esa filosofía es la que hoy inspira a todo
  > el equipo de Mambo y define la manera en que trabajamos cada día.
- **Foto:** `Foto-Sandra.jpeg`

### 4.2 El grid — cinco personas

| # | Nombre | Rol | Cita | Archivo de origen |
|---|---|---|---|---|
| 1 | Luisina Cristófaro | Estratega de Marketing y Creadora de Contenido | «Las mejores marcas cuentan historias reales.» | `foto-Luisina.jpeg` |
| 2 | Belén del Corro Lestard | Asesora Inmobiliaria | «La cercanía también es profesionalismo.» | `foto-belen.jpeg` |
| 3 | Agustina Polanco | Corredora Inmobiliaria | «Cada hogar comienza con una buena decisión.» | `foto-agustina.jpeg` |
| 4 | Nadia Medina | Agente Inmobiliaria | «Confianza que acompaña.» | `Foto-Nadia.jpeg` |
| 5 | Marianela Veiga | Agente Inmobiliaria | «Encontrar soluciones es mi forma de ayudar.» | `Foto-Marianela.jpeg` |

Los nombres de esta columna y el de Sandra (§4.1) son los archivos **de origen**, tal como
están hoy en `client/public/`. El código no los referencia: apunta a los recortados que
define §5.3 (`/equipo/<slug>.jpg`).

Bios completas:

- **Luisina:** Licenciada en Higiene y Seguridad, encontró en el marketing y la
  comunicación el espacio ideal para unir el pensamiento estratégico con la creatividad.
  En Mambo desarrolla la identidad de la marca, crea contenidos y diseña estrategias que
  conectan desde la autenticidad, siempre con una mirada humana y orientada a resultados.
- **Belén:** Después de más de diez años de trayectoria en el sector bancario, comercial
  y financiero, Belén decidió volcar toda esa experiencia al negocio inmobiliario
  familiar. Hoy acompaña a cada cliente con una mirada integral, claridad y vocación de
  servicio, manteniendo los valores que dieron origen a Mambo: cercanía, capacitación
  permanente y compromiso genuino.
- **Agustina:** Desde 2019 forma parte del mundo inmobiliario, creciendo profesionalmente
  de la mano de Sandra Lestard y consolidando una forma de trabajar basada en la ética,
  la empatía y el acompañamiento. Mamá de tres hijos, entiende que detrás de cada
  propiedad hay una familia, un proyecto de vida y nuevos comienzos que merecen ser
  acompañados con profesionalismo y calidez.
- **Nadia:** Con una sólida experiencia en el sector inmobiliario y formación junto a una
  de las empresas más reconocidas del medio, Nadia combina conocimiento, cercanía y
  compromiso en cada operación. Dinámica y resolutiva, acompaña a sus clientes con
  transparencia, brindando el respaldo y la confianza necesarios para tomar grandes
  decisiones.
- **Marianela:** Con experiencia en el sector público y privado y formación como
  Licenciada en Resolución de Conflictos y Mediación, Marianela, oriunda de la ciudad de
  Salta, combina escucha, negociación y profesionalismo para acompañar cada operación. Su
  compromiso, honestidad y calidez le permiten generar acuerdos y brindar soluciones que
  transmiten confianza en cada etapa del proceso.

El apellido de Marianela (Veiga) llegó después de la primera redacción de este spec.

## 5. Tratamiento de las fotos

### 5.1 El problema

Los seis archivos no son un set homogéneo:

| Archivo | Dimensiones | Composición |
|---|---|---|
| `Foto-Sandra.jpeg` | 1254×1254 | Logo estampado a la izquierda, sujeto a la derecha |
| `foto-belen.jpeg` | 1254×1254 | Ídem |
| `Foto-Nadia.jpeg` | 1254×1254 | Ídem, sentada |
| `Foto-Marianela.jpeg` | 1086×1448 | Ídem, formato 3:4 |
| `foto-agustina.jpeg` | 1254×1254 | **Flyer completo**: copy, WhatsApp y barra de iconos |
| `foto-Luisina.jpeg` | 960×1280 | Foto de celular, pared beige, sin marca, centrada |

Cinco de seis traen el logo de Mambo Group estampado. Repetirlo seis veces en una grilla
es ruido, y en la de Agustina además viene un teléfono personal. Servidas tal cual pesan
**1.079 KB en total**.

El dato que las salva: en las seis el sujeto está a la derecha y el texto a la izquierda.
Un recorte a la derecha produce seis retratos limpios y comparables.

### 5.2 Por qué no alcanza con `object-fit: cover`

Un `cover` de una fuente 1:1 dentro de una tarjeta 3:4 solo descarta el 25 % del ancho:
la fuente se escala hasta llenar el alto y sobra `1 − 0.75 = 0.25` de ancho. El logo
ocupa cerca de la mitad izquierda del cuadro, así que quedaría cortado a mitad de
palabra. `object-position` desplaza el recorte pero no lo agranda.

### 5.3 La solución: recortar los archivos

Los seis archivos se recortan y reexportan una sola vez, antes de tocar el CSS:

- **Encuadre:** de pecho para arriba, comparable entre las seis. Ni cuerpo entero (Sandra
  quedaría chica) ni primer plano cerrado.
- **Relación:** 3:4 exacta, para que el CSS no tenga que compensar nada.
- **Ancho de salida:** 800 px, es decir 800×1067 (≈2× sobre una tarjeta de ~378 px en
  desktop).
- **Formato:** JPEG calidad 82. Objetivo: ~350 KB en total, contra los 1.079 KB de hoy.
- **Nombres:** se normalizan a `client/public/equipo/<slug>.jpg`, en minúsculas y sin
  tildes, donde `<slug>` es el mismo campo de `Persona` (§7): `sandra`, `luisina`,
  `belen`, `agustina`, `nadia`, `marianela`. Hoy la capitalización de los archivos es
  inconsistente (`Foto-Sandra` vs `foto-belen`).
- **Originales:** se conservan en `client/fotos-originales/` para poder rehacer el recorte
  sin pedir los archivos de nuevo. Va fuera de `public/` a propósito: Vite copia `public/`
  entero al build, así que dejarlos ahí sumaría 1 MB muerto a cada deploy.

Por qué recortar los archivos y no resolverlo en CSS: el CSS necesitaría un punto focal y
un factor de zoom por persona —doce números mágicos sin forma de verificarlos salvo
mirando— y además seguiría bajando 1 MB de fotos al navegador. Recortar resuelve el
encuadre y el peso en el mismo paso, y deja el CSS en un `object-fit: cover` que se lee
solo.

**Salida de emergencia,** si el recorte por archivo no se puede hacer: envolver el `img`
en un contenedor `aspect-ratio: 3/4; overflow: hidden` y darle
`object-position: var(--foco)` + `transform: scale(var(--zoom))` con
`transform-origin: var(--foco)`, definiendo `--foco` y `--zoom` por persona. Es la misma
idea pero calibrada a ojo y sin ganancia de peso.

### 5.4 Resolución

Tarjeta del grid en desktop: `(1200 − 64) / 3 ≈ 378 px`. Con fuentes de 800 px el factor
es ~2.1×, suficiente en pantallas retina. Un primer plano más cerrado bajaría a ~1.4× y
se vería blando; de ahí que el encuadre sea de pecho para arriba y no de cara.

## 6. Estructura de la página

```
[Hero]       Quiénes somos — campo petróleo, sin cambios estructurales
[Historia]   Manifiesto en dos columnas: texto + foto
[Equipo]     Sandra destacada  →  grid de 5
[CTA]        Contactanos / Ver propiedades
```

**Historia** se reescribe con material real (los veinte años de gestión de empresas de
Sandra, la fundación de Mambo Group, la filosofía de transparencia y acompañamiento). No
se inventa nada: todo sale de su bio. Conserva el layout de dos columnas actual.

**CTA** se conserva tal cual. Es la única página institucional del sitio y sin él la
página termina en seco en la última tarjeta.

## 7. Arquitectura de archivos

```
client/src/pages/public/equipo.ts        nuevo   type Persona + const EQUIPO
client/src/components/PersonaCard.tsx    nuevo   tarjeta del grid
client/src/components/PersonaCard.css    nuevo
client/src/pages/public/Nosotros.tsx     reescrito
client/src/pages/public/Nosotros.css     reescrito
client/public/equipo/*.jpg               nuevo   retratos recortados
```

```ts
export type Persona = {
  slug: string      // clave de React y nombre de archivo
  nombre: string
  rol: string
  cita: string
  bio: string[]     // array: Sandra tiene dos párrafos, el resto uno
  foto: string
}
```

Los datos salen a `equipo.ts` porque seis bios largas son ~90 líneas que dentro de la
página solo estorban. `bio` es un array para que Sandra no necesite un tipo aparte.

`PersonaCard` sigue la convención de `PropiedadCard.tsx`: componente más CSS hermano, sin
lógica de datos. Recibe una `Persona` y nada más.

La tarjeta destacada de Sandra va **inline en `Nosotros.tsx`**, no en `PersonaCard`. Su
layout es de dos columnas y el de la tarjeta es vertical; parametrizar esa diferencia
produciría un componente con dos modos que no comparten casi nada.

## 8. Diseño visual

Todo con los tokens de `index.css` (spec `2026-07-24-paleta-de-color-design.md`). No se
agregan colores.

**Sandra destacada.** Dos columnas sobre `--white`: foto a la izquierda (5/12) con
`--radius-md` y `--shadow-card`, texto a la derecha (7/12). Nombre en `--font-serif`
sobre `--petrol`. Rol en versalitas, `letter-spacing: .14em`, `--text-muted`. La cita en
serif itálica, cuerpo grande, con una regla vertical `--magenta` de 2 px a la izquierda:
es el único uso del acento en toda la sección, según la regla de escasez de la paleta.
Los dos párrafos en sans, `--text-muted`.

**Grid.** Fondo `--bone` para separarlo de la fila de Sandra sin necesidad de una línea.
Cada tarjeta: foto 3:4 con `--radius-md`, nombre en serif `--petrol`, rol en versalitas
`--text-muted`, cita en serif itálica, bio en sans a `0.85rem`.

**Hover:** `translateY(-4px)` y de `--shadow-card` a `--shadow-hover`, la misma transición
que ya usan las tarjetas de propiedades. Sin zoom sobre la foto: son retratos de personas
reales, no fotos de producto.

## 9. Responsive

| Ancho | Sandra destacada | Grid |
|---|---|---|
| ≥1024 px | 2 columnas (5/12 + 7/12) | 3 columnas, última fila **centrada** (3+2) |
| 640–1023 px | 2 columnas ajustadas | 2 columnas, última centrada (2+2+1) |
| <640 px | Apilada, foto arriba | 1 columna |

Cinco tarjetas no entran parejas en tres ni en dos columnas. En vez de dejar el hueco a la
derecha, la última fila se centra: se lee como decisión y no como error. Se implementa con
flex `wrap` + `justify-content: center` y un `flex-basis` calculado, no con
`grid-template-columns`, porque CSS Grid no permite centrar una fila incompleta.

## 10. Accesibilidad y performance

- `alt` descriptivo por persona: `"Belén del Corro Lestard, asesora inmobiliaria"`. El
  placeholder actual usa `aria-hidden` porque no había foto; se elimina.
- Jerarquía de encabezados: `h1` en el hero, `h2` por sección, `h3` por persona.
- Contraste: los tokens ya están validados en el spec de paleta. La combinación nueva a
  verificar es serif itálica sobre `--bone`.
- `loading="lazy"` en las cinco del grid; Sandra en `eager` porque entra casi en el
  viewport inicial.
- `width` y `height` explícitos en los `img` para evitar saltos de layout al cargar.

## 11. Fuera de alcance

- **Cifras del grupo.** Vuelven cuando haya números reales confirmados.
- **`WHATSAPP_NUMERO`** sigue en placeholder (`5493810000000`) en `config/contacto.ts`. La
  página usa `EMAIL_CONTACTO`, que sí es plausible, pero tampoco está confirmado.
- **«Mambo Groups» en el resto del sitio.** Se corrige solo en esta página; el mismo error
  aparece en otros archivos y merece un cambio aparte.
- **Contacto por persona.** El modelo `Persona` deja lugar para agregar un campo después.
- **Panel de administración del equipo.** Los datos van en un archivo estático. Seis
  personas que cambian una vez por año no justifican tabla, endpoint ni ABM.

## 12. Decisiones abiertas

1. **La foto de Luisina desentona.** Es la única sacada con celular, contra pared beige y
   sin la marca; las otras cinco son de la misma sesión de estudio. El recorte de pecho
   para arriba lo atenúa. Conviene pedir que la repitan en la próxima sesión.
2. **Sin filtro global sobre las fotos.** Se evaluó blanco y negro y duotono petróleo para
   homogeneizar el set. Se descartó: con la foto nueva de Belén ya no hace falta, y es una
   decisión estética que le corresponde al cliente.
