import { Link } from 'react-router-dom'
import './StatTile.css'

interface Props {
  label: string
  valor: number | string
  tono?: 'ok' | 'espera'
  /** Si viene, el tile entero es un link (p. ej. a la lista ya filtrada). */
  to?: string
  /** Línea chica bajo el valor: un monto que acompaña a una cantidad, o viceversa. */
  detalle?: string
}

export default function StatTile({ label, valor, tono, to, detalle }: Props) {
  // Un contador ("3") y un monto ya formateado ("ARS 1.250.000") no pueden ir
  // al mismo cuerpo: con el tamaño del contador el monto se sale de la caja.
  // Se distinguen por el tipo —los contadores llegan como `number`— más un
  // largo mínimo, para que el guión de "sin dato" siga leyéndose grande.
  const esMonto = typeof valor === 'string' && valor.trim().length > 4

  const contenido = (
    <>
      <div className="stat-tile-label">{label}</div>
      <div
        className={`stat-tile-valor${tono ? ` tono-${tono}` : ''}${esMonto ? ' es-monto' : ''}`}
      >
        {valor}
      </div>
      {detalle && <div className="stat-tile-detalle">{detalle}</div>}
    </>
  )
  if (to) return <Link to={to} className="stat-tile stat-tile-link">{contenido}</Link>
  return <div className="stat-tile">{contenido}</div>
}
