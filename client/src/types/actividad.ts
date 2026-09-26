import type { PersonaBrief } from './persona'
import type { PropiedadBrief } from './reserva'
import type { UsuarioBrief } from './inmobiliaria'

export type TipoActividad = 'llamada' | 'visita' | 'tarea' | 'whatsapp' | 'email' | 'otro'
export type EstadoActividad = 'pendiente' | 'hecha' | 'cancelada'

export const TIPOS_ACTIVIDAD: TipoActividad[] = [
  'llamada', 'visita', 'tarea', 'whatsapp', 'email', 'otro',
]

export const ETIQUETAS_TIPO_ACTIVIDAD: Record<TipoActividad, string> = {
  llamada: 'Llamada',
  visita: 'Visita',
  tarea: 'Tarea',
  whatsapp: 'WhatsApp',
  email: 'Email',
  otro: 'Otro',
}

export const ETIQUETAS_ESTADO_ACTIVIDAD: Record<EstadoActividad, string> = {
  pendiente: 'Pendiente',
  hecha: 'Hecha',
  cancelada: 'Cancelada',
}

/** Lo mínimo de una operación para nombrarla y linkearla. */
export interface OperacionBrief {
  id: number
  title: string
}

export interface Actividad {
  id: number
  title: string
  activity_type: TipoActividad
  status: EstadoActividad
  description: string | null
  due_at: string | null
  done_at: string | null
  assigned_to: UsuarioBrief | null
  created_by: UsuarioBrief
  person: PersonaBrief | null
  propiedad: PropiedadBrief | null
  deal: OperacionBrief | null
  created_at: string
  updated_at: string
}

export interface ActividadCreatePayload {
  title: string
  activity_type: TipoActividad
  description?: string | null
  due_at?: string | null
  assigned_to_user_id?: number | null
  person_id?: number | null
  property_id?: number | null
  deal_id?: number | null
}

export type ActividadUpdatePayload = Partial<ActividadCreatePayload>
