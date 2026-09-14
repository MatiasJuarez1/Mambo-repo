import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Etapa, OperacionListItem } from '../../../types/operacion'
import { formatearMonto } from '../../../lib/formato'
import './TarjetaOperacion.css'

interface Props {
  operacion: OperacionListItem
  etapas: Etapa[]
  onMover: (stageId: number) => Promise<void>
}

/**
 * Tarjeta del tablero. Se mueve con un selector, no con drag & drop: es la
 * misma acción, anda en el celular y cuesta una fracción.
 */
export default function TarjetaOperacion({ operacion, etapas, onMover }: Props) {
  const [moviendo, setMoviendo] = useState(false)
  const selectId = `etapa-${operacion.id}`

  const mover = async (stageId: number) => {
    setMoviendo(true)
    try {
      await onMover(stageId)
    } finally {
      setMoviendo(false)
    }
  }

  return (
    <article className="tarjeta-op">
      <Link to={`/admin/operaciones/${operacion.id}`} className="tarjeta-op-titulo">{operacion.title}</Link>
      {operacion.propiedad && <p className="tarjeta-op-propiedad">{operacion.propiedad.titulo}</p>}
      <p className="tarjeta-op-monto">{formatearMonto(operacion.amount, operacion.currency)}</p>
      {operacion.parties.length > 0 && (
        <p className="tarjeta-op-partes">{operacion.parties.map(p => p.person.full_name).join(', ')}</p>
      )}
      <footer className="tarjeta-op-pie">
        <span className="tarjeta-op-dias">
          {operacion.dias_en_etapa} día{operacion.dias_en_etapa === 1 ? '' : 's'}
        </span>
        <label htmlFor={selectId} className="sr-only">Etapa</label>
        <select
          id={selectId}
          value={operacion.stage_id}
          disabled={moviendo}
          onChange={e => mover(Number(e.target.value))}
        >
          {etapas.map(et => <option key={et.id} value={et.id}>{et.name}</option>)}
        </select>
      </footer>
    </article>
  )
}
