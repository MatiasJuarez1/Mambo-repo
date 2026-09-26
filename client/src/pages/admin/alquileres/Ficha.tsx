import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { alquileresApi } from '../../../api/alquileres'
import { inmobiliariaApi } from '../../../api/inmobiliaria'
import type {
  Ajuste, Cobro, Contrato, Gasto, LiquidacionEnLista, RolParteContrato,
} from '../../../types/alquileres'
import Badge from '../../../components/Badge'
import Modal from '../../../components/crm/Modal/Modal'
import TablaAjustes from '../../../components/crm/TablaAjustes/TablaAjustes'
import ModalAplicarAjuste from '../../../components/crm/ModalAplicarAjuste/ModalAplicarAjuste'
import TablaCobros from '../../../components/crm/TablaCobros/TablaCobros'
import ModalRegistrarPago from '../../../components/crm/ModalRegistrarPago/ModalRegistrarPago'
import TablaGastos from '../../../components/crm/TablaGastos/TablaGastos'
import BloqueLiquidaciones from '../../../components/crm/BloqueLiquidaciones/BloqueLiquidaciones'
import ModalLiquidar from '../../../components/crm/ModalLiquidar/ModalLiquidar'
import BloqueDocumentos from '../../../components/crm/BloqueDocumentos/BloqueDocumentos'
import { formatearFecha, formatearMonto } from '../../../lib/formato'
import {
  LABEL_ESTADO_CONTRATO, LABEL_INDICE, LABEL_ROL_CONTRATO, ROLES_CONTRATO, hoyIso,
} from '../../../lib/alquileres'
import '../../../components/crm/ChipsRol/ChipsRol.css'
import './Ficha.css'

const MAX_PDF_BYTES = 10 * 1024 * 1024

