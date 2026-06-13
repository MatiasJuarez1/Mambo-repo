import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { propiedadesApi } from '../../api/propiedades'
import type { Propiedad, TipoPropiedad, TipoOperacion } from '../../types/propiedad'
import './Detalle.css'

// ── Helpers ────────────────────────────────────────────────────────────────

function formatPrecio(precio: number | null, moneda: string) {
  if (precio === null) return 'Consultar precio'
  const n = precio.toLocaleString('es-AR')
  return moneda === 'USD' ? `U$D ${n}` : `$ ${n}`
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

export default function Detalle() {
  const { id } = useParams()
  const [prop, setProp]       = useState<Propiedad | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [imgIdx, setImgIdx]   = useState(0)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    propiedadesApi.obtener(Number(id))
      .then(p => {
        // ordenar imágenes: principal primero
        p.medios.sort((a, b) => {
          if (a.es_principal && !b.es_principal) return -1
          if (!a.es_principal && b.es_principal) return 1
          return a.orden - b.orden
        })
        setProp(p)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <main className="detalle-page">
        <p className="detalle-estado">Cargando...</p>
      </main>
    )
  }

  if (error || !prop) {
    return (
      <main className="detalle-page">
        <p className="detalle-estado detalle-error">
          {error ?? 'Propiedad no encontrada.'}
        </p>
        <div style={{ textAlign: 'center' }}>
          <Link to="/propiedades" className="btn-primary">← Volver al listado</Link>
        </div>
      </main>
    )
  }

  const imagenes = prop.medios.filter(m => m.tipo_medio === 'imagen')
  const imgActual = imagenes[imgIdx]
  const ubicStr = [
    prop.ubicacion?.direccion,
    prop.ubicacion?.ciudad,
    prop.ubicacion?.provincia,
  ].filter(Boolean).join(' · ')

  return (
    <main className="detalle-page">
      {/* ── Breadcrumb ── */}
      <div className="detalle-breadcrumb">
        <div className="section-container">
          <Link to="/propiedades">← Propiedades</Link>
          <span>/</span>
          <span>{LABEL_TIPO[prop.tipo_propiedad]}</span>
        </div>
      </div>

      <div className="section-container detalle-layout">
        {/* ── Columna izquierda: galería ── */}
        <div className="detalle-galeria">
          {imagenes.length > 0 ? (
            <>
              <div className="detalle-img-principal">
                <img src={imgActual.url} alt={imgActual.descripcion ?? prop.titulo} />
                <span className={`detalle-badge badge-${prop.tipo_operacion}`}>
                  {LABEL_OPERACION[prop.tipo_operacion]}
                </span>
              </div>
              {imagenes.length > 1 && (
                <div className="detalle-thumbnails">
                  {imagenes.map((m, i) => (
                    <button
                      key={m.id}
                      className={`detalle-thumb${i === imgIdx ? ' active' : ''}`}
                      onClick={() => setImgIdx(i)}
                    >
                      <img src={m.url} alt={m.descripcion ?? `Foto ${i + 1}`} />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="detalle-img-empty" />
          )}
        </div>

        {/* ── Columna derecha: info ── */}
        <div className="detalle-info">
          {/* Tipo + título */}
          <p className="detalle-tipo">
            {LABEL_TIPO[prop.tipo_propiedad]}
          </p>
          <h1 className="detalle-titulo">{prop.titulo}</h1>
          {ubicStr && <p className="detalle-ubicacion">{ubicStr}</p>}

          {/* Precio */}
          <div className="detalle-precio-wrap">
            <p className="detalle-precio">
              {formatPrecio(prop.precio, prop.moneda)}
            </p>
            {prop.tipo_operacion === 'alquiler' && (
              <span className="detalle-precio-sub">/mes</span>
            )}
            {prop.tipo_operacion === 'temporal' && (
              <span className="detalle-precio-sub">/semana</span>
            )}
          </div>

          {/* Stats rápidos */}
          {(prop.dormitorios != null || prop.banos != null ||
            prop.m2_cubiertos != null || prop.m2_totales != null) && (
            <div className="detalle-stats">
              {prop.dormitorios != null && (
                <div className="detalle-stat">
                  <span className="detalle-stat-val">{prop.dormitorios}</span>
                  <span className="detalle-stat-lbl">Dormitorios</span>
                </div>
              )}
              {prop.banos != null && (
                <div className="detalle-stat">
                  <span className="detalle-stat-val">{prop.banos}</span>
                  <span className="detalle-stat-lbl">Baños</span>
                </div>
              )}
              {prop.m2_cubiertos != null && (
                <div className="detalle-stat">
                  <span className="detalle-stat-val">{prop.m2_cubiertos}</span>
                  <span className="detalle-stat-lbl">m² cubiertos</span>
                </div>
              )}
              {prop.m2_totales != null && (
                <div className="detalle-stat">
                  <span className="detalle-stat-val">{prop.m2_totales}</span>
                  <span className="detalle-stat-lbl">m² totales</span>
                </div>
              )}
            </div>
          )}

          {/* Descripción */}
          {prop.descripcion && (
            <div className="detalle-seccion">
              <h2 className="detalle-seccion-titulo">Descripción</h2>
              <p className="detalle-descripcion">{prop.descripcion}</p>
            </div>
          )}

          {/* Características */}
          {prop.caracteristicas.length > 0 && (
            <div className="detalle-seccion">
              <h2 className="detalle-seccion-titulo">Características</h2>
              <div className="detalle-caract-grid">
                {prop.caracteristicas.map(c => (
                  <div key={c.id} className="detalle-caract-item">
                    <span className="detalle-caract-clave">{c.clave}</span>
                    <span className="detalle-caract-valor">{c.valor}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="detalle-cta">
            <a href="#contacto" className="btn-primary">Consultar por esta propiedad</a>
          </div>
        </div>
      </div>
    </main>
  )
}
