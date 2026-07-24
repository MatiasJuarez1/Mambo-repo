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
}

export default function Badge({ value, color }: Props) {
  const c = color ?? colorMap[value] ?? 'neutro'
  return (
    <span className={`badge badge-${c}`}>
      {labelMap[value] ?? value}
    </span>
  )
}
