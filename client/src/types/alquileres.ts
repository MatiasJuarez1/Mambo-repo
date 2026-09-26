import type { PropiedadBrief } from './reserva'

export type EstadoContrato   = 'vigente' | 'finalizado' | 'rescindido'
export type IndiceAjuste     = 'icl' | 'ipc' | 'uva' | 'casa_propia' | 'porcentaje_fijo' | 'sin_ajuste'
export type RolParteContrato = 'inquilino' | 'propietario' | 'garante'
export type EstadoAjuste     = 'pendiente' | 'aplicado' | 'omitido'
export type Moneda           = 'ARS' | 'USD'
export type EstadoCobro      = 'pendiente' | 'parcial' | 'pagado' | 'anulado'
export type MedioPago        = 'efectivo' | 'transferencia' | 'otro'
export type TipoGasto        = 'expensas' | 'reparacion' | 'impuesto' | 'otro'
export type EstadoLiquidacion = 'emitida' | 'pagada'

// Los Decimal del backend viajan como string ("150000.00"); `formatearMonto`
// los acepta tal cual y las cuentas del cliente los pasan por `Number`.
export interface ParteContrato {
  person_id: number
  full_name: string
  rol: RolParteContrato
}

export interface Ajuste {
  id: number
  fecha_prevista: string
  estado: EstadoAjuste
  coeficiente: string | null
  monto_anterior: string | null
  monto_nuevo: string | null
  aplicado_at: string | null
  notas: string | null
}

export interface ContratoRef {
  id: number
  fecha_inicio: string
  fecha_fin: string
}

/** Fila de `GET /api/v1/alquileres/contratos`. */
export interface ContratoEnLista {
  id: number
  property_id: number
  propiedad: PropiedadBrief
  partes: ParteContrato[]
  estado: EstadoContrato
  fecha_inicio: string
  fecha_fin: string
  moneda: string
  monto_vigente: string
  proximo_ajuste: string | null
  administrado: boolean
  /** Cobros vencidos con saldo; 0 si no es administrado. */
  vencidos: number
}

/** Bloque `resumen_cobros` de la ficha: null si el contrato no es administrado. */
export interface ResumenCobros {
  vencidos: number
  saldo_vencido: string
  proximo_vencimiento: string | null
}

