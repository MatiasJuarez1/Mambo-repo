import { useState } from 'react'
import type { Cobro, CobroUpdatePayload, LiquidacionEnLista, Pago } from '../../../types/alquileres'
import Badge from '../../Badge'
import Modal from '../Modal/Modal'
import { formatearFecha, formatearMonto } from '../../../lib/formato'
import { LABEL_MEDIO_PAGO, etiquetaEstadoCobro, nombreMes } from '../../../lib/alquileres'
import { mediaUrl } from '../../../lib/propiedad'
import './TablaCobros.css'

interface Props {
  cobros: Cobro[]
  moneda: string
  /** Solo un contrato vigente admite registrar pagos. */
  contratoVigente: boolean
  /** `inmobiliaria.email_configurado`: sin SMTP, "Enviar por email" queda deshabilitado. */
  emailConfigurado: boolean
  /** Para rotular "Liquidado en N° …" en los pagos que ya entraron en una liquidación. */
  liquidaciones: LiquidacionEnLista[]
  onRegistrarPago: (cobro: Cobro) => void
  onEditar: (cobro: Cobro, data: CobroUpdatePayload) => Promise<void>
  onAnularCobro: (cobro: Cobro, motivo: string) => Promise<void>
  onAnularPago: (cobro: Cobro, pago: Pago, motivo: string) => Promise<void>
  onEnviarRecibo: (cobro: Cobro, pago: Pago) => Promise<void>
}

const mensajeDe = (e: unknown, porDefecto: string) => (e instanceof Error ? e.message : porDefecto)

