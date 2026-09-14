import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { operacionesApi } from '../../../api/operaciones'
import { usuariosApi } from '../../../api/usuarios'
import type { Operacion, Pipeline, RolParte } from '../../../types/operacion'
import type { PersonaBrief } from '../../../types/persona'
import type { UsuarioBrief } from '../../../types/inmobiliaria'
import SelectorPersona from '../../../components/crm/SelectorPersona/SelectorPersona'
import Badge from '../../../components/Badge'
import { formatearFecha, formatearMonto } from '../../../lib/formato'
import { LABEL_ROL_PARTE, ROLES_PARTE } from '../../../lib/crm'
import './Ficha.css'

export default function OperacionFicha() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const opId     = Number(id)

  const [op, setOp]                 = useState<Operacion | null>(null)
  const [pipeline, setPipeline]     = useState<Pipeline | null>(null)
  const [usuarios, setUsuarios]     = useState<UsuarioBrief[]>([])
  const [nuevaParte, setNuevaParte] = useState<PersonaBrief | null>(null)
  const [nuevoRol, setNuevoRol]     = useState<RolParte>('comprador')
  const [error, setError]           = useState<string | null>(null)

  const cargar = () => {
    operacionesApi.obtener(opId)
      .then(async o => {
        setOp(o)
        setPipeline(await operacionesApi.pipeline(o.pipeline_id))
      })
      .catch(e => setError(e.message))
  }

  useEffect(() => {
    cargar()
    usuariosApi.listar().then(setUsuarios).catch(() => setUsuarios([]))
  }, [opId]) // eslint-disable-line

  // Cada cambio va directo al backend y se recarga la ficha; si lo rechaza
  // (409 al ganar con la propiedad de baja, etc.) se muestra su mensaje.
  const intentar = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      cargar()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la acción')
    }
  }

  const eliminar = () => {
    if (!op || !window.confirm('¿Eliminar la operación?')) return
    intentar(async () => {
      await operacionesApi.eliminar(op.id)
      navigate('/admin/operaciones')
    })
  }

  const agregarParte = () => {
    if (!op || !nuevaParte) return
    intentar(async () => {
      await operacionesApi.agregarParte(op.id, { person_id: nuevaParte.id, role: nuevoRol })
      setNuevaParte(null)
    })
  }

  if (error && !op) return <p className="lista-estado lista-error">{error}</p>
  if (!op || !pipeline) return <p className="lista-estado">Cargando...</p>

  const etapa = pipeline.stages.find(s => s.id === op.stage_id)

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <span className="section-label">{pipeline.name}</span>
          <h1>{op.title}</h1>
        </div>
        <button className="btn btn-danger" onClick={eliminar}>Eliminar</button>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="ficha-op-grilla">
        <section className="admin-card">
          <h2 className="form-section-title">Estado</h2>
          <div className="form-field">
            <label htmlFor="etapa">Etapa</label>
            <select
              id="etapa"
              value={op.stage_id}
              onChange={e => intentar(() => operacionesApi.moverEtapa(op.id, Number(e.target.value)))}
            >
              {pipeline.stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <p className="form-hint">
              {op.dias_en_etapa} días en {etapa?.name ?? 'la etapa'}
              {op.closed_at ? ` · cerrada el ${formatearFecha(op.closed_at)}` : ''}
            </p>
          </div>

          <dl className="ficha-op-datos">
            <dt>Propiedad</dt>
            <dd>
              {op.propiedad
                ? (
                  <>
                    <Link to={`/admin/propiedades/${op.propiedad.id}/editar`}>{op.propiedad.titulo}</Link>{' '}
                    <Badge value={op.propiedad.estado_comercial} />
                  </>
                )
                : '—'}
            </dd>
            <dt>Monto</dt>
            <dd>{formatearMonto(op.amount, op.currency)}</dd>
            <dt>Asignado a</dt>
            <dd>
              <select
                aria-label="Asignado a"
                value={op.assigned_to_user_id ?? ''}
                onChange={e => intentar(() => operacionesApi.editar(op.id, {
                  // `null` desasigna; `undefined` dejaría al que estaba.
                  assigned_to_user_id: e.target.value ? Number(e.target.value) : null,
                }))}
              >
                <option value="">Nadie</option>
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </dd>
          </dl>

          {op.notes && <p className="ficha-op-notas">{op.notes}</p>}
        </section>

        <section className="admin-card">
          <h2 className="form-section-title">Partes</h2>
          <ul className="partes-lista">
            {op.parties.map(p => (
              <li key={p.id}>
                <Link to={`/admin/personas/${p.person.id}`}>{p.person.full_name}</Link>
                <small>{LABEL_ROL_PARTE[p.role]}</small>
                <button
                  type="button"
                  className="btn btn-outline btn-chico"
                  onClick={() => intentar(() => operacionesApi.quitarParte(op.id, p.id))}
                >
                  Quitar
                </button>
              </li>
            ))}
            {op.parties.length === 0 && <li className="ficha-op-vacio">Sin partes</li>}
          </ul>
          <div className="form-row partes-alta">
            <div className="form-field">
              <SelectorPersona valor={nuevaParte} onChange={setNuevaParte} label="Agregar parte" />
            </div>
            <div className="form-field" style={{ maxWidth: 160 }}>
              <label htmlFor="rol">Rol</label>
              <select id="rol" value={nuevoRol} onChange={e => setNuevoRol(e.target.value as RolParte)}>
                {ROLES_PARTE.map(r => <option key={r} value={r}>{LABEL_ROL_PARTE[r]}</option>)}
              </select>
            </div>
            <button type="button" className="btn btn-outline" disabled={!nuevaParte} onClick={agregarParte}>
              Agregar
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
