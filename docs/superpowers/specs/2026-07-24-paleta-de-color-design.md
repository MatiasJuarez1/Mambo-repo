# Paleta de color — Petróleo y tinta

Fecha: 2026-07-24
Estado: aprobado, pendiente de plan de implementación

## 1. Objetivo

Definir una paleta única para el frontend de Mambo, derivada del logo de la marca, y
eliminar la ambigüedad cromática que hay hoy en el código.

El disparador es un conflicto de tres fuentes:

| Fuente | Colores | Estado |
|---|---|---|
| Spec de rediseño (2026-07-06) | teal `#076766` + rosa `#DE1267` | commiteado |
| `client/src/index.css` actual | verde `#1f3d34` + dorado `#c2a878` + crema `#ece4d3` | sin commitear, con alias `--pink → gold` |
| Logo `client/public/logo-mambo-horizontal.png` | negro `#000000`, gris `#747373`, magenta `#EE016A` | es la marca |

Decisión: **el logo manda**. La paleta se deriva de sus colores; el experimento
verde/dorado se descarta.

## 2. Filosofía

Tres ideas ordenan todo lo demás:

1. **El acento se gana con escasez.** El logo usa dos formas neutras grandes y una
   pincelada magenta chica. El sitio replica esa proporción: cuando el magenta aparece
   dos veces por pantalla se lee como decisión; cuando aparece diez, como plantilla.
2. **El color de marca no hace trabajo semántico.** Hoy el mismo rosa dice "reservada"
   y "venta" (`Badge.tsx:8-12`). Son lenguajes distintos y necesitan escalas distintas.
3. **El campo oscuro es un neutro con temperatura, no un color de marca.** El verde
   petróleo puede repetirse en grandes superficies sin cansar; el magenta no.

## 3. Tokens

### 3.1 Neutros

| Token | Hex | Rol |
|---|---|---|
| `--ink` | `#121212` | titulares serif, texto fuerte |
| `--graphite` | `#6A6969` | texto secundario |
| `--line` | `#E2E1DF` | bordes, divisores |
| `--bone` | `#F7F6F4` | superficie alterna (secciones, filas de tabla, fondos de página) |
| `--white` | `#FFFFFF` | fondo principal |

`--ink` es `#121212` y no negro puro: el negro absoluto sobre blanco vibra en pantalla
y cansa la lectura sostenida. El logo conserva `#000000` porque es una forma, no un
párrafo.

`--graphite` es el gris del logo (`#747373`) oscurecido ~4%. Justificación en §6.

`--line` y `--bone` son levemente cálidos, en reemplazo del `#f8f9fb` azulado que hoy
está hardcodeado en cuatro archivos. Un gris frío junto a un verde petróleo lee a
dashboard corporativo; uno cálido lee a boutique inmobiliaria.

### 3.2 Petróleo — el campo oscuro

| Token | Hex | Rol |
|---|---|---|
| `--petrol` | `#0E3A3B` | hero, franjas oscuras, CTA, precios, badges de operación |
| `--petrol-deep` | `#071F20` | footer, sidebar admin |
| `--petrol-soft` | `#E8EFEF` | fondos tenues, hover de fila de tabla |

### 3.3 Magenta — el acento

| Token | Hex | Rol |
|---|---|---|
| `--magenta` | `#EE016A` | magenta exacto del logo |
| `--magenta-deep` | `#C10154` | hover, y todo magenta sobre texto chico |

Van dos tonos y no uno porque el magenta puro se queda a un pelo del mínimo accesible
para texto chico (4.33 contra 4.5 requerido). Sirve para botones y títulos; no para un
link de 13px.

### 3.4 Escala semántica — estados del dato

Apagada a propósito, para que no compita con el magenta de marca.

