import { api, BASE_URL } from './client'
import { construirQuery } from '../lib/query'
import type { Paginado } from '../types/persona'
import type {
  AplicarAjustePayload, Cobro, CobroEnLista, CobroUpdatePayload, Contrato, ContratoCreatePayload,
  ContratoEnLista, ContratoRenovarPayload, ContratoUpdatePayload, EstadoContrato, EstadoLiquidacion,
  Gasto, GastoPayload, Liquidacion, LiquidacionEnLista, LiquidacionPreview, LiquidarPayload,
  PagoPayload, PunitorioSugerido, Recordatorios, RescindirPayload, ResumenAlquileres,
} from '../types/alquileres'

const RAIZ = '/api/v1/alquileres'
const BASE = `${RAIZ}/contratos`

export interface ListarContratosParams {
  estado?: EstadoContrato
  property_id?: number
  person_id?: number
  vence_en_dias?: number
  ajuste_en_dias?: number
  /** Vigentes administrados con pagos de meses anteriores sin liquidar. */
  sin_liquidar?: boolean
  q?: string
  skip?: number
  limit?: number
}

/** `estado=vencido` es virtual: pendiente o parcial ya vencido. */
export type FiltroEstadoCobro = 'pendiente' | 'parcial' | 'pagado' | 'anulado' | 'vencido'

export interface ListarCobrosParams {
  estado?: FiltroEstadoCobro
  vence_en_dias?: number
  contrato_id?: number
  property_id?: number
  q?: string
  skip?: number
  limit?: number
}

/** Los dos estados reales más `anulada`, que en la base es un timestamp. */
export type FiltroEstadoLiquidacion = EstadoLiquidacion | 'anulada'

export interface ListarLiquidacionesParams {
  estado?: FiltroEstadoLiquidacion
  /** `YYYY-MM`. */
  periodo?: string
  contrato_id?: number
  skip?: number
  limit?: number
}

const cobroUrl = (contratoId: number, cobroId: number) => `${BASE}/${contratoId}/cobros/${cobroId}`
const gastoUrl = (contratoId: number, gastoId: number) => `${BASE}/${contratoId}/gastos/${gastoId}`
const liqUrl   = (contratoId: number, liqId: number)   => `${BASE}/${contratoId}/liquidaciones/${liqId}`

