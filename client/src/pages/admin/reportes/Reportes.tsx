import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { reportesApi } from '../../../api/reportes'
import { operacionesApi } from '../../../api/operaciones'
import { usuariosApi } from '../../../api/usuarios'
import type { PipelineResumen } from '../../../types/operacion'
import type { UsuarioBrief } from '../../../types/inmobiliaria'
import type {
  FiltrosReporte, NombreReporte, ReporteAlquileres, ReporteComisiones, ReporteEmbudo, ReporteOperaciones,
} from '../../../types/reportes'
import GraficoBarras from '../../../components/graficos/GraficoBarras'
import GraficoEmbudo from '../../../components/graficos/GraficoEmbudo'
import Badge from '../../../components/Badge'
import {
  etiquetaMes, etiquetaMesCorta, formatearFecha, formatearMonto, formatearPorcentaje,
} from '../../../lib/formato'
import { monedaMasFrecuente } from '../../../lib/reportes'
import './Reportes.css'

const PESTANAS: { id: NombreReporte; label: string }[] = [
  { id: 'operaciones', label: 'Operaciones' },
  { id: 'comisiones', label: 'Comisiones' },
  { id: 'embudo', label: 'Embudo' },
  { id: 'alquileres', label: 'Alquileres' },
]

const esPestana = (v: string | null): v is NombreReporte => PESTANAS.some(p => p.id === v)

/**
 * Los cuatro reportes del Bloque 4 en pestañas. Los filtros viven en la query
 * string para poder linkear una vista (el dashboard lo usa).
 */
