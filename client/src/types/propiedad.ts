export type TipoPropiedad = 'casa' | 'depto' | 'local' | 'terreno' | 'oficina' | 'otro'
export type TipoOperacion = 'venta' | 'alquiler' | 'temporal'
export type EstadoComercial = 'disponible' | 'reservada' | 'cerrada' | 'baja'
export type TipoMedio = 'imagen' | 'video' | 'documento' | 'otro'

export interface Ubicacion {
  id: number
  propiedad_id: number
  direccion: string | null
  ciudad: string | null
  provincia: string | null
  pais: string | null
  codigo_postal: string | null
  lat: number | null
  lng: number | null
  creado_en: string
}

export interface Medio {
  id: number
  propiedad_id: number
  tipo_medio: TipoMedio
  url: string
  descripcion: string | null
  orden: number
  es_principal: boolean
  creado_en: string
}

export interface Caracteristica {
  id: number
  propiedad_id: number
  clave: string
  valor: string
  creado_en: string
}

export interface PropiedadListItem {
  id: number
  titulo: string
  tipo_propiedad: TipoPropiedad
  tipo_operacion: TipoOperacion
  estado_comercial: EstadoComercial
  moneda: string
  precio: number | null
  dormitorios: number | null
  banos: number | null
  m2_cubiertos: number | null
  m2_totales: number | null
  creado_en: string
  ubicacion: Ubicacion | null
  medios: Medio[]
}

export interface Propiedad extends PropiedadListItem {
  descripcion: string | null
  propietario_persona_id: number | null
  actualizado_en: string
  eliminado_en: string | null
  caracteristicas: Caracteristica[]
}

// ── Payloads para crear / editar ─────────────────────────────

export interface PropiedadCreatePayload {
  titulo: string
  descripcion?: string
  tipo_propiedad: TipoPropiedad
  tipo_operacion: TipoOperacion
  estado_comercial: EstadoComercial
  moneda: string
  precio?: number
  dormitorios?: number
  banos?: number
  m2_cubiertos?: number
  m2_totales?: number
  propietario_persona_id?: number
  ubicacion?: {
    direccion?: string
    ciudad?: string
    provincia?: string
    pais?: string
    codigo_postal?: string
    lat?: number
    lng?: number
  }
  medios?: { tipo_medio: TipoMedio; url: string; descripcion?: string; orden?: number; es_principal?: boolean }[]
  caracteristicas?: { clave: string; valor: string }[]
}

export type PropiedadUpdatePayload = Partial<PropiedadCreatePayload>
