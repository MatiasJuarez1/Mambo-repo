import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { reservasApi } from '../../../api/reservas'
import { propiedadesApi } from '../../../api/propiedades'
import type { EstadoReserva, Reserva } from '../../../types/reserva'
import Badge from '../../../components/Badge'
import { diasHasta, formatearFecha, formatearMonto } from '../../../lib/formato'
import { LABEL_ESTADO_RESERVA, etapaInicialSegunOperacion, rolInicialSegunOperacion } from '../../../lib/crm'
import './Lista.css'

const ESTADOS: EstadoReserva[] = ['activa', 'vencida', 'cancelada', 'convertida']

// Una reserva activa que vence dentro de estos días se resalta en la tabla.
const DIAS_ALERTA = 3

export default function ReservasLista() {
  const navigate = useNavigate()
  const [estado, setEstado]     = useState<EstadoReserva | ''>('activa')
  const [reservas, setReservas] = useState<Reserva[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  const cargar = () => {
    setLoading(true)
    setError(null)
    reservasApi.listar({ status: estado || undefined, limit: 200 })
      .then(r => setReservas(r.items))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(cargar, [estado]) // eslint-disable-line

  // Cancelar y vencer no cambian de pantalla: se recarga la lista y, si el
  // backend rechaza la transición, se muestra su mensaje tal cual.
  const accion = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      cargar()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la acción')
    }
  }

  // Convertir marca la reserva y abre el alta de operación ya cargada: la
  // propiedad decide pipeline, etapa y rol (comprador o inquilino).
  const convertir = async (r: Reserva) => {
    setError(null)
    try {
      await reservasApi.convertir(r.id)
      const prop = await propiedadesApi.obtener(r.property_id)
      const { pipeline, etapa } = etapaInicialSegunOperacion(prop.tipo_operacion)
      const params = new URLSearchParams({
        propiedad: String(r.property_id),
        persona:   String(r.person.id),
        rol:       rolInicialSegunOperacion(prop.tipo_operacion),
        pipeline,
        etapa,
        reserva:   String(r.id),
      })
      navigate(`/admin/operaciones/nueva?${params}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo convertir')
    }
  }

  const claseVencimiento = (r: Reserva) => {
    const dias = diasHasta(r.expires_at)
    if (r.status !== 'activa' || dias === null) return ''
    return dias < 0 ? 'reserva-vencida' : dias <= DIAS_ALERTA ? 'reserva-por-vencer' : ''
  }

  return (
    <div>
      <div className="admin-page-header">
        <h1>Reservas</h1>
        <Link to="/admin/reservas/nueva" className="btn btn-magenta">+ Nueva reserva</Link>
      </div>

      <div className="admin-card filtros-bar">
        <label className="filtros-label">
          Estado
          <select value={estado} onChange={e => setEstado(e.target.value as EstadoReserva | '')}>
            <option value="">Todas</option>
            {ESTADOS.map(e => <option key={e} value={e}>{LABEL_ESTADO_RESERVA[e]}</option>)}
          </select>
        </label>
      </div>

      {loading && <p className="lista-estado">Cargando...</p>}
      {error   && <p className="lista-estado lista-error" role="alert">{error}</p>}

      {!loading && (
        reservas.length === 0
          ? <p className="lista-estado">No hay reservas.</p>
          : (
            <div className="admin-card tabla-wrapper">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Propiedad</th>
                    <th>Persona</th>
                    <th>Seña</th>
                    <th>Vence</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {reservas.map(r => (
                    <tr key={r.id} className={claseVencimiento(r)}>
                      <td data-label="Propiedad">
                        <Link to={`/admin/propiedades/${r.property_id}/editar`}>{r.propiedad.titulo}</Link>
                      </td>
                      <td data-label="Persona">
                        <Link to={`/admin/personas/${r.person.id}`}>{r.person.full_name}</Link>
                      </td>
                      <td data-label="Seña">{formatearMonto(r.amount, r.currency)}</td>
                      <td data-label="Vence">{formatearFecha(r.expires_at)}</td>
                      <td data-label="Estado">
                        <Badge value={r.status} label={LABEL_ESTADO_RESERVA[r.status]} />
                      </td>
                      <td data-label="Acciones">
                        {r.status === 'activa' && (
                          <div className="tabla-acciones">
                            <button className="btn btn-magenta" onClick={() => convertir(r)}>Convertir</button>
                            <button className="btn btn-outline" onClick={() => accion(() => reservasApi.vencer(r.id))}>
                              Marcar vencida
                            </button>
                            <button className="btn btn-danger" onClick={() => accion(() => reservasApi.cancelar(r.id))}>
                              Cancelar
                            </button>
                          </div>
                        )}
                        {r.status === 'vencida' && (
                          <button className="btn btn-danger" onClick={() => accion(() => reservasApi.cancelar(r.id))}>
                            Cancelar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
      )}
    </div>
  )
}
