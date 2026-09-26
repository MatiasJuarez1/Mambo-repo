import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { operacionesApi } from '../../../api/operaciones'
import type { OperacionListItem, Pipeline, PipelineResumen } from '../../../types/operacion'
import TarjetaOperacion from '../../../components/crm/TarjetaOperacion/TarjetaOperacion'
import './Tablero.css'

// El tablero recuerda el último pipeline elegido en este navegador, así quien
// trabaja con alquileres no vuelve a Venta cada vez que entra.
const CLAVE_PIPELINE = 'mambo.tablero.pipeline'

// Las columnas cerradas (ganada/perdida) acumulan para siempre; se muestran
// plegadas y con un tope para que el tablero no se haga interminable.
const MAX_CERRADAS = 20

function pipelineRecordado(): number | null {
  try {
    const v = localStorage.getItem(CLAVE_PIPELINE)
    return v ? Number(v) : null
  } catch {
    return null
  }
}

export default function Tablero() {
  const [pipelines, setPipelines]         = useState<PipelineResumen[]>([])
  const [pipelineId, setPipelineId]       = useState<number | null>(pipelineRecordado())
  const [pipeline, setPipeline]           = useState<Pipeline | null>(null)
  const [operaciones, setOperaciones]     = useState<OperacionListItem[]>([])
  const [cerradaAbierta, setCerradaAbierta] = useState<number | null>(null)
  const [error, setError]                 = useState<string | null>(null)

  useEffect(() => {
    operacionesApi.pipelines()
      .then(ps => {
        const activos = ps.filter(p => p.is_active)
        setPipelines(activos)
        if (pipelineId === null || !activos.some(p => p.id === pipelineId)) {
          setPipelineId(activos[0]?.id ?? null)
        }
      })
      .catch(e => setError(e.message))
  }, []) // eslint-disable-line

  const cargar = () => {
    if (pipelineId === null) return
    try { localStorage.setItem(CLAVE_PIPELINE, String(pipelineId)) } catch { /* sin storage, sin memoria */ }
    Promise.all([
      operacionesApi.pipeline(pipelineId),
      operacionesApi.listar({ pipeline_id: pipelineId, limit: 200 }),
    ])
      .then(([p, ops]) => { setPipeline(p); setOperaciones(ops.items) })
      .catch(e => setError(e.message))
  }

  useEffect(cargar, [pipelineId]) // eslint-disable-line

  const porEtapa = useMemo(() => {
    const mapa = new Map<number, OperacionListItem[]>()
    operaciones.forEach(op => mapa.set(op.stage_id, [...(mapa.get(op.stage_id) ?? []), op]))
    return mapa
  }, [operaciones])

  // Optimista: la tarjeta cambia de columna al toque; si el backend rechaza
  // (409, propiedad dada de baja) se recarga y vuelve a donde estaba.
  const mover = async (op: OperacionListItem, stageId: number) => {
    setError(null)
    setOperaciones(ops => ops.map(o => (o.id === op.id ? { ...o, stage_id: stageId } : o)))
    try {
      await operacionesApi.moverEtapa(op.id, stageId)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo mover')
    } finally {
      cargar()
    }
  }

  const abiertas = pipeline?.stages.filter(s => !s.is_won && !s.is_lost) ?? []
  const cerradas = pipeline?.stages.filter(s => s.is_won || s.is_lost) ?? []

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <span className="section-label">CRM</span>
          <h1>Operaciones</h1>
        </div>
        {/* El selector de pipeline es un filtro de la pantalla, no un título:
            va del lado de las acciones, junto al alta. */}
        <div className="admin-page-acciones">
          <div className="tablero-pipelines" role="tablist">
            {pipelines.map(p => (
              <button
                key={p.id}
                role="tab"
                aria-selected={p.id === pipelineId}
                className={`tablero-pipeline${p.id === pipelineId ? ' activo' : ''}`}
                onClick={() => setPipelineId(p.id)}
              >
                {p.name}
              </button>
            ))}
          </div>
          <Link
            to={`/admin/operaciones/nueva${pipeline ? `?pipeline=${pipeline.name}` : ''}`}
            className="btn btn-magenta"
          >
            + Nueva operación
          </Link>
        </div>
      </div>

      {error && <p className="lista-estado lista-error" role="alert">{error}</p>}

      {pipeline && (
        <>
          <div className="tablero">
            {abiertas.map(etapa => (
              <section key={etapa.id} className="tablero-columna">
                <h2 className="tablero-columna-titulo">
                  {etapa.name} <span>{porEtapa.get(etapa.id)?.length ?? 0}</span>
                </h2>
                <div className="tablero-tarjetas">
                  {(porEtapa.get(etapa.id) ?? []).map(op => (
                    <TarjetaOperacion
                      key={op.id}
                      operacion={op}
                      etapas={pipeline.stages}
                      onMover={id => mover(op, id)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="tablero-cerradas">
            {cerradas.map(etapa => {
              const lista = porEtapa.get(etapa.id) ?? []
              const abierta = cerradaAbierta === etapa.id
              return (
                <section key={etapa.id} className="admin-card">
                  <button
                    className="tablero-cerrada-toggle"
                    aria-expanded={abierta}
                    onClick={() => setCerradaAbierta(abierta ? null : etapa.id)}
                  >
                    {etapa.name} · {lista.length}
                  </button>
                  {abierta && (
                    <div className="tablero-tarjetas">
                      {lista.slice(0, MAX_CERRADAS).map(op => (
                        <TarjetaOperacion
                          key={op.id}
                          operacion={op}
                          etapas={pipeline.stages}
                          onMover={id => mover(op, id)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
