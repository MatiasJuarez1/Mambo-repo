import { useEffect, useId, useMemo, useState } from 'react'
import { operacionesApi } from '../../../api/operaciones'
import type { OperacionListItem } from '../../../types/operacion'
import './SelectorOperacion.css'

export interface OperacionElegida {
  id: number
  title: string
}

interface Props {
  valor: OperacionElegida | null
  onChange: (operacion: OperacionElegida | null) => void
  label?: string
  /** Precargada por la pantalla de origen: se muestra sin "Quitar". */
  bloqueada?: boolean
}

const MAX_RESULTADOS = 8

/**
 * Buscador de operaciones para vincular una actividad. El listado del backend
 * no tiene búsqueda por texto, así que se trae entero una vez (sin filtrar por
 * `is_closed`: una tarea puede seguir ligada a una operación ya cerrada) y se
 * filtra acá, igual que `SelectorPropiedad`. `limit: 200` es el techo del
 * router (`GET /api/v1/deals`, `le=200`); pedir más devuelve 422.
 */
export default function SelectorOperacion({ valor, onChange, label = 'Operación', bloqueada = false }: Props) {
  const id = useId()
  const [texto, setTexto] = useState('')
  const [todas, setTodas] = useState<OperacionListItem[]>([])
  const [errorCarga, setErrorCarga] = useState(false)

  useEffect(() => {
    if (valor && bloqueada) return
    operacionesApi.listar({ limit: 200 })
      .then(p => { setTodas(p.items); setErrorCarga(false) })
      .catch(() => setErrorCarga(true))
  }, [valor, bloqueada])

  const resultados = useMemo(() => {
    const termino = texto.trim().toLowerCase()
    if (!termino) return []
    return todas
      .filter(o => o.title.toLowerCase().includes(termino) || String(o.id) === termino)
      .slice(0, MAX_RESULTADOS)
  }, [texto, todas])

  if (valor) {
    return (
      <div className="selector-operacion">
        <label className="selector-operacion-label">{label}</label>
        <div className="selector-operacion-elegida">
          <span>{valor.title}</span>
          {!bloqueada && (
            <button type="button" className="btn btn-outline btn-chico" onClick={() => onChange(null)}>
              Quitar
            </button>
          )}
        </div>
      </div>
    )
  }

  const hayTexto = texto.trim().length > 0
  const listaId = `${id}-lista`

  return (
    <div className="selector-operacion">
      <label className="selector-operacion-label" htmlFor={id}>{label}</label>
      <input
        id={id}
        role="combobox"
        aria-expanded={hayTexto}
        aria-controls={listaId}
        aria-autocomplete="list"
        className="selector-operacion-input"
        placeholder="Buscar por título…"
        value={texto}
        onChange={e => setTexto(e.target.value)}
        autoComplete="off"
      />
      {hayTexto && (
        <div className="selector-operacion-panel">
          {errorCarga && <p className="selector-operacion-estado selector-operacion-error">No se pudieron cargar las operaciones</p>}
          {!errorCarga && resultados.length === 0 && <p className="selector-operacion-estado">Sin resultados</p>}
          <ul id={listaId} role="listbox" className="selector-operacion-lista">
            {resultados.map(o => (
              <li
                key={o.id}
                role="option"
                aria-selected={false}
                className="selector-operacion-opcion"
                onClick={() => { onChange({ id: o.id, title: o.title }); setTexto('') }}
              >
                <span>{o.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