export interface Contrato extends ContratoEnLista {
  deal_id: number | null
  deal: { id: number; title: string } | null
  contrato_anterior: ContratoRef | null
  renovacion: ContratoRef | null
  dia_vencimiento: number
  monto_inicial: string
  indice: IndiceAjuste
  frecuencia_meses: number | null
  porcentaje_fijo: string | null
  honorarios_pct: string | null
  /** Override del % diario de punitorio; null → el de la inmobiliaria. */
  punitorio_diario_pct: string | null
  fecha_rescision: string | null
  motivo_rescision: string | null
  pdf_url: string | null
  notas: string | null
  ajustes: Ajuste[]
  cobros: Cobro[]
  gastos: Gasto[]
  liquidaciones: LiquidacionEnLista[]
  resumen_cobros: ResumenCobros | null
  /** Solo en la respuesta de aplicar un ajuste: períodos con pagos que no se actualizaron. */
  cobros_no_actualizados?: number | null
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// Cobros, pagos, gastos y liquidaciones (2b)
// ---------------------------------------------------------------------------

export interface Pago {
  id: number
  fecha_pago: string
  monto: string
  punitorio: string
  total: string
  medio: MedioPago
  referencia: string | null
  recibo_numero: number
  recibo_numero_formateado: string
  recibo_pdf_url: string | null
  enviado_email_at: string | null
  anulado_at: string | null
  motivo_anulacion: string | null
  liquidacion_id: number | null
  notas: string | null
  registrado_por: { id: number; name: string } | null
  whatsapp_url: string | null
  created_at: string
}

/** Un período esperado del contrato, con sus pagos. */
export interface Cobro {
  id: number
  contrato_id: number
  /** Primer día del mes, `YYYY-MM-01`. */
  periodo: string
  fecha_vencimiento: string
  monto: string
  estado: EstadoCobro
  pagado: string
  saldo: string
  dias_atraso: number
  vencido: boolean
  notas: string | null
  pagos: Pago[]
}

/** Fila de `GET /api/v1/alquileres/cobros`: el cobro más lo mínimo del contrato. */
export interface CobroEnLista {
  id: number
  contrato_id: number
  propiedad: PropiedadBrief
  inquilinos: ParteContrato[]
  moneda: string
  periodo: string
  fecha_vencimiento: string
  monto: string
  estado: EstadoCobro
  pagado: string
  saldo: string
  dias_atraso: number
  vencido: boolean
}

export interface PunitorioSugerido {
  monto: string
  dias_atraso: number
  pct: string
}

export interface Gasto {
  id: number
  contrato_id: number
  fecha: string
  tipo: TipoGasto
  concepto: string
  monto: string
  comprobante_url: string | null
  liquidacion_id: number | null
  created_at: string
}

export interface LiquidacionEnLista {
  id: number
  contrato_id: number
  propiedad: PropiedadBrief
  moneda: string
  periodo: string
  numero: number
  numero_formateado: string
  total_cobrado: string
  total_punitorios: string
  honorarios_pct: string
  honorarios_monto: string
  total_gastos: string
  total_a_transferir: string
  estado: EstadoLiquidacion
  anulada: boolean
  motivo_anulacion: string | null
  fecha_pago: string | null
  comprobante_pdf_url: string | null
  enviado_email_at: string | null
  notas: string | null
  created_at: string
}

export interface Liquidacion extends LiquidacionEnLista {
  pagos: Pago[]
  gastos: Gasto[]
  whatsapp_url: string | null
}

export interface LiquidacionPreview {
  periodo: string
  pagos: Pago[]
  gastos: Gasto[]
  total_cobrado: string
  total_punitorios: string
  honorarios_pct: string
  honorarios_monto: string
  total_gastos: string
  total_a_transferir: string
}

/** Tiles del dashboard: `esperado`/`cobrado` son del `periodo`; el resto, de hoy. */
export interface ResumenAlquileres {
  periodo: string
  esperado: string
  cobrado: string
  vencidos_cantidad: number
  vencido_monto: string
  morosos: number
  liquidaciones_sin_emitir: number
}

export interface PagoPayload {
  fecha_pago: string
  monto: number
  /** Ausente → el backend usa el sugerido; 0 → sin punitorio. */
  punitorio?: number
  medio: MedioPago
  referencia?: string
  notas?: string
}

export interface CobroUpdatePayload {
  monto?: number
  fecha_vencimiento?: string
  notas?: string
}

export interface GastoPayload {
  fecha: string
  tipo: TipoGasto
  concepto: string
  monto: number
}

export interface LiquidarPayload {
  /** `YYYY-MM`. */
  periodo: string
  notas?: string
}

export interface PartePayload {
  person_id: number
  rol: RolParteContrato
}

export interface ContratoCreatePayload {
  property_id: number
  deal_id?: number
  partes: PartePayload[]
  fecha_inicio: string
  fecha_fin: string
  dia_vencimiento: number
  monto_inicial: number
  moneda: Moneda
  indice: IndiceAjuste
  frecuencia_meses?: number
  porcentaje_fijo?: number
  administrado: boolean
  honorarios_pct?: number
  punitorio_diario_pct?: number
  notas?: string
}

/** PATCH parcial: solo viajan los campos presentes. `deal_id` no se edita. */
export type ContratoUpdatePayload = Partial<Omit<ContratoCreatePayload, 'deal_id'>>

/** Renovación: todo opcional salvo `fecha_fin`; lo que falta se copia del anterior. */
export type ContratoRenovarPayload =
  Partial<Omit<ContratoCreatePayload, 'deal_id' | 'property_id' | 'fecha_fin'>> & { fecha_fin: string }

export interface RescindirPayload {
  fecha_rescision: string
  motivo: string
}

/** Exactamente uno de `coeficiente` o `porcentaje`; el backend rechaza ambos o ninguno. */
export type AplicarAjustePayload =
  ({ coeficiente: number; porcentaje?: never } | { porcentaje: number; coeficiente?: never }) & { notas?: string }

// ---------------------------------------------------------------------------
// Recordatorios (2c)
// ---------------------------------------------------------------------------

export type TipoRecordatorio = 'cobro_vencido' | 'cobro_por_vencer' | 'ajuste' | 'fin_contrato'

export interface Recordatorio {
  tipo: TipoRecordatorio
  fecha: string
  /** Negativo = atrasado. */
  dias: number
  contrato_id: number
  /** cobro_id / ajuste_id / contrato_id según el tipo. */
  referencia_id: number
  propiedad: PropiedadBrief
  inquilinos: ParteContrato[]
  moneda: string
  /** Saldo del cobro; monto vigente en ajuste y fin_contrato. */
  monto: string | null
  detalle: string
}

export interface Recordatorios {
  hoy: string
  dias: number
  total: number
  por_tipo: Record<TipoRecordatorio, number>
  items: Recordatorio[]
}
