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
  actualizado_en: string
}

export type InmobiliariaUpdatePayload = Partial<Omit<Inmobiliaria, 'id' | 'logo_url' | 'actualizado_en'>>

export interface UsuarioBrief {
  id: number
  name: string
  email: string
}
