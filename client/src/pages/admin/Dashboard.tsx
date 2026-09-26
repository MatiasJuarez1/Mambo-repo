import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { propiedadesApi } from '../../api/propiedades'
import { reservasApi } from '../../api/reservas'
import { operacionesApi } from '../../api/operaciones'
import { alquileresApi } from '../../api/alquileres'
import { reportesApi } from '../../api/reportes'
import type { PropiedadListItem } from '../../types/propiedad'
import type { Reserva } from '../../types/reserva'
import type { Recordatorios, ResumenAlquileres } from '../../types/alquileres'
import type { ReporteOperaciones } from '../../types/reportes'
import StatTile from '../../components/StatTile'
import { useAuth } from '../../context/AuthContext'
import { veCrm } from '../../lib/beta'
import BandejaRecordatorios from '../../components/crm/BandejaRecordatorios/BandejaRecordatorios'
import GraficoBarras from '../../components/graficos/GraficoBarras'
import { diasHasta, etiquetaMesCorta, formatearMonto } from '../../lib/formato'
import { monedaMasFrecuente } from '../../lib/reportes'

// Una reserva que vence dentro de esta cantidad de días cuenta como "esta semana".
const DIAS_SEMANA = 7
// Ventanas de los tiles de alquileres; los links a la lista llevan el mismo filtro.
const DIAS_VENCEN_CONTRATOS = 90
const DIAS_PROXIMOS_AJUSTES = 30
// Meses que abarca el gráfico de operaciones cerradas.
const MESES_GRAFICO = 6

