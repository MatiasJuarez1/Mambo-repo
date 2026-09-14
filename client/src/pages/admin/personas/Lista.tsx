import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { personasApi, type ListarPersonasParams } from '../../../api/personas'
import type { EtiquetaConteo, PersonaListItem, Rol } from '../../../types/persona'
import ChipsRol from '../../../components/crm/ChipsRol/ChipsRol'
import { LABEL_ROL } from '../../../lib/crm'

const ROLES: Rol[] = ['propietario', 'comprador', 'vendedor', 'inquilino', 'interesado']
const POR_PAGINA = 50

export default function PersonasLista() {
  const [personas, setPersonas] = useState<PersonaListItem[]>([])
  const [total, setTotal] = useState(0)
  const [etiquetas, setEtiquetas] = useState<EtiquetaConteo[]>([])
  const [filtros, setFiltros] = useState<ListarPersonasParams>({ search: '', rol: '', tag: '', skip: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    personasApi.etiquetas().then(setEtiquetas).catch(() => setEtiquetas([]))
  }, [])

  // La búsqueda se dispara con un pequeño retraso para no pegarle a la API por tecla.
  useEffect(() => {
    setLoading(true)
    setError(null)
    const timer = setTimeout(() => {
      personasApi
        .listar({ ...filtros, limit: POR_PAGINA })
        .then(r => { setPersonas(r.items); setTotal(r.total) })
        .catch(e => setError(e.message))
        .finally(() => setLoading(false))
    }, 200)
    return () => clearTimeout(timer)
  }, [filtros])

  const set = (campo: keyof ListarPersonasParams, valor: string) =>
    setFiltros(f => ({ ...f, [campo]: valor, skip: 0 }))

  return (
    <div>
      <div className="admin-page-header">
        <h1>Personas</h1>
        <Link to="/admin/personas/nueva" className="btn btn-magenta">+ Nueva persona</Link>
      </div>

      <div className="admin-card filtros-bar">
        <input
          type="search"
          className="filtros-buscar"
          placeholder="Buscar por nombre o documento…"
          aria-label="Buscar"
          value={filtros.search ?? ''}
          onChange={e => set('search', e.target.value)}
        />
        <label className="filtros-label">
          Rol
          <select value={filtros.rol ?? ''} onChange={e => set('rol', e.target.value)}>
            <option value="">Todos</option>
            {ROLES.map(r => <option key={r} value={r}>{LABEL_ROL[r]}</option>)}
          </select>
        </label>
        <label className="filtros-label">
          Etiqueta
          <select value={filtros.tag ?? ''} onChange={e => set('tag', e.target.value)}>
            <option value="">Todas</option>
            {etiquetas.map(t => <option key={t.nombre} value={t.nombre}>{t.nombre} ({t.cantidad})</option>)}
          </select>
        </label>
      </div>

      {loading && <p className="lista-estado">Cargando...</p>}
      {error && <p className="lista-estado lista-error">{error}</p>}

      {!loading && !error && (
        personas.length === 0
          ? <p className="lista-estado">No hay personas que coincidan.</p>
          : (
            <div className="admin-card tabla-wrapper">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Documento</th>
                    <th>Roles</th>
                    <th>Etiquetas</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {personas.map(p => (
                    <tr key={p.id}>
                      <td data-label="Nombre"><Link to={`/admin/personas/${p.id}`} className="tabla-titulo">{p.full_name}</Link></td>
                      <td data-label="Documento">{p.document_number ? `${p.document_type ?? ''} ${p.document_number}`.trim() : '—'}</td>
                      <td data-label="Roles"><ChipsRol roles={p.roles} /></td>
                      <td data-label="Etiquetas">
                        <span className="etiquetas">
                          {p.tags.map(t => <span key={t} className="etiqueta">{t}</span>)}
                        </span>
                      </td>
                      <td data-label="Acciones">
                        <Link to={`/admin/personas/${p.id}/editar`} className="btn btn-outline">Editar</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="lista-total">{total} persona{total === 1 ? '' : 's'}</p>
            </div>
          )
      )}
    </div>
  )
}
