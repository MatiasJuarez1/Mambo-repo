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
  estado_comercial?: string
  ciudad?: string
  precio_min?: number
  precio_max?: number
  skip?: number
  limit?: number
}

function toQuery(params: ListarParams): string {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') q.set(k, String(v))
  })
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const propiedadesApi = {
  listar: (params: ListarParams = {}) =>
    api.get<PropiedadListItem[]>(`${BASE}${toQuery(params)}`),

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

  eliminarMedio: (propiedadId: number, medioId: number) =>
    api.delete<void>(`${BASE}/${propiedadId}/medios/${medioId}`),

  // Características
  agregarCaracteristica: (propiedadId: number, data: { clave: string; valor: string }) =>
    api.post<Caracteristica>(`${BASE}/${propiedadId}/caracteristicas`, data),

  eliminarCaracteristica: (propiedadId: number, caracteristicaId: number) =>
    api.delete<void>(`${BASE}/${propiedadId}/caracteristicas/${caracteristicaId}`),
}