| Estado | Texto | Fondo | Token |
|---|---|---|---|
| Disponible / Activa | `#0F7A5A` | `#E4F2EC` | `--estado-ok` / `--estado-ok-bg` |
| Reservada / Pausada | `#8A5A00` | `#FBF0DC` | `--estado-espera` / `--estado-espera-bg` |
| Cerrada | `#5C5C5C` | `#EFEFEF` | `--estado-neutro` / `--estado-neutro-bg` |
| Baja / Eliminada | `#B3261E` | `#FBE9E7` | `--estado-baja` / `--estado-baja-bg` |

### 3.5 Tipos de operación

`venta`, `alquiler` y `temporal` describen un tipo, no un estado. Van todos en
`--petrol` sólido con texto blanco; se distinguen por la etiqueta, no por el color.
Esto elimina la mayor fuente de repetición cromática del listado, donde el badge de
operación aparece en cada card.

## 4. Regla de asignación

> Si el color comunica un **estado del dato**, sale de la escala semántica (§3.4).
> Si comunica **marca**, es magenta.
> Todo lo demás es neutro o petróleo.

### 4.1 Dónde va el magenta (y solo ahí)

- Botón primario: `.btn-primary`, `.btn-pink` del admin, "Consultar por WhatsApp"
- Ítem activo del sidebar admin
- La barrita de 2px del `.eyebrow`
- Acento de hover de las cards (`.categoria-card`, `.nosotros-valor-card`) — aparece
  de a uno por vez

Son 4 usos. Hoy el token de acento aparece en 20 lugares del CSS.

### 4.2 Qué deja de ser magenta

| Elemento | Archivo | Pasa a |
|---|---|---|
| Badge de operación en card | `PropiedadCard.css:52` | `--petrol` |
| Badges de operación en detalle | `Detalle.css:56,80` | `--petrol` |
| Hovers de navbar | `index.css:113,164,201` | `--petrol` |
| `.section-label` | `index.css:747` | `--petrol` |
| Link "Ver todas →" | `index.css:534` | `--petrol` |
| Bullets de características | `Detalle.css:104` | `--petrol` |
| Tile "Reservadas" | `StatTile.css:26` | `--estado-espera` |
| Tile "Disponibles" | `StatTile.css` (tono `teal`) | `--estado-ok` |

Los tonos de `StatTile` (`tono="teal" \| "pink"`, usados en `Dashboard.tsx:28-29` y
`Lista.tsx:84-85`) pasan a `tono="ok" \| "espera"`, alineados con la escala semántica.

Los hovers de la navbar pasan a petróleo por dos motivos: en versalita de 12px el
magenta no alcanza el contraste mínimo, y mantiene el header calmo.

## 5. Migración

### 5.1 Renombrado

Se **eliminan los alias** `--pink`, `--pink-dark`, `--teal`, `--teal-dark`, `--green`,
`--gold`, `--cream`, `--gray` y se reemplazan por los nombres de §3.

Alcance medido: 117 referencias en CSS (`--teal` 36, `--gray` 37, `--pink` 20,
`--green` 10, `--cream` 7, `--gold` 3).

La alternativa —conservar los alias y cambiar solo los valores— es un cambio de 6
líneas, pero deja permanentemente un archivo donde hay que aprender un mapa falso
(`--pink` apuntando a un dorado) antes de tocar nada. Con 117 referencias el reemplazo
mecánico es acotado; el alias es deuda indefinida.

### 5.2 Colores hardcodeados a absorber

| Color | Archivos | Pasa a |
|---|---|---|
| `#f8f9fb` | `Detalle.css`, `Listado.css`, `Lista.css`, `AdminLayout.css` | `--bone` |
| `#dc2626` | `Detalle.css`, `Lista.css`, `AdminLayout.css` (×3) | `--estado-baja` |
| `#fee2e2` / `#991b1b` | `Formulario.css` | `--estado-baja-bg` / `--estado-baja` |
| Paleta completa de badges | `Badge.css:12-17` | escala semántica §3.4 |
| `#d1d5db` (degradado) | `PropiedadCard.css:37`, `Detalle.css:51` | `--line` |
| `#fff` literal | `Formulario.css:138` | `--white` |

### 5.3 Tintes rgba() hardcodeados

