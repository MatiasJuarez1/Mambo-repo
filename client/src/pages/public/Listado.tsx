import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { propiedadesApi } from '../../api/propiedades'
import type { PropiedadListItem } from '../../types/propiedad'
import { ESTADOS_PUBLICOS, OPCIONES_TIPO } from '../../lib/propiedad'
import PropiedadCard from '../../components/PropiedadCard'
import './Listado.css'

// ── Componente ─────────────────────────────────────────────────────────────

export default function Listado() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [propiedades, setPropiedades] = useState<PropiedadListItem[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [ciudades, setCiudades]       = useState<string[]>([])

  // Filtros desde URL
  const operacion = searchParams.get('tipo_operacion') ?? ''
  const tipo      = searchParams.get('tipo_propiedad') ?? ''
  const ciudad    = searchParams.get('ciudad') ?? ''

  // Zonas disponibles para el desplegable. Si el endpoint falla, el select se
  // queda solo con "Todas las zonas": la página sigue funcionando y no se
  // muestra ningún error, porque esto no impide ver las propiedades.
  useEffect(() => {
    propiedadesApi
      .ciudades()
      .then(setCiudades)
      .catch(() => setCiudades([]))
  }, [])

  // Una `ciudad=` que venga por URL y no esté en la lista (link viejo, zona que
  // se quedó sin inventario) se agrega igual como opción: si no, el select
  // quedaría en blanco y el usuario no vería por qué filtra el listado.
  const opcionesCiudad = ciudad && !ciudades.includes(ciudad)
    ? [ciudad, ...ciudades]
    : ciudades

  useEffect(() => {
    setLoading(true)
    propiedadesApi
      .listar({
        tipo_operacion:  operacion || undefined,
        tipo_propiedad:  tipo      || undefined,
        ciudad:          ciudad    || undefined,
        // Se piden también las reservadas y las cerradas: se muestran con una faja
        // encima (ver PropiedadCard) como antecedente de operaciones concretadas.
        // El backend las devuelve después de las disponibles.
        estados: ESTADOS_PUBLICOS,
      })
      .then(setPropiedades)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [operacion, tipo, ciudad])

  const set = (key: string, value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    })
  }

  return (
    <main className="listado-page">
      {/* ── Cabecera ── */}
      <div className="listado-hero">
        <div className="section-container">
          <p className="listado-eyebrow">Propiedades</p>
          <h1 className="listado-title">Encontrá tu próxima<br /><em>propiedad</em></h1>
        </div>
      </div>

      {/* ── Filtros ── */}
      <div className="listado-filtros-wrap">
        <div className="section-container">
          <div className="listado-filtros">
            <select
              value={operacion}
              onChange={e => set('tipo_operacion', e.target.value)}
              aria-label="Operación"
            >
              <option value="">Todas las operaciones</option>
              <option value="venta">Venta</option>
              <option value="alquiler">Alquiler</option>
              {/* `temporal` existe en el enum del backend; no se ofrece en la
                  barra del hero, pero acá sí para poder filtrarlo. */}
              <option value="temporal">Temporal</option>
            </select>

            <select
              value={tipo}
              onChange={e => set('tipo_propiedad', e.target.value)}
              aria-label="Tipo de propiedad"
            >
              <option value="">Todos los tipos</option>
              {OPCIONES_TIPO.map(({ valor, label }) => (
                <option key={valor} value={valor}>{label}</option>
              ))}
            </select>

            <select
              value={ciudad}
              onChange={e => set('ciudad', e.target.value)}
              aria-label="Zona"
            >
              <option value="">Todas las zonas</option>
              {opcionesCiudad.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Resultados ── */}
      <div className="listado-body">
        <div className="section-container">
          {loading && (
            <p className="listado-estado">Cargando propiedades...</p>
          )}
          {error && (
            <p className="listado-estado listado-error">{error}</p>
          )}
          {!loading && !error && propiedades.length === 0 && (
            <p className="listado-estado">No se encontraron propiedades con esos filtros.</p>
          )}
          {!loading && !error && propiedades.length > 0 && (
            <>
              <p className="listado-count">
                {propiedades.length} propiedad{propiedades.length !== 1 ? 'es' : ''}
              </p>
              <div className="propiedades-grid">
                {propiedades.map(p => (
                  <PropiedadCard key={p.id} propiedad={p} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
