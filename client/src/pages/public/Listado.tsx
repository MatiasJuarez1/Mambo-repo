import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { propiedadesApi } from '../../api/propiedades'
import type { PropiedadListItem } from '../../types/propiedad'
import PropiedadCard from '../../components/PropiedadCard'
import './Listado.css'

// ── Componente ─────────────────────────────────────────────────────────────

export default function Listado() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [propiedades, setPropiedades] = useState<PropiedadListItem[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)

  // Filtros desde URL
  const operacion = searchParams.get('tipo_operacion') ?? ''
  const tipo      = searchParams.get('tipo_propiedad') ?? ''
  const ciudad    = searchParams.get('ciudad') ?? ''

  useEffect(() => {
    setLoading(true)
    propiedadesApi
      .listar({
        tipo_operacion:  operacion || undefined,
        tipo_propiedad:  tipo      || undefined,
        ciudad:          ciudad    || undefined,
        estado_comercial: 'disponible',
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
            >
              <option value="">Todas las operaciones</option>
              <option value="venta">Venta</option>
              <option value="alquiler">Alquiler</option>
              <option value="temporal">Temporal</option>
            </select>

            <select
              value={tipo}
              onChange={e => set('tipo_propiedad', e.target.value)}
            >
              <option value="">Todos los tipos</option>
              <option value="casa">Casa</option>
              <option value="depto">Departamento</option>
              <option value="local">Local</option>
              <option value="terreno">Terreno</option>
              <option value="oficina">Oficina</option>
            </select>

            <input
              type="text"
              placeholder="Ciudad o zona..."
              value={ciudad}
              onChange={e => set('ciudad', e.target.value)}
            />
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
