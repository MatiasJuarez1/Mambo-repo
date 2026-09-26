/** Formato de montos y fechas del panel. Una sola implementación para todas las tablas. */

// Los `Decimal` del backend llegan como string ("150000.00"): se aceptan tal
// cual para no obligar a cada pantalla a convertirlos antes de mostrarlos.
export function formatearMonto(monto: number | string | null, moneda: string): string {
  if (monto === null) return '—'
  const n = typeof monto === 'string' ? Number(monto) : monto
  if (Number.isNaN(n)) return '—'
  return `${moneda} ${n.toLocaleString('es-AR')}`
}

export function formatearFecha(iso: string | null): string {
  if (!iso) return '—'
  const fecha = new Date(iso)
  const dd = String(fecha.getUTCDate()).padStart(2, '0')
  const mm = String(fecha.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${fecha.getUTCFullYear()}`
}

/** Días enteros entre `desde` (hoy por defecto) y `iso`; negativo si ya pasó. */
export function diasHasta(iso: string | null, desde: Date = new Date()): number | null {
  if (!iso) return null
  const ms = new Date(iso).getTime() - desde.getTime()
  return Math.floor(ms / 86_400_000)
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** `2026-09` → "sep 2026". El `mes: "total"` de los reportes se lee "Total". */
export function etiquetaMes(ym: string): string {
  if (ym === 'total') return 'Total'
  const [a, m] = ym.split('-').map(Number)
  return `${MESES_CORTOS[m - 1] ?? '?'} ${a}`
}

/** `2026-09` → "sep 26", para el eje de los gráficos. */
export function etiquetaMesCorta(ym: string): string {
  const [a, m] = ym.split('-').map(Number)
  return `${MESES_CORTOS[m - 1] ?? '?'} ${String(a).slice(2)}`
}

export function formatearPorcentaje(pct: number | string | null): string {
  if (pct === null) return '—'
  const n = typeof pct === 'string' ? Number(pct) : pct
  if (Number.isNaN(n)) return '—'
  return `${n.toLocaleString('es-AR')} %`
}

/** `1258291` → "1,2 MB". Una decimal como máximo; sin decimales si es entero. */
export function formatearTamano(bytes: number): string {
  const formato = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 1 })
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${formato(bytes / 1024)} KB`
  return `${formato(bytes / (1024 * 1024))} MB`
}

// A diferencia de `formatearFecha` (que también recibe `date` sin hora, y por
// eso se mantiene en UTC), esta función siempre recibe un instante completo:
// lo renderiza en el huso horario local del navegador para que coincida con
// el horario que el usuario tipeó en el `datetime-local` de alta.
/** `2026-09-22T13:00:00Z` → "22/09/2026 10:00" (en UTC-3). Hora local del navegador. */
export function formatearFechaHora(iso: string | null): string {
  if (!iso) return '—'
  const fecha = new Date(iso)
  const dd = String(fecha.getDate()).padStart(2, '0')
  const mm = String(fecha.getMonth() + 1).padStart(2, '0')
  const hh = String(fecha.getHours()).padStart(2, '0')
  const min = String(fecha.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${fecha.getFullYear()} ${hh}:${min}`
}
