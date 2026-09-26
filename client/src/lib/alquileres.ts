/**
 * Etiquetas y cálculos del módulo de alquileres. La regla del calendario
 * replica la del backend (`generar_ajustes`) para la vista previa del alta.
 */
import type {
  Cobro, EstadoAjuste, EstadoCobro, EstadoContrato, EstadoLiquidacion, IndiceAjuste, MedioPago,
  Recordatorio, RolParteContrato, TipoGasto, TipoRecordatorio,
} from '../types/alquileres'

export const LABEL_INDICE: Record<IndiceAjuste, string> = {
  icl:             'ICL',
  ipc:             'IPC',
  uva:             'UVA',
  casa_propia:     'Casa Propia',
  porcentaje_fijo: 'Porcentaje fijo',
  sin_ajuste:      'Sin ajuste',
}

export const INDICES: IndiceAjuste[] = ['icl', 'ipc', 'uva', 'casa_propia', 'porcentaje_fijo', 'sin_ajuste']

export const LABEL_ESTADO_CONTRATO: Record<EstadoContrato, string> = {
  vigente:    'Vigente',
  finalizado: 'Finalizado',
  rescindido: 'Rescindido',
}

export const LABEL_ESTADO_AJUSTE: Record<EstadoAjuste, string> = {
  pendiente: 'Pendiente',
  aplicado:  'Aplicado',
  omitido:   'Omitido',
}

export const LABEL_ROL_CONTRATO: Record<RolParteContrato, string> = {
  inquilino:   'Inquilino',
  propietario: 'Propietario',
  garante:     'Garante',
}

export const ROLES_CONTRATO: RolParteContrato[] = ['inquilino', 'propietario', 'garante']

/** Fecha `YYYY-MM-DD` de hoy en hora local (`toISOString` daría el día UTC). */
export function hoyIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** `iso` + N días, en `YYYY-MM-DD`. Lo usa la renovación (inicio = fin anterior + 1). */
export function sumarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  const fecha = new Date(Date.UTC(a, m - 1, d + dias))
  return fecha.toISOString().slice(0, 10)
}

/**
 * Suma meses a una fecha `YYYY-MM-DD` como `relativedelta(months=n)`: si el día
 * no existe en el mes destino se recorta al último (31/01 + 1 mes = 28/02).
 */
export function sumarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  const totalMeses = (m - 1) + meses
  const anio = a + Math.floor(totalMeses / 12)
  const mes  = ((totalMeses % 12) + 12) % 12
  const ultimoDia = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate()
  const dia = Math.min(d, ultimoDia)
  return `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

/** Fechas de ajuste `inicio + k·frecuencia` para k ≥ 1 mientras sean `< fin`. */
export function generarFechasAjuste(inicio: string, fin: string, frecuenciaMeses: number | null): string[] {
  if (!inicio || !fin || !frecuenciaMeses || frecuenciaMeses < 1) return []
  const fechas: string[] = []
  for (let k = 1; ; k++) {
    const fecha = sumarMeses(inicio, k * frecuenciaMeses)
    if (fecha >= fin) break
    fechas.push(fecha)
  }
  return fechas
}

/** Monto nuevo con dos decimales, redondeo "half up" como el backend. */
export function calcularMontoNuevo(montoActual: number, coeficiente: number): number {
  return Math.round((montoActual * coeficiente + Number.EPSILON) * 100) / 100
}

export function coeficienteDesdePorcentaje(porcentaje: number): number {
  return 1 + porcentaje / 100
}

// ---------------------------------------------------------------------------
// Cobros, pagos, gastos y liquidaciones (2b)
// ---------------------------------------------------------------------------

export const LABEL_MEDIO_PAGO: Record<MedioPago, string> = {
  efectivo:      'Efectivo',
  transferencia: 'Transferencia',
  otro:          'Otro',
}

export const MEDIOS_PAGO: MedioPago[] = ['transferencia', 'efectivo', 'otro']

export const LABEL_TIPO_GASTO: Record<TipoGasto, string> = {
  expensas:   'Expensas',
  reparacion: 'Reparación',
  impuesto:   'Impuesto',
  otro:       'Otro',
}

export const TIPOS_GASTO: TipoGasto[] = ['expensas', 'reparacion', 'impuesto', 'otro']

export const LABEL_ESTADO_COBRO: Record<EstadoCobro, string> = {
  pendiente: 'Pendiente',
  parcial:   'Parcial',
  pagado:    'Pagado',
  anulado:   'Anulado',
}

export const LABEL_ESTADO_LIQUIDACION: Record<EstadoLiquidacion, string> = {
  emitida: 'Emitida',
  pagada:  'Pagada',
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** `2026-09-01` o `2026-09` → "Septiembre 2026". Es el rótulo del período en tablas y PDFs. */
export function nombreMes(periodo: string): string {
  const [a, m] = periodo.split('-').map(Number)
  const nombre = MESES[m - 1] ?? '?'
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${a}`
}

