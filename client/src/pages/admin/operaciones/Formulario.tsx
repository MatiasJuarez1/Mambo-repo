import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { operacionesApi } from '../../../api/operaciones'
import { propiedadesApi } from '../../../api/propiedades'
import { personasApi } from '../../../api/personas'
import { usuariosApi } from '../../../api/usuarios'
import type { Pipeline, PipelineResumen, RolParte } from '../../../types/operacion'
import type { PersonaBrief } from '../../../types/persona'
import type { PropiedadListItem } from '../../../types/propiedad'
import type { UsuarioBrief } from '../../../types/inmobiliaria'
import SelectorPersona from '../../../components/crm/SelectorPersona/SelectorPersona'
import { LABEL_ROL_PARTE, ROLES_PARTE } from '../../../lib/crm'
import './Ficha.css'

interface ParteEnAlta { persona: PersonaBrief; rol: RolParte }

/**
 * Alta de operación. Llega vacía desde el tablero o precargada desde una
 * reserva convertida (query params `propiedad`, `persona`, `rol`, `pipeline`
 * y `etapa`).
 */
export default function OperacionFormulario() {
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [pipelines, setPipelines]     = useState<PipelineResumen[]>([])
  const [pipeline, setPipeline]       = useState<Pipeline | null>(null)
  const [etapaId, setEtapaId]         = useState<number | null>(null)
  const [propiedades, setPropiedades] = useState<PropiedadListItem[]>([])
  const [propiedad, setPropiedad]     = useState<{ id: number; titulo: string } | null>(null)
  const [titulo, setTitulo]           = useState('')
  const [monto, setMonto]             = useState('')
  const [moneda, setMoneda]           = useState('ARS')
  const [usuarios, setUsuarios]       = useState<UsuarioBrief[]>([])
  const [asignado, setAsignado]       = useState('')
  const [notas, setNotas]             = useState('')
  const [partes, setPartes]           = useState<ParteEnAlta[]>([])
  const [nuevaParte, setNuevaParte]   = useState<PersonaBrief | null>(null)
  const [nuevoRol, setNuevoRol]       = useState<RolParte>('comprador')
  const [guardando, setGuardando]     = useState(false)
  const [error, setError]             = useState<string | null>(null)

  const cargarPipeline = (id: number, etapaNombre: string | null) => {
    operacionesApi.pipeline(id)
      .then(p => {
        setPipeline(p)
        // Una operación nunca nace ganada ni perdida.
        const abiertas = p.stages.filter(s => !s.is_won && !s.is_lost)
        const inicial = abiertas.find(s => s.name === etapaNombre) ?? abiertas[0]
        setEtapaId(inicial?.id ?? null)
      })
      .catch(e => setError(e.message))
  }

  // El título y el monto se completan desde la propiedad sólo si están vacíos:
  // lo que ya escribió quien carga no se pisa.
  const completarDesdePropiedad = (p: { id: number; titulo: string; precio: number | null; moneda: string }) => {
    setPropiedad({ id: p.id, titulo: p.titulo })
    setTitulo(t => t || p.titulo)
    if (p.precio !== null) {
      setMonto(String(p.precio))
      setMoneda(p.moneda)
    }
  }

  // Precarga desde los query params (reserva convertida) y catálogos.
  useEffect(() => {
    const pipelineNombre = params.get('pipeline')
    operacionesApi.pipelines()
      .then(ps => {
        const activos = ps.filter(p => p.is_active)
        setPipelines(activos)
        const elegido = activos.find(p => p.name === pipelineNombre) ?? activos[0]
        if (elegido) cargarPipeline(elegido.id, params.get('etapa'))
      })
      .catch(e => setError(e.message))

    propiedadesApi.listar({ limit: 500 }).then(setPropiedades).catch(() => setPropiedades([]))
    usuariosApi.listar().then(setUsuarios).catch(() => setUsuarios([]))

    const propiedadId = params.get('propiedad')
    if (propiedadId) {
      propiedadesApi.obtener(Number(propiedadId))
        .then(completarDesdePropiedad)
        .catch(e => setError(e.message))
    }
    const personaId = params.get('persona')
    if (personaId) {
      personasApi.obtener(Number(personaId))
        .then(p => {
          const rol = (params.get('rol') as RolParte | null) ?? 'interesado'
          setPartes([{ persona: { id: p.id, full_name: p.full_name }, rol }])
        })
        .catch(e => setError(e.message))
    }
  }, []) // eslint-disable-line

  const elegirPropiedad = (id: number) => {
    const p = propiedades.find(x => x.id === id)
    if (p) completarDesdePropiedad(p)
  }

  const agregarParte = () => {
    if (!nuevaParte) return
    setPartes(ps => [...ps, { persona: nuevaParte, rol: nuevoRol }])
    setNuevaParte(null)
  }

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pipeline || etapaId === null) {
      setError('Elegí el pipeline y la etapa')
      return
    }
    setGuardando(true)
    setError(null)
    try {
      const creada = await operacionesApi.crear({
        title:               titulo.trim(),
        pipeline_id:         pipeline.id,
        stage_id:            etapaId,
        property_id:         propiedad?.id,
        amount:              monto ? Number(monto) : undefined,
        currency:            moneda,
        assigned_to_user_id: asignado ? Number(asignado) : undefined,
        notes:               notas || undefined,
        parties:             partes.map(p => ({ person_id: p.persona.id, role: p.rol })),
      })
      navigate(`/admin/operaciones/${creada.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la operación')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div>
      <div className="admin-page-header"><h1>Nueva operación</h1></div>
      {error && <p className="form-error" role="alert">{error}</p>}

      <form onSubmit={guardar} className="admin-card form">
        <div className="form-row">
          <div className="form-field">
            <label htmlFor="pipeline">Pipeline</label>
            <select id="pipeline" value={pipeline?.id ?? ''} onChange={e => cargarPipeline(Number(e.target.value), null)}>
              {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="etapa">Etapa</label>
            <select id="etapa" value={etapaId ?? ''} onChange={e => setEtapaId(Number(e.target.value))}>
              {pipeline?.stages.filter(s => !s.is_won && !s.is_lost).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-field full">
          <label htmlFor="propiedad">Propiedad (opcional)</label>
          {propiedad
            ? (
              <p id="propiedad" className="form-valor">
                {propiedad.titulo}{' '}
                <button type="button" className="btn btn-outline btn-chico" onClick={() => setPropiedad(null)}>
                  Quitar
                </button>
              </p>
            )
            : (
              <select id="propiedad" value="" onChange={e => elegirPropiedad(Number(e.target.value))}>
                <option value="">Sin propiedad</option>
                {propiedades.map(p => <option key={p.id} value={p.id}>{p.titulo}</option>)}
              </select>
            )}
        </div>

        <div className="form-field full">
          <label htmlFor="titulo">Título *</label>
          <input id="titulo" required value={titulo} onChange={e => setTitulo(e.target.value)} />
        </div>

        <div className="form-row">
          <div className="form-field" style={{ maxWidth: 100 }}>
            <label htmlFor="moneda">Moneda</label>
            <select id="moneda" value={moneda} onChange={e => setMoneda(e.target.value)}>
              <option>ARS</option>
              <option>USD</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="monto">Monto</label>
            <input id="monto" type="number" min={0} value={monto} onChange={e => setMonto(e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="asignado">Asignado a</label>
            <select id="asignado" value={asignado} onChange={e => setAsignado(e.target.value)}>
              <option value="">Nadie</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        </div>

        <h2 className="form-section-title">Partes</h2>
        <ul className="partes-lista">
          {partes.map((p, i) => (
            <li key={`${p.persona.id}-${p.rol}`}>
              <span>{p.persona.full_name}</span>
              <small>{LABEL_ROL_PARTE[p.rol]}</small>
              <button
                type="button"
                className="btn btn-outline btn-chico"
                onClick={() => setPartes(ps => ps.filter((_, j) => j !== i))}
              >
                Quitar
              </button>
            </li>
          ))}
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
          <button type="button" className="btn btn-outline" onClick={agregarParte} disabled={!nuevaParte}>
            Agregar
          </button>
        </div>

        <div className="form-field full">
          <label htmlFor="notas">Notas</label>
          <textarea id="notas" rows={3} value={notas} onChange={e => setNotas(e.target.value)} />
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={() => navigate(-1)}>Cancelar</button>
          <button type="submit" className="btn btn-magenta" disabled={guardando}>
            {guardando ? 'Creando...' : 'Crear operación'}
          </button>
        </div>
      </form>
    </div>
  )
}
