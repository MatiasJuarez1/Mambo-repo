import type { Rol } from '../types/persona'
import type { RolParte } from '../types/operacion'
import type { EstadoReserva } from '../types/reserva'
import type { TipoOperacion } from '../types/propiedad'

export const LABEL_ROL: Record<Rol, string> = {
  propietario: 'Propietario',
  comprador:   'Comprador',
  vendedor:    'Vendedor',
  inquilino:   'Inquilino',
  interesado:  'Interesado',
}

export const LABEL_ROL_PARTE: Record<RolParte, string> = {
  ...LABEL_ROL,
  garante: 'Garante',
  otro:    'Otro',
}

export const ROLES_PARTE: RolParte[] = [
  'comprador', 'vendedor', 'inquilino', 'propietario', 'garante', 'interesado', 'otro',
]

export const LABEL_ESTADO_RESERVA: Record<EstadoReserva, string> = {
  activa:     'Activa',
  cancelada:  'Cancelada',
  vencida:    'Vencida',
  convertida: 'Convertida',
}

/** Con qué rol entra la persona al convertir una reserva en operación. */
export function rolInicialSegunOperacion(operacion: TipoOperacion): RolParte {
  return operacion === 'venta' ? 'comprador' : 'inquilino'
}

/** A qué pipeline y etapa va una reserva convertida. Los nombres son los sembrados. */
export function etapaInicialSegunOperacion(operacion: TipoOperacion): { pipeline: string; etapa: string } {
  return operacion === 'venta'
    ? { pipeline: 'Venta', etapa: 'Oferta' }
    : { pipeline: 'Alquiler', etapa: 'Reserva' }
}