Diez tintes translúcidos arrastran colores de tres paletas abandonadas. No los detecta
un grep de hexadecimales, por lo que quedarían como fantasmas si no se listan:

| Tinte | Origen | Archivos | Pasa a |
|---|---|---|---|
| `rgba(7,103,102,·)` | teal viejo | `index.css:51,296,297,607`, `Nosotros.css:171` | tinte de `--petrol` |
| `rgba(5,78,78,0.55)` | teal-dark viejo | `Detalle.css:44` | tinte de `--petrol-deep` |
| `rgba(194,168,120,0.12)` | dorado descartado | `index.css:279`, `Nosotros.css:24` | tinte de `--petrol` claro |
| `rgba(236,228,211,0.55)` | crema descartado | `index.css:334` | `--line` sobre oscuro |
| `rgba(21,42,36,0.22)` | verde descartado | `index.css:372` | tinte de `--petrol-deep` |

Se definen dos tokens de sombra en `:root` para no repetir el tinte:
`--shadow-card` (ya existe, neutro) y `--shadow-hover` con tinte petróleo
`0 14px 38px rgba(14, 58, 59, 0.13)`.

### 5.4 Cambio en `Badge.tsx`

El tipo `Color` pasa de `'teal' | 'pink' | 'yellow' | 'gray' | 'red' | 'blue'` a
`'ok' | 'espera' | 'neutro' | 'baja' | 'operacion'`, y `colorMap` se reescribe según
§3.4 y §3.5.

## 6. Accesibilidad

Contrastes verificados por cálculo de luminancia relativa (WCAG 2.1):

| Par | Ratio | Veredicto |
|---|---|---|
| `--ink` sobre blanco | 17.0 | ✓ AAA |
| Blanco sobre `--petrol` | 12.5 | ✓ AAA |
| `--magenta-deep` sobre blanco | 6.18 | ✓ AA |
| `--graphite` sobre blanco | 5.41 | ✓ AA |
| `--graphite` sobre `--bone` | 5.02 | ✓ AA |
| `--magenta` sobre blanco | 4.33 | ✗ texto chico — solo ≥18px o bold |
| `#747373` (gris del logo) sobre `--bone` | 4.34 | ✗ — motivo del ajuste |

El gris exacto del logo pasa sobre blanco (4.67) pero **no sobre `--bone`** (4.34,
mínimo 4.5). Como el texto secundario cae sobre ambas superficies, se oscurece un 4% a
`#6A6969`. A ojo es indistinguible; el `#747373` original queda documentado para uso
decorativo (no texto).

Reglas duras:

1. Magenta puro nunca sobre texto menor a 18px o no-bold → usar `--magenta-deep`.
2. Todo par texto/fondo ≥ 4.5:1 (≥ 3:1 para texto ≥18px y para bordes de controles).
3. Ningún estado se comunica solo por color: siempre lleva etiqueta textual. Los
   badges actuales ya cumplen esto vía `labelMap`.

## 7. Fuera de alcance

- Tipografías: siguen Cormorant Garamond + Inter, sin cambios.
- Estructura, layout y componentes: sin cambios. Este spec toca color únicamente.
- Modo oscuro: no se implementa. Los tokens quedan nombrados por rol y no por
  apariencia, lo que no lo impide a futuro.
- El logo en negativo para el footer: requiere un archivo que todavía no existe.

## 8. Criterio de terminado

- `grep -rE "#[0-9a-fA-F]{3,6}" client/src --include=*.css` no devuelve resultados
  fuera del bloque `:root` de `index.css`.
- `grep -rn "rgba(" client/src --include=*.css` solo devuelve tintes de blanco, negro
  o de tokens definidos en `:root` — ningún color de marca literal.
- No quedan referencias a `--pink`, `--teal`, `--green`, `--gold`, `--cream`, `--gray`.
- `npm run build` limpio.
- Revisión visual de las 6 pantallas: Home, Listado, Detalle, Nosotros, Dashboard
  admin, Lista admin.
