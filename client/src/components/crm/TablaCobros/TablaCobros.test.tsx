import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TablaCobros from './TablaCobros'
import type { Cobro, LiquidacionEnLista, Pago } from '../../../types/alquileres'

const PAGO: Pago = {
  id: 501, fecha_pago: '2026-02-12', monto: '100000.00', punitorio: '2000.00', total: '102000.00', medio: 'efectivo',
  referencia: null, recibo_numero: 7, recibo_numero_formateado: '0001-00000007', recibo_pdf_url: 'https://r2/7.pdf',
  enviado_email_at: '2026-02-13T10:00:00Z', anulado_at: null, motivo_anulacion: null, liquidacion_id: 9, notas: null,
  registrado_por: null, whatsapp_url: null, created_at: '',
}

const LIQ: LiquidacionEnLista = {
  id: 9, contrato_id: 3, propiedad: { id: 7, titulo: 'Depto', estado_comercial: 'cerrada' }, moneda: 'ARS',
  periodo: '2026-02-01', numero: 2, numero_formateado: '0001-00000002',
  total_cobrado: '102000.00', total_punitorios: '2000.00', honorarios_pct: '8.00', honorarios_monto: '8160.00',
  total_gastos: '0.00', total_a_transferir: '93840.00', estado: 'emitida', anulada: false, motivo_anulacion: null, fecha_pago: null,
  comprobante_pdf_url: null, enviado_email_at: null, notas: null, created_at: '',
}

const base = { contrato_id: 3, monto: '100000.00', notas: null }
const COBROS: Cobro[] = [
  { ...base, id: 1, periodo: '2026-01-01', fecha_vencimiento: '2026-01-10', estado: 'anulado', pagado: '0.00', saldo: '0.00', dias_atraso: 0, vencido: false, pagos: [] },
  { ...base, id: 2, periodo: '2026-02-01', fecha_vencimiento: '2026-02-10', estado: 'pagado', pagado: '100000.00', saldo: '0.00', dias_atraso: 0, vencido: false, pagos: [PAGO] },
  { ...base, id: 3, periodo: '2026-03-01', fecha_vencimiento: '2026-03-10', estado: 'parcial', pagado: '40000.00', saldo: '60000.00', dias_atraso: 12, vencido: true,
    pagos: [{ ...PAGO, id: 502, recibo_numero: 8, recibo_numero_formateado: '0001-00000008', liquidacion_id: null, enviado_email_at: null, anulado_at: '2026-03-01T00:00:00Z', motivo_anulacion: 'Error de carga' }] },
  { ...base, id: 4, periodo: '2099-04-01', fecha_vencimiento: '2099-04-10', estado: 'pendiente', pagado: '0.00', saldo: '100000.00', dias_atraso: 0, vencido: false, pagos: [] },
]

function renderTabla(over: Partial<React.ComponentProps<typeof TablaCobros>> = {}) {
  const props = {
    cobros: COBROS, moneda: 'ARS', contratoVigente: true, emailConfigurado: true, liquidaciones: [LIQ],
    onRegistrarPago: vi.fn(), onEditar: vi.fn().mockResolvedValue(undefined), onAnularCobro: vi.fn().mockResolvedValue(undefined),
    onAnularPago: vi.fn().mockResolvedValue(undefined), onEnviarRecibo: vi.fn().mockResolvedValue(undefined),
    ...over,
  }
  render(<TablaCobros {...props} />)
  return props
}

it('un chip por estado y las acciones según estado y pagos', () => {
  renderTabla()
  // "Pagado" también es un encabezado de columna: se buscan las chapitas.
  const chips = (texto: string) => screen.getByText(texto, { selector: '.badge' })
  expect(chips('Anulado')).toBeInTheDocument()
  expect(chips('Pagado')).toBeInTheDocument()
  expect(chips('Vencido 12 días')).toBeInTheDocument()
  expect(chips('Al día')).toBeInTheDocument()
  // Registrar pago: parcial y pendiente. Editar/Anular mes: solo el pendiente sin pagos.
  expect(screen.getAllByRole('button', { name: 'Registrar pago' })).toHaveLength(2)
  expect(screen.getAllByRole('button', { name: 'Editar' })).toHaveLength(1)
  expect(screen.getAllByRole('button', { name: 'Anular mes' })).toHaveLength(1)
})

