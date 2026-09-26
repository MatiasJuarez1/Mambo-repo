import type { Ajuste } from '../../../types/alquileres'
import Badge from '../../Badge'
import { formatearFecha, formatearMonto } from '../../../lib/formato'
import { LABEL_ESTADO_AJUSTE } from '../../../lib/alquileres'
import './TablaAjustes.css'

interface Props {
  ajustes: Ajuste[]
  moneda: string
  /** Solo un contrato vigente admite aplicar u omitir. */
  contratoVigente: boolean
  onAplicar: (ajuste: Ajuste) => void
  onOmitir: (ajuste: Ajuste) => void
}

/** El pendiente más antiguo: el único que el backend deja aplicar. */
export function primerPendiente(ajustes: Ajuste[]): Ajuste | null {
  const pendientes = ajustes.filter(a => a.estado === 'pendiente')
  if (pendientes.length === 0) return null
  return pendientes.reduce((min, a) => (a.fecha_prevista < min.fecha_prevista ? a : min))
}

/** Línea de tiempo de ajustes del contrato: una fila por fecha prevista. */
export default function TablaAjustes({ ajustes, moneda, contratoVigente, onAplicar, onOmitir }: Props) {
  if (ajustes.length === 0) return <p className="lista-estado">Este contrato no tiene ajustes.</p>
  const primero = primerPendiente(ajustes)

  return (
    <div className="tabla-wrapper">
      <table className="tabla tabla-ajustes">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Estado</th>
            <th>Monto</th>
            <th>Coeficiente</th>
            <th>Notas</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {ajustes.map(a => {
            const esPrimero = primero?.id === a.id
            const puedeActuar = contratoVigente && a.estado === 'pendiente'
            return (
              <tr key={a.id}>
                <td data-label="Fecha">{formatearFecha(a.fecha_prevista)}</td>
                <td data-label="Estado"><Badge value={a.estado} label={LABEL_ESTADO_AJUSTE[a.estado]} /></td>
                <td data-label="Monto">
                  {a.estado === 'aplicado'
                    ? `${formatearMonto(a.monto_anterior, moneda)} → ${formatearMonto(a.monto_nuevo, moneda)}`
                    : '—'}
                </td>
                <td data-label="Coeficiente">{a.coeficiente ? Number(a.coeficiente).toLocaleString('es-AR', { maximumFractionDigits: 6 }) : '—'}</td>
                <td data-label="Notas">{a.notas ?? '—'}</td>
                <td data-label="Acciones">
                  {puedeActuar && (
                    <div className="tabla-acciones">
                      <button
                        type="button"
                        className="btn btn-magenta btn-chico"
                        disabled={!esPrimero}
                        title={esPrimero ? undefined : 'Resolvé primero el ajuste anterior'}
                        onClick={() => onAplicar(a)}
                      >
                        Aplicar
                      </button>
                      <button type="button" className="btn btn-outline btn-chico" onClick={() => onOmitir(a)}>
                        Omitir
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
