import { api } from './client'
import type {
  Publicacion,
  PublicacionListItem,
  PublicacionCreatePayload,
  PublicacionUpdatePayload,
} from '../types/publicacion'

const BASE = '/api/v1/publicaciones'

export interface ListarPublicacionesParams {
  estado?: string
  propiedad_id?: number
  skip?: number
  limit?: number
}

function toQuery(params: ListarPublicacionesParams): string {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') q.set(k, String(v))
  })
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const publicacionesApi = {
  // Endpoint público (solo activas)
  listarPublicas: (params: Omit<ListarPublicacionesParams, 'estado'> = {}) =>
    api.get<PublicacionListItem[]>(`${BASE}/publicas${toQuery(params)}`),

  // Admin: todos los estados
  listar: (params: ListarPublicacionesParams = {}) =>
    api.get<PublicacionListItem[]>(`${BASE}${toQuery(params)}`),

  obtener: (id: number) =>
    api.get<Publicacion>(`${BASE}/${id}`),

  crear: (data: PublicacionCreatePayload) =>
    api.post<Publicacion>(BASE, data),

  actualizar: (id: number, data: PublicacionUpdatePayload) =>
    api.put<Publicacion>(`${BASE}/${id}`, data),

  eliminar: (id: number) =>
    api.delete<void>(`${BASE}/${id}`),
}
