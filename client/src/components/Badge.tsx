import './Badge.css'

type Color = 'teal' | 'pink' | 'yellow' | 'gray' | 'red' | 'blue'

const colorMap: Record<string, Color> = {
  // estado_comercial
  disponible: 'teal',
  reservada:  'pink',
  cerrada:    'gray',
  baja:       'red',
  // tipo_operacion
  venta:      'pink',
  alquiler:   'blue',
  temporal:   'yellow',
  // estado_publicacion
  activa:     'teal',
  pausada:    'yellow',
  eliminada:  'red',
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
  const c = color ?? colorMap[value] ?? 'gray'
  return (
    <span className={`badge badge-${c}`}>
      {labelMap[value] ?? value}
    </span>
  )
}
