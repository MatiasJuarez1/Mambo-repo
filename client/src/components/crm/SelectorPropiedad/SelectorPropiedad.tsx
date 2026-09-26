import { useEffect, useId, useMemo, useState } from 'react'
import { propiedadesApi } from '../../../api/propiedades'
import type { PropiedadListItem } from '../../../types/propiedad'
import Badge from '../../Badge'
import './SelectorPropiedad.css'

export interface PropiedadElegida {
  id: number
  titulo: string
}

interface Props {
  valor: PropiedadElegida | null
  onChange: (propiedad: PropiedadElegida | null) => void
  label?: string
  /** Precargada por la pantalla de origen (deal, propiedad): se muestra sin "Quitar". */
  bloqueada?: boolean
}

const MAX_RESULTADOS = 8

/**
 * Buscador de propiedades para los formularios del CRM. El listado del backend
 * no tiene búsqueda por texto, así que se trae entero una vez y se filtra acá;
 * el inventario de una inmobiliaria chica entra cómodo en memoria.
 */
export default function SelectorPropiedad({ valor, onChange, label = 'Propiedad', bloqueada = false }: Props) {
  const id = useId()
  const [texto, setTexto] = useState('')
  const [todas, setTodas] = useState<PropiedadListItem[]>([])
  const [errorCarga, setErrorCarga] = useState(false)

  useEffect(() => {
    if (valor && bloqueada) return
    propiedadesApi.listar({ limit: 500 })
      .then(p => { setTodas(p); setErrorCarga(false) })
      .catch(() => setErrorCarga(true))
  }, [valor, bloqueada])

  const resultados = useMemo(() => {
    const termino = texto.trim().toLowerCase()
    if (!termino) return []
    return todas
      .filter(p => p.titulo.toLowerCase().includes(termino) || String(p.id) === termino)
      .slice(0, MAX_RESULTADOS)
  }, [texto, todas])

  if (valor) {
    return (
      <div className="selector-propiedad">
        <label className="selector-propiedad-label">{label}</label>
        <div className="selector-propiedad-elegida">
          <span>{valor.titulo}</span>
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
    <div className="selector-propiedad">
      <label className="selector-propiedad-label" htmlFor={id}>{label}</label>
      <input
        id={id}
        role="combobox"
        aria-expanded={hayTexto}
        aria-controls={listaId}
        aria-autocomplete="list"
        className="selector-propiedad-input"
        placeholder="Buscar por título…"
        value={texto}
        onChange={e => setTexto(e.target.value)}
        autoComplete="off"
      />
      {hayTexto && (
        <div className="selector-propiedad-panel">
          {errorCarga && <p className="selector-propiedad-estado selector-propiedad-error">No se pudieron cargar las propiedades</p>}
          {!errorCarga && resultados.length === 0 && <p className="selector-propiedad-estado">Sin resultados</p>}
          <ul id={listaId} role="listbox" className="selector-propiedad-lista">
            {resultados.map(p => (
              <li
                key={p.id}
                role="option"
                aria-selected={false}
                className="selector-propiedad-opcion"
                onClick={() => { onChange({ id: p.id, titulo: p.titulo }); setTexto('') }}
              >
                <span>{p.titulo}</span>
                <Badge value={p.estado_comercial} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
