import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { publicacionesApi } from '../../../api/publicaciones'
import { useAuth } from '../../../context/AuthContext'
import type { EstadoPublicacion, PublicacionListItem } from '../../../types/publicacion'
import Badge from '../../../components/Badge'
import { formatearFecha, formatearMonto } from '../../../lib/formato'

// `eliminada` no se ofrece: es el resultado del borrado lógico, no un estado que
// alguien quiera filtrar desde el panel.
const ESTADOS: { valor: EstadoPublicacion; label: string }[] = [
  { valor: 'activa', label: 'Activa' },
  { valor: 'pausada', label: 'Pausada' },
]

export default function PublicacionesLista() {
  const { usuario } = useAuth()
  const [estado, setEstado] = useState<EstadoPublicacion | ''>('')
  const [publicaciones, setPublicaciones] = useState<PublicacionListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = () => {
    setLoading(true)
    setError(null)
    publicacionesApi.listar({ estado: estado || undefined, limit: 100 })
      .then(setPublicaciones)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(cargar, [estado]) // eslint-disable-line

  // El botón se le muestra a quien el backend va a dejar pasar (`SOLO_STAFF` en
  // el router): esto es cosmético, la barrera real es el endpoint.
  const puedeDescargar = Boolean(
    usuario?.roles.includes('staff') || usuario?.roles.includes('admin'),
  )

  const cambiarEstado = async (p: PublicacionListItem, nuevo: EstadoPublicacion) => {
    setError(null)
    try {
      await publicacionesApi.actualizar(p.id, { estado: nuevo })
      cargar()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el estado')
    }
  }

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <span className="section-label">Inventario</span>
          <h1>Publicaciones</h1>
        </div>
        <div className="admin-page-acciones">
          <Link to="/admin/publicaciones/nueva" className="btn btn-magenta">+ Nueva publicación</Link>
        </div>
      </div>

      <div className="admin-card filtros-bar">
        <label className="filtros-label">
          Estado
          <select value={estado} onChange={e => setEstado(e.target.value as EstadoPublicacion | '')}>
            <option value="">Todas</option>
            {ESTADOS.map(e => <option key={e.valor} value={e.valor}>{e.label}</option>)}
          </select>
        </label>
      </div>

      {loading && <p className="lista-estado">Cargando...</p>}
      {error   && <p className="lista-estado lista-error" role="alert">{error}</p>}

      {!loading && (
        publicaciones.length === 0
          ? <p className="lista-estado">No hay publicaciones.</p>
          : (
            <div className="admin-card tabla-wrapper">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Propiedad</th>
                    <th>Título</th>
                    <th className="num">Precio</th>
                    <th>Publicada</th>
                    <th>Estado</th>
                    <th className="th-acciones">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {publicaciones.map(p => (
                    <tr key={p.id}>
                      <td data-label="Propiedad">
                        <Link to={`/admin/propiedades/${p.propiedad_id}/editar`}>
                          {p.propiedad?.titulo ?? `#${p.propiedad_id}`}
                        </Link>
                      </td>
                      <td data-label="Título">
                        <span className="tabla-titulo" title={p.titulo}>{p.titulo}</span>
                      </td>
                      <td data-label="Precio" className="tabla-precio num">
                        {formatearMonto(p.precio_publicado, p.moneda_publicada)}
                      </td>
                      <td data-label="Publicada">{formatearFecha(p.publicada_en)}</td>
                      <td data-label="Estado"><Badge value={p.estado} /></td>
                      <td data-label="Acciones">
                        <div className="tabla-acciones">
                          <Link to={`/admin/publicaciones/${p.id}/editar`} className="btn btn-outline btn-chico">
                            Editar
                          </Link>
                          {p.estado === 'activa' && (
                            <button className="btn btn-outline btn-chico" onClick={() => cambiarEstado(p, 'pausada')}>
                              Pausar
                            </button>
                          )}
                          {p.estado === 'pausada' && (
                            <button className="btn btn-outline btn-chico" onClick={() => cambiarEstado(p, 'activa')}>
                              Reactivar
                            </button>
                          )}
                          {puedeDescargar && (
                            <a
                              href={publicacionesApi.urlDescarga(p.id)}
                              download
                              className="btn btn-petrol btn-chico"
                            >
                              Descargar material
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
      )}
    </div>
  )
}