/** `2026-09-01` → `2026-09`, el formato que piden `periodo=` en preview, liquidar y resumen. */
export function periodoYm(iso: string): string {
  return iso.slice(0, 7)
}

/** `YYYY-MM` del mes anterior a `hoy` (default: hoy real). Default del selector de "Liquidar período". */
export function mesAnterior(hoy: string = hoyIso()): string {
  return periodoYm(sumarMeses(`${periodoYm(hoy)}-01`, -1))
}

/** Días enteros de `desde` a `hasta`, ambos `YYYY-MM-DD`; negativo si `hasta` ya pasó. */
export function diasEntre(desde: string, hasta: string): number {
  const [a1, m1, d1] = desde.split('-').map(Number)
  const [a2, m2, d2] = hasta.split('-').map(Number)
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000)
}

export interface ChipCobro {
  texto: string
  color: 'ok' | 'espera' | 'neutro' | 'baja'
}

// Un cobro que vence dentro de esta cantidad de días se avisa como "vence en N días".
const DIAS_AVISO_VENCIMIENTO = 7

/**
 * Chip de estado de un período. El estado real lo fija el backend (nunca por
 * fecha); acá solo se le suma el matiz temporal: "vence en N días" o
 * "vencido N días" mientras haya saldo.
 */
export function etiquetaEstadoCobro(
  cobro: Pick<Cobro, 'estado' | 'fecha_vencimiento' | 'dias_atraso'>,
  hoy: string = hoyIso(),
): ChipCobro {
  if (cobro.estado === 'anulado') return { texto: 'Anulado', color: 'neutro' }
  if (cobro.estado === 'pagado')  return { texto: 'Pagado', color: 'ok' }
  if (cobro.dias_atraso > 0) {
    return { texto: `Vencido ${cobro.dias_atraso} día${cobro.dias_atraso === 1 ? '' : 's'}`, color: 'baja' }
  }
  if (cobro.estado === 'parcial') return { texto: 'Parcial', color: 'espera' }
  const faltan = diasEntre(hoy, cobro.fecha_vencimiento)
  if (faltan === 0) return { texto: 'Vence hoy', color: 'espera' }
  if (faltan > 0 && faltan <= DIAS_AVISO_VENCIMIENTO) {
    return { texto: `Vence en ${faltan} día${faltan === 1 ? '' : 's'}`, color: 'espera' }
  }
  return { texto: 'Al día', color: 'ok' }
}

// ---------------------------------------------------------------------------
// Recordatorios (2c)
// ---------------------------------------------------------------------------

/** Mismo orden que el email diario. */
export const ORDEN_TIPOS_RECORDATORIO: TipoRecordatorio[] = [
  'cobro_vencido', 'cobro_por_vencer', 'ajuste', 'fin_contrato',
]

const LABEL_TIPO_RECORDATORIO: Record<TipoRecordatorio, string> = {
  cobro_vencido:    'Cobros vencidos',
  cobro_por_vencer: 'Cobros por vencer',
  ajuste:           'Ajustes',
  fin_contrato:     'Contratos que terminan',
}

export function etiquetaTipoRecordatorio(tipo: TipoRecordatorio): string {
  return LABEL_TIPO_RECORDATORIO[tipo]
}

/** Chip temporal de un recordatorio: rojo si ya pasó, naranja si es inminente, gris si falta. */
export function chipRecordatorio(item: Pick<Recordatorio, 'dias'>): ChipCobro {
  const d = item.dias
  if (d < 0)   return { texto: `Hace ${-d} día${d === -1 ? '' : 's'}`, color: 'baja' }
  if (d === 0) return { texto: 'Hoy', color: 'espera' }
  if (d === 1) return { texto: 'Mañana', color: 'espera' }
  return { texto: `En ${d} días`, color: d <= DIAS_AVISO_VENCIMIENTO ? 'espera' : 'neutro' }
}
