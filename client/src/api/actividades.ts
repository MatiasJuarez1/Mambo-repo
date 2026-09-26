import { api } from './client'
import { construirQuery } from '../lib/query'
import type {
  Actividad, ActividadCreatePayload, ActividadUpdatePayload, EstadoActividad, TipoActividad,
} from '../types/actividad'
import type { Paginado } from '../types/persona'

const BASE = '/api/v1/activities'

export interface ListarActividadesParams {
  person_id?: number
  property_id?: number
  deal_id?: number
  assigned_to_user_id?: number
  status?: EstadoActividad
  type?: TipoActividad
  skip?: number
  limit?: number
}

export const actividadesApi = {
  listar: (params: ListarActividadesParams = {}) =>
    api.get<Paginado<Actividad>>(`${BASE}${construirQuery(params)}`),

  crear: (data: ActividadCreatePayload) => api.post<Actividad>(BASE, data),
  editar: (id: number, data: ActividadUpdatePayload) => api.patch<Actividad>(`${BASE}/${id}`, data),
  marcarHecha: (id: number) => api.patch<Actividad>(`${BASE}/${id}/done`),
  cancelar: (id: number) => api.patch<Actividad>(`${BASE}/${id}/cancel`),
  eliminar: (id: number) => api.delete<void>(`${BASE}/${id}`),
}
