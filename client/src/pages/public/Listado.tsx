import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { propiedadesApi } from '../../api/propiedades'
import type { PropiedadListItem, TipoPropiedad, TipoOperacion } from '../../types/propiedad'
import './Listado.css'

// ── Helpers ────────────────────────────────────────────────────────────────

function formatPrecio(precio: number | null, moneda: string) {
  if (precio === null) return 'Consultar'
  const n = precio.toLocaleString('es-AR')
  return moneda === 'USD' ? `U$D ${n}` : `$ ${n}`
}

function imagenPrincipal(p: PropiedadListItem) {
  const m = p.medios.find(m => m.es_principal) ?? p.medios[0]
  return m?.url ?? null
}

const LABEL_OPERACION: Record<TipoOperacion, string> = {
  venta: 'Venta',
  alquiler: 'Alquiler',
  temporal: 'Temporal',
}

const LABEL_TIPO: Record<TipoPropiedad, string> = {
  casa: 'Casa', depto: 'Departamento', local: 'Local',
  terreno: 'Terreno', oficina: 'Oficina', otro: 'Otro',
}

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

// ── Card ───────────────────────────────────────────────────────────────────

function PropiedadCard({ propiedad: p }: { propiedad: PropiedadListItem }) {
  const img = imagenPrincipal(p)
  const loc = [p.ubicacion?.ciudad, p.ubicacion?.provincia]
    .filter(Boolean).join(', ')

  return (
    <Link to={`/propiedades/${p.id}`} className="prop-card">
      {/* Imagen */}
      <div className="prop-card-img">
        {img
          ? <img src={img} alt={p.titulo} loading="lazy" />
          : <div className="prop-card-img-empty" />
        }
        <span className={`prop-card-badge badge-${p.tipo_operacion}`}>
          {LABEL_OPERACION[p.tipo_operacion]}
        </span>
      </div>

      {/* Info */}
      <div className="prop-card-body">
        <p className="prop-card-tipo">{LABEL_TIPO[p.tipo_propiedad]}</p>
        <h3 className="prop-card-titulo">{p.titulo}</h3>
        {loc && <p className="prop-card-loc">{loc}</p>}

        {/* Stats */}
        <div className="prop-card-stats">
          {p.dormitorios != null && (
            <span>{p.dormitorios} dorm.</span>
          )}
          {p.banos != null && (
            <span>{p.banos} baño{p.banos !== 1 ? 's' : ''}</span>
          )}
          {p.m2_cubiertos != null && (
            <span>{p.m2_cubiertos} m²</span>
          )}
          {p.m2_totales != null && p.m2_cubiertos == null && (
            <span>{p.m2_totales} m² tot.</span>
          )}
        </div>

        {/* Precio */}
        <p className="prop-card-precio">
          {formatPrecio(p.precio, p.moneda)}
        </p>
      </div>
    </Link>
  )
}
