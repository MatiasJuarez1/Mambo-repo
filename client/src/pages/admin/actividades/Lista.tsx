import { useEffect, useState } from 'react'
import { actividadesApi, type ListarActividadesParams } from '../../../api/actividades'
import { usuariosApi } from '../../../api/usuarios'
import Badge from '../../../components/Badge'
import SelectorPersona from '../../../components/crm/SelectorPersona/SelectorPersona'
import SelectorPropiedad, { type PropiedadElegida } from '../../../components/crm/SelectorPropiedad/SelectorPropiedad'
import SelectorOperacion, { type OperacionElegida } from '../../../components/crm/SelectorOperacion/SelectorOperacion'
import { formatearFechaHora } from '../../../lib/formato'
import { ETIQUETAS_ESTADO_ACTIVIDAD, ETIQUETAS_TIPO_ACTIVIDAD, TIPOS_ACTIVIDAD } from '../../../types/actividad'
import type { Actividad, EstadoActividad, TipoActividad } from '../../../types/actividad'
import type { PersonaBrief } from '../../../types/persona'
import type { UsuarioBrief } from '../../../types/inmobiliaria'

const ESTADOS: EstadoActividad[] = ['pendiente', 'hecha', 'cancelada']

function estaVencida(a: Actividad): boolean {
  return a.status === 'pendiente' && a.due_at !== null && new Date(a.due_at) < new Date()
}

