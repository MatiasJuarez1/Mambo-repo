import { useState } from 'react'
import type { LiquidacionEnLista } from '../../../types/alquileres'
import Badge from '../../Badge'
import Modal from '../Modal/Modal'
import { formatearFecha, formatearMonto } from '../../../lib/formato'
import { LABEL_ESTADO_LIQUIDACION, hoyIso, nombreMes } from '../../../lib/alquileres'
import { mediaUrl } from '../../../lib/propiedad'
import './BloqueLiquidaciones.css'

interface Props {
  liquidaciones: LiquidacionEnLista[]
  moneda: string
  /** Solo un contrato vigente admite emitir liquidaciones nuevas. */
  contratoVigente: boolean
  emailConfigurado: boolean
  onLiquidar: () => void
  onPagar: (liq: LiquidacionEnLista, fechaPago: string) => Promise<void>
  onEnviar: (liq: LiquidacionEnLista) => Promise<void>
  /** Deshace una liquidación emitida por error: devuelve sus pagos y gastos a pendientes. */
  onAnular: (liq: LiquidacionEnLista, motivo: string) => Promise<void>
}

/** Liquidaciones emitidas al propietario, una por mes, con su PDF y su estado. */
export default function BloqueLiquidaciones({
  liquidaciones, moneda, contratoVigente, emailConfigurado, onLiquidar, onPagar, onEnviar, onAnular,
}: Props) {
  const [pagando, setPagando] = useState<LiquidacionEnLista | null>(null)
  const [fechaPago, setFechaPago] = useState(hoyIso())
  const [enviando, setEnviando] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorPago, setErrorPago] = useState<string | null>(null)
  const [anulando, setAnulando] = useState<LiquidacionEnLista | null>(null)
  const [motivo, setMotivo] = useState('')
  const [errorAnular, setErrorAnular] = useState<string | null>(null)

  const enviar = async (liq: LiquidacionEnLista) => {
    setError(null)
    setEnviando(liq.id)
    try {
      await onEnviar(liq)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar la liquidación')
    } finally {
      setEnviando(null)
    }
  }

  const anular = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!anulando) return
    setErrorAnular(null)
    try {
      await onAnular(anulando, motivo.trim())
      setAnulando(null)
    } catch (err: unknown) {
      setErrorAnular(err instanceof Error ? err.message : 'No se pudo anular la liquidación')
    }
  }

  const pagar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pagando) return
    setErrorPago(null)
    try {
      await onPagar(pagando, fechaPago)
      setPagando(null)
    } catch (err: unknown) {
      setErrorPago(err instanceof Error ? err.message : 'No se pudo marcar como pagada')
    }
  }

  return (
    <>
      <div className="liquidaciones-barra">
        {contratoVigente && (
          <button type="button" className="btn btn-magenta btn-chico" onClick={onLiquidar}>Liquidar período</button>
        )}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}

      {liquidaciones.length === 0
        ? <p className="lista-estado">Todavía no se emitieron liquidaciones.</p>
        : (
          <div className="tabla-wrapper">
            <table className="tabla tabla-liquidaciones">
              <thead>
                <tr>
                  <th>Período</th>
                  <th>N°</th>
                  <th>Cobrado</th>
                  <th>Honorarios</th>
                  <th>Gastos</th>
                  <th>A transferir</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {liquidaciones.map(l => (
                  <tr key={l.id}>
                    <td data-label="Período">{nombreMes(l.periodo)}</td>
                    <td data-label="N°">{l.numero_formateado}</td>
                    <td data-label="Cobrado">{formatearMonto(l.total_cobrado, moneda)}</td>
                    <td data-label="Honorarios">−{formatearMonto(l.honorarios_monto, moneda)}</td>
                    <td data-label="Gastos">−{formatearMonto(l.total_gastos, moneda)}</td>
                    <td data-label="A transferir"><strong>{formatearMonto(l.total_a_transferir, moneda)}</strong></td>
                    <td data-label="Estado">
                      {l.anulada
                        ? <Badge value="anulada" color="baja" label="Anulada" />
                        : <Badge value={l.estado} color={l.estado === 'pagada' ? 'ok' : 'espera'} label={LABEL_ESTADO_LIQUIDACION[l.estado]} />}
                      {l.anulada
                        ? l.motivo_anulacion && <div className="liquidaciones-fecha">{l.motivo_anulacion}</div>
                        : l.fecha_pago && <div className="liquidaciones-fecha">el {formatearFecha(l.fecha_pago)}</div>}
                    </td>
                    <td data-label="Acciones">
                      <div className="tabla-acciones">
                        {l.comprobante_pdf_url && (
                          <a href={mediaUrl(l.comprobante_pdf_url)} target="_blank" rel="noreferrer" className="btn btn-outline btn-chico">Ver PDF</a>
                        )}
                        {/* Una anulada conserva su PDF como historial, pero ya no se opera. */}
                        {!l.anulada && (
                          <>
                            <button
                              type="button"
                              className="btn btn-outline btn-chico"
                              disabled={!emailConfigurado || enviando === l.id}
                              title={emailConfigurado ? undefined : 'El servidor no tiene configurado el envío de emails'}
                              onClick={() => enviar(l)}
                            >
                              {enviando === l.id ? 'Enviando...' : l.enviado_email_at ? 'Reenviar' : 'Enviar por email'}
                            </button>
                            {l.enviado_email_at && <span className="liquidaciones-enviado">Enviado el {formatearFecha(l.enviado_email_at)}</span>}
                            {l.estado === 'emitida' && (
                              <>
                                <button type="button" className="btn btn-outline btn-chico" onClick={() => { setFechaPago(hoyIso()); setErrorPago(null); setPagando(l) }}>
                                  Marcar pagada
                                </button>
                                <button type="button" className="btn btn-outline btn-chico" onClick={() => { setMotivo(''); setErrorAnular(null); setAnulando(l) }}>
                                  Anular
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {anulando && (
        <Modal titulo={`Anular la liquidación N° ${anulando.numero_formateado}`} onCerrar={() => setAnulando(null)}>
          <form onSubmit={anular} className="form">
            {errorAnular && <p className="form-error" role="alert">{errorAnular}</p>}
            <p className="modal-resultado">
              Los pagos y gastos de esta liquidación vuelven a quedar pendientes y el período
              se puede volver a liquidar. El número {anulando.numero_formateado} no se reutiliza.
            </p>
            <div className="form-field">
              <label htmlFor="liq-motivo-anulacion">Motivo</label>
              <input
                id="liq-motivo-anulacion"
                required
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                placeholder="Por qué se anula"
              />
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-outline" onClick={() => setAnulando(null)}>Cancelar</button>
              <button type="submit" className="btn btn-magenta">Anular</button>
            </div>
          </form>
        </Modal>
      )}

      {pagando && (
        <Modal titulo={`Liquidación N° ${pagando.numero_formateado} pagada`} onCerrar={() => setPagando(null)}>
          <form onSubmit={pagar} className="form">
            {errorPago && <p className="form-error" role="alert">{errorPago}</p>}
            <p className="modal-resultado">
              Transferido al propietario: <strong>{formatearMonto(pagando.total_a_transferir, moneda)}</strong>
            </p>
            <div className="form-field">
              <label htmlFor="liq-fecha-pago">Fecha de pago</label>
              <input id="liq-fecha-pago" type="date" required max={hoyIso()} value={fechaPago} onChange={e => setFechaPago(e.target.value)} />
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-outline" onClick={() => setPagando(null)}>Cancelar</button>
              <button type="submit" className="btn btn-magenta">Confirmar</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
