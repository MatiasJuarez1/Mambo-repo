import type { PropiedadListItem } from './propiedad'

export type EstadoPublicacion = 'activa' | 'pausada' | 'eliminada'

export interface PublicacionListItem {
  id: number
  propiedad_id: number
  titulo: string
  descripcion: string | null
  estado: EstadoPublicacion
  precio_publicado: number | null
  moneda_publicada: string
  slug: string | null
  publicada_en: string | null
  creado_en: string
  propiedad: PropiedadListItem | null
}

export interface Publicacion extends PublicacionListItem {
  actualizado_en: string
  eliminado_en: string | null
}

// ── Payloads ─────────────────────────────────────────────────

export interface PublicacionCreatePayload {
  propiedad_id: number
  titulo: string
  descripcion?: string
  estado?: EstadoPublicacion
  precio_publicado?: number
  moneda_publicada?: string
  slug?: string
}

export type PublicacionUpdatePayload = Partial<Omit<PublicacionCreatePayload, 'propiedad_id'>>
