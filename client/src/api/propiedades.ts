import { api } from './client'
import type {
  Propiedad,
  PropiedadListItem,
  PropiedadCreatePayload,
  PropiedadUpdatePayload,
  Medio,
  Caracteristica,
} from '../types/propiedad'

const BASE = '/api/v1/propiedades'

export interface ListarParams {
  tipo_propiedad?: string
  tipo_operacion?: string
  /** Un estado exacto. Para pedir varios a la vez, usar `estados`. */
  estado_comercial?: string
  /** Varios estados a la vez; viaja como el parámetro repetido que espera FastAPI. */
  estados?: readonly string[]
  ciudad?: string
  precio_min?: number
  precio_max?: number
  skip?: number
  limit?: number
}

function toQuery(params: ListarParams): string {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === '') return
    // FastAPI lee las listas como el mismo parámetro repetido
    // (?estados=disponible&estados=cerrada), no como valores separados por coma.
    if (Array.isArray(v)) v.forEach(item => q.append(k, String(item)))
    else q.set(k, String(v))
  })
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const propiedadesApi = {
  listar: (params: ListarParams = {}) =>
    api.get<PropiedadListItem[]>(`${BASE}${toQuery(params)}`),

  // Zonas (ciudades) que hoy tienen propiedades publicadas, para los desplegables.
  ciudades: () =>
    api.get<string[]>(`${BASE}/ciudades`),

  obtener: (id: number) =>
    api.get<Propiedad>(`${BASE}/${id}`),

  crear: (data: PropiedadCreatePayload) =>
    api.post<Propiedad>(BASE, data),

  actualizar: (id: number, data: PropiedadUpdatePayload) =>
    api.put<Propiedad>(`${BASE}/${id}`, data),

  eliminar: (id: number) =>
    api.delete<void>(`${BASE}/${id}`),

  // Medios
  agregarMedio: (propiedadId: number, data: Omit<Medio, 'id' | 'propiedad_id' | 'creado_en'>) =>
    api.post<Medio>(`${BASE}/${propiedadId}/medios`, data),

  // Sube un archivo de imagen (multipart) y lo asocia a la propiedad.
  subirMedio: (propiedadId: number, archivo: File, esPrincipal = false) => {
    const fd = new FormData()
    fd.append('archivo', archivo)
    fd.append('es_principal', String(esPrincipal))
    return api.post<Medio>(`${BASE}/${propiedadId}/medios/upload`, fd)
  },

  eliminarMedio: (propiedadId: number, medioId: number) =>
    api.delete<void>(`${BASE}/${propiedadId}/medios/${medioId}`),

  // Características
  agregarCaracteristica: (propiedadId: number, data: { clave: string; valor: string }) =>
    api.post<Caracteristica>(`${BASE}/${propiedadId}/caracteristicas`, data),

  eliminarCaracteristica: (propiedadId: number, caracteristicaId: number) =>
    api.delete<void>(`${BASE}/${propiedadId}/caracteristicas/${caracteristicaId}`),
}
