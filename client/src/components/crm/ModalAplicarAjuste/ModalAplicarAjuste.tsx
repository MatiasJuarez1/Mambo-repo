import { useState } from 'react'
import type { Ajuste, AplicarAjustePayload } from '../../../types/alquileres'
import { calcularMontoNuevo, coeficienteDesdePorcentaje } from '../../../lib/alquileres'
import { formatearFecha, formatearMonto } from '../../../lib/formato'
import Modal from '../Modal/Modal'

interface Props {
  ajuste: Ajuste
  montoActual: number
  moneda: string
  /** Con índice `porcentaje_fijo`, el % del contrato viene precargado. */
  porcentajeFijo: number | null
  onConfirmar: (payload: AplicarAjustePayload) => Promise<void>
  onCerrar: () => void
}

type Modo = 'coeficiente' | 'porcentaje'

/**
 * Aplica un ajuste con un coeficiente o un porcentaje cargado a mano; el monto
 * nuevo se calcula en vivo para confirmarlo viendo el resultado. Manda al
 * backend exactamente uno de los dos campos.
 */
export default function ModalAplicarAjuste({ ajuste, montoActual, moneda, porcentajeFijo, onConfirmar, onCerrar }: Props) {
  const [modo, setModo] = useState<Modo>(porcentajeFijo !== null ? 'porcentaje' : 'coeficiente')
  const [coeficiente, setCoeficiente] = useState('')
  const [porcentaje, setPorcentaje] = useState(porcentajeFijo !== null ? String(porcentajeFijo) : '')
  const [notas, setNotas] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valor = modo === 'coeficiente' ? Number(coeficiente) : Number(porcentaje)
  const coefEfectivo = modo === 'coeficiente' ? valor : coeficienteDesdePorcentaje(valor)
  const valido = (modo === 'coeficiente' ? coeficiente : porcentaje) !== '' && !Number.isNaN(valor) && coefEfectivo > 0
  const montoNuevo = valido ? calcularMontoNuevo(montoActual, coefEfectivo) : null

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valido) { setError('Indicá un valor mayor que cero'); return }
    setEnviando(true)
    setError(null)
    try {
      const base = notas.trim() ? { notas: notas.trim() } : {}
      await onConfirmar(modo === 'coeficiente' ? { coeficiente: valor, ...base } : { porcentaje: valor, ...base })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo aplicar el ajuste')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal titulo={`Aplicar ajuste del ${formatearFecha(ajuste.fecha_prevista)}`} onCerrar={onCerrar}>
      <form onSubmit={confirmar} className="form">
        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="modal-toggle" role="radiogroup" aria-label="Modo">
          <label>
            <input type="radio" name="modo" checked={modo === 'coeficiente'} onChange={() => setModo('coeficiente')} />
            {' '}Por coeficiente
          </label>
          <label>
            <input type="radio" name="modo" checked={modo === 'porcentaje'} onChange={() => setModo('porcentaje')} />
            {' '}Por porcentaje
          </label>
        </div>

        {modo === 'coeficiente'
          ? (
            <div className="form-field">
              <label htmlFor="coeficiente">Coeficiente</label>
              <input
                id="coeficiente" type="number" step="0.000001" min={0} autoFocus
                value={coeficiente} onChange={e => setCoeficiente(e.target.value)}
                placeholder="Ej.: 1.125"
              />
            </div>
          )
          : (
            <div className="form-field">
              <label htmlFor="porcentaje">Porcentaje (%)</label>
              <input
                id="porcentaje" type="number" step="0.01" autoFocus
                value={porcentaje} onChange={e => setPorcentaje(e.target.value)}
                placeholder="Ej.: 12.5"
              />
            </div>
          )}

        <p className="modal-resultado" aria-live="polite">
          {formatearMonto(montoActual, moneda)} → <strong>{montoNuevo === null ? '…' : formatearMonto(montoNuevo, moneda)}</strong>
        </p>

        <div className="form-field">
          <label htmlFor="notas-ajuste">Notas</label>
          <input id="notas-ajuste" value={notas} onChange={e => setNotas(e.target.value)} placeholder="Opcional" />
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn btn-magenta" disabled={enviando || !valido}>
            {enviando ? 'Aplicando...' : 'Aplicar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
