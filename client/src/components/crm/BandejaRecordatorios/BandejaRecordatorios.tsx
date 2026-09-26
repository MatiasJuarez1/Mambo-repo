import { Link } from 'react-router-dom'
import type { Recordatorio, Recordatorios } from '../../../types/alquileres'
import Badge from '../../Badge'
import { formatearFecha, formatearMonto } from '../../../lib/formato'
import { ORDEN_TIPOS_RECORDATORIO, chipRecordatorio, etiquetaTipoRecordatorio } from '../../../lib/alquileres'
import './BandejaRecordatorios.css'

// En el dashboard se muestran los primeros N; el resto queda detrás de "Ver los X".
const MAXIMO_COMPACTO = 8

interface Props {
  datos: Recordatorios
  /** Dashboard: recorta a `MAXIMO_COMPACTO` ítems y linkea a la página completa. */
  compacto?: boolean
}

function hrefDe(item: Recordatorio): string {
  const ficha = `/admin/alquileres/${item.contrato_id}`
  // La ficha renderiza cada período con `id="cobro-{id}"`: el ancla lleva a la fila.
  return item.tipo === 'cobro_vencido' || item.tipo === 'cobro_por_vencer'
    ? `${ficha}#cobro-${item.referencia_id}`
    : ficha
}

/**
 * La bandeja de "qué hay que atender": cobros vencidos y por vencer, ajustes
 * pendientes y contratos que terminan, agrupados en el mismo orden que el
 * email diario. Cada fila lleva a la ficha del contrato.
 */
export default function BandejaRecordatorios({ datos, compacto = false }: Props) {
  if (datos.total === 0) {
    return <p className="lista-estado">Nada pendiente en los próximos {datos.dias} días.</p>
  }
  const visibles = compacto ? datos.items.slice(0, MAXIMO_COMPACTO) : datos.items

  return (
    <div className="bandeja">
      {ORDEN_TIPOS_RECORDATORIO.map(tipo => {
        const items = visibles.filter(i => i.tipo === tipo)
        if (items.length === 0) return null
        const titulo = `${etiquetaTipoRecordatorio(tipo)} (${datos.por_tipo[tipo]})`
        return (
          <section key={tipo} className="bandeja-grupo" aria-labelledby={`bandeja-${tipo}`}>
            <h3 id={`bandeja-${tipo}`} className="bandeja-titulo">{titulo}</h3>
            <ul className="bandeja-lista">
              {items.map(item => {
                const chip = chipRecordatorio(item)
                return (
                  <li key={`${item.tipo}-${item.referencia_id}`} className="bandeja-item">
                    <div className="bandeja-item-principal">
                      <Link to={hrefDe(item)} className="tabla-titulo">{item.propiedad.titulo}</Link>
                      {item.inquilinos.length > 0 && (
                        <span className="bandeja-inquilinos">{item.inquilinos.map(p => p.full_name).join(' y ')}</span>
                      )}
                    </div>
                    <div className="bandeja-item-detalle">
                      <span>{item.detalle}</span>
                      <span>{formatearFecha(item.fecha)}</span>
                      {item.monto !== null && <span>{formatearMonto(item.monto, item.moneda)}</span>}
                      <Badge value={item.tipo} color={chip.color} label={chip.texto} />
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
      {compacto && datos.total > MAXIMO_COMPACTO && (
        <Link to="/admin/alquileres/recordatorios" className="btn btn-outline bandeja-ver-todos">
          Ver los {datos.total}
        </Link>
      )}
    </div>
  )
}
