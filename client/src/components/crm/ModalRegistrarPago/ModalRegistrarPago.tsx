import { useEffect, useState } from 'react'
import type { Cobro, MedioPago, PagoPayload, PunitorioSugerido } from '../../../types/alquileres'
import { LABEL_MEDIO_PAGO, MEDIOS_PAGO, hoyIso, nombreMes } from '../../../lib/alquileres'
import { formatearMonto } from '../../../lib/formato'
import Modal from '../Modal/Modal'

interface Props {
  cobro: Cobro
  moneda: string
  /** Pide el punitorio sugerido para una fecha; se llama al abrir y cada vez que cambia la fecha. */
  sugerirPunitorio: (fechaPago: string) => Promise<PunitorioSugerido>
  onConfirmar: (payload: PagoPayload) => Promise<void>
  onCerrar: () => void
}

/**
 * Alta de un pago sobre un período. El monto arranca en el saldo y el punitorio
 * en lo que sugiere el backend para la fecha elegida (editable: a veces se
 * perdona). El total se muestra en vivo para confirmar viendo lo que se cobra.
 */
export default function ModalRegistrarPago({ cobro, moneda, sugerirPunitorio, onConfirmar, onCerrar }: Props) {
  const [fechaPago, setFechaPago] = useState(hoyIso())
  const [monto, setMonto] = useState(String(Number(cobro.saldo)))
  const [punitorio, setPunitorio] = useState('0')
  const [sugerido, setSugerido] = useState<PunitorioSugerido | null>(null)
  const [medio, setMedio] = useState<MedioPago>('transferencia')
  const [referencia, setReferencia] = useState('')
  const [notas, setNotas] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Cada cambio de fecha vuelve a pedir el sugerido y pisa el campo: si el
  // usuario ya lo había tocado, igual conviene que vea el valor de la fecha nueva.
  useEffect(() => {
    if (!fechaPago) return
    let vigente = true
    sugerirPunitorio(fechaPago)
      .then(s => {
        if (!vigente) return
        setSugerido(s)
        setPunitorio(String(Number(s.monto)))
      })
      .catch(() => { if (vigente) setSugerido(null) })
    return () => { vigente = false }
  }, [fechaPago, sugerirPunitorio])

  const montoNum = Number(monto)
  const punitorioNum = punitorio === '' ? 0 : Number(punitorio)
  const valido = monto !== '' && montoNum > 0 && montoNum <= Number(cobro.saldo) && punitorioNum >= 0
  const total = (Number.isNaN(montoNum) ? 0 : montoNum) + (Number.isNaN(punitorioNum) ? 0 : punitorioNum)

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valido) { setError('El monto tiene que ser mayor que cero y no superar el saldo'); return }
    setEnviando(true)
    setError(null)
    try {
      await onConfirmar({
        fecha_pago: fechaPago,
        monto: montoNum,
        punitorio: punitorioNum,
        medio,
        referencia: referencia.trim() || undefined,
        notas: notas.trim() || undefined,
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el pago')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal titulo={`Registrar pago · ${nombreMes(cobro.periodo)}`} onCerrar={onCerrar}>
      <form onSubmit={confirmar} className="form">
        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="pago-fecha">Fecha de pago</label>
            <input id="pago-fecha" type="date" required max={hoyIso()} value={fechaPago} onChange={e => setFechaPago(e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="pago-medio">Medio</label>
            <select id="pago-medio" value={medio} onChange={e => setMedio(e.target.value as MedioPago)}>
              {MEDIOS_PAGO.map(m => <option key={m} value={m}>{LABEL_MEDIO_PAGO[m]}</option>)}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="pago-monto">Monto (saldo {formatearMonto(cobro.saldo, moneda)})</label>
            <input
              id="pago-monto" type="number" min={0} max={Number(cobro.saldo)} step="0.01" required
              value={monto} onChange={e => setMonto(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="pago-punitorio">Punitorio</label>
            <input id="pago-punitorio" type="number" min={0} step="0.01" value={punitorio} onChange={e => setPunitorio(e.target.value)} />
            {sugerido && sugerido.dias_atraso > 0 && (
              <span className="form-hint">
                {sugerido.dias_atraso} día{sugerido.dias_atraso === 1 ? '' : 's'} de atraso × {Number(sugerido.pct)} % diario
              </span>
            )}
          </div>
        </div>

        <p className="modal-resultado" aria-live="polite">
          Total: <strong>{formatearMonto(total, moneda)}</strong>
        </p>

        <div className="form-field">
          <label htmlFor="pago-referencia">Referencia</label>
          <input id="pago-referencia" maxLength={100} value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="N° de transferencia, etc." />
        </div>
        <div className="form-field">
          <label htmlFor="pago-notas">Notas</label>
          <input id="pago-notas" value={notas} onChange={e => setNotas(e.target.value)} placeholder="Opcional" />
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn btn-magenta" disabled={enviando || !valido}>
            {enviando ? 'Registrando...' : 'Registrar pago'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
