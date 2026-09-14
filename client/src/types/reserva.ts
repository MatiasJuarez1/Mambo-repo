import type { PersonaBrief } from './persona'

export type EstadoReserva = 'activa' | 'cancelada' | 'vencida' | 'convertida'

export interface PropiedadBrief {
  id: number
  titulo: string
  estado_comercial: string
}

export interface Reserva {
  id: number
  status: EstadoReserva
  person: PersonaBrief
  property_id: number
  propiedad: PropiedadBrief
  amount: number | null
  currency: string
  notes: string | null
  expires_at: string | null
  created_by: { id: number; email: string }
  created_at: string
  updated_at: string
}

export interface ReservaCreatePayload {
  person_id: number
  property_id: number
  amount?: number
  currency?: string
  notes?: string
  expires_at?: string
}