export default function ActividadesLista() {
  const [actividades, setActividades] = useState<Actividad[]>([])
  const [usuarios, setUsuarios] = useState<UsuarioBrief[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorAccion, setErrorAccion] = useState<string | null>(null)

  // Filtros: independientes del formulario de alta de abajo. Filtrar por una
  // persona no debe atarla a la próxima actividad que se cree, ni al revés.
  const [filtroEstado, setFiltroEstado] = useState<EstadoActividad | ''>('')
  const [filtroTipo, setFiltroTipo] = useState<TipoActividad | ''>('')
  const [filtroAsignado, setFiltroAsignado] = useState<number | ''>('')
  const [filtroPersona, setFiltroPersona] = useState<PersonaBrief | null>(null)
  const [filtroPropiedad, setFiltroPropiedad] = useState<PropiedadElegida | null>(null)
  const [filtroOperacion, setFiltroOperacion] = useState<OperacionElegida | null>(null)

  const [mostrarAlta, setMostrarAlta] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [tipo, setTipo] = useState<TipoActividad>('tarea')
  const [vencimiento, setVencimiento] = useState('')
  const [asignadoAlta, setAsignadoAlta] = useState<number | ''>('')
  const [altaPersona, setAltaPersona] = useState<PersonaBrief | null>(null)
  const [altaPropiedad, setAltaPropiedad] = useState<PropiedadElegida | null>(null)
  const [altaOperacion, setAltaOperacion] = useState<OperacionElegida | null>(null)
  const [errorAlta, setErrorAlta] = useState<string | null>(null)

  useEffect(() => {
    usuariosApi.listar().then(setUsuarios).catch(() => setUsuarios([]))
  }, [])

  useEffect(() => {
    let vigente = true
    setLoading(true)
    setError(null)
    const params: ListarActividadesParams = {}
    if (filtroEstado) params.status = filtroEstado
    if (filtroTipo) params.type = filtroTipo
    if (filtroAsignado) params.assigned_to_user_id = filtroAsignado
    if (filtroPersona) params.person_id = filtroPersona.id
    if (filtroPropiedad) params.property_id = filtroPropiedad.id
    if (filtroOperacion) params.deal_id = filtroOperacion.id
    actividadesApi.listar(params)
      .then(r => { if (vigente) setActividades(r.items) })
      .catch(e => { if (vigente) setError(e.message) })
      .finally(() => { if (vigente) setLoading(false) })
    return () => { vigente = false }
  }, [filtroEstado, filtroTipo, filtroAsignado, filtroPersona, filtroPropiedad, filtroOperacion])

  const crear = async () => {
    setErrorAlta(null)
    try {
      const nueva = await actividadesApi.crear({
        title: titulo.trim(),
        activity_type: tipo,
        due_at: vencimiento ? new Date(vencimiento).toISOString() : null,
        assigned_to_user_id: asignadoAlta || null,
        person_id: altaPersona?.id ?? null,
        property_id: altaPropiedad?.id ?? null,
        deal_id: altaOperacion?.id ?? null,
      })
      setActividades(a => [nueva, ...a])
      setTitulo('')
      setVencimiento('')
      setAsignadoAlta('')
      setAltaPersona(null)
      setAltaPropiedad(null)
      setAltaOperacion(null)
      setMostrarAlta(false)
    } catch (e: unknown) {
      setErrorAlta(e instanceof Error ? e.message : 'No se pudo crear')
    }
  }

  const marcarHecha = async (id: number) => {
    setErrorAccion(null)
    try {
      const actualizada = await actividadesApi.marcarHecha(id)
      setActividades(a => a.map(x => (x.id === id ? actualizada : x)))
    } catch (e) {
      setErrorAccion(e instanceof Error ? e.message : 'No se pudo completar la acción')
    }
  }

  const cancelar = async (a: Actividad) => {
    if (!window.confirm(`¿Cancelar "${a.title}"?`)) return
    setErrorAccion(null)
    try {
      const actualizada = await actividadesApi.cancelar(a.id)
      setActividades(list => list.map(x => (x.id === a.id ? actualizada : x)))
    } catch (e) {
      setErrorAccion(e instanceof Error ? e.message : 'No se pudo completar la acción')
    }
  }

  const borrar = async (a: Actividad) => {
    if (!window.confirm(`¿Borrar "${a.title}"?`)) return
    setErrorAccion(null)
    try {
      await actividadesApi.eliminar(a.id)
      setActividades(list => list.filter(x => x.id !== a.id))
    } catch (e) {
      setErrorAccion(e instanceof Error ? e.message : 'No se pudo completar la acción')
    }
  }

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <span className="section-label">CRM</span>
          <h1>Actividades</h1>
        </div>
      </div>

      <div className="admin-card filtros-bar">
        <label className="filtros-label">
          Estado
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value as EstadoActividad | '')}>
            <option value="">Todos</option>
            {ESTADOS.map(e => <option key={e} value={e}>{ETIQUETAS_ESTADO_ACTIVIDAD[e]}</option>)}
          </select>
        </label>
        <label className="filtros-label">
          Tipo
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value as TipoActividad | '')}>
            <option value="">Todos</option>
            {TIPOS_ACTIVIDAD.map(t => <option key={t} value={t}>{ETIQUETAS_TIPO_ACTIVIDAD[t]}</option>)}
          </select>
        </label>
        <label className="filtros-label">
          Asignado
          <select value={filtroAsignado} onChange={e => setFiltroAsignado(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Todos</option>
            {usuarios.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        <SelectorPersona valor={filtroPersona} onChange={setFiltroPersona} />
        <SelectorPropiedad valor={filtroPropiedad} onChange={setFiltroPropiedad} />
        <SelectorOperacion valor={filtroOperacion} onChange={setFiltroOperacion} />
      </div>

      <div className="admin-card">
        <button type="button" className="btn btn-outline" onClick={() => setMostrarAlta(m => !m)}>
          {mostrarAlta ? 'Cerrar' : '+ Nueva actividad'}
        </button>
        {mostrarAlta && (
          <div className="form-row" role="group" aria-label="Nueva actividad">
            <div className="form-field">
              <label htmlFor="actividad-titulo">Título</label>
              <input id="actividad-titulo" value={titulo} onChange={e => setTitulo(e.target.value)} />
            </div>

            <div className="form-field">
              <label htmlFor="actividad-tipo">Tipo</label>
              <select id="actividad-tipo" value={tipo} onChange={e => setTipo(e.target.value as TipoActividad)}>
                {TIPOS_ACTIVIDAD.map(t => <option key={t} value={t}>{ETIQUETAS_TIPO_ACTIVIDAD[t]}</option>)}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="actividad-vencimiento">Vencimiento</label>
              <input
                id="actividad-vencimiento"
                type="datetime-local"
                value={vencimiento}
                onChange={e => setVencimiento(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label htmlFor="actividad-asignado">Asignado</label>
              <select
                id="actividad-asignado"
                value={asignadoAlta}
                onChange={e => setAsignadoAlta(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">Sin asignar</option>
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>

            <div className="form-field">
              <SelectorPersona valor={altaPersona} onChange={setAltaPersona} />
            </div>
            <div className="form-field">
              <SelectorPropiedad valor={altaPropiedad} onChange={setAltaPropiedad} />
            </div>
            <div className="form-field">
              <SelectorOperacion valor={altaOperacion} onChange={setAltaOperacion} />
            </div>

            {errorAlta && <p className="form-error" role="alert">{errorAlta}</p>}

            <button
              type="button"
              className="btn btn-magenta"
              disabled={!titulo.trim()}
              onClick={crear}
            >
              Crear
            </button>
          </div>
        )}
      </div>

      {loading && <p className="lista-estado">Cargando...</p>}
      {error && <p className="lista-estado lista-error" role="alert">{error}</p>}

      {!loading && !error && (
        <>
          {errorAccion && <p className="lista-estado lista-error" role="alert">{errorAccion}</p>}
          {actividades.length === 0
            ? <p className="lista-estado">No hay actividades</p>
            : (
              <div className="admin-card tabla-wrapper">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Vence</th>
                      <th>Tipo</th>
                      <th>Título</th>
                      <th>Vinculada a</th>
                      <th>Asignado</th>
                      <th>Estado</th>
                      <th className="th-acciones">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actividades.map(a => {
                      // Persona, propiedad y operación van en una sola celda: lo
                      // que la actividad toca, separado por puntos.
                      const vinculos = [a.person?.full_name, a.propiedad?.titulo, a.deal?.title]
                        .filter(Boolean)
                        .join(' · ')

                      return (
                      <tr key={a.id}>
                        <td data-label="Vence">
                          {formatearFechaHora(a.due_at)}
                          {estaVencida(a) && <Badge value="vencida" />}
                        </td>
                        <td data-label="Tipo">{ETIQUETAS_TIPO_ACTIVIDAD[a.activity_type]}</td>
                        <td data-label="Título"><span className="tabla-titulo" title={a.title}>{a.title}</span></td>
                        <td data-label="Vinculada a">
                          {vinculos
                            ? <span className="tabla-texto" title={vinculos}>{vinculos}</span>
                            : <span className="tabla-vacio">—</span>}
                        </td>
                        <td data-label="Asignado">{a.assigned_to?.name ?? '—'}</td>
                        <td data-label="Estado"><Badge value={a.status} /></td>
                        <td data-label="Acciones">
                          <div className="tabla-acciones">
                            {a.status === 'pendiente' && (
                              <>
                                <button type="button" className="btn btn-outline btn-chico" onClick={() => marcarHecha(a.id)}>Hecha</button>
                                <button type="button" className="btn btn-outline btn-chico" onClick={() => cancelar(a)}>Cancelar</button>
                              </>
                            )}
                            <button type="button" className="btn btn-outline btn-chico" onClick={() => borrar(a)}>Borrar</button>
                          </div>
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
        </>
      )}
    </div>
  )
}
