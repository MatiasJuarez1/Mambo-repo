import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { alquileresApi } from '../../../api/alquileres'
import type { ContratoEnLista, EstadoContrato } from '../../../types/alquileres'
import Badge from '../../../components/Badge'
import { formatearFecha, formatearMonto } from '../../../lib/formato'
import { LABEL_ESTADO_CONTRATO } from '../../../lib/alquileres'

const ESTADOS: EstadoContrato[] = ['vigente', 'finalizado', 'rescindido']

/**
 * Lista de contratos. Los filtros viven en la query string para que los tiles
 * del dashboard puedan linkear a "vencen en 90 días" o "ajuste en 30 días".
 * Sin `estado` en la URL se listan los vigentes; `estado=todos` los muestra todos.
 */
export default function ContratosLista() {
  const [params, setParams] = useSearchParams()
  const estado   = params.get('estado') ?? 'vigente'
  const vence    = params.get('vence_en_dias') ?? ''
  const ajuste   = params.get('ajuste_en_dias') ?? ''
  const q        = params.get('q') ?? ''
  const sinLiquidar = params.get('sin_liquidar') === '1'

  const [contratos, setContratos] = useState<ContratoEnLista[]>([])
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)

  const setFiltro = (clave: string, valor: string) => {
    const nuevos = new URLSearchParams(params)
    if (valor) nuevos.set(clave, valor)
    else nuevos.delete(clave)
    setParams(nuevos, { replace: true })
  }

  useEffect(() => {
    setLoading(true)
    setError(null)
    alquileresApi.listar({
      estado:         estado === 'todos' ? undefined : (estado as EstadoContrato),
      vence_en_dias:  vence ? Number(vence) : undefined,
      ajuste_en_dias: ajuste ? Number(ajuste) : undefined,
      sin_liquidar:   sinLiquidar || undefined,
      q:              q || undefined,
      limit:          200,
    })
      .then(r => { setContratos(r.items); setTotal(r.total) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [estado, vence, ajuste, q, sinLiquidar])

  const partesInquilinas = (c: ContratoEnLista) => c.partes.filter(p => p.rol === 'inquilino')

  const inquilinos = (c: ContratoEnLista) =>
    partesInquilinas(c).map((p, i) => (
      <span key={p.person_id}>
        {i > 0 && ', '}
        <Link to={`/admin/personas/${p.person_id}`}>{p.full_name}</Link>
      </span>
    ))

  // La celda recorta con elipsis, así que la lista completa va al `title`. Es
  // texto plano y no el JSX de arriba: un atributo no admite elementos.
  const nombresInquilinos = (c: ContratoEnLista) =>
    partesInquilinas(c).map(p => p.full_name).join(', ')

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <span className="section-label">Alquileres</span>
          <h1>Contratos</h1>
        </div>
        <div className="admin-page-acciones">
          <Link to="/admin/alquileres/nuevo" className="btn btn-magenta">+ Nuevo contrato</Link>
        </div>
      </div>

      <div className="admin-card filtros-bar">
        <label className="filtros-label">
          Estado
          <select value={estado} onChange={e => setFiltro('estado', e.target.value)}>
            {ESTADOS.map(e => <option key={e} value={e}>{LABEL_ESTADO_CONTRATO[e]}</option>)}
            <option value="todos">Todos</option>
          </select>
        </label>
        <label className="filtros-label">
          Vencen en ≤ días
          <input type="number" min={0} value={vence} onChange={e => setFiltro('vence_en_dias', e.target.value)} />
        </label>
        <label className="filtros-label">
          Ajuste en ≤ días
          <input type="number" min={0} value={ajuste} onChange={e => setFiltro('ajuste_en_dias', e.target.value)} />
        </label>
        <label className="filtros-label filtros-check">
          <input type="checkbox" checked={sinLiquidar} onChange={e => setFiltro('sin_liquidar', e.target.checked ? '1' : '')} />
          {' '}Sin liquidar
        </label>
        <input
          className="filtros-buscar"
          type="search"
          placeholder="Buscar por propiedad o persona…"
          aria-label="Buscar"
          value={q}
          onChange={e => setFiltro('q', e.target.value)}
        />
      </div>

      {loading && <p className="lista-estado">Cargando...</p>}
      {error   && <p className="lista-estado lista-error" role="alert">{error}</p>}

      {!loading && !error && (
        contratos.length === 0
          ? <p className="lista-estado">No hay contratos.</p>
          : (
            <>
              <div className="admin-card tabla-wrapper">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Propiedad</th>
                      <th>Inquilino</th>
                      <th className="num">Monto vigente</th>
                      <th>Próximo ajuste</th>
                      <th>Vence</th>
                      <th className="num">Cobros vencidos</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contratos.map(c => (
                      <tr key={c.id}>
                        <td data-label="Propiedad">
                          <Link to={`/admin/alquileres/${c.id}`} className="tabla-titulo">{c.propiedad.titulo}</Link>
                        </td>
                        <td data-label="Inquilino">
                          <span className="tabla-texto" title={nombresInquilinos(c)}>{inquilinos(c)}</span>
                        </td>
                        <td data-label="Monto vigente" className="tabla-precio num">{formatearMonto(c.monto_vigente, c.moneda)}</td>
                        <td data-label="Próximo ajuste">{formatearFecha(c.proximo_ajuste)}</td>
                        <td data-label="Vence">{formatearFecha(c.fecha_fin)}</td>
                        <td data-label="Cobros vencidos" className="num">
                          {c.vencidos > 0
                            ? <Link to={`/admin/alquileres/${c.id}`} className="lista-vencidos">{c.vencidos}</Link>
                            : (c.administrado ? '0' : '—')}
                        </td>
                        <td data-label="Estado">
                          <Badge value={c.estado} label={LABEL_ESTADO_CONTRATO[c.estado]} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="lista-total">{total} contrato{total === 1 ? '' : 's'}</p>
            </>
          )
      )}
    </div>
  )
}
