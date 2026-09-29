import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { propiedadesApi, type ListarParams } from '../../../api/propiedades'
import type { PropiedadListItem, TipoOperacion, EstadoComercial } from '../../../types/propiedad'
import Badge from '../../../components/Badge'
import StatTile from '../../../components/StatTile'
import { etiquetaEstado, LABEL_ESTADO } from '../../../lib/propiedad'
import { ANCHO_MINIATURA, urlDeVariante } from '../../../lib/imagen'
import { formatearMonto } from '../../../lib/formato'
import { veCrm } from '../../../lib/beta'
import { useAuth } from '../../../context/AuthContext'
import './Lista.css'

const TIPO_OPTIONS   = ['', 'casa', 'depto', 'local', 'terreno', 'oficina', 'otro']
const OPERACION_OPTIONS: TipoOperacion[] = ['venta', 'alquiler', 'temporal']
const ESTADO_OPTIONS: EstadoComercial[]  = ['disponible', 'reservada', 'cerrada', 'baja']

export default function PropiedadesLista() {
  const navigate = useNavigate()
  const crm = veCrm(useAuth().usuario)

  const [propiedades, setPropiedades] = useState<PropiedadListItem[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)

  const [filtros, setFiltros] = useState<ListarParams>({
    tipo_propiedad:  '',
    tipo_operacion:  undefined,
    estado_comercial: undefined,
    ciudad:          '',
  })

  const [busqueda, setBusqueda] = useState('')

  const cargar = (params: ListarParams = filtros) => {
    setLoading(true)
    setError(null)
    propiedadesApi
      .listar(params)
      .then(setPropiedades)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { cargar() }, []) // eslint-disable-line

  const handleFiltro = (key: keyof ListarParams, value: string) => {
    const next = { ...filtros, [key]: value || undefined }
    setFiltros(next)
    cargar(next)
  }

  const handleEliminar = async (id: number, titulo: string) => {
    if (!window.confirm(`¿Dar de baja "${titulo}"?`)) return
    try {
      await propiedadesApi.eliminar(id)
      setPropiedades(prev => prev.filter(p => p.id !== id))
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al eliminar')
    }
  }

  const total       = propiedades.length
  const disponibles = propiedades.filter(p => p.estado_comercial === 'disponible').length
  const reservadas  = propiedades.filter(p => p.estado_comercial === 'reservada').length

  const visibles = propiedades.filter(p =>
    p.titulo.toLowerCase().includes(busqueda.toLowerCase()) ||
    (p.ubicacion?.ciudad ?? '').toLowerCase().includes(busqueda.toLowerCase())
  )

  return (
    <div>
      {/* Header */}
      <div className="admin-page-header">
        <div>
          <span className="section-label">Inventario</span>
          <h1>Propiedades</h1>
        </div>
        <div className="admin-page-acciones">
          <Link to="/admin/propiedades/nueva" className="btn btn-magenta">
            + Nueva propiedad
          </Link>
        </div>
      </div>

      <div className="admin-stats-grid">
        <StatTile label="Total" valor={total} />
        <StatTile label="Disponibles" valor={disponibles} tono="ok" />
        <StatTile label="Reservadas" valor={reservadas} tono="espera" />
      </div>

      {/* Filtros */}
      <div className="admin-card filtros-bar">
        <input
          type="text"
          className="filtros-buscar"
          placeholder="Buscar por título o ciudad..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
        />

        <select
          value={filtros.tipo_propiedad ?? ''}
          onChange={e => handleFiltro('tipo_propiedad', e.target.value)}
        >
          <option value="">Todos los tipos</option>
          {TIPO_OPTIONS.filter(Boolean).map(t => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>

        <select
          value={filtros.tipo_operacion ?? ''}
          onChange={e => handleFiltro('tipo_operacion', e.target.value)}
        >
          <option value="">Todas las operaciones</option>
          {OPERACION_OPTIONS.map(o => (
            <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>
          ))}
        </select>

        <select
          value={filtros.estado_comercial ?? ''}
          onChange={e => handleFiltro('estado_comercial', e.target.value)}
        >
          <option value="">Todos los estados</option>
          {/* Acá el filtro abarca ventas y alquileres a la vez, así que "cerrada" no
              puede resolverse a una sola palabra: LABEL_ESTADO nombra las dos. */}
          {ESTADO_OPTIONS.map(e => (
            <option key={e} value={e}>{LABEL_ESTADO[e]}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Ciudad..."
          value={filtros.ciudad ?? ''}
          onChange={e => handleFiltro('ciudad', e.target.value)}
        />
      </div>

      {/* Estados */}
      {loading && <p className="lista-estado">Cargando...</p>}
      {error   && <p className="lista-estado lista-error">{error}</p>}

      {/* Tabla */}
      {!loading && !error && (
        propiedades.length === 0
          ? <p className="lista-estado">No se encontraron propiedades.</p>
          : visibles.length === 0
          ? <p className="lista-estado">No hay propiedades que coincidan con la búsqueda.</p>
          : (
            <div className="admin-card tabla-wrapper">
              <table className="tabla tabla-propiedades">
                <thead>
                  <tr>
                    <th>Propiedad</th>
                    <th>Tipo</th>
                    <th>Operación</th>
                    <th>Estado</th>
                    <th className="num">Precio</th>
                    {crm && <th>Propietario</th>}
                    <th className="th-acciones">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map(p => {
                    const img = p.medios.find(m => m.es_principal) ?? p.medios[0]
                    return (
                      /* Los `data-label` no se ven en escritorio: bajo 640px la tabla pasa a
                         tarjetas apiladas (Lista.css) y cada celda se rotula con el suyo. */
                      <tr key={p.id}>
                        <td data-label="Propiedad">
                          <div className="tabla-propiedad">
                            {img
                              /* Sin `srcset`: el hueco mide 40×40 fijos, así que no
                                 hay nada que el navegador tenga que decidir. Se pide
                                 la variante más chica y, si la foto no tiene, la
                                 completa. */
                              ? <img
                                  src={urlDeVariante(img, ANCHO_MINIATURA)}
                                  alt={p.titulo}
                                  className="tabla-thumb"
                                  loading="lazy"
                                  width={40}
                                  height={40}
                                />
                              : <div className="tabla-thumb tabla-thumb-empty" />
                            }
                            {/* La ciudad va acá y no en una columna propia: ocho
                                columnas en una línea no entran en una notebook
                                y la fila ya mide dos renglones de alto. Bajo el
                                título es, además, donde se la busca.
                                El `title` deja el valor completo al alcance del
                                puntero: en la columna el texto se recorta con
                                elipsis para que la fila no crezca. */}
                            <div className="tabla-propiedad-texto">
                              <span className="tabla-titulo" title={p.titulo}>{p.titulo}</span>
                              <span className="tabla-subtitulo" title={p.ubicacion?.ciudad ?? undefined}>
                                {p.ubicacion?.ciudad ?? '—'}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td data-label="Tipo"><Badge value={p.tipo_propiedad} /></td>
                        <td data-label="Operación"><Badge value={p.tipo_operacion} /></td>
                        <td data-label="Estado">
                          <Badge
                            value={p.estado_comercial}
                            label={etiquetaEstado(p.estado_comercial, p.tipo_operacion)}
                          />
                        </td>
                        <td data-label="Precio" className="tabla-precio num">{formatearMonto(p.precio, p.moneda)}</td>
                        {crm && <td data-label="Propietario">
                          {p.propietario
                            ? (
                              <Link
                                to={`/admin/personas/${p.propietario.id}`}
                                className="tabla-texto"
                                title={p.propietario.full_name}
                              >
                                {p.propietario.full_name}
                              </Link>
                            )
                            : <span className="tabla-vacio">—</span>}
                        </td>}
                        <td data-label="Acciones">
                          <div className="tabla-acciones">
                            {/* Solo una propiedad disponible se puede reservar: las demás ya
                                están reservadas, cerradas o dadas de baja. */}
                            {crm && p.estado_comercial === 'disponible' && (
                              <Link to={`/admin/reservas/nueva?propiedad=${p.id}`} className="btn btn-outline">
                                Reservar
                              </Link>
                            )}
                            <button
                              className="btn btn-outline"
                              onClick={() => navigate(`/admin/propiedades/${p.id}/editar`)}
                            >
                              Editar
                            </button>
                            <a
                              className="btn btn-outline"
                              href={propiedadesApi.urlFicha(p.id)}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Ficha PDF
                            </a>
                            <button
                              className="btn btn-danger"
                              onClick={() => handleEliminar(p.id, p.titulo)}
                            >
                              Baja
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
      )}
    </div>
  )
}