export default function ContratoFicha() {
  const { id } = useParams()
  const contratoId = Number(id)

  const [contrato, setContrato]   = useState<Contrato | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [aplicando, setAplicando] = useState<Ajuste | null>(null)
  const [rescindiendo, setRescindiendo] = useState(false)
  const [fechaRescision, setFechaRescision] = useState(hoyIso())
  const [motivo, setMotivo]       = useState('')
  const [errorRescision, setErrorRescision] = useState<string | null>(null)
  const [subiendo, setSubiendo]   = useState(false)
  const inputPdf = useRef<HTMLInputElement>(null)
  const [pagando, setPagando]     = useState<Cobro | null>(null)
  const [liquidando, setLiquidando] = useState(false)
  const [emailConfigurado, setEmailConfigurado] = useState(false)
  const [avisoAjuste, setAvisoAjuste] = useState<string | null>(null)

  useEffect(() => {
    setContrato(null)
    setError(null)
    alquileresApi.obtener(contratoId).then(setContrato).catch(e => setError(e.message))
  }, [contratoId])

  // Sin SMTP en el servidor, los botones "Enviar por email" quedan deshabilitados.
  useEffect(() => {
    inmobiliariaApi.obtener()
      .then(i => setEmailConfigurado(i.email_configurado))
      .catch(() => setEmailConfigurado(false))
  }, [])

  // Cada acción devuelve el contrato entero: se reemplaza y listo. Si el backend
  // la rechaza (409), su mensaje va arriba de la ficha.
  const intentar = async (fn: () => Promise<Contrato>) => {
    setError(null)
    try {
      setContrato(await fn())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la acción')
    }
  }

  const subirPdf = async (archivo: File | undefined) => {
    if (!archivo || !contrato) return
    if (archivo.type !== 'application/pdf') { setError('El archivo tiene que ser un PDF'); return }
    if (archivo.size > MAX_PDF_BYTES) { setError('El PDF no puede superar los 10 MB'); return }
    setSubiendo(true)
    await intentar(() => alquileresApi.subirPdf(contrato.id, archivo))
    setSubiendo(false)
    if (inputPdf.current) inputPdf.current.value = ''
  }

  // Los endpoints de cobros devuelven solo ese cobro: se reemplaza la fila y se
  // vuelve a pedir el contrato en segundo plano para refrescar `resumen_cobros`.
  const reemplazarCobro = (cobro: Cobro) => {
    setContrato(c => c && { ...c, cobros: c.cobros.map(x => (x.id === cobro.id ? cobro : x)) })
    alquileresApi.obtener(contratoId).then(setContrato).catch(() => {})
  }
  const reemplazarGasto = (gasto: Gasto) =>
    setContrato(c => c && { ...c, gastos: c.gastos.map(x => (x.id === gasto.id ? gasto : x)) })
  const reemplazarLiquidacion = (liq: LiquidacionEnLista) =>
    setContrato(c => c && { ...c, liquidaciones: c.liquidaciones.map(x => (x.id === liq.id ? liq : x)) })

  const sugerirPunitorio = useCallback(
    (fecha: string) => alquileresApi.punitorio(contratoId, pagando?.id ?? 0, fecha),
    [contratoId, pagando],
  )
  const pedirPreview = useCallback(
    (periodo: string) => alquileresApi.previewLiquidacion(contratoId, periodo),
    [contratoId],
  )

  // El error de la rescisión se muestra dentro del modal, que tapa la ficha.
  const rescindir = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!contrato) return
    setErrorRescision(null)
    try {
      setContrato(await alquileresApi.rescindir(contrato.id, { fecha_rescision: fechaRescision, motivo: motivo.trim() }))
      setRescindiendo(false)
    } catch (err: unknown) {
      setErrorRescision(err instanceof Error ? err.message : 'No se pudo rescindir')
    }
  }

  if (error && !contrato) return <p className="lista-estado lista-error" role="alert">{error}</p>
  if (!contrato) return <p className="lista-estado">Cargando...</p>

  const vigente = contrato.estado === 'vigente'
  const puedeFinalizar = vigente && hoyIso() >= contrato.fecha_fin
  const puedeRenovar = (vigente || contrato.estado === 'finalizado') && contrato.renovacion === null
  const montoVigente = Number(contrato.monto_vigente)
  const porRol = (rol: RolParteContrato) => contrato.partes.filter(p => p.rol === rol)

  return (
    <div>
      <div className="admin-page-header ficha-contrato-cabecera">
        <div>
          <span className="section-label">Contrato de alquiler #{contrato.id}</span>
          <h1>
            <Link to={`/admin/propiedades/${contrato.property_id}/editar`}>{contrato.propiedad.titulo}</Link>
          </h1>
          <div className="ficha-contrato-meta">
            <Badge value={contrato.estado} label={LABEL_ESTADO_CONTRATO[contrato.estado]} />
            <strong>{formatearMonto(contrato.monto_vigente, contrato.moneda)}</strong>
            <span>vence el {formatearFecha(contrato.fecha_fin)}</span>
            {contrato.deal && <Link to={`/admin/operaciones/${contrato.deal.id}`}>Deal #{contrato.deal.id}</Link>}
          </div>
        </div>

        <div className="ficha-contrato-acciones">
          {vigente && (
            <>
              <Link to={`/admin/alquileres/${contrato.id}/editar`} className="btn btn-outline">Editar</Link>
              <button
                type="button"
                className="btn btn-outline"
                disabled={!puedeFinalizar}
                title={puedeFinalizar ? undefined : 'Solo se puede finalizar a partir de la fecha de fin'}
                onClick={() => intentar(() => alquileresApi.finalizar(contrato.id))}
              >
                Finalizar
              </button>
              <button type="button" className="btn btn-danger" onClick={() => setRescindiendo(true)}>Rescindir</button>
            </>
          )}
          {puedeRenovar && (
            <Link to={`/admin/alquileres/${contrato.id}/renovar`} className="btn btn-magenta">Renovar</Link>
          )}
        </div>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {avisoAjuste && <p className="form-hint ficha-contrato-aviso" role="status">{avisoAjuste}</p>}

      {contrato.estado === 'rescindido' && (
        <p className="admin-card ficha-contrato-rescision">
          Rescindido el {formatearFecha(contrato.fecha_rescision)}: {contrato.motivo_rescision}
        </p>
      )}

      {(contrato.contrato_anterior || contrato.renovacion) && (
        <p className="ficha-contrato-cadena">
          {contrato.contrato_anterior && (
            <Link to={`/admin/alquileres/${contrato.contrato_anterior.id}`}>
              Renueva a #{contrato.contrato_anterior.id} ({formatearFecha(contrato.contrato_anterior.fecha_inicio)} – {formatearFecha(contrato.contrato_anterior.fecha_fin)})
            </Link>
          )}
          {contrato.renovacion && (
            <Link to={`/admin/alquileres/${contrato.renovacion.id}`}>
              Renovado por #{contrato.renovacion.id} ({formatearFecha(contrato.renovacion.fecha_inicio)} – {formatearFecha(contrato.renovacion.fecha_fin)})
            </Link>
          )}
        </p>
      )}

      <div className="ficha-contrato-grilla">
        <section className="admin-card">
          <h2 className="form-section-title">Datos</h2>
          <dl className="ficha-contrato-datos">
            <dt>Plazo</dt>
            <dd>{formatearFecha(contrato.fecha_inicio)} – {formatearFecha(contrato.fecha_fin)}</dd>
            <dt>Vence el día</dt>
            <dd>{contrato.dia_vencimiento} de cada mes</dd>
            <dt>Monto inicial</dt>
            <dd>{formatearMonto(contrato.monto_inicial, contrato.moneda)}</dd>
            <dt>Índice</dt>
            <dd>
              {LABEL_INDICE[contrato.indice]}
              {contrato.frecuencia_meses ? ` · cada ${contrato.frecuencia_meses} meses` : ''}
              {contrato.porcentaje_fijo ? ` · ${Number(contrato.porcentaje_fijo)}%` : ''}
            </dd>
            <dt>Administrado</dt>
            <dd>
              {contrato.administrado ? 'Sí' : 'No'}
              {contrato.honorarios_pct ? ` · honorarios ${Number(contrato.honorarios_pct)}%` : ''}
              {contrato.punitorio_diario_pct ? ` · punitorio ${Number(contrato.punitorio_diario_pct)}% diario` : ''}
            </dd>
            <dt>PDF</dt>
            <dd className="ficha-contrato-pdf">
              {contrato.pdf_url
                ? <a href={contrato.pdf_url} target="_blank" rel="noreferrer">Ver PDF</a>
                : <span>Sin PDF</span>}
              {vigente && (
                <>
                  <input
                    ref={inputPdf}
                    type="file"
                    accept="application/pdf"
                    aria-label="Subir PDF"
                    hidden
                    onChange={e => subirPdf(e.target.files?.[0])}
                  />
                  <button type="button" className="btn btn-outline btn-chico" disabled={subiendo} onClick={() => inputPdf.current?.click()}>
                    {subiendo ? 'Subiendo...' : contrato.pdf_url ? 'Reemplazar PDF' : 'Subir PDF'}
                  </button>
                  {contrato.pdf_url && (
                    <button type="button" className="btn btn-outline btn-chico" onClick={() => intentar(() => alquileresApi.quitarPdf(contrato.id))}>
                      Quitar
                    </button>
                  )}
                </>
              )}
            </dd>
          </dl>
          {contrato.notas && <p className="ficha-contrato-notas">{contrato.notas}</p>}
        </section>

        <section className="admin-card">
          <h2 className="form-section-title">Partes</h2>
          {ROLES_CONTRATO.map(rol => {
            const personas = porRol(rol)
            if (personas.length === 0) return null
            return (
              <div key={rol} className="ficha-contrato-partes">
                <span className={`chip-rol chip-rol-${rol}`}>{LABEL_ROL_CONTRATO[rol]}</span>
                {personas.map(p => (
                  <Link key={p.person_id} to={`/admin/personas/${p.person_id}`}>{p.full_name}</Link>
                ))}
              </div>
            )
          })}
        </section>
      </div>

      <section className="admin-card ficha-contrato-ajustes">
        <h2 className="form-section-title">Ajustes</h2>
        <TablaAjustes
          ajustes={contrato.ajustes}
          moneda={contrato.moneda}
          contratoVigente={vigente}
          onAplicar={setAplicando}
          onOmitir={a => intentar(() => alquileresApi.omitirAjuste(contrato.id, a.id))}
        />
      </section>

      {aplicando && (
        <ModalAplicarAjuste
          ajuste={aplicando}
          montoActual={montoVigente}
          moneda={contrato.moneda}
          porcentajeFijo={contrato.indice === 'porcentaje_fijo' && contrato.porcentaje_fijo ? Number(contrato.porcentaje_fijo) : null}
          onConfirmar={async payload => {
            const actualizado = await alquileresApi.aplicarAjuste(contrato.id, aplicando.id, payload)
            setContrato(actualizado)
            setAplicando(null)
            const n = actualizado.cobros_no_actualizados ?? 0
            setAvisoAjuste(n > 0 ? `${n} período${n === 1 ? ' con pagos no se actualizó' : 's con pagos no se actualizaron'}` : null)
          }}
          onCerrar={() => setAplicando(null)}
        />
      )}

      {contrato.administrado
        ? (
          <>
            <section className="admin-card ficha-contrato-bloque">
              <div className="ficha-contrato-bloque-cabecera">
                <h2 className="form-section-title">Cobros</h2>
                {contrato.resumen_cobros && (
                  <p className="ficha-contrato-resumen">
                    {contrato.resumen_cobros.vencidos > 0
                      ? <span className="ficha-contrato-vencido">{contrato.resumen_cobros.vencidos} vencido{contrato.resumen_cobros.vencidos === 1 ? '' : 's'} · saldo {formatearMonto(contrato.resumen_cobros.saldo_vencido, contrato.moneda)}</span>
                      : <span>Sin vencidos</span>}
                    {contrato.resumen_cobros.proximo_vencimiento && <span> · próximo vencimiento {formatearFecha(contrato.resumen_cobros.proximo_vencimiento)}</span>}
                  </p>
                )}
              </div>
              <TablaCobros
                cobros={contrato.cobros}
                moneda={contrato.moneda}
                contratoVigente={vigente}
                emailConfigurado={emailConfigurado}
                liquidaciones={contrato.liquidaciones}
                onRegistrarPago={setPagando}
                onEditar={async (c, data) => reemplazarCobro(await alquileresApi.editarCobro(contrato.id, c.id, data))}
                onAnularCobro={async (c, motivo) => reemplazarCobro(await alquileresApi.anularCobro(contrato.id, c.id, motivo))}
                onAnularPago={async (c, p, motivo) => reemplazarCobro(await alquileresApi.anularPago(contrato.id, c.id, p.id, motivo))}
                onEnviarRecibo={async (c, p) => reemplazarCobro(await alquileresApi.enviarRecibo(contrato.id, c.id, p.id))}
              />
            </section>

            <section className="admin-card ficha-contrato-bloque">
              <h2 className="form-section-title">Gastos</h2>
              <TablaGastos
                gastos={contrato.gastos}
                moneda={contrato.moneda}
                liquidaciones={contrato.liquidaciones}
                onCrear={async (payload, archivo) => {
                  let gasto = await alquileresApi.crearGasto(contrato.id, payload)
                  if (archivo) gasto = await alquileresApi.subirComprobante(contrato.id, gasto.id, archivo)
                  setContrato(c => c && { ...c, gastos: [...c.gastos, gasto] })
                }}
                onEditar={async (g, payload) => reemplazarGasto(await alquileresApi.editarGasto(contrato.id, g.id, payload))}
                onBorrar={async g => {
                  await alquileresApi.borrarGasto(contrato.id, g.id)
                  setContrato(c => c && { ...c, gastos: c.gastos.filter(x => x.id !== g.id) })
                }}
                onSubirComprobante={async (g, archivo) => reemplazarGasto(await alquileresApi.subirComprobante(contrato.id, g.id, archivo))}
                onQuitarComprobante={async g => reemplazarGasto(await alquileresApi.quitarComprobante(contrato.id, g.id))}
              />
            </section>

            <section className="admin-card ficha-contrato-bloque">
              <h2 className="form-section-title">Liquidaciones</h2>
              <BloqueLiquidaciones
                liquidaciones={contrato.liquidaciones}
                moneda={contrato.moneda}
                contratoVigente={vigente}
                emailConfigurado={emailConfigurado}
                onLiquidar={() => setLiquidando(true)}
                onPagar={async (l, fecha) => reemplazarLiquidacion(await alquileresApi.pagarLiquidacion(contrato.id, l.id, fecha))}
                onEnviar={async l => reemplazarLiquidacion(await alquileresApi.enviarLiquidacion(contrato.id, l.id))}
                onAnular={async (l, motivo) => {
                  reemplazarLiquidacion(await alquileresApi.anularLiquidacion(contrato.id, l.id, motivo))
                  // La anulación devuelve pagos y gastos a pendientes: la ficha los muestra
                  // con su `liquidacion_id`, así que hay que recargar el contrato entero.
                  setContrato(await alquileresApi.obtener(contrato.id))
                }}
              />
            </section>
          </>
        )
        : (
          <p className="admin-card ficha-contrato-bloque ficha-contrato-no-administrado">
            Contrato no administrado: sin cobros ni liquidaciones.
            {vigente && <> <Link to={`/admin/alquileres/${contrato.id}/editar`}>Editar el contrato</Link> para administrarlo.</>}
          </p>
        )}

      <BloqueDocumentos entidad={{ contratoId: contrato.id }} />

      {pagando && (
        <ModalRegistrarPago
          cobro={pagando}
          moneda={contrato.moneda}
          sugerirPunitorio={sugerirPunitorio}
          onConfirmar={async payload => {
            reemplazarCobro(await alquileresApi.registrarPago(contrato.id, pagando.id, payload))
            setPagando(null)
          }}
          onCerrar={() => setPagando(null)}
        />
      )}

      {liquidando && (
        <ModalLiquidar
          moneda={contrato.moneda}
          pedirPreview={pedirPreview}
          urlBorrador={periodo => alquileresApi.urlBorradorLiquidacion(contrato.id, periodo)}
          onConfirmar={async payload => {
            await alquileresApi.liquidar(contrato.id, payload)
            // La liquidación marca pagos y gastos: la ficha entera cambia.
            setContrato(await alquileresApi.obtener(contrato.id))
            setLiquidando(false)
          }}
          onCerrar={() => setLiquidando(false)}
        />
      )}

      {rescindiendo && (
        <Modal titulo="Rescindir contrato" onCerrar={() => setRescindiendo(false)}>
          <form onSubmit={rescindir} className="form">
            {errorRescision && <p className="form-error" role="alert">{errorRescision}</p>}
            <div className="form-field">
              <label htmlFor="fecha_rescision">Fecha de rescisión</label>
              <input
                id="fecha_rescision" type="date" required
                min={contrato.fecha_inicio} max={contrato.fecha_fin}
                value={fechaRescision} onChange={e => setFechaRescision(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="motivo">Motivo</label>
              <textarea id="motivo" rows={3} required value={motivo} onChange={e => setMotivo(e.target.value)} />
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-outline" onClick={() => setRescindiendo(false)}>Cancelar</button>
              <button type="submit" className="btn btn-danger" disabled={!motivo.trim()}>Rescindir</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
