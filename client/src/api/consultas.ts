import { api } from './client'

/** Lo que manda el formulario "Solicitar visita" de la ficha pública. */
export interface ConsultaPayload {
  propiedad_id: number
  nombre: string
  apellido: string
  telefono: string
  email?: string
  /** `AAAA-MM-DD`: un día, sin horario. */
  fecha_preferida?: string
  mensaje?: string
  /** Trampa para bots: el formulario lo oculta, así que una persona lo deja vacío. */
  sitio_web?: string
}

export interface ConsultaRecibida {
  mensaje: string
}

export const consultasApi = {
  enviar: (payload: ConsultaPayload) =>
    api.post<ConsultaRecibida>('/api/v1/consultas', payload),
}
