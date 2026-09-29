import { api } from './client'
import type { TipoOperacion, TipoPropiedad } from '../types/propiedad'
import type { PropiedadBrief } from '../types/reserva'

/** Criterios de una búsqueda guardada. `null` = cualquiera. */
export interface CriteriosBusqueda {
  tipo_operacion: TipoOperacion | null
  tipo_propiedad: TipoPropiedad | null
  ciudad: string | null
  moneda: string | null
  precio_min: string | number | null
  precio_max: string | number | null
  dormitorios_min: number | null
  notas: string | null
}

export interface Busqueda extends CriteriosBusqueda {
  id: number
  person: { id: number; full_name: string }
  activa: boolean
  created_at: string
  /** Propiedades disponibles que hoy la cumplen (0 si está pausada). */
  coincidencias: number
}

export interface Coincidencias {
  busqueda_id: number
  propiedades: PropiedadBrief[]
}

const BASE = '/api/v1/busquedas'

export const busquedasApi = {
  listar: (personId: number) =>
    api.get<Busqueda[]>(`${BASE}?person_id=${personId}`),

  crear: (personId: number, criterios: Partial<CriteriosBusqueda>) =>
    api.post<Busqueda>(BASE, { person_id: personId, ...criterios }),

  actualizar: (id: number, cambios: Partial<CriteriosBusqueda> & { activa?: boolean }) =>
    api.patch<Busqueda>(`${BASE}/${id}`, cambios),

  borrar: (id: number) =>
    api.delete<void>(`${BASE}/${id}`),

  coincidencias: (id: number) =>
    api.get<Coincidencias>(`${BASE}/${id}/coincidencias`),

  /** Búsquedas activas a las que les sirve la propiedad: a quién ofrecérsela. */
  interesados: (propiedadId: number) =>
    api.get<Busqueda[]>(`${BASE}/interesados/${propiedadId}`),
}
