import './Badge.css'

type Color = 'ok' | 'espera' | 'neutro' | 'baja' | 'operacion'

const colorMap: Record<string, Color> = {
  // estado_comercial
  disponible: 'ok',
  reservada:  'espera',
  cerrada:    'neutro',
  baja:       'baja',
  // tipo_operacion — todas en petróleo: el tipo lo dice la etiqueta, no el color
  venta:      'operacion',
  alquiler:   'operacion',
  temporal:   'operacion',
  // estado_publicacion
  activa:     'ok',
  pausada:    'espera',
  eliminada:  'baja',
  // estado de reserva (activa ya está mapeada arriba)
  convertida: 'neutro',
  vencida:    'baja',
  // estado de contrato de alquiler
  vigente:    'ok',
  finalizado: 'neutro',
  rescindido: 'baja',
  // estado de ajuste
  pendiente:  'espera',
  aplicado:   'ok',
  omitido:    'neutro',
  // estado de actividad (pendiente ya está mapeada arriba)
  hecha:      'ok',
  cancelada:  'baja',
}

const labelMap: Record<string, string> = {
  disponible: 'Disponible',
  reservada:  'Reservada',
  cerrada:    'Cerrada',
  baja:       'Baja',
  venta:      'Venta',
  alquiler:   'Alquiler',
  temporal:   'Temporal',
  activa:     'Activa',
  pausada:    'Pausada',
  eliminada:  'Eliminada',
  convertida: 'Convertida',
  vencida:    'Vencida',
  vigente:    'Vigente',
  finalizado: 'Finalizado',
  rescindido: 'Rescindido',
  pendiente:  'Pendiente',
  aplicado:   'Aplicado',
  omitido:    'Omitido',
  hecha:      'Hecha',
  cancelada:  'Cancelada',
  casa:       'Casa',
  depto:      'Depto',
  local:      'Local',
  terreno:    'Terreno',
  oficina:    'Oficina',
  otro:       'Otro',
}

interface Props {
  value: string
  color?: Color
  /**
   * Texto a mostrar, cuando no alcanza con traducir `value` por sí solo. Lo usa
   * `estado_comercial`: "cerrada" se lee "Vendida" o "Alquilada" según la operación
   * de la propiedad, un dato que esta chapita no tiene por qué conocer.
   */
  label?: string
}

export default function Badge({ value, color, label }: Props) {
  const c = color ?? colorMap[value] ?? 'neutro'
  return (
    <span className={`badge badge-${c}`}>
      {label ?? labelMap[value] ?? value}
    </span>
  )
}
