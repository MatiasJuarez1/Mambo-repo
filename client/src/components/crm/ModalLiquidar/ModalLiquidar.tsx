import { useEffect, useState } from 'react'
import type { LiquidacionPreview, LiquidarPayload } from '../../../types/alquileres'
import { LABEL_TIPO_GASTO, mesAnterior, nombreMes } from '../../../lib/alquileres'
import { formatearFecha, formatearMonto } from '../../../lib/formato'
import Modal from '../Modal/Modal'
import './ModalLiquidar.css'

interface Props {
  moneda: string
  /** Pide el desglose de un mes (`YYYY-MM`); un 409 del backend se muestra como "nada que liquidar". */
  pedirPreview: (periodo: string) => Promise<LiquidacionPreview>
  /** URL del mismo desglose en PDF, para revisarlo o mandárselo al propietario antes de emitir. */
  urlBorrador: (periodo: string) => string
  onConfirmar: (payload: LiquidarPayload) => Promise<void>
  onCerrar: () => void
}

/**
 * Liquidar un mes al propietario: se elige el período (default, el mes
 * anterior), se muestra exactamente lo que va a salir en el PDF y se confirma.
 */
export default function ModalLiquidar({ moneda, pedirPreview, urlBorrador, onConfirmar, onCerrar }: Props) {
  const [periodo, setPeriodo] = useState(mesAnterior())
  const [preview, setPreview] = useState<LiquidacionPreview | null>(null)
  const [cargando, setCargando] = useState(true)
  const [errorPreview, setErrorPreview] = useState<string | null>(null)
  const [notas, setNotas] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!/^\d{4}-\d{2}$/.test(periodo)) return
    let vigente = true
    setCargando(true)
    setErrorPreview(null)
    setPreview(null)
    pedirPreview(periodo)
      .then(p => { if (vigente) setPreview(p) })
      .catch((e: unknown) => { if (vigente) setErrorPreview(e instanceof Error ? e.message : 'No se pudo calcular') })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [periodo, pedirPreview])

  const vacio = preview !== null && preview.pagos.length === 0 && preview.gastos.length === 0

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!preview || vacio) return
    setEnviando(true)
    setError(null)
    try {
      await onConfirmar({ periodo, notas: notas.trim() || undefined })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo emitir la liquidación')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal titulo="Liquidar período" onCerrar={onCerrar}>
      <form onSubmit={confirmar} className="form">
        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="form-field">
          <label htmlFor="liquidar-periodo">Mes</label>
          <input id="liquidar-periodo" type="month" required value={periodo} onChange={e => setPeriodo(e.target.value)} />
        </div>

        {cargando && <p className="lista-estado">Calculando...</p>}
        {errorPreview && <p className="form-hint">{errorPreview}</p>}
        {vacio && <p className="lista-estado">No hay nada que liquidar en {nombreMes(periodo)}.</p>}

        {preview && !vacio && (
          <table className="tabla liquidacion-desglose" aria-label={`Desglose de ${nombreMes(periodo)}`}>
            <tbody>
              {preview.pagos.map(p => (
                <tr key={`p${p.id}`}>
                  <td>
                    Recibo N° {p.recibo_numero_formateado} · {formatearFecha(p.fecha_pago)}
                    {Number(p.punitorio) > 0 && <span className="liquidacion-detalle"> (incluye {formatearMonto(p.punitorio, moneda)} de punitorio)</span>}
                  </td>
                  <td className="liquidacion-monto">{formatearMonto(p.total, moneda)}</td>
                </tr>
              ))}
              <tr className="liquidacion-negativo">
                <td>Honorarios ({Number(preview.honorarios_pct)} %)</td>
                <td className="liquidacion-monto">−{formatearMonto(preview.honorarios_monto, moneda)}</td>
              </tr>
              {preview.gastos.map(g => (
                <tr key={`g${g.id}`} className="liquidacion-negativo">
                  <td>{LABEL_TIPO_GASTO[g.tipo]} · {g.concepto} · {formatearFecha(g.fecha)}</td>
                  <td className="liquidacion-monto">−{formatearMonto(g.monto, moneda)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total a transferir</td>
                <td className="liquidacion-monto"><strong>{formatearMonto(preview.total_a_transferir, moneda)}</strong></td>
              </tr>
            </tfoot>
          </table>
        )}

        {preview && !vacio && (
          <p className="form-hint">
            <a href={urlBorrador(periodo)} target="_blank" rel="noreferrer">Ver borrador en PDF</a>
            {' '}— sin número y sin emitir; no queda registrado.
          </p>
        )}

        <div className="form-field">
          <label htmlFor="liquidar-notas">Notas</label>
          <input id="liquidar-notas" value={notas} onChange={e => setNotas(e.target.value)} placeholder="Opcional; salen en el PDF" />
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn btn-magenta" disabled={enviando || !preview || vacio}>
            {enviando ? 'Emitiendo...' : 'Emitir liquidación'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
