import type { EstadoContrato, RolParteContrato } from './alquileres'

/** Contacto de una persona, como lo devuelve `/api/v1/people/{id}/contacts`. */
export type TipoContacto = 'email' | 'phone' | 'whatsapp' | 'other'

export interface Contacto {
  id: number
  person_id: number
  type: TipoContacto
  value: string
  is_primary: boolean
  created_at: string
}

export type Rol = 'propietario' | 'comprador' | 'vendedor' | 'inquilino' | 'garante' | 'interesado'

/** Cantidad de vínculos por rol; los calcula el backend, nunca se editan. */
export type Roles = Record<Rol, number>

export interface PersonaListItem {
  id: number
  full_name: string
  document_type: string | null
  document_number: string | null
  created_at: string
  tags: string[]
  roles: Roles
}

export interface Persona extends PersonaListItem {
  first_name: string
  last_name: string
  notes: string | null
  contacts: Contacto[]
  updated_at: string
}

export interface PersonaBrief {
  id: number
  full_name: string
}

export interface ContactoPayload {
  type: TipoContacto
  value: string
  is_primary?: boolean
}

export interface PersonaCreatePayload {
  first_name: string
  last_name: string
  document_type?: string
  document_number?: string
  notes?: string
  contacts?: ContactoPayload[]
}

export type PersonaUpdatePayload = Partial<Omit<PersonaCreatePayload, 'contacts'>>

export interface EtiquetaConteo {
  nombre: string
  cantidad: number
}

/** Respuesta de `/api/v1/people/{id}/vinculos`: lo que muestra la ficha. */
export interface Vinculos {
  propiedades: {
    id: number
    titulo: string
    tipo_operacion: string
    estado_comercial: string
    foto_principal: string | null
  }[]
  reservas: {
    id: number
    status: string
    amount: number | null
    currency: string
    expires_at: string | null
    propiedad: { id: number; titulo: string; estado_comercial: string }
  }[]
  deals: {
    id: number
    title: string
    pipeline: string
    stage: string
    is_won: boolean
    is_lost: boolean
    amount: number | null
    currency: string
    role: string
    propiedad: { id: number; titulo: string; estado_comercial: string } | null
  }[]
  actividades: {
    id: number
    activity_type: string
    status: string
    title: string
    due_at: string | null
  }[]
  // Historial completo de contratos de alquiler, una entrada por (contrato, rol).
  contratos: {
    id: number
    rol: RolParteContrato
    estado: EstadoContrato
    fecha_fin: string
    monto_vigente: string
    moneda: string
    propiedad: { id: number; titulo: string; estado_comercial: string }
  }[]
}

export interface Paginado<T> {
  total: number
  items: T[]
}
