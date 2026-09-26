export interface RepartoIn { user_id: number; pct: number }

export interface ComisionIn {
  monto_operacion: number
  pct: number | null
  monto: number | null
  cobrada: boolean
  fecha_cobro: string | null
  notas: string | null
  reparto: RepartoIn[]
}

export interface RepartoOut { user_id: number; nombre: string; pct: string; monto: string }

export interface Comision {
  deal_id: number
  monto_operacion: string
  moneda: string
  pct: string | null
  monto: string
  cobrada: boolean
  fecha_cobro: string | null
  notas: string | null
  reparto: RepartoOut[]
  sin_monto: boolean
  updated_at: string
}
