import { api } from './client'
import type {
  Contacto, ContactoPayload, EtiquetaConteo, Paginado, Persona, PersonaCreatePayload,
  PersonaListItem, PersonaUpdatePayload, Vinculos,
} from '../types/persona'

const BASE = '/api/v1/people'

export interface ListarPersonasParams {
  search?: string
  tag?: string
  rol?: string
  skip?: number
  limit?: number
}

function query(params: object): string {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') q.set(k, String(v))
  })
  const s = q.toString()
  return s ? `?${s}` : ''
}

export const personasApi = {
  listar:   (params: ListarPersonasParams = {}) => api.get<Paginado<PersonaListItem>>(`${BASE}${query(params)}`),
  obtener:  (id: number)                         => api.get<Persona>(`${BASE}/${id}`),
  vinculos: (id: number)                         => api.get<Vinculos>(`${BASE}/${id}/vinculos`),
  crear:    (data: PersonaCreatePayload)         => api.post<Persona>(BASE, data),
  editar:   (id: number, data: PersonaUpdatePayload) => api.patch<Persona>(`${BASE}/${id}`, data),
  eliminar: (id: number)                         => api.delete<void>(`${BASE}/${id}`),

  etiquetas:      ()                               => api.get<EtiquetaConteo[]>(`${BASE}/tags`),
  setEtiquetas:   (id: number, tags: string[])     => api.put<Persona>(`${BASE}/${id}/tags`, { tags }),

  agregarContacto: (id: number, data: ContactoPayload)         => api.post<Contacto>(`${BASE}/${id}/contacts`, data),
  quitarContacto:  (id: number, contactoId: number)            => api.delete<void>(`${BASE}/${id}/contacts/${contactoId}`),
  marcarPrincipal: (id: number, contactoId: number)            => api.patch<Contacto>(`${BASE}/${id}/contacts/${contactoId}`, { is_primary: true }),
}
