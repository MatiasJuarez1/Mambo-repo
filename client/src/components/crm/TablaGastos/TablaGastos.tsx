import { useRef, useState } from 'react'
import type { Gasto, GastoPayload, LiquidacionEnLista } from '../../../types/alquileres'
import Modal from '../Modal/Modal'
import FormularioGasto, { TIPOS_COMPROBANTE } from '../FormularioGasto/FormularioGasto'
import { formatearFecha, formatearMonto } from '../../../lib/formato'
import { LABEL_TIPO_GASTO } from '../../../lib/alquileres'
import { mediaUrl } from '../../../lib/propiedad'
import './TablaGastos.css'

interface Props {
  gastos: Gasto[]
  moneda: string
  /** Para rotular "Liquidado en N° …". */
  liquidaciones: LiquidacionEnLista[]
  onCrear: (payload: GastoPayload, archivo?: File) => Promise<void>
  onEditar: (gasto: Gasto, payload: GastoPayload) => Promise<void>
  onBorrar: (gasto: Gasto) => Promise<void>
  onSubirComprobante: (gasto: Gasto, archivo: File) => Promise<void>
  onQuitarComprobante: (gasto: Gasto) => Promise<void>
}

/**
 * Gastos del contrato (expensas, reparaciones…) que se descuentan al propietario
 * en la liquidación. Alta inline; los ya liquidados no se tocan.
 */
export default function TablaGastos({
  gastos, moneda, liquidaciones, onCrear, onEditar, onBorrar, onSubirComprobante, onQuitarComprobante,
}: Props) {
  const [agregando, setAgregando] = useState(false)
  const [editando, setEditando] = useState<Gasto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputComprobante = useRef<HTMLInputElement>(null)
  const [subiendoPara, setSubiendoPara] = useState<Gasto | null>(null)

  const numeroLiquidacion = (id: number) => liquidaciones.find(l => l.id === id)?.numero_formateado ?? `#${id}`

  const intentar = async (fn: () => Promise<void>, porDefecto: string) => {
    setError(null)
    try {
      await fn()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : porDefecto)
    }
  }

  const elegirComprobante = (gasto: Gasto) => {
    setSubiendoPara(gasto)
    inputComprobante.current?.click()
  }

  const subir = async (archivo: File | undefined) => {
    const gasto = subiendoPara
    if (inputComprobante.current) inputComprobante.current.value = ''
    setSubiendoPara(null)
    if (!archivo || !gasto) return
    await intentar(() => onSubirComprobante(gasto, archivo), 'No se pudo subir el comprobante')
  }

  const total = gastos.reduce((acc, g) => acc + Number(g.monto), 0)

  return (
    <>
      {error && <p className="form-error" role="alert">{error}</p>}

      {/* Un solo input de archivo para toda la tabla: se abre para el gasto elegido. */}
      <input
        ref={inputComprobante} type="file" accept={TIPOS_COMPROBANTE} hidden
        aria-label="Subir comprobante"
        onChange={e => subir(e.target.files?.[0])}
      />

      {agregando
        ? (
          <div className="tabla-gastos-alta">
            <FormularioGasto
              conComprobante
              textoGuardar="Agregar gasto"
              onGuardar={async (payload, archivo) => { await onCrear(payload, archivo); setAgregando(false) }}
              onCancelar={() => setAgregando(false)}
            />
          </div>
        )
        : (
          <div className="tabla-gastos-barra">
            <button type="button" className="btn btn-outline btn-chico" onClick={() => setAgregando(true)}>+ Agregar gasto</button>
          </div>
        )}

      {gastos.length === 0
        ? <p className="lista-estado">Sin gastos cargados.</p>
        : (
          <div className="tabla-wrapper">
            <table className="tabla tabla-gastos">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Concepto</th>
                  <th>Monto</th>
                  <th>Comprobante</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {gastos.map(g => (
                  <tr key={g.id}>
                    <td data-label="Fecha">{formatearFecha(g.fecha)}</td>
                    <td data-label="Tipo">{LABEL_TIPO_GASTO[g.tipo]}</td>
                    <td data-label="Concepto">{g.concepto}</td>
                    <td data-label="Monto">{formatearMonto(g.monto, moneda)}</td>
                    <td data-label="Comprobante">
                      {g.comprobante_url
                        ? <a href={mediaUrl(g.comprobante_url)} target="_blank" rel="noreferrer">Ver comprobante</a>
                        : <span className="tabla-gastos-sin">—</span>}
                    </td>
                    <td data-label="Acciones">
                      {g.liquidacion_id !== null
                        ? <span className="tabla-gastos-liquidado">Liquidado en N° {numeroLiquidacion(g.liquidacion_id)}</span>
                        : (
                          <div className="tabla-acciones">
                            <button type="button" className="btn btn-outline btn-chico" onClick={() => setEditando(g)}>Editar</button>
                            <button type="button" className="btn btn-outline btn-chico" onClick={() => elegirComprobante(g)}>
                              {g.comprobante_url ? 'Reemplazar comprobante' : 'Subir comprobante'}
                            </button>
                            {g.comprobante_url && (
                              <button type="button" className="btn btn-outline btn-chico" onClick={() => intentar(() => onQuitarComprobante(g), 'No se pudo quitar el comprobante')}>
                                Quitar comprobante
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn-outline btn-chico"
                              onClick={() => { if (window.confirm(`¿Borrar el gasto "${g.concepto}"?`)) void intentar(() => onBorrar(g), 'No se pudo borrar el gasto') }}
                            >
                              Borrar
                            </button>
                          </div>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Total</td>
                  <td data-label="Total">{formatearMonto(total, moneda)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

      {editando && (
        <Modal titulo="Editar gasto" onCerrar={() => setEditando(null)}>
          <FormularioGasto
            inicial={{ fecha: editando.fecha, tipo: editando.tipo, concepto: editando.concepto, monto: Number(editando.monto) }}
            onGuardar={async payload => { await onEditar(editando, payload); setEditando(null) }}
            onCancelar={() => setEditando(null)}
          />
        </Modal>
      )}
    </>
  )
}
