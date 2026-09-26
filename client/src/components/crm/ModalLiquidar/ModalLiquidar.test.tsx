import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ModalLiquidar from './ModalLiquidar'
import type { LiquidacionPreview, Pago } from '../../../types/alquileres'
import { mesAnterior } from '../../../lib/alquileres'

const PAGO: Pago = {
  id: 501, fecha_pago: '2026-08-12', monto: '100000.00', punitorio: '1500.00', total: '101500.00', medio: 'transferencia',
  referencia: null, recibo_numero: 7, recibo_numero_formateado: '0001-00000007', recibo_pdf_url: null,
  enviado_email_at: null, anulado_at: null, motivo_anulacion: null, liquidacion_id: null, notas: null,
  registrado_por: null, whatsapp_url: null, created_at: '',
}

const PREVIEW: LiquidacionPreview = {
  periodo: '2026-08-01', pagos: [PAGO],
  gastos: [{ id: 2, contrato_id: 3, fecha: '2026-08-02', tipo: 'reparacion', concepto: 'Plomero', monto: '30000.00', comprobante_url: null, liquidacion_id: null, created_at: '' }],
  total_cobrado: '100000.00', total_punitorios: '1500.00', honorarios_pct: '8.00', honorarios_monto: '8120.00',
  total_gastos: '30000.00', total_a_transferir: '63380.00',
}

function renderModal(over: Partial<React.ComponentProps<typeof ModalLiquidar>> = {}) {
  const props = {
    moneda: 'ARS', pedirPreview: vi.fn().mockResolvedValue(PREVIEW),
    urlBorrador: (periodo: string) => `http://api.test/preview.pdf?periodo=${periodo}`,
    onConfirmar: vi.fn().mockResolvedValue(undefined), onCerrar: vi.fn(),
    ...over,
  }
  render(<ModalLiquidar {...props} />)
  return props
}

it('arranca en el mes anterior, pide el preview y muestra el desglose completo', async () => {
  const props = renderModal()
  const dialogo = within(screen.getByRole('dialog'))
  expect(dialogo.getByLabelText('Mes')).toHaveValue(mesAnterior())
  await waitFor(() => expect(props.pedirPreview).toHaveBeenCalledWith(mesAnterior()))
  expect(await dialogo.findByText(/Recibo N° 0001-00000007/)).toBeInTheDocument()
  expect(dialogo.getByText(/incluye ARS 1.500 de punitorio/)).toBeInTheDocument()
  expect(dialogo.getByText('Honorarios (8 %)')).toBeInTheDocument()
  expect(dialogo.getByText('−ARS 8.120')).toBeInTheDocument()
  expect(dialogo.getByText(/Reparación · Plomero/)).toBeInTheDocument()
  expect(dialogo.getByText('ARS 63.380')).toBeInTheDocument()
})

it('confirmar manda el período elegido y las notas', async () => {
  const usuario = userEvent.setup()
  const props = renderModal()
  const dialogo = within(screen.getByRole('dialog'))
  await dialogo.findByText('ARS 63.380')
  await usuario.type(dialogo.getByLabelText('Notas'), 'Incluye plomero')
  await usuario.click(dialogo.getByRole('button', { name: 'Emitir liquidación' }))
  await waitFor(() => expect(props.onConfirmar).toHaveBeenCalledWith({ periodo: mesAnterior(), notas: 'Incluye plomero' }))
})

it('con el preview vacío avisa y no deja emitir', async () => {
  renderModal({ pedirPreview: vi.fn().mockResolvedValue({ ...PREVIEW, pagos: [], gastos: [] }) })
  const dialogo = within(screen.getByRole('dialog'))
  expect(await dialogo.findByText(/No hay nada que liquidar/)).toBeInTheDocument()
  expect(dialogo.getByRole('button', { name: 'Emitir liquidación' })).toBeDisabled()
})

it('muestra el 409 del backend al emitir', async () => {
  const usuario = userEvent.setup()
  renderModal({ onConfirmar: vi.fn().mockRejectedValue(new Error('Ya existe una liquidación para ese período')) })
  const dialogo = within(screen.getByRole('dialog'))
  await dialogo.findByText('ARS 63.380')
  await usuario.click(dialogo.getByRole('button', { name: 'Emitir liquidación' }))
  expect(await dialogo.findByRole('alert')).toHaveTextContent('Ya existe una liquidación para ese período')
})
