import { api } from './client'
import { construirQuery } from '../lib/query'
import type { Paginado } from '../types/persona'
import type { Comision, ComisionIn } from '../types/comision'
import type {
  Operacion, OperacionCreatePayload, OperacionListItem, OperacionUpdatePayload,
  Parte, PartePayload, Pipeline, PipelineResumen,
} from '../types/operacion'

const BASE = '/api/v1'

export interface ListarOperacionesParams {
  pipeline_id?: number
  stage_id?: number
  is_closed?: boolean
  skip?: number
  limit?: number
}

export const operacionesApi = {
  pipelines:  ()                 => api.get<PipelineResumen[]>(`${BASE}/pipelines`),
  pipeline:   (id: number)       => api.get<Pipeline>(`${BASE}/pipelines/${id}`),

  listar:     (params: ListarOperacionesParams = {}) => api.get<Paginado<OperacionListItem>>(`${BASE}/deals${construirQuery(params)}`),
  obtener:    (id: number)                            => api.get<Operacion>(`${BASE}/deals/${id}`),
  crear:      (data: OperacionCreatePayload)          => api.post<Operacion>(`${BASE}/deals`, data),
  editar:     (id: number, data: OperacionUpdatePayload) => api.patch<Operacion>(`${BASE}/deals/${id}`, data),
  moverEtapa: (id: number, stage_id: number)          => api.patch<Operacion>(`${BASE}/deals/${id}/stage`, { stage_id }),
  eliminar:   (id: number)                            => api.delete<void>(`${BASE}/deals/${id}`),

  agregarParte: (id: number, data: PartePayload) => api.post<Parte>(`${BASE}/deals/${id}/parties`, data),
  quitarParte:  (id: number, parteId: number)    => api.delete<void>(`${BASE}/deals/${id}/parties/${parteId}`),

  comision:        (id: number)                   => api.get<Comision>(`${BASE}/deals/${id}/comision`),
  guardarComision: (id: number, data: ComisionIn) => api.put<Comision>(`${BASE}/deals/${id}/comision`, data),
}
