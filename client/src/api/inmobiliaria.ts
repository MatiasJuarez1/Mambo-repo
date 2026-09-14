import { api } from './client'
import type { Inmobiliaria, InmobiliariaUpdatePayload } from '../types/inmobiliaria'

const BASE = '/api/v1/inmobiliaria'

export const inmobiliariaApi = {
  obtener:    ()                                  => api.get<Inmobiliaria>(BASE),
  actualizar: (data: InmobiliariaUpdatePayload)   => api.put<Inmobiliaria>(BASE, data),
  subirLogo:  (archivo: File) => {
    const form = new FormData()
    form.append('archivo', archivo)
    return api.post<Inmobiliaria>(`${BASE}/logo`, form)
  },
}
