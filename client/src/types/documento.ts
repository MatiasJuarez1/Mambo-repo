export type TipoDocumento =
  | 'boleto'
  | 'reserva_firmada'
  | 'dni'
  | 'informe_dominio'
  | 'anexo_fotografico'
  | 'otro'

export const TIPOS_DOCUMENTO: TipoDocumento[] = [
  'boleto', 'reserva_firmada', 'dni', 'informe_dominio', 'anexo_fotografico', 'otro',
]

export const ETIQUETAS_TIPO_DOCUMENTO: Record<TipoDocumento, string> = {
  boleto: 'Boleto',
  reserva_firmada: 'Reserva firmada',
  dni: 'DNI',
  informe_dominio: 'Informe de dominio',
  anexo_fotografico: 'Anexo fotográfico',
  otro: 'Otro',
}

export interface DocumentoOut {
  id: number
  tipo: TipoDocumento
  archivo_url: string
  nombre_original: string
  tamano_bytes: number
  subido_por: string
  created_at: string
}

/** Exactamente una entidad dueña; TypeScript impide pasar dos. */
export type EntidadDocumento =
  | { propiedadId: number }
  | { personaId: number }
  | { dealId: number }
  | { contratoId: number }
