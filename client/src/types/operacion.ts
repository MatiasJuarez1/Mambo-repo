import type { PersonaBrief } from './persona'
import type { PropiedadBrief } from './reserva'

export type RolParte =
  | 'comprador' | 'vendedor' | 'inquilino' | 'propietario' | 'garante' | 'interesado' | 'otro'

export interface Etapa {
  id: number
  pipeline_id: number
  name: string
  position: number
  is_won: boolean
  is_lost: boolean
}

export interface PipelineResumen {
  id: number
  name: string
  is_active: boolean
  stage_count: number
}

export interface Pipeline {
  id: number
  name: string
  description: string | null
  is_active: boolean
  stages: Etapa[]
  created_at: string
}

export interface Parte {
  id: number
  deal_id: number
  person_id: number
  person: PersonaBrief
  role: RolParte
  notes: string | null
  created_at: string
}

/** Tarjeta del tablero: `GET /api/v1/deals`. */
export interface OperacionListItem {
  id: number
  title: string
  pipeline_id: number
  stage_id: number
  assigned_to_user_id: number | null
  property_id: number | null
  propiedad: PropiedadBrief | null
  amount: number | null
  currency: string
  is_won: boolean
  is_lost: boolean
  stage_changed_at: string
  dias_en_etapa: number
  parties: Parte[]
  created_at: string
}

export interface Operacion extends OperacionListItem {
  notes: string | null
  closed_at: string | null
  updated_at: string
}

export interface PartePayload {
  person_id: number
  role: RolParte
  notes?: string
}

export interface OperacionCreatePayload {
  title: string
  pipeline_id: number
  stage_id: number
  assigned_to_user_id?: number
  property_id?: number
  amount?: number
  currency?: string
  notes?: string
  parties?: PartePayload[]
}

export type OperacionUpdatePayload = Partial<
  Pick<OperacionCreatePayload, 'title' | 'assigned_to_user_id' | 'property_id' | 'amount' | 'currency' | 'notes'>
>
