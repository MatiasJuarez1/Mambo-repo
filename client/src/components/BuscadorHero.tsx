import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { propiedadesApi } from '../api/propiedades'
import { OPCIONES_OPERACION, OPCIONES_TIPO } from '../lib/propiedad'
import { SERVICIOS } from '../pages/public/catalogo-servicios'
import './BuscadorHero.css'

/**
 * Barra de búsqueda flotante del hero, con dos modos.
 *
 * El componente no lee ni escribe la URL: arma un destino con los campos que
 * el usuario completó y navega. Quien filtra de verdad es `Listado.tsx`, que
 * lee `tipo_operacion`, `tipo_propiedad` y `ciudad` de la query string.
 *
 * Las opciones vacías (`''`) significan "sin filtro" y no viajan como parámetro.
 */

type Modo = 'propiedades' | 'servicios'

interface Opcion {
  valor: string
  label: string
}

const ICONO_OPERACION = (
  <svg className="qs-ico" viewBox="0 0 24 24" width="20" height="20" fill="none"
       stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
       aria-hidden="true">
    <path d="M7 7h11l-3-3M17 17H6l3 3" />
  </svg>
)

const ICONO_TIPO = (
  <svg className="qs-ico" viewBox="0 0 24 24" width="20" height="20" fill="none"
       stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
       aria-hidden="true">
    <path d="M4 11l8-6 8 6M6 10v9h12v-9" />
  </svg>
)

const ICONO_ZONA = (
  <svg className="qs-ico" viewBox="0 0 24 24" width="20" height="20" fill="none"
       stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
       aria-hidden="true">
    <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.4" />
  </svg>
)

const ICONO_SERVICIO = (
  <svg className="qs-ico" viewBox="0 0 24 24" width="20" height="20" fill="none"
       stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
       aria-hidden="true">
    <path d="M9 4h6v3H9z" />
    <path d="M7 5.5H5v14h14v-14h-2" />
    <path d="M8.8 12.6l2 2 4.4-4.6" />
  </svg>
)

const OPCIONES_SERVICIO: Opcion[] = SERVICIOS.map(s => ({ valor: s.slug, label: s.titulo }))

interface CampoProps {
  icono: ReactNode
  /** Rótulo del campo; también es el `aria-label` del select. */
  caption: string
  /** Texto de la opción vacía, la que no filtra nada. */
  vacia: string
  opciones: readonly Opcion[]
  valor: string
  onChange: (valor: string) => void
  /** Ocupa el ancho de los tres campos del modo Propiedades. */
  ancho?: boolean
}

/** Un campo de la barra: ícono + rótulo + desplegable (el caret es el `::after`). */
function CampoBuscador({ icono, caption, vacia, opciones, valor, onChange, ancho = false }: CampoProps) {
  return (
    <label className={ancho ? 'qs-field qs-field--ancho' : 'qs-field'}>
      {icono}
      <span className="qs-text">
        <span className="qs-cap">{caption}</span>
        <select
          className="qs-select"
          aria-label={caption}
          value={valor}
          onChange={e => onChange(e.target.value)}
        >
          <option value="">{vacia}</option>
          {opciones.map(o => (
            <option key={o.valor} value={o.valor}>{o.label}</option>
          ))}
        </select>
      </span>
    </label>
  )
}

export default function BuscadorHero() {
  const navigate = useNavigate()

  const [modo, setModo] = useState<Modo>('propiedades')

  // Un estado por campo. Cambiar de pestaña no los limpia: volver a la anterior
  // devuelve la búsqueda tal como estaba.
  const [operacion, setOperacion] = useState('')
  const [tipo, setTipo]           = useState('')
  const [ciudad, setCiudad]       = useState('')
  const [servicio, setServicio]   = useState('')

  const [zonas, setZonas] = useState<Opcion[]>([])

  // Las zonas salen del backend para no ofrecer ciudades sin inventario.
  // Si el endpoint falla (o todavía no existe) el select se queda con
  // "Todo Tucumán" y la barra sigue siendo usable: no es un error del usuario.
  useEffect(() => {
    let vigente = true
    propiedadesApi
      .ciudades()
      .then(lista => {
        if (vigente) setZonas(lista.map(c => ({ valor: c, label: c })))
      })
      .catch(() => {
        if (vigente) setZonas([])
      })
    return () => { vigente = false }
  }, [])

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (modo === 'servicios') {
      navigate(servicio ? `/servicios#${servicio}` : '/servicios')
      return
    }

    const params = new URLSearchParams()
    if (operacion) params.set('tipo_operacion', operacion)
    if (tipo)      params.set('tipo_propiedad', tipo)
    if (ciudad)    params.set('ciudad', ciudad)

    const query = params.toString()
    navigate(query ? `/propiedades?${query}` : '/propiedades')
  }

  const enPropiedades = modo === 'propiedades'

  return (
    <form className="hero-search" onSubmit={handleSubmit}>
      <div className="qs-tabs" role="tablist" aria-label="Qué querés buscar">
        <button
          type="button"
          role="tab"
          className="qs-tab"
          aria-selected={enPropiedades}
          onClick={() => setModo('propiedades')}
        >
          Propiedades
        </button>
        <button
          type="button"
          role="tab"
          className="qs-tab"
          aria-selected={!enPropiedades}
          onClick={() => setModo('servicios')}
        >
          Servicios
        </button>
      </div>

      {enPropiedades ? (
        <>
          <CampoBuscador
            icono={ICONO_OPERACION}
            caption="Operación"
            vacia="Venta/Alquiler"
            opciones={OPCIONES_OPERACION}
            valor={operacion}
            onChange={setOperacion}
          />
          <CampoBuscador
            icono={ICONO_TIPO}
            caption="Tipo"
            vacia="Todos los tipos"
            opciones={OPCIONES_TIPO}
            valor={tipo}
            onChange={setTipo}
          />
          <CampoBuscador
            icono={ICONO_ZONA}
            caption="Zona"
            vacia="Todo Tucumán"
            opciones={zonas}
            valor={ciudad}
            onChange={setCiudad}
          />
        </>
      ) : (
        <CampoBuscador
          icono={ICONO_SERVICIO}
          caption="¿Qué necesitás?"
          vacia="Todos los servicios"
          opciones={OPCIONES_SERVICIO}
          valor={servicio}
          onChange={setServicio}
          ancho
        />
      )}

      <button type="submit" className="qs-buscar">
        {enPropiedades ? 'Buscar' : 'Ver servicio'}
      </button>
    </form>
  )
}
