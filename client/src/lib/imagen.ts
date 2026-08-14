import type { Medio } from '../types/propiedad'
import { mediaUrl } from './propiedad'

/**
 * Lo único que hace falta de un medio para elegir qué archivo bajar.
 *
 * Se tipa como `Pick` y no como `Medio` entero para que también sirva con
 * objetos parciales (los de los tests) y con cualquier otra entidad que en el
 * futuro guarde una foto con el mismo par de campos.
 */
export type MedioConVariantes = Pick<Medio, 'url' | 'variantes'>

/**
 * Ancho de la variante que se pide cuando el hueco es chico y fijo (la
 * miniatura de 48×48 de la tabla del panel). Ahí no hay `srcset` que valga: el
 * tamaño no depende del viewport, así que se elige el archivo a mano.
 */
export const ANCHO_MINIATURA = 400

/**
 * Arma el `srcset` de un medio a partir de sus variantes, o `undefined` si no
 * tiene ninguna —así el `<img>` sale con `src` a secas y el atributo ni aparece
 * en el HTML, que es exactamente el comportamiento anterior a las variantes—.
 *
 * Las claves del diccionario son el ancho real en píxeles de cada copia, que es
 * justo el descriptor `w` que espera el navegador. **Se itera lo que vino**, sin
 * asumir que están las tres: una foto de 600px solo genera la de 400.
 *
 * ## Por qué `url` no entra como candidato
 *
 * La imagen completa (hasta 1920 de lado) sería el candidato más grande, pero la
 * API no expone sus dimensiones y no hay forma de deducirlas: lo único que se
 * sabe por las variantes es una cota inferior (si existe la de 1600, el original
 * mide más de 1600, pero no cuánto más). Anunciarla como `1920w` sería mentirle
 * al navegador —una foto de 1000px publicitada como de 1920 hace que descarte
 * variantes que le alcanzaban— y el algoritmo de selección se apoya en que los
 * descriptores sean ciertos. El techo queda entonces en 1600px, que cubre todos
 * los huecos reales del sitio, y `url` se queda donde es correcto sin declarar
 * ancho: en `src`, como respaldo para los navegadores sin `srcset` y para cuando
 * no hay ninguna variante.
 */
export function srcSetDeMedio(medio: MedioConVariantes): string | undefined {
  if (!medio.variantes) return undefined

  const candidatos = Object.entries(medio.variantes)
    .map(([ancho, url]) => ({ ancho: Number(ancho), url }))
    // Defensivo contra filas escritas a mano: un ancho que no es un número no
    // sirve como descriptor, y un `srcset` inválido invalida la lista entera.
    .filter(c => Number.isFinite(c.ancho) && c.ancho > 0 && !!c.url)
    .sort((a, b) => a.ancho - b.ancho)

  if (candidatos.length === 0) return undefined

  // Las variantes vienen con la misma forma que `url` —relativas en desarrollo,
  // absolutas con R2— así que se resuelven igual.
  return candidatos.map(c => `${mediaUrl(c.url)} ${c.ancho}w`).join(', ')
}

/**
 * URL de la variante de un ancho dado, o la de la imagen completa si esa
 * variante no existe. Para los huecos de tamaño fijo, donde `srcset` no aporta
 * nada porque no hay nada que el navegador tenga que decidir.
 */
export function urlDeVariante(medio: MedioConVariantes, ancho: number): string {
  return mediaUrl(medio.variantes?.[String(ancho)] ?? medio.url)
}