export default function Reportes() {
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab')
  const tab: NombreReporte = esPestana(tabParam) ? tabParam : 'operaciones'
  const filtros: FiltrosReporte = useMemo(() => ({
    desde: params.get('desde') ?? undefined,
    hasta: params.get('hasta') ?? undefined,
    pipeline_id: params.get('pipeline_id') ? Number(params.get('pipeline_id')) : undefined,
    agente_id: params.get('agente_id') ? Number(params.get('agente_id')) : undefined,
    cobrada: params.get('cobrada') === null ? undefined : params.get('cobrada') === 'true',
  }), [params])
  const monedaParam = params.get('moneda')

  const [pipelines, setPipelines] = useState<PipelineResumen[]>([])
  const [usuarios, setUsuarios] = useState<UsuarioBrief[]>([])
  const [operaciones, setOperaciones] = useState<ReporteOperaciones | null>(null)
  const [comisiones, setComisiones] = useState<ReporteComisiones | null>(null)
  const [embudo, setEmbudo] = useState<ReporteEmbudo | null>(null)
  const [alquileres, setAlquileres] = useState<ReporteAlquileres | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    operacionesApi.pipelines().then(setPipelines).catch(() => setPipelines([]))
    usuariosApi.listar().then(setUsuarios).catch(() => setUsuarios([]))
  }, [])

  // El embudo necesita pipeline: sin uno elegido se usa el primero.
  const pipelineEmbudo = filtros.pipeline_id ?? pipelines[0]?.id

  useEffect(() => {
    setError(null)
    const fallo = (e: Error) => setError(e.message)
    if (tab === 'operaciones') reportesApi.operaciones(filtros).then(setOperaciones).catch(fallo)
    if (tab === 'comisiones') reportesApi.comisiones(filtros).then(setComisiones).catch(fallo)
    if (tab === 'embudo' && pipelineEmbudo) {
      reportesApi.embudo({ ...filtros, pipeline_id: pipelineEmbudo }).then(setEmbudo).catch(fallo)
    }
    if (tab === 'alquileres') {
      reportesApi.alquileres({ desde: filtros.desde, hasta: filtros.hasta }).then(setAlquileres).catch(fallo)
    }
  }, [tab, filtros, pipelineEmbudo])

  const setParam = (clave: string, valor: string) => {
    const nuevos = new URLSearchParams(params)
    if (valor === '') nuevos.delete(clave); else nuevos.set(clave, valor)
    setParams(nuevos, { replace: true })
  }

  const filasMonetarias: { moneda: string }[] =
    (tab === 'operaciones' ? operaciones?.filas : tab === 'alquileres' ? alquileres?.filas : comisiones?.filas) ?? []
  const monedas = [...new Set(filasMonetarias.map(f => f.moneda))].sort()
  const moneda = monedaParam && monedas.includes(monedaParam) ? monedaParam : monedaMasFrecuente(filasMonetarias)

  const filtrosCsv: FiltrosReporte = tab === 'embudo' ? { ...filtros, pipeline_id: pipelineEmbudo } : filtros

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <span className="section-label">Análisis</span>
          <h1>Reportes</h1>
        </div>
        <div className="admin-page-acciones">
          <a href={reportesApi.urlCsv(tab, filtrosCsv)} download className="btn btn-outline">Exportar CSV</a>
        </div>
      </div>

      <div role="tablist" className="reportes-tabs">
        {PESTANAS.map(p => (
          <button
            key={p.id} role="tab" aria-selected={tab === p.id}
            className={`reportes-tab${tab === p.id ? ' activa' : ''}`}
            onClick={() => setParam('tab', p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="admin-card filtros-bar">
        <label className="filtros-label">
          Desde
          <input type="date" value={filtros.desde ?? ''} onChange={e => setParam('desde', e.target.value)} />
        </label>
        <label className="filtros-label">
          Hasta
          <input type="date" value={filtros.hasta ?? ''} onChange={e => setParam('hasta', e.target.value)} />
        </label>
        {(tab === 'operaciones' || tab === 'embudo') && (
          <label className="filtros-label">
            Pipeline
            <select
              value={filtros.pipeline_id ?? (tab === 'embudo' ? pipelineEmbudo ?? '' : '')}
              onChange={e => setParam('pipeline_id', e.target.value)}
            >
              {tab === 'operaciones' && <option value="">Todos</option>}
              {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        {(tab === 'operaciones' || tab === 'comisiones') && (
          <label className="filtros-label">
            Agente
            <select value={filtros.agente_id ?? ''} onChange={e => setParam('agente_id', e.target.value)}>
              <option value="">Todos</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
        )}
        {tab === 'comisiones' && (
          <label className="filtros-label">
            Cobrada
            <select
              value={filtros.cobrada === undefined ? '' : String(filtros.cobrada)}
              onChange={e => setParam('cobrada', e.target.value)}
            >
              <option value="">Todas</option>
              <option value="true">Sí</option>
              <option value="false">No</option>
            </select>
          </label>
        )}
        {monedas.length > 1 && (
          <label className="filtros-label">
            Moneda
            <select value={moneda} onChange={e => setParam('moneda', e.target.value)}>
              {monedas.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
        )}
      </div>

      {error && <p className="lista-estado lista-error" role="alert">{error}</p>}

      {tab === 'operaciones' && operaciones && <PestanaOperaciones datos={operaciones} moneda={moneda} />}
      {tab === 'comisiones' && comisiones && <PestanaComisiones datos={comisiones} moneda={moneda} />}
      {tab === 'embudo' && embudo && <PestanaEmbudo datos={embudo} />}
      {tab === 'alquileres' && alquileres && <PestanaAlquileres datos={alquileres} moneda={moneda} />}
    </div>
  )
}

function PestanaOperaciones({ datos, moneda }: { datos: ReporteOperaciones; moneda: string }) {
  const filas = datos.filas.filter(f => f.moneda === moneda)
  const total = datos.totales.find(t => t.moneda === moneda)
  return (
    <>
      <div className="admin-card reportes-grafico">
        <GraficoBarras
          categorias={filas.map(f => etiquetaMesCorta(f.mes))}
          series={[
            { nombre: 'Ganadas', valores: filas.map(f => f.ganadas) },
            { nombre: 'Perdidas', valores: filas.map(f => f.perdidas) },
          ]}
        />
      </div>
      <div className="admin-card tabla-wrapper">
        <table className="tabla">
          <thead>
            <tr><th>Mes</th><th>Ganadas</th><th>Perdidas</th><th>Monto</th><th>Comisiones</th><th>Cobradas</th></tr>
          </thead>
          <tbody>
            {[...filas, ...(total ? [total] : [])].map(f => (
              <tr key={f.mes} className={f.mes === 'total' ? 'fila-total' : undefined}>
                <td>{etiquetaMes(f.mes)}</td>
                <td>{f.ganadas}</td>
                <td>{f.perdidas}</td>
                <td>{formatearMonto(f.monto_ganado, moneda)}</td>
                <td>{formatearMonto(f.comisiones, moneda)}</td>
                <td>{formatearMonto(f.comisiones_cobradas, moneda)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function PestanaComisiones({ datos, moneda }: { datos: ReporteComisiones; moneda: string }) {
  const agentes = datos.por_agente.filter(a => a.moneda === moneda)
  const filas = datos.filas.filter(f => f.moneda === moneda)
  return (
    <>
      <div className="admin-card tabla-wrapper reportes-grafico">
        <h2 className="form-section-title reportes-tabla-titulo">Por agente</h2>
        <table className="tabla">
          <thead><tr><th>Agente</th><th>Operaciones</th><th>Comisión</th><th>Cobrada</th></tr></thead>
          <tbody>
            {agentes.map(a => (
              <tr key={a.user_id ?? 'resto'}>
                <td>{a.nombre}</td>
                <td>{a.operaciones}</td>
                <td>{formatearMonto(a.comision, moneda)}</td>
                <td>{formatearMonto(a.cobrada, moneda)}</td>
              </tr>
            ))}
            {agentes.length === 0 && (
              <tr><td colSpan={4} className="lista-estado">Sin comisiones en el período.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="admin-card tabla-wrapper">
        <h2 className="form-section-title reportes-tabla-titulo">Por operación</h2>
        <table className="tabla">
          <thead>
            <tr><th>Operación</th><th>Cerrada</th><th>Monto</th><th>%</th><th>Comisión</th><th>Estado</th><th>Reparto</th></tr>
          </thead>
          <tbody>
            {filas.map(f => (
              <tr key={f.deal_id}>
                <td>
                  <Link to={`/admin/operaciones/${f.deal_id}`} className="tabla-titulo">{f.titulo}</Link>{' '}
                  <small>{f.pipeline}</small>
                </td>
                <td>{formatearFecha(f.closed_at)}</td>
                <td>{formatearMonto(f.monto_operacion, moneda)}</td>
                <td>{formatearPorcentaje(f.pct)}</td>
                <td>{formatearMonto(f.monto, moneda)}</td>
                <td>
                  <Badge
                    value={f.cobrada ? 'cobrada' : 'a_cobrar'}
                    color={f.cobrada ? 'ok' : 'espera'}
                    label={f.cobrada ? `Cobrada ${formatearFecha(f.fecha_cobro)}` : 'A cobrar'}
                  />
                </td>
                <td>{f.reparto.map(r => `${r.nombre} ${formatearPorcentaje(r.pct)}`).join(' · ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function PestanaEmbudo({ datos }: { datos: ReporteEmbudo }) {
  return (
    <div className="admin-card">
      <GraficoEmbudo
        etapas={datos.etapas.map(e => ({
          nombre: e.nombre,
          valor: e.ingresaron,
          detalle: [
            e.conversion_pct !== null ? `${formatearPorcentaje(e.conversion_pct)} avanzan` : null,
            e.dias_promedio !== null ? `${Number(e.dias_promedio).toLocaleString('es-AR')} días` : null,
            `${e.actuales} ahora`,
          ].filter(Boolean).join(' · '),
        }))}
      />
      <p className="reportes-resumen">
        Ganadas {datos.ganadas} · Perdidas {datos.perdidas} · Tasa de cierre {formatearPorcentaje(datos.tasa_cierre_pct)}
        {datos.dias_promedio_cierre !== null
          && ` · ${Number(datos.dias_promedio_cierre).toLocaleString('es-AR')} días promedio de cierre`}
      </p>
    </div>
  )
}

function PestanaAlquileres({ datos, moneda }: { datos: ReporteAlquileres; moneda: string }) {
  const filas = datos.filas.filter(f => f.moneda === moneda)
  const total = datos.totales.find(t => t.moneda === moneda)
  return (
    <>
      <div className="admin-card reportes-grafico">
        <GraficoBarras
          categorias={filas.map(f => etiquetaMesCorta(f.mes))}
          series={[
            { nombre: 'Esperado', valores: filas.map(f => Number(f.esperado)) },
            { nombre: 'Cobrado', valores: filas.map(f => Number(f.cobrado)) },
          ]}
          formatear={v => formatearMonto(v, moneda)}
        />
      </div>
      <div className="admin-card tabla-wrapper">
        <table className="tabla">
          <thead>
            <tr><th>Mes</th><th>Esperado</th><th>Cobrado</th><th>Pendiente</th><th>Honorarios</th><th>Contratos</th></tr>
          </thead>
          <tbody>
            {[...filas, ...(total ? [total] : [])].map(f => (
              <tr key={f.mes} className={f.mes === 'total' ? 'fila-total' : undefined}>
                <td>{etiquetaMes(f.mes)}</td>
                <td>{formatearMonto(f.esperado, moneda)}</td>
                <td>{formatearMonto(f.cobrado, moneda)}</td>
                <td>{formatearMonto(f.pendiente, moneda)}</td>
                <td>{formatearMonto(f.honorarios, moneda)}</td>
                <td>{f.contratos_vigentes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
