/** Formato de montos y fechas del panel. Una sola implementación para todas las tablas. */

export function formatearMonto(monto: number | null, moneda: string): string {
  if (monto === null) return '—'
  return `${moneda} ${monto.toLocaleString('es-AR')}`
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
