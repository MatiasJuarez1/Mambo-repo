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
