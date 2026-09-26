import type { RepartoOut } from './comision'

export interface FilaOperaciones {
  mes: string; moneda: string; ganadas: number; perdidas: number
  monto_ganado: string; comisiones: string; comisiones_cobradas: string
}
export interface ReporteOperaciones {
  desde: string; hasta: string; pipeline_id: number | null; agente_id: number | null
  filas: FilaOperaciones[]; totales: FilaOperaciones[]
}

export interface FilaComision {
  deal_id: number; titulo: string; pipeline: string; closed_at: string; moneda: string
  monto_operacion: string; pct: string | null; monto: string; cobrada: boolean
  fecha_cobro: string | null; reparto: RepartoOut[]
}
export interface FilaAgente {
  user_id: number | null; nombre: string; moneda: string
  operaciones: number; comision: string; cobrada: string
}
export interface ReporteComisiones {
  desde: string; hasta: string; agente_id: number | null; cobrada: boolean | null
  filas: FilaComision[]; por_agente: FilaAgente[]
}

export interface FilaEmbudo {
  stage_id: number; nombre: string; position: number; is_won: boolean; is_lost: boolean
  ingresaron: number; actuales: number; dias_promedio: string | null; conversion_pct: string | null
}
export interface ReporteEmbudo {
  desde: string; hasta: string; pipeline_id: number; pipeline: string
  etapas: FilaEmbudo[]; ganadas: number; perdidas: number
  tasa_cierre_pct: string | null; dias_promedio_cierre: string | null
}

export interface FilaAlquileres {
  mes: string; moneda: string; esperado: string; cobrado: string
  pendiente: string; honorarios: string; contratos_vigentes: number
}
export interface ReporteAlquileres {
  desde: string; hasta: string; filas: FilaAlquileres[]; totales: FilaAlquileres[]
}

export type NombreReporte = 'operaciones' | 'comisiones' | 'embudo' | 'alquileres'

export interface FiltrosReporte {
  desde?: string
  hasta?: string
  pipeline_id?: number
  agente_id?: number
  cobrada?: boolean
}
