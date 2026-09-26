export interface Inmobiliaria {
  id: number
  nombre: string
  logo_url: string | null
  telefono: string | null
  email: string | null
  cuit: string | null
  direccion: string | null
  honorarios_venta_pct: number | null
  honorarios_alquiler_pct: number | null
  /** % diario de punitorio por mora (0.1 = 0,1 % por día); null → sin punitorio. */
  punitorio_diario_pct: number | null
  dias_gracia: number
  /** Ventana por defecto de la bandeja de recordatorios y del email diario. */
  dias_aviso_recordatorios: number
  /** Solo lectura: si el servidor tiene las `SMTP_*` para mandar recibos por email. */
  email_configurado: boolean
  /** Solo lectura: si el servidor tiene `RECORDATORIOS_TOKEN` y `SMTP_*` para el email diario. */
  recordatorios_configurado: boolean
  actualizado_en: string
}

export type InmobiliariaUpdatePayload =
  Partial<Omit<Inmobiliaria, 'id' | 'logo_url' | 'email_configurado' | 'recordatorios_configurado' | 'actualizado_en'>>

export interface UsuarioBrief {
  id: number
  name: string
  email: string
}
