import { OPCIONES_TIPO } from '../../lib/propiedad'
import { SERVICIOS } from '../../pages/public/catalogo-servicios'

/** Una entrada de un desplegable de la navbar. */
export interface EntradaMenu {
  label: string
  to: string
}

// Menú de propiedades: solo filtra por tipo. La operación (venta / alquiler /
// temporal) no es una decisión de navegación — la resuelven la barra del hero y
// los filtros del listado.
export const ENTRADAS_PROPIEDADES: EntradaMenu[] = OPCIONES_TIPO.map(({ valor, label }) => ({
  label,
  to: `/propiedades?tipo_propiedad=${valor}`,
}))

// Menú de servicios: cada entrada baja al ancla de su bloque en /servicios.
export const ENTRADAS_SERVICIOS: EntradaMenu[] = SERVICIOS.map(({ slug, titulo }) => ({
  label: titulo,
  to: `/servicios#${slug}`,
}))
