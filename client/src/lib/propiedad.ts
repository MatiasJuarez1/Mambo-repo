import type {
  EstadoComercial,
  PropiedadListItem,
  TipoPropiedad,
  TipoOperacion,
} from '../types/propiedad'
import { BASE_URL } from '../api/client'

/**
 * Resuelve la URL de un medio a una URL usable por el navegador.
 * Los archivos locales se guardan como rutas relativas (`/media/...`) servidas
 * por el backend, así que se les antepone su host. Las URLs absolutas (http...)
 * —p. ej. cuando en el futuro se migre a la nube— se devuelven sin tocar.
 */
export function mediaUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url
  return `${BASE_URL}${url}`
}

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

/**
 * Tipos de propiedad navegables, en plural y en el orden en que se muestran.
 *
 * A diferencia de `LABEL_TIPO` —que da el nombre en singular de UNA propiedad
 * concreta (fichas, detalle)— esta lista nombra CATEGORÍAS: alimenta el menú de
 * la navbar, el desplegable del buscador y los filtros del listado.
 * `otro` queda afuera a propósito: no es una categoría navegable.
 */
export const OPCIONES_TIPO = [
  { valor: 'casa', label: 'Casas' },
  { valor: 'depto', label: 'Departamentos' },
  { valor: 'terreno', label: 'Lotes y terrenos' },
  { valor: 'local', label: 'Locales comerciales' },
  { valor: 'oficina', label: 'Oficinas' },
] as const satisfies readonly { valor: TipoPropiedad; label: string }[]

/**
 * Operaciones que se ofrecen en la barra de búsqueda del hero.
 *
 * `temporal` existe en el enum `TipoOperacion` (y `LABEL_OPERACION` lo etiqueta),
 * pero no se expone acá para no recargar el buscador: se sigue viendo como opción
 * en los filtros del listado.
 */
export const OPCIONES_OPERACION = [
  { valor: 'venta', label: 'Venta' },
  { valor: 'alquiler', label: 'Alquiler' },
] as const satisfies readonly { valor: TipoOperacion; label: string }[]

/**
 * Estados comerciales que se muestran en el sitio público.
 *
 * `baja` queda afuera a propósito: es una propiedad retirada del inventario, no
 * una operación concretada, y no aporta nada al visitante. Las reservadas y las
 * cerradas sí se muestran, con una faja encima (ver `etiquetaCierre`), porque son
 * la prueba de las operaciones que la inmobiliaria fue cerrando.
 */
export const ESTADOS_PUBLICOS = [
  'disponible',
  'reservada',
  'cerrada',
] as const satisfies readonly EstadoComercial[]

/**
 * Texto de la faja que cruza la foto cuando la propiedad ya no se puede operar.
 * Devuelve `null` si sigue disponible —o si está dada de baja, que no debería
 * llegar al sitio público—.
 *
 * `estado_comercial` no distingue una venta de un alquiler: la palabra sale de
 * `tipo_operacion`. Se usa la forma masculina (el sello clásico del rubro) porque
 * la misma ficha puede ser una casa, un local o un terreno.
 */
export function etiquetaCierre(
  p: Pick<PropiedadListItem, 'estado_comercial' | 'tipo_operacion'>,
): string | null {
  if (p.estado_comercial === 'reservada') return 'Reservado'
  if (p.estado_comercial !== 'cerrada') return null
  return p.tipo_operacion === 'venta' ? 'Vendido' : 'Alquilado'
}

/**
 * Etiquetas de `estado_comercial` para cuando NO se conoce la operación.
 *
 * `cerrada` es el nombre técnico del enum de la base y no le dice nada a quien carga
 * una propiedad: la operación puede haber sido una venta o un alquiler. Donde el
 * contexto abarca las dos a la vez —el filtro del listado del panel— se nombran
 * ambas; donde hay una propiedad concreta se usa `etiquetaEstado`, que elige una.
 *
 * `baja` se explicita porque se confunde con `cerrada`: no es una operación
 * concretada sino una propiedad retirada, y es el único estado que no se publica.
 */
export const LABEL_ESTADO: Record<EstadoComercial, string> = {
  disponible: 'Disponible',
  reservada:  'Reservada',
  cerrada:    'Vendida / Alquilada',
  baja:       'Dada de baja',
}

/**
 * Etiqueta de `estado_comercial` para una propiedad concreta.
 *
 * Va en femenino porque acompaña a «la propiedad» («Estado: Vendida»). Es la
 * diferencia con `etiquetaCierre`, que devuelve el masculino del sello que cruza la
 * foto («VENDIDO»); son dos textos distintos a propósito, no una inconsistencia.
 */
export function etiquetaEstado(estado: EstadoComercial, operacion: TipoOperacion): string {
  if (estado !== 'cerrada') return LABEL_ESTADO[estado]
  return operacion === 'venta' ? 'Vendida' : 'Alquilada'
}

/** URL de la imagen principal (o la primera), o null si no hay medios. */
export function imagenPrincipal(p: PropiedadListItem): string | null {
  const m = p.medios.find(x => x.es_principal) ?? p.medios[0]
  return m ? mediaUrl(m.url) : null
}