it('sin contrato vigente no se registran pagos', () => {
  renderTabla({ contratoVigente: false })
  expect(screen.queryByRole('button', { name: 'Registrar pago' })).not.toBeInTheDocument()
})

it('la fila con pagos se expande: liquidado no se anula, enviado ofrece reenviar', async () => {
  const usuario = userEvent.setup()
  const props = renderTabla()
  await usuario.click(screen.getByRole('button', { name: /Febrero 2026/ }))
  const pagos = within(screen.getByRole('list', { name: 'Pagos de Febrero 2026' }))
  expect(pagos.getByText('Recibo N° 0001-00000007')).toBeInTheDocument()
  expect(pagos.getByText(/ARS 100.000 \+ ARS 2.000 punitorio/)).toBeInTheDocument()
  expect(pagos.getByText('Liquidado en N° 0001-00000002')).toBeInTheDocument()
  expect(pagos.queryByRole('button', { name: 'Anular' })).not.toBeInTheDocument()
  expect(pagos.getByText(/Enviado el 13\/02\/2026/)).toBeInTheDocument()
  await usuario.click(pagos.getByRole('button', { name: 'Reenviar' }))
  await waitFor(() => expect(props.onEnviarRecibo).toHaveBeenCalledWith(COBROS[1], PAGO))
})

it('un pago anulado se muestra con su motivo y sin acciones', async () => {
  const usuario = userEvent.setup()
  renderTabla()
  await usuario.click(screen.getByRole('button', { name: /Marzo 2026/ }))
  const pagos = within(screen.getByRole('list', { name: 'Pagos de Marzo 2026' }))
  expect(pagos.getByText('Anulado: Error de carga')).toBeInTheDocument()
  expect(pagos.queryByRole('button', { name: 'Anular' })).not.toBeInTheDocument()
})

it('sin email configurado el botón queda deshabilitado con explicación', async () => {
  const usuario = userEvent.setup()
  renderTabla({ emailConfigurado: false })
  await usuario.click(screen.getByRole('button', { name: /Febrero 2026/ }))
  const boton = screen.getByRole('button', { name: 'Reenviar' })
  expect(boton).toBeDisabled()
  expect(boton).toHaveAttribute('title', expect.stringMatching(/envío de emails/))
})

it('anular mes pide motivo y lo manda; el 409 se ve en el modal', async () => {
  const usuario = userEvent.setup()
  const props = renderTabla({ onAnularCobro: vi.fn().mockRejectedValueOnce(new Error('El cobro tiene pagos')).mockResolvedValue(undefined) })
  await usuario.click(screen.getByRole('button', { name: 'Anular mes' }))
  const dialogo = within(screen.getByRole('dialog'))
  await usuario.type(dialogo.getByLabelText('Motivo'), 'Cobrado antes del sistema')
  await usuario.click(dialogo.getByRole('button', { name: 'Anular' }))
  expect(await dialogo.findByRole('alert')).toHaveTextContent('El cobro tiene pagos')
  await usuario.click(dialogo.getByRole('button', { name: 'Anular' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(props.onAnularCobro).toHaveBeenCalledWith(COBROS[3], 'Cobrado antes del sistema')
})

it('editar manda monto, vencimiento y notas', async () => {
  const usuario = userEvent.setup()
  const props = renderTabla()
  await usuario.click(screen.getByRole('button', { name: 'Editar' }))
  const dialogo = within(screen.getByRole('dialog'))
  await usuario.clear(dialogo.getByLabelText('Monto'))
  await usuario.type(dialogo.getByLabelText('Monto'), '120000')
  await usuario.click(dialogo.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(props.onEditar).toHaveBeenCalledWith(COBROS[3], { monto: 120000, fecha_vencimiento: '2099-04-10', notas: undefined }))
})