/** Un período por fila; las que tienen pagos se expanden para ver los recibos. */
export default function TablaCobros({
  cobros, moneda, contratoVigente, emailConfigurado, liquidaciones,
  onRegistrarPago, onEditar, onAnularCobro, onAnularPago, onEnviarRecibo,
}: Props) {
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set())
  const [editando, setEditando] = useState<Cobro | null>(null)
  const [anulando, setAnulando] = useState<{ cobro: Cobro; pago?: Pago } | null>(null)
  const [enviando, setEnviando] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (cobros.length === 0) return <p className="lista-estado">Este contrato no tiene cobros.</p>

  const numeroLiquidacion = (id: number | null) =>
    id === null ? null : (liquidaciones.find(l => l.id === id)?.numero_formateado ?? `#${id}`)

  const alternar = (id: number) => setAbiertos(prev => {
    const nuevo = new Set(prev)
    if (nuevo.has(id)) nuevo.delete(id)
    else nuevo.add(id)
    return nuevo
  })

  const enviar = async (cobro: Cobro, pago: Pago) => {
    setError(null)
    setEnviando(pago.id)
    try {
      await onEnviarRecibo(cobro, pago)
    } catch (e: unknown) {
      setError(mensajeDe(e, 'No se pudo enviar el recibo'))
    } finally {
      setEnviando(null)
    }
  }

  return (
    <>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="tabla-wrapper">
        <table className="tabla tabla-cobros">
          <thead>
            <tr>
              <th>Período</th>
              <th>Vence</th>
              <th>Monto</th>
              <th>Pagado</th>
              <th>Saldo</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cobros.map(c => {
              const chip = etiquetaEstadoCobro(c)
              const tienePagos = c.pagos.length > 0
              const abierto = abiertos.has(c.id)
              const puedePagar = contratoVigente && (c.estado === 'pendiente' || c.estado === 'parcial')
              const puedeEditar = !tienePagos && c.estado !== 'anulado'
              return (
                <FilaCobro
                  key={c.id}
                  cobro={c}
                  moneda={moneda}
                  chip={chip}
                  abierto={abierto}
                  onAlternar={tienePagos ? () => alternar(c.id) : undefined}
                  acciones={(
                    <div className="tabla-acciones">
                      {puedePagar && (
                        <button type="button" className="btn btn-magenta btn-chico" onClick={() => onRegistrarPago(c)}>
                          Registrar pago
                        </button>
                      )}
                      {puedeEditar && (
                        <>
                          <button type="button" className="btn btn-outline btn-chico" onClick={() => setEditando(c)}>Editar</button>
                          <button type="button" className="btn btn-outline btn-chico" onClick={() => setAnulando({ cobro: c })}>Anular mes</button>
                        </>
                      )}
                    </div>
                  )}
                  pagos={abierto && tienePagos ? (
                    <ul className="cobro-pagos" aria-label={`Pagos de ${nombreMes(c.periodo)}`}>
                      {c.pagos.map(p => (
                        <li key={p.id} className={`cobro-pago${p.anulado_at ? ' cobro-pago-anulado' : ''}`}>
                          <div className="cobro-pago-datos">
                            <span className="cobro-pago-recibo">Recibo N° {p.recibo_numero_formateado}</span>
                            <span>{formatearFecha(p.fecha_pago)}</span>
                            <span>
                              {formatearMonto(p.monto, moneda)}
                              {Number(p.punitorio) > 0 && ` + ${formatearMonto(p.punitorio, moneda)} punitorio`}
                            </span>
                            <span>{LABEL_MEDIO_PAGO[p.medio]}{p.referencia ? ` · ${p.referencia}` : ''}</span>
                            {p.anulado_at && <span className="cobro-pago-motivo">Anulado: {p.motivo_anulacion}</span>}
                          </div>
                          {!p.anulado_at && (
                            <div className="tabla-acciones">
                              {p.recibo_pdf_url && (
                                <a href={mediaUrl(p.recibo_pdf_url)} target="_blank" rel="noreferrer" className="btn btn-outline btn-chico">Ver PDF</a>
                              )}
                              <button
                                type="button"
                                className="btn btn-outline btn-chico"
                                disabled={!emailConfigurado || enviando === p.id}
                                title={emailConfigurado ? undefined : 'El servidor no tiene configurado el envío de emails'}
                                onClick={() => enviar(c, p)}
                              >
                                {enviando === p.id ? 'Enviando...' : p.enviado_email_at ? 'Reenviar' : 'Enviar por email'}
                              </button>
                              {p.enviado_email_at && <span className="cobro-pago-enviado">Enviado el {formatearFecha(p.enviado_email_at)}</span>}
                              {p.whatsapp_url && (
                                <a href={p.whatsapp_url} target="_blank" rel="noreferrer" className="btn btn-outline btn-chico">WhatsApp</a>
                              )}
                              {p.liquidacion_id !== null
                                ? <span className="cobro-pago-liquidado">Liquidado en N° {numeroLiquidacion(p.liquidacion_id)}</span>
                                : (
                                  <button type="button" className="btn btn-outline btn-chico" onClick={() => setAnulando({ cobro: c, pago: p })}>
                                    Anular
                                  </button>
                                )}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                />
              )
            })}
          </tbody>
        </table>
      </div>

      {editando && (
        <ModalEditarCobro
          cobro={editando}
          onConfirmar={async data => { await onEditar(editando, data); setEditando(null) }}
          onCerrar={() => setEditando(null)}
        />
      )}

      {anulando && (
        <ModalMotivo
          titulo={anulando.pago
            ? `Anular recibo N° ${anulando.pago.recibo_numero_formateado}`
            : `Anular ${nombreMes(anulando.cobro.periodo)}`}
          onConfirmar={async motivo => {
            if (anulando.pago) await onAnularPago(anulando.cobro, anulando.pago, motivo)
            else await onAnularCobro(anulando.cobro, motivo)
            setAnulando(null)
          }}
          onCerrar={() => setAnulando(null)}
        />
      )}
    </>
  )
}

interface FilaProps {
  cobro: Cobro
  moneda: string
  chip: ReturnType<typeof etiquetaEstadoCobro>
  abierto: boolean
  onAlternar?: () => void
  acciones: React.ReactNode
  pagos: React.ReactNode
}

function FilaCobro({ cobro: c, moneda, chip, abierto, onAlternar, acciones, pagos }: FilaProps) {
  return (
    <>
      <tr id={`cobro-${c.id}`} className={c.estado === 'anulado' ? 'cobro-anulado' : undefined}>
        <td data-label="Período">
          {onAlternar
            ? (
              <button type="button" className="cobro-periodo-toggle" aria-expanded={abierto} onClick={onAlternar}>
                {nombreMes(c.periodo)} <span aria-hidden="true">{abierto ? '▾' : '▸'}</span>
              </button>
            )
            : nombreMes(c.periodo)}
          {c.notas && <div className="cobro-notas">{c.notas}</div>}
        </td>
        <td data-label="Vence">{formatearFecha(c.fecha_vencimiento)}</td>
        <td data-label="Monto">{formatearMonto(c.monto, moneda)}</td>
        <td data-label="Pagado">{formatearMonto(c.pagado, moneda)}</td>
        <td data-label="Saldo">{formatearMonto(c.saldo, moneda)}</td>
        <td data-label="Estado"><Badge value={c.estado} color={chip.color} label={chip.texto} /></td>
        <td data-label="Acciones">{acciones}</td>
      </tr>
      {pagos && (
        <tr className="cobro-fila-pagos">
          <td colSpan={7}>{pagos}</td>
        </tr>
      )}
    </>
  )
}

interface EditarProps {
  cobro: Cobro
  onConfirmar: (data: CobroUpdatePayload) => Promise<void>
  onCerrar: () => void
}

/** Monto, vencimiento y notas de un período sin pagos. */
function ModalEditarCobro({ cobro, onConfirmar, onCerrar }: EditarProps) {
  const [monto, setMonto] = useState(String(Number(cobro.monto)))
  const [vence, setVence] = useState(cobro.fecha_vencimiento)
  const [notas, setNotas] = useState(cobro.notas ?? '')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault()
    setEnviando(true)
    setError(null)
    try {
      await onConfirmar({ monto: Number(monto), fecha_vencimiento: vence, notas: notas.trim() || undefined })
    } catch (err: unknown) {
      setError(mensajeDe(err, 'No se pudo editar el período'))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal titulo={`Editar ${nombreMes(cobro.periodo)}`} onCerrar={onCerrar}>
      <form onSubmit={confirmar} className="form">
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-field">
          <label htmlFor="cobro-monto">Monto</label>
          <input id="cobro-monto" type="number" min={0} step="0.01" required value={monto} onChange={e => setMonto(e.target.value)} />
        </div>
        <div className="form-field">
          <label htmlFor="cobro-vence">Vence</label>
          <input id="cobro-vence" type="date" required value={vence} onChange={e => setVence(e.target.value)} />
        </div>
        <div className="form-field">
          <label htmlFor="cobro-notas">Notas</label>
          <input id="cobro-notas" value={notas} onChange={e => setNotas(e.target.value)} placeholder="Opcional" />
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn btn-magenta" disabled={enviando || Number(monto) <= 0}>
            {enviando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

interface MotivoProps {
  titulo: string
  onConfirmar: (motivo: string) => Promise<void>
  onCerrar: () => void
}

/** Confirmación con motivo obligatorio: anular un mes o un recibo. */
export function ModalMotivo({ titulo, onConfirmar, onCerrar }: MotivoProps) {
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault()
    setEnviando(true)
    setError(null)
    try {
      await onConfirmar(motivo.trim())
    } catch (err: unknown) {
      setError(mensajeDe(err, 'No se pudo anular'))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal titulo={titulo} onCerrar={onCerrar}>
      <form onSubmit={confirmar} className="form">
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-field">
          <label htmlFor="motivo-anulacion">Motivo</label>
          <textarea id="motivo-anulacion" rows={3} required autoFocus value={motivo} onChange={e => setMotivo(e.target.value)} />
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn btn-danger" disabled={enviando || !motivo.trim()}>
            {enviando ? 'Anulando...' : 'Anular'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