export const alquileresApi = {
  listar:    (params: ListarContratosParams = {})      => api.get<Paginado<ContratoEnLista>>(`${BASE}${construirQuery(params)}`),
  obtener:   (id: number)                              => api.get<Contrato>(`${BASE}/${id}`),
  crear:     (data: ContratoCreatePayload)             => api.post<Contrato>(BASE, data),
  editar:    (id: number, data: ContratoUpdatePayload) => api.patch<Contrato>(`${BASE}/${id}`, data),
  finalizar: (id: number)                              => api.post<Contrato>(`${BASE}/${id}/finalizar`, undefined),
  rescindir: (id: number, data: RescindirPayload)      => api.post<Contrato>(`${BASE}/${id}/rescindir`, data),
  renovar:   (id: number, data: ContratoRenovarPayload) => api.post<Contrato>(`${BASE}/${id}/renovar`, data),

  // Las acciones sobre ajustes devuelven el contrato completo: la ficha refresca
  // la línea de tiempo y el monto vigente con una sola respuesta.
  aplicarAjuste: (id: number, ajusteId: number, data: AplicarAjustePayload) =>
    api.post<Contrato>(`${BASE}/${id}/ajustes/${ajusteId}/aplicar`, data),
  omitirAjuste:  (id: number, ajusteId: number, notas?: string) =>
    api.post<Contrato>(`${BASE}/${id}/ajustes/${ajusteId}/omitir`, { notas }),

  subirPdf: (id: number, archivo: File) => {
    const form = new FormData()
    form.append('archivo', archivo)
    return api.put<Contrato>(`${BASE}/${id}/pdf`, form)
  },
  quitarPdf: (id: number) => api.delete<Contrato>(`${BASE}/${id}/pdf`),

  /** El contrato que nació de un deal, o 404. */
  porDeal: (dealId: number) => api.get<Contrato>(`/api/v1/deals/${dealId}/contrato`),

  // --- Listados transversales y resumen del dashboard ---
  listarCobros:        (params: ListarCobrosParams = {})        => api.get<Paginado<CobroEnLista>>(`${RAIZ}/cobros${construirQuery(params)}`),
  listarLiquidaciones: (params: ListarLiquidacionesParams = {}) => api.get<Paginado<LiquidacionEnLista>>(`${RAIZ}/liquidaciones${construirQuery(params)}`),
  resumen:             (periodo?: string)                       => api.get<ResumenAlquileres>(`${RAIZ}/resumen${construirQuery({ periodo })}`),
  /** Sin `dias`, el backend usa la ventana configurada en la inmobiliaria. */
  recordatorios:       (dias?: number)                          => api.get<Recordatorios>(`${RAIZ}/recordatorios${construirQuery({ dias })}`),

  // --- Cobros y pagos: cada acción devuelve el cobro entero y la ficha reemplaza esa fila ---
  obtenerCobro:    (contratoId: number, cobroId: number)                            => api.get<Cobro>(cobroUrl(contratoId, cobroId)),
  editarCobro:     (contratoId: number, cobroId: number, data: CobroUpdatePayload)  => api.patch<Cobro>(cobroUrl(contratoId, cobroId), data),
  anularCobro:     (contratoId: number, cobroId: number, motivo: string)            => api.post<Cobro>(`${cobroUrl(contratoId, cobroId)}/anular`, { motivo }),
  punitorio:       (contratoId: number, cobroId: number, fechaPago: string)         =>
    api.get<PunitorioSugerido>(`${cobroUrl(contratoId, cobroId)}/punitorio${construirQuery({ fecha_pago: fechaPago })}`),
  registrarPago:   (contratoId: number, cobroId: number, data: PagoPayload)         => api.post<Cobro>(`${cobroUrl(contratoId, cobroId)}/pagos`, data),
  anularPago:      (contratoId: number, cobroId: number, pagoId: number, motivo: string) =>
    api.post<Cobro>(`${cobroUrl(contratoId, cobroId)}/pagos/${pagoId}/anular`, { motivo }),
  /** 202: el email sale después de la respuesta. Devuelve el cobro con `enviado_email_at` todavía sin marcar. */
  enviarRecibo:    (contratoId: number, cobroId: number, pagoId: number, email?: string) =>
    api.post<Cobro>(`${cobroUrl(contratoId, cobroId)}/pagos/${pagoId}/enviar`, email ? { email } : {}),

  // --- Gastos ---
  listarGastos:      (contratoId: number)                                   => api.get<Gasto[]>(`${BASE}/${contratoId}/gastos`),
  crearGasto:        (contratoId: number, data: GastoPayload)               => api.post<Gasto>(`${BASE}/${contratoId}/gastos`, data),
  editarGasto:       (contratoId: number, gastoId: number, data: Partial<GastoPayload>) => api.patch<Gasto>(gastoUrl(contratoId, gastoId), data),
  borrarGasto:       (contratoId: number, gastoId: number)                  => api.delete<void>(gastoUrl(contratoId, gastoId)),
  subirComprobante:  (contratoId: number, gastoId: number, archivo: File) => {
    const form = new FormData()
    form.append('archivo', archivo)
    return api.put<Gasto>(`${gastoUrl(contratoId, gastoId)}/comprobante`, form)
  },
  quitarComprobante: (contratoId: number, gastoId: number) => api.delete<Gasto>(`${gastoUrl(contratoId, gastoId)}/comprobante`),

  // --- Liquidaciones ---
  liquidacionesDeContrato: (contratoId: number)                          => api.get<Liquidacion[]>(`${BASE}/${contratoId}/liquidaciones`),
  previewLiquidacion:      (contratoId: number, periodo: string)         =>
    api.get<LiquidacionPreview>(`${BASE}/${contratoId}/liquidaciones/preview${construirQuery({ periodo })}`),
  // URL para abrir en una pestaña, no un fetch: el navegador manda la cookie de
  // sesión solo porque el PDF sale del mismo host que la API.
  urlBorradorLiquidacion:  (contratoId: number, periodo: string)         =>
    `${BASE_URL}${BASE}/${contratoId}/liquidaciones/preview.pdf${construirQuery({ periodo })}`,
  liquidar:                (contratoId: number, data: LiquidarPayload)   => api.post<Liquidacion>(`${BASE}/${contratoId}/liquidaciones`, data),
  pagarLiquidacion:        (contratoId: number, liqId: number, fechaPago: string) =>
    api.post<Liquidacion>(`${liqUrl(contratoId, liqId)}/pagar`, { fecha_pago: fechaPago }),
  enviarLiquidacion:       (contratoId: number, liqId: number, email?: string) =>
    api.post<Liquidacion>(`${liqUrl(contratoId, liqId)}/enviar`, email ? { email } : {}),
  anularLiquidacion:       (contratoId: number, liqId: number, motivo: string) =>
    api.post<Liquidacion>(`${liqUrl(contratoId, liqId)}/anular`, { motivo }),
}
