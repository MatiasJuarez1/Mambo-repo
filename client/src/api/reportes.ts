import { api, BASE_URL } from './client'
import { construirQuery } from '../lib/query'
import type {
  FiltrosReporte, NombreReporte, ReporteAlquileres, ReporteComisiones, ReporteEmbudo, ReporteOperaciones,
} from '../types/reportes'

const BASE = '/api/v1/reportes'

export const reportesApi = {
  operaciones: (f: FiltrosReporte = {}) => api.get<ReporteOperaciones>(`${BASE}/operaciones${construirQuery(f)}`),
  comisiones:  (f: FiltrosReporte = {}) => api.get<ReporteComisiones>(`${BASE}/comisiones${construirQuery(f)}`),
  embudo:      (f: FiltrosReporte = {}) => api.get<ReporteEmbudo>(`${BASE}/embudo${construirQuery(f)}`),
  alquileres:  (f: FiltrosReporte = {}) => api.get<ReporteAlquileres>(`${BASE}/alquileres${construirQuery(f)}`),
  /** URL absoluta del CSV: se abre con un `<a download>`; la cookie viaja porque es first-party. */
  urlCsv: (reporte: NombreReporte, f: FiltrosReporte = {}) =>
    `${BASE_URL}${BASE}/${reporte}${construirQuery({ ...f, formato: 'csv' })}`,
}
