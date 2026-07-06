import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { propiedadesApi, type ListarParams } from '../../../api/propiedades'
import type { PropiedadListItem, TipoOperacion, EstadoComercial } from '../../../types/propiedad'
import Badge from '../../../components/Badge'
import StatTile from '../../../components/StatTile'
import './Lista.css'

const TIPO_OPTIONS   = ['', 'casa', 'depto', 'local', 'terreno', 'oficina', 'otro']
const OPERACION_OPTIONS: TipoOperacion[] = ['venta', 'alquiler', 'temporal']
const ESTADO_OPTIONS: EstadoComercial[]  = ['disponible', 'reservada', 'cerrada', 'baja']

function formatPrecio(precio: number | null, moneda: string) {
  if (precio === null) return '—'
  return `${moneda} ${precio.toLocaleString('es-AR')}`
}

export default function PropiedadesLista() {
  const navigate = useNavigate()

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
        <h1>Propiedades</h1>
        <Link to="/admin/propiedades/nueva" className="btn btn-pink">
          + Nueva propiedad
        </Link>
      </div>

      <div className="admin-stats-grid">
        <StatTile label="Total" valor={total} />
        <StatTile label="Disponibles" valor={disponibles} tono="teal" />
        <StatTile label="Reservadas" valor={reservadas} tono="pink" />
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
          {ESTADO_OPTIONS.map(e => (
            <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>
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
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Propiedad</th>
                    <th>Tipo</th>
                    <th>Operación</th>
                    <th>Estado</th>
                    <th>Precio</th>
                    <th>Ciudad</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map(p => {
                    const img = p.medios.find(m => m.es_principal) ?? p.medios[0]
                    return (
                      <tr key={p.id}>
                        <td>
                          <div className="tabla-propiedad">
                            {img
                              ? <img src={img.url} alt={p.titulo} className="tabla-thumb" />
                              : <div className="tabla-thumb tabla-thumb-empty" />
                            }
                            <span className="tabla-titulo">{p.titulo}</span>
                          </div>
                        </td>
                        <td><Badge value={p.tipo_propiedad} /></td>
                        <td><Badge value={p.tipo_operacion} /></td>
                        <td><Badge value={p.estado_comercial} /></td>
                        <td className="tabla-precio">{formatPrecio(p.precio, p.moneda)}</td>
                        <td>{p.ubicacion?.ciudad ?? '—'}</td>
                        <td>
                          <div className="tabla-acciones">
                            <button
                              className="btn btn-outline"
                              onClick={() => navigate(`/admin/propiedades/${p.id}/editar`)}
                            >
                              Editar
                            </button>
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
