import { useState } from 'react'
import type { GastoPayload, TipoGasto } from '../../../types/alquileres'
import { LABEL_TIPO_GASTO, TIPOS_GASTO, hoyIso } from '../../../lib/alquileres'

export const TIPOS_COMPROBANTE = 'application/pdf,image/jpeg,image/png,image/webp'
const MAX_COMPROBANTE_BYTES = 10 * 1024 * 1024

interface Props {
  /** Valores de un gasto existente; sin ellos es un alta. */
  inicial?: GastoPayload
  /** Solo el alta acepta comprobante en el mismo formulario; en edición se sube aparte. */
  conComprobante?: boolean
  textoGuardar?: string
  onGuardar: (payload: GastoPayload, archivo?: File) => Promise<void>
  onCancelar: () => void
}

/** Fecha, tipo, concepto y monto de un gasto que se descuenta al propietario. */
export default function FormularioGasto({ inicial, conComprobante = false, textoGuardar = 'Guardar', onGuardar, onCancelar }: Props) {
  const [fecha, setFecha] = useState(inicial?.fecha ?? hoyIso())
  const [tipo, setTipo] = useState<TipoGasto>(inicial?.tipo ?? 'expensas')
  const [concepto, setConcepto] = useState(inicial?.concepto ?? '')
  const [monto, setMonto] = useState(inicial ? String(inicial.monto) : '')
  const [archivo, setArchivo] = useState<File | undefined>()
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valido = fecha !== '' && concepto.trim() !== '' && monto !== '' && Number(monto) > 0

  const elegirArchivo = (f: File | undefined) => {
    if (f && f.size > MAX_COMPROBANTE_BYTES) {
      setError('El comprobante no puede superar los 10 MB')
      setArchivo(undefined)
      return
    }
    setError(null)
    setArchivo(f)
  }

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valido) return
    setEnviando(true)
    setError(null)
    try {
      await onGuardar({ fecha, tipo, concepto: concepto.trim(), monto: Number(monto) }, archivo)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el gasto')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={guardar} className="form formulario-gasto" aria-label={inicial ? 'Editar gasto' : 'Nuevo gasto'}>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-row">
        <div className="form-field">
          <label htmlFor="gasto-fecha">Fecha</label>
          <input id="gasto-fecha" type="date" required value={fecha} onChange={e => setFecha(e.target.value)} />
        </div>
        <div className="form-field">
          <label htmlFor="gasto-tipo">Tipo</label>
          <select id="gasto-tipo" value={tipo} onChange={e => setTipo(e.target.value as TipoGasto)}>
            {TIPOS_GASTO.map(t => <option key={t} value={t}>{LABEL_TIPO_GASTO[t]}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="gasto-monto">Monto</label>
          <input id="gasto-monto" type="number" min={0} step="0.01" required value={monto} onChange={e => setMonto(e.target.value)} />
        </div>
      </div>
      <div className="form-field full">
        <label htmlFor="gasto-concepto">Concepto</label>
        <input id="gasto-concepto" required maxLength={150} value={concepto} onChange={e => setConcepto(e.target.value)} placeholder="Ej.: Expensas de agosto" />
      </div>
      {conComprobante && (
        <div className="form-field full">
          <label htmlFor="gasto-comprobante">Comprobante (opcional)</label>
          <input id="gasto-comprobante" type="file" accept={TIPOS_COMPROBANTE} onChange={e => elegirArchivo(e.target.files?.[0])} />
        </div>
      )}
      <div className="form-actions">
        <button type="button" className="btn btn-outline" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="btn btn-magenta" disabled={enviando || !valido}>
          {enviando ? 'Guardando...' : textoGuardar}
        </button>
      </div>
    </form>
  )
}
