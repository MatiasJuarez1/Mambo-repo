import { api } from './client'
import { construirQuery } from '../lib/query'
import type { Paginado } from '../types/persona'
import type { Reserva, ReservaCreatePayload } from '../types/reserva'

const BASE = '/api/v1/reservations'

export interface ListarReservasParams {
  status?: string
  person_id?: number
  property_id?: number
  skip?: number
  limit?: number
}

export const reservasApi = {
  listar:    (params: ListarReservasParams = {}) => api.get<Paginado<Reserva>>(`${BASE}${construirQuery(params)}`),
  obtener:   (id: number)                         => api.get<Reserva>(`${BASE}/${id}`),
  crear:     (data: ReservaCreatePayload)         => api.post<Reserva>(BASE, data),
  cancelar:  (id: number)                         => api.patch<Reserva>(`${BASE}/${id}/cancel`),
  vencer:    (id: number)                         => api.patch<Reserva>(`${BASE}/${id}/expire`),
  convertir: (id: number)                         => api.patch<Reserva>(`${BASE}/${id}/convert`),
}