export default function Dashboard() {
  const [props, setProps]                   = useState<PropiedadListItem[]>([])
  const [reservasActivas, setReservasActivas] = useState<Reserva[]>([])
  const [operacionesAbiertas, setOperacionesAbiertas] = useState(0)
  const [contratosPorVencer, setContratosPorVencer]   = useState(0)
  const [ajustesProximos, setAjustesProximos]         = useState(0)
  const [resumen, setResumen]                         = useState<ResumenAlquileres | null>(null)
  const [recordatorios, setRecordatorios]             = useState<Recordatorios | null>(null)
  const [comisionesACobrar, setComisionesACobrar]     = useState(0)
  const [ultimosMeses, setUltimosMeses]               = useState<ReporteOperaciones | null>(null)

  const crm = veCrm(useAuth().usuario)

  useEffect(() => {
    propiedadesApi.listar({ limit: 500 }).then(setProps).catch(() => setProps([]))
    if (!crm) return
    reservasApi.listar({ status: 'activa', limit: 200 })
      .then(r => setReservasActivas(r.items))
      .catch(() => setReservasActivas([]))
    // Sólo interesa el total del paginado, no las operaciones en sí.
    operacionesApi.listar({ is_closed: false, limit: 1 })
      .then(r => setOperacionesAbiertas(r.total))
      .catch(() => setOperacionesAbiertas(0))
    alquileresApi.listar({ vence_en_dias: DIAS_VENCEN_CONTRATOS, limit: 1 })
      .then(r => setContratosPorVencer(r.total))
      .catch(() => setContratosPorVencer(0))
    alquileresApi.listar({ ajuste_en_dias: DIAS_PROXIMOS_AJUSTES, limit: 1 })
      .then(r => setAjustesProximos(r.total))
      .catch(() => setAjustesProximos(0))
    alquileresApi.resumen().then(setResumen).catch(() => setResumen(null))
    // Sin `dias`: la ventana es la configurada en la inmobiliaria.
    alquileresApi.recordatorios().then(setRecordatorios).catch(() => setRecordatorios(null))
    // Del último año (el default del reporte): solo interesa cuántas hay.
    reportesApi.comisiones({ cobrada: false })
      .then(r => setComisionesACobrar(r.filas.length))
      .catch(() => setComisionesACobrar(0))
    reportesApi.operaciones({ desde: primerDiaHaceMeses(MESES_GRAFICO - 1) })
      .then(setUltimosMeses)
      .catch(() => setUltimosMeses(null))
  }, [crm])

  const total       = props.length
  const disponibles = props.filter(p => p.estado_comercial === 'disponible').length
  const reservadas  = props.filter(p => p.estado_comercial === 'reservada').length
  // Una moneda por vez: la que más filas tiene (ARS en la práctica).
  const monedaGrafico = ultimosMeses ? monedaMasFrecuente(ultimosMeses.filas) : 'ARS'
  const filasGrafico = ultimosMeses ? ultimosMeses.filas.filter(f => f.moneda === monedaGrafico) : []
  const vencenEstaSemana = reservasActivas.filter(r => {
    const d = diasHasta(r.expires_at)
    return d !== null && d >= 0 && d <= DIAS_SEMANA
  }).length

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <span className="section-label">Panel</span>
          <h1>Dashboard</h1>
        </div>
      </div>

      {/* Trece tiles seguidos en una sola grilla son una pared de números: no
          hay forma de saber cuál mira uno sin leer el rótulo de todos. Van
          agrupados por área —las mismas tres de la navegación—, así que el
          ojo elige primero el bloque y después el dato. */}
      <section className="admin-seccion">
        <h2 className="admin-seccion-titulo">Inventario</h2>
        <div className="admin-stats-grid">
          <StatTile label="Propiedades" valor={total} to="/admin/propiedades" />
          <StatTile label="Disponibles" valor={disponibles} tono="ok" />
          <StatTile label="Reservadas" valor={reservadas} tono="espera" />
        </div>
      </section>

      {crm && (<>
      <section className="admin-seccion">
        <h2 className="admin-seccion-titulo">Comercial</h2>
        <div className="admin-stats-grid">
          <StatTile label="Reservas activas" valor={reservasActivas.length} tono="espera" to="/admin/reservas" />
          <StatTile label="Vencen esta semana" valor={vencenEstaSemana} tono="espera" />
          <StatTile label="Operaciones abiertas" valor={operacionesAbiertas} tono="ok" to="/admin/operaciones" />
          <StatTile
            label="Comisiones a cobrar"
            valor={comisionesACobrar}
            tono={comisionesACobrar > 0 ? 'espera' : 'ok'}
            to="/admin/reportes?tab=comisiones&cobrada=false"
          />
        </div>
      </section>

      <section className="admin-seccion">
        <h2 className="admin-seccion-titulo">Alquileres</h2>
        <div className="admin-stats-grid">
          <StatTile
            label={`Contratos que vencen en ${DIAS_VENCEN_CONTRATOS} días`}
            valor={contratosPorVencer}
            tono="espera"
            to={`/admin/alquileres?vence_en_dias=${DIAS_VENCEN_CONTRATOS}`}
          />
          <StatTile
            label={`Ajustes en los próximos ${DIAS_PROXIMOS_AJUSTES} días`}
            valor={ajustesProximos}
            tono="espera"
            to={`/admin/alquileres?ajuste_en_dias=${DIAS_PROXIMOS_AJUSTES}`}
          />
          {/* Los montos son en ARS: los contratos en dólares son la excepción y el resumen los suma igual. */}
          <StatTile
            label="Cobros vencidos"
            valor={resumen?.vencidos_cantidad ?? 0}
            detalle={resumen ? formatearMonto(resumen.vencido_monto, 'ARS') : undefined}
            tono="espera"
            to="/admin/alquileres/cobros?estado=vencido"
          />
          <StatTile
            label="Cobrado este mes"
            valor={resumen ? formatearMonto(resumen.cobrado, 'ARS') : '—'}
            detalle={resumen ? `de ${formatearMonto(resumen.esperado, 'ARS')}` : undefined}
            tono="ok"
            to="/admin/alquileres/cobros?estado=pagado"
          />
          <StatTile
            label="Liquidaciones sin emitir"
            valor={resumen?.liquidaciones_sin_emitir ?? 0}
            tono="espera"
            to="/admin/alquileres?sin_liquidar=1"
          />
          <StatTile
            label="Recordatorios"
            valor={recordatorios?.total ?? 0}
            tono={recordatorios && recordatorios.total > 0 ? 'espera' : 'ok'}
            to="/admin/alquileres/recordatorios"
          />
        </div>
      </section>

      <div className="admin-card admin-bloque">
        <div className="admin-card-cabecera">
          <h2>Próximos {recordatorios?.dias ?? 30} días</h2>
          <Link to="/admin/alquileres/recordatorios" className="btn btn-outline btn-chico">Ver todos</Link>
        </div>
        {recordatorios
          ? <BandejaRecordatorios datos={recordatorios} compacto />
          : <p className="lista-estado">Cargando...</p>}
      </div>

      <div className="admin-card admin-bloque">
        <div className="admin-card-cabecera">
          <h2>Últimos {MESES_GRAFICO} meses</h2>
          <Link to="/admin/reportes" className="btn btn-outline btn-chico">Ver reportes</Link>
        </div>
        {ultimosMeses
          ? (
            <GraficoBarras
              categorias={filasGrafico.map(f => etiquetaMesCorta(f.mes))}
              series={[
                { nombre: 'Ganadas', valores: filasGrafico.map(f => f.ganadas) },
                { nombre: 'Perdidas', valores: filasGrafico.map(f => f.perdidas) },
              ]}
            />
          )
          : <p className="lista-estado">Cargando...</p>}
      </div>
      </>)}
    </div>
  )
}

/** `YYYY-MM-01` de hace `meses` meses, en hora local. */
function primerDiaHaceMeses(meses: number): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - meses)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
