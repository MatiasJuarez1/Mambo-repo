import { api } from './client'
import { construirQuery } from '../lib/query'
import type { DocumentoOut, EntidadDocumento, TipoDocumento } from '../types/documento'

const BASE = '/api/v1/documentos'

/** La entidad como la espera el backend: exactamente un `<entidad>_id`. */
export function paramsDeEntidad(entidad: EntidadDocumento): Record<string, number> {
  if ('propiedadId' in entidad) return { propiedad_id: entidad.propiedadId }
  if ('personaId' in entidad) return { persona_id: entidad.personaId }
  if ('dealId' in entidad) return { deal_id: entidad.dealId }
  return { contrato_id: entidad.contratoId }
}

export const documentosApi = {
  listar: (entidad: EntidadDocumento) =>
    api.get<DocumentoOut[]>(`${BASE}${construirQuery(paramsDeEntidad(entidad))}`),

  // FormData: `api.post` deja que el navegador ponga el Content-Type con el boundary.
  subir: (entidad: EntidadDocumento, tipo: TipoDocumento, archivo: File) => {
    const fd = new FormData()
    fd.append('tipo', tipo)
    fd.append('archivo', archivo)
    Object.entries(paramsDeEntidad(entidad)).forEach(([k, v]) => fd.append(k, String(v)))
    return api.post<DocumentoOut>(BASE, fd)
  },

  eliminar: (documentoId: number) => api.delete<void>(`${BASE}/${documentoId}`),
}
