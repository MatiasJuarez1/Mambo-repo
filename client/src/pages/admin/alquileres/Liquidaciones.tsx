import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { alquileresApi, type FiltroEstadoLiquidacion } from '../../../api/alquileres'
import type { LiquidacionEnLista } from '../../../types/alquileres'
import Badge from '../../../components/Badge'
import { formatearFecha, formatearMonto } from '../../../lib/formato'
import { LABEL_ESTADO_LIQUIDACION, nombreMes } from '../../../lib/alquileres'
import { mediaUrl } from '../../../lib/propiedad'

const ESTADOS: { valor: FiltroEstadoLiquidacion | 'todos'; label: string }[] = [
  { valor: 'todos',   label: 'Todas' },
  { valor: 'emitida', label: 'Emitidas' },
  { valor: 'pagada',  label: 'Pagadas' },
  { valor: 'anulada', label: 'Anuladas' },
]

/**
 * Liquidaciones de todos los contratos administrados, las más recientes primero.
 * Es la vista para cerrar el mes: se filtra por estado para ver qué queda por
 * transferir. Los filtros viven en la query string, igual que en Cobros, para
 * que se puedan linkear desde el dashboard.
 *
 * Emitir, marcar pagada y enviar siguen siendo acciones de la ficha del
 * contrato: acá solo se mira y se abre el PDF, porque emitir necesita el
 * desglose del período y eso es propio de un contrato.
 */
export default function LiquidacionesLista() {
  const [params, setParams] = useSearchParams()
  const estado  = params.get('estado') ?? 'todos'
  const periodo = params.get('periodo') ?? ''

  const [liquidaciones, setLiquidaciones] = useState<LiquidacionEnLista[]>([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const setFiltro = (clave: string, valor: string) => {
    const nuevos = new URLSearchParams(params)
    if (valor) nuevos.set(clave, valor)
    else nuevos.delete(clave)
    setParams(nuevos, { replace: true })
  }

  useEffect(() => {
    // Un `type="month"` a medio tipear manda 'YYYY-' y el backend responde 422.
    if (periodo && !/^\d{4}-\d{2}$/.test(periodo)) return
    setLoading(true)
    setError(null)
    alquileresApi.listarLiquidaciones({
      estado:  estado === 'todos' ? undefined : (estado as FiltroEstadoLiquidacion),
      periodo: periodo || undefined,
      limit:   200,
    })
      .then(r => { setLiquidaciones(r.items); setTotal(r.total) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [estado, periodo])

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <span className="section-label">Alquileres</span>
          <h1>Liquidaciones</h1>
        </div>
        <div className="admin-page-acciones">
          <Link to="/admin/alquileres/cobros" className="btn btn-outline">Ver cobros</Link>
          <Link to="/admin/alquileres" className="btn btn-outline">Ver contratos</Link>
        </div>
      </div>

      <div className="admin-card filtros-bar">
        <label className="filtros-label">
          Estado
          <select value={estado} onChange={e => setFiltro('estado', e.target.value)}>
            {ESTADOS.map(e => <option key={e.valor} value={e.valor}>{e.label}</option>)}
          </select>
        </label>
        <label className="filtros-label">
          Período
          <input type="month" value={periodo} onChange={e => setFiltro('periodo', e.target.value)} />
        </label>
      </div>

      {loading && <p className="lista-estado">Cargando...</p>}
      {error   && <p className="lista-estado lista-error" role="alert">{error}</p>}

      {!loading && !error && (
        liquidaciones.length === 0
          ? <p className="lista-estado">No hay liquidaciones.</p>
          : (
            <>
              <div className="admin-card tabla-wrapper">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Período</th>
                      <th>N°</th>
                      <th>Propiedad</th>
                      <th className="num">Cobrado</th>
                      <th className="num">Honorarios</th>
                      <th className="num">Gastos</th>
                      <th className="num">A transferir</th>
                      <th>Estado</th>
                      <th>Comprobante</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liquidaciones.map(l => (
                      <tr key={l.id}>
                        <td data-label="Período">{nombreMes(l.periodo)}</td>
                        <td data-label="N°">{l.numero_formateado}</td>
                        <td data-label="Propiedad">
                          <Link to={`/admin/alquileres/${l.contrato_id}`} className="tabla-titulo">{l.propiedad.titulo}</Link>
                        </td>
                        <td data-label="Cobrado" className="num">{formatearMonto(l.total_cobrado, l.moneda)}</td>
                        <td data-label="Honorarios" className="num">−{formatearMonto(l.honorarios_monto, l.moneda)}</td>
                        <td data-label="Gastos" className="num">−{formatearMonto(l.total_gastos, l.moneda)}</td>
                        <td data-label="A transferir" className="tabla-precio num">
                          <strong>{formatearMonto(l.total_a_transferir, l.moneda)}</strong>
                        </td>
                        <td data-label="Estado">
                          {l.anulada
                            ? <Badge value="anulada" color="baja" label="Anulada" />
                            : <Badge
                                value={l.estado}
                                color={l.estado === 'pagada' ? 'ok' : 'espera'}
                                label={LABEL_ESTADO_LIQUIDACION[l.estado]}
                              />}
                          {l.anulada
                            ? l.motivo_anulacion && <div className="tabla-subtexto">{l.motivo_anulacion}</div>
                            : l.fecha_pago && <div className="tabla-subtexto">el {formatearFecha(l.fecha_pago)}</div>}
                        </td>
                        <td data-label="Comprobante">
                          {l.comprobante_pdf_url
                            ? <a href={mediaUrl(l.comprobante_pdf_url)} target="_blank" rel="noreferrer" className="btn btn-outline btn-chico">Ver PDF</a>
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="lista-total">{total} liquidaci{total === 1 ? 'ón' : 'ones'}</p>
            </>
          )
      )}
    </div>
  )
}
