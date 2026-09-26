import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { alquileresApi, type FiltroEstadoCobro } from '../../../api/alquileres'
import type { CobroEnLista } from '../../../types/alquileres'
import Badge from '../../../components/Badge'
import { formatearFecha, formatearMonto } from '../../../lib/formato'
import { etiquetaEstadoCobro, nombreMes } from '../../../lib/alquileres'

const ESTADOS: { valor: FiltroEstadoCobro | 'todos'; label: string }[] = [
  { valor: 'vencido',   label: 'Vencidos' },
  { valor: 'pendiente', label: 'Pendientes' },
  { valor: 'parcial',   label: 'Parciales' },
  { valor: 'pagado',    label: 'Pagados' },
  { valor: 'anulado',   label: 'Anulados' },
  { valor: 'todos',     label: 'Todos' },
]

/**
 * Cobros de todos los contratos administrados. Los filtros viven en la query
 * string para que los tiles del dashboard linkeen a "vencidos" o "pagados".
 * Sin `estado` en la URL se listan los vencidos, que es lo que se viene a mirar.
 */
export default function CobrosLista() {
  const [params, setParams] = useSearchParams()
  const estado = params.get('estado') ?? 'vencido'
  const vence  = params.get('vence_en_dias') ?? ''
  const q      = params.get('q') ?? ''

  const [cobros, setCobros]   = useState<CobroEnLista[]>([])
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
    setLoading(true)
    setError(null)
    alquileresApi.listarCobros({
      estado:        estado === 'todos' ? undefined : (estado as FiltroEstadoCobro),
      vence_en_dias: vence ? Number(vence) : undefined,
      q:             q || undefined,
      limit:         200,
    })
      .then(r => { setCobros(r.items); setTotal(r.total) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [estado, vence, q])

  const inquilinos = (c: CobroEnLista) =>
    c.inquilinos.map((p, i) => (
      <span key={p.person_id}>
        {i > 0 && ', '}
        <Link to={`/admin/personas/${p.person_id}`}>{p.full_name}</Link>
      </span>
    ))

  // La celda recorta con elipsis, así que la lista completa va al `title`. Es
  // texto plano y no el JSX de arriba: un atributo no admite elementos.
  const nombresInquilinos = (c: CobroEnLista) => c.inquilinos.map(p => p.full_name).join(', ')

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <span className="section-label">Alquileres</span>
          <h1>Cobros</h1>
        </div>
        <div className="admin-page-acciones">
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
          Vencen en ≤ días
          <input type="number" min={0} value={vence} onChange={e => setFiltro('vence_en_dias', e.target.value)} />
        </label>
        <input
          className="filtros-buscar"
          type="search"
          placeholder="Buscar por propiedad o inquilino…"
          aria-label="Buscar"
          value={q}
          onChange={e => setFiltro('q', e.target.value)}
        />
      </div>

      {loading && <p className="lista-estado">Cargando...</p>}
      {error   && <p className="lista-estado lista-error" role="alert">{error}</p>}

      {!loading && !error && (
        cobros.length === 0
          ? <p className="lista-estado">No hay cobros.</p>
          : (
            <>
              <div className="admin-card tabla-wrapper">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Propiedad</th>
                      <th>Inquilino</th>
                      <th>Período</th>
                      <th>Vence</th>
                      <th className="num">Saldo</th>
                      <th className="num">Atraso</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cobros.map(c => {
                      const chip = etiquetaEstadoCobro(c)
                      return (
                        <tr key={c.id}>
                          <td data-label="Propiedad">
                            <Link to={`/admin/alquileres/${c.contrato_id}`} className="tabla-titulo">{c.propiedad.titulo}</Link>
                          </td>
                          <td data-label="Inquilino">
                            <span className="tabla-texto" title={nombresInquilinos(c)}>{inquilinos(c)}</span>
                          </td>
                          <td data-label="Período">{nombreMes(c.periodo)}</td>
                          <td data-label="Vence">{formatearFecha(c.fecha_vencimiento)}</td>
                          <td data-label="Saldo" className="tabla-precio num">{formatearMonto(c.saldo, c.moneda)}</td>
                          <td data-label="Atraso" className="num">{c.dias_atraso > 0 ? `${c.dias_atraso} día${c.dias_atraso === 1 ? '' : 's'}` : '—'}</td>
                          <td data-label="Estado"><Badge value={c.estado} color={chip.color} label={chip.texto} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="lista-total">{total} cobro{total === 1 ? '' : 's'}</p>
            </>
          )
      )}
    </div>
  )
}
