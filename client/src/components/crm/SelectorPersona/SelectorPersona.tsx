import { useEffect, useId, useState } from 'react'
import { personasApi } from '../../../api/personas'
import type { PersonaBrief, PersonaListItem, TipoContacto } from '../../../types/persona'
import './SelectorPersona.css'

interface Props {
  valor: PersonaBrief | null
  onChange: (persona: PersonaBrief | null) => void
  label?: string
}

const DEBOUNCE_MS = 250
const MAX_RESULTADOS = 8

/** Parte "Nombre Apellido" en (first_name, last_name); todo va al nombre si es una sola palabra. */
function partirNombre(texto: string): { first_name: string; last_name: string } {
  const partes = texto.trim().split(/\s+/)
  if (partes.length === 1) return { first_name: partes[0], last_name: '' }
  return { first_name: partes.slice(0, -1).join(' '), last_name: partes[partes.length - 1] }
}

/**
 * Buscador de personas con creación inline. Se usa en propiedad (propietario),
 * reserva (interesado) y partes de una operación: cargar un dueño nunca obliga a
 * ir a otra pantalla.
 */
export default function SelectorPersona({ valor, onChange, label = 'Persona' }: Props) {
  const id = useId()
  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState<PersonaListItem[]>([])
  const [buscando, setBuscando] = useState(false)
  const [errorBusqueda, setErrorBusqueda] = useState(false)
  const [creando, setCreando] = useState(false)
  const [telefono, setTelefono] = useState('')
  const [errorCreacion, setErrorCreacion] = useState<string | null>(null)

  useEffect(() => {
    const termino = texto.trim()
    if (!termino) {
      setResultados([])
      setErrorBusqueda(false)
      return
    }
    setBuscando(true)
    const timer = setTimeout(() => {
      personasApi
        .listar({ search: termino, limit: MAX_RESULTADOS })
        .then(r => { setResultados(r.items); setErrorBusqueda(false) })
        .catch(() => { setResultados([]); setErrorBusqueda(true) })
        .finally(() => setBuscando(false))
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [texto])

  const elegir = (p: PersonaBrief) => {
    onChange({ id: p.id, full_name: p.full_name })
    setTexto('')
    setResultados([])
    setCreando(false)
  }

  const guardarNueva = async () => {
    setErrorCreacion(null)
    const nombre = partirNombre(texto)
    if (!nombre.last_name) {
      setErrorCreacion('Escribí nombre y apellido')
      return
    }
    try {
      const contacts = telefono.trim()
        ? [{ type: 'phone' as TipoContacto, value: telefono.trim(), is_primary: true }]
        : undefined
      const creada = await personasApi.crear({ ...nombre, ...(contacts ? { contacts } : {}) })
      setTelefono('')
      elegir(creada)
    } catch (e: unknown) {
      setErrorCreacion(e instanceof Error ? e.message : 'No se pudo crear')
    }
  }

  if (valor) {
    return (
      <div className="selector-persona">
        <label className="selector-persona-label">{label}</label>
        <div className="selector-persona-elegida">
          <span>{valor.full_name}</span>
          <button type="button" className="btn btn-outline btn-chico" onClick={() => onChange(null)}>
            Quitar
          </button>
        </div>
      </div>
    )
  }

  const hayTexto = texto.trim().length > 0
  const listaId = `${id}-lista`

  return (
    <div className="selector-persona">
      <label className="selector-persona-label" htmlFor={id}>{label}</label>
      <input
        id={id}
        role="combobox"
        aria-expanded={hayTexto}
        aria-controls={listaId}
        aria-autocomplete="list"
        className="selector-persona-input"
        placeholder="Buscar por nombre o documento…"
        value={texto}
        onChange={e => { setTexto(e.target.value); setCreando(false) }}
        autoComplete="off"
      />

      {hayTexto && (
        <div className="selector-persona-panel">
          {buscando && <p className="selector-persona-estado">Buscando…</p>}
          {errorBusqueda && <p className="selector-persona-estado selector-persona-error">No se pudo buscar</p>}

          <ul id={listaId} role="listbox" className="selector-persona-lista">
            {resultados.map(p => (
              <li
                key={p.id}
                role="option"
                aria-selected={false}
                className="selector-persona-opcion"
                onClick={() => elegir(p)}
              >
                <span>{p.full_name}</span>
                {p.document_number && <small>{p.document_number}</small>}
              </li>
            ))}
          </ul>

          {!creando && (
            <button type="button" className="selector-persona-crear" onClick={() => setCreando(true)}>
              + Crear a «{texto.trim()}»
            </button>
          )}

          {creando && (
            <div className="selector-persona-nueva">
              <p className="selector-persona-estado">Se crea como <strong>{texto.trim()}</strong></p>
              <label htmlFor={`${id}-tel`}>Teléfono</label>
              <input
                id={`${id}-tel`}
                value={telefono}
                onChange={e => setTelefono(e.target.value)}
                placeholder="Opcional"
              />
              {errorCreacion && <p className="form-error">{errorCreacion}</p>}
              <div className="selector-persona-acciones">
                <button type="button" className="btn btn-magenta btn-chico" onClick={guardarNueva}>
                  Guardar persona
                </button>
                <button type="button" className="btn btn-outline btn-chico" onClick={() => setCreando(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
