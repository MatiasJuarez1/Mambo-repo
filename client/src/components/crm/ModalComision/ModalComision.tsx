import { useState } from 'react'
import type { Operacion } from '../../../types/operacion'
import type { Comision, ComisionIn } from '../../../types/comision'
import type { UsuarioBrief } from '../../../types/inmobiliaria'
import { hoyIso } from '../../../lib/alquileres'
import { formatearMonto } from '../../../lib/formato'
import Modal from '../Modal/Modal'
import './ModalComision.css'

interface FilaReparto { user_id: string; pct: string }

interface Props {
  operacion: Operacion
  usuarios: UsuarioBrief[]
  /** Sin `inicial` es un alta: arranca con el monto del deal y el asignado al 100 %. */
  inicial?: Comision
  onGuardar: (body: ComisionIn) => Promise<void>
  onCerrar: () => void
}

const redondear = (n: number) => Math.round(n * 100) / 100

/**
 * Alta/edición completa de la comisión. Escribir el % recalcula el monto; escribir
 * el monto deja el % como referencia. El reparto es en % de la comisión y no puede
 * pasar de 100 (lo que sobra queda para la inmobiliaria).
 */
export default function ModalComision({ operacion, usuarios, inicial, onGuardar, onCerrar }: Props) {
  const [montoOperacion, setMontoOperacion] = useState(
    String(Number(inicial?.monto_operacion ?? operacion.amount ?? 0)),
  )
  const [pct, setPct] = useState(inicial?.pct != null ? String(Number(inicial.pct)) : '')
  const [monto, setMonto] = useState(String(Number(inicial?.monto ?? 0)))
  const [cobrada, setCobrada] = useState(inicial?.cobrada ?? false)
  const [fechaCobro, setFechaCobro] = useState(inicial?.fecha_cobro ?? hoyIso())
  const [notas, setNotas] = useState(inicial?.notas ?? '')
  const [reparto, setReparto] = useState<FilaReparto[]>(
    inicial
      ? inicial.reparto.map(r => ({ user_id: String(r.user_id), pct: String(Number(r.pct)) }))
      : operacion.assigned_to_user_id
        ? [{ user_id: String(operacion.assigned_to_user_id), pct: '100' }]
        : [],
  )
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recalcular = (nuevoMontoOp: string, nuevoPct: string) => {
    if (nuevoPct === '') return
    setMonto(String(redondear(Number(nuevoMontoOp) * Number(nuevoPct) / 100)))
  }

  const sumaReparto = redondear(reparto.reduce((acc, r) => acc + (Number(r.pct) || 0), 0))
  const repetidos = new Set(reparto.map(r => r.user_id)).size !== reparto.length
  const incompleto = reparto.some(r => r.user_id === '' || r.pct === '' || Number(r.pct) <= 0)
  const valido = monto !== '' && Number(monto) >= 0 && sumaReparto <= 100 && !repetidos && !incompleto
  const restoPct = redondear(100 - sumaReparto)

  const actualizarFila = (i: number, cambio: Partial<FilaReparto>) =>
    setReparto(filas => filas.map((f, j) => (j === i ? { ...f, ...cambio } : f)))

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valido) return
    setEnviando(true)
    setError(null)
    try {
      await onGuardar({
        monto_operacion: Number(montoOperacion),
        pct: pct === '' ? null : Number(pct),
        monto: Number(monto),
        cobrada,
        fecha_cobro: cobrada ? fechaCobro : null,
        notas: notas.trim() || null,
        reparto: reparto.map(r => ({ user_id: Number(r.user_id), pct: Number(r.pct) })),
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la comisión')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal titulo={inicial ? 'Editar comisión' : 'Cargar comisión'} onCerrar={onCerrar}>
      <form onSubmit={confirmar} className="form">
        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="com-monto-op">Monto de la operación</label>
            <input
              id="com-monto-op" type="number" min={0} step="0.01" required value={montoOperacion}
              onChange={e => { setMontoOperacion(e.target.value); recalcular(e.target.value, pct) }}
            />
          </div>
          <div className="form-field">
            <label htmlFor="com-pct">Porcentaje</label>
            <input
              id="com-pct" type="number" min={0} max={100} step="0.01" value={pct}
              onChange={e => { setPct(e.target.value); recalcular(montoOperacion, e.target.value) }}
            />
          </div>
          <div className="form-field">
            <label htmlFor="com-monto">Comisión</label>
            <input
              id="com-monto" type="number" min={0} step="0.01" required value={monto}
              onChange={e => setMonto(e.target.value)}
            />
          </div>
        </div>

        <fieldset className="form-field reparto">
          <legend>Reparto entre agentes</legend>
          {reparto.map((fila, i) => (
            <div className="reparto-fila" key={i}>
              <select aria-label="Agente" value={fila.user_id} onChange={e => actualizarFila(i, { user_id: e.target.value })}>
                <option value="">Elegí un agente</option>
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <input
                aria-label="% del agente" type="number" min={0} max={100} step="0.01" value={fila.pct}
                onChange={e => actualizarFila(i, { pct: e.target.value })}
              />
              <button type="button" className="btn btn-outline" onClick={() => setReparto(filas => filas.filter((_, j) => j !== i))}>
                Quitar
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-outline" onClick={() => setReparto(filas => [...filas, { user_id: '', pct: '' }])}>
            Agregar agente
          </button>
          <p className="form-hint" aria-live="polite">
            {sumaReparto > 100
              ? `El reparto supera el 100 % (${sumaReparto} %)`
              : repetidos
                ? 'Un agente aparece dos veces'
                : `Repartido ${sumaReparto} % · Inmobiliaria ${restoPct} % · ${formatearMonto(redondear(Number(monto) * restoPct / 100), operacion.currency)}`}
          </p>
        </fieldset>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="com-cobrada">
              <input id="com-cobrada" type="checkbox" checked={cobrada} onChange={e => setCobrada(e.target.checked)} />
              {' '}Cobrada
            </label>
          </div>
          <div className="form-field">
            <label htmlFor="com-fecha">Fecha de cobro</label>
            <input
              id="com-fecha" type="date" disabled={!cobrada} max={hoyIso()} value={fechaCobro}
              onChange={e => setFechaCobro(e.target.value)}
            />
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="com-notas">Notas</label>
          <input id="com-notas" value={notas} onChange={e => setNotas(e.target.value)} placeholder="Opcional" />
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn btn-magenta" disabled={!valido || enviando}>
            {enviando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
