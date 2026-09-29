import { api } from './client'
import type { UsuarioBrief } from '../types/inmobiliaria'

export type EntidadAuditada = 'propiedad' | 'contrato' | 'cobro' | 'pago' | 'liquidacion' | 'comision'
export type AccionAuditada = 'crear' | 'editar' | 'baja' | 'borrar'

export interface CambioRegistrado {
  id: number
  entidad: EntidadAuditada
  entidad_id: number
  accion: AccionAuditada
  /** En `editar`, `{campo: [antes, después]}`; en `crear` y `borrar`, los valores al momento. */
  cambios: Record<string, unknown>
  usuario: UsuarioBrief | null
  creado_en: string
}

export interface PaginadoCambios {
  total: number
  items: CambioRegistrado[]
}

export const auditoriaApi = {
  listar: (entidad: EntidadAuditada, entidadId: number, limit = 50) => {
    const q = new URLSearchParams({ entidad, entidad_id: String(entidadId), limit: String(limit) })
    return api.get<PaginadoCambios>(`/api/v1/audit-log?${q}`)
  },
}
