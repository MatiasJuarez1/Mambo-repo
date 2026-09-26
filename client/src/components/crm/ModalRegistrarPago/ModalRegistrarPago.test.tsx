import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ModalRegistrarPago from './ModalRegistrarPago'
import type { Cobro } from '../../../types/alquileres'
import { hoyIso } from '../../../lib/alquileres'

const COBRO: Cobro = {
  id: 101, contrato_id: 3, periodo: '2026-08-01', fecha_vencimiento: '2026-08-10', monto: '100000.00', estado: 'parcial',
  pagado: '40000.00', saldo: '60000.00', dias_atraso: 20, vencido: true, notas: null, pagos: [],
}

function renderModal(over: Partial<React.ComponentProps<typeof ModalRegistrarPago>> = {}) {
  const props = {
    cobro: COBRO, moneda: 'ARS',
    sugerirPunitorio: vi.fn().mockResolvedValue({ monto: '1200.00', dias_atraso: 20, pct: '0.100' }),
    onConfirmar: vi.fn().mockResolvedValue(undefined), onCerrar: vi.fn(),
    ...over,
  }
  render(<ModalRegistrarPago {...props} />)
  return props
}

it('arranca con hoy, el saldo, transferencia y el punitorio sugerido; total en vivo', async () => {
  const props = renderModal()
  const dialogo = within(screen.getByRole('dialog'))
  expect(dialogo.getByLabelText('Fecha de pago')).toHaveValue(hoyIso())
  expect(dialogo.getByLabelText(/^Monto/)).toHaveValue(60000)
  expect(dialogo.getByLabelText('Medio')).toHaveValue('transferencia')
  await waitFor(() => expect(dialogo.getByLabelText('Punitorio')).toHaveValue(1200))
  expect(props.sugerirPunitorio).toHaveBeenCalledWith(hoyIso())
  expect(dialogo.getByText('20 días de atraso × 0.1 % diario')).toBeInTheDocument()
  expect(dialogo.getByText('ARS 61.200')).toBeInTheDocument()
})

it('cambiar la fecha vuelve a pedir el punitorio y lo precarga', async () => {
  const usuario = userEvent.setup()
  const sugerir = vi.fn()
    .mockResolvedValueOnce({ monto: '1200.00', dias_atraso: 20, pct: '0.100' })
    .mockResolvedValueOnce({ monto: '0.00', dias_atraso: 0, pct: '0.100' })
  renderModal({ sugerirPunitorio: sugerir })
  const dialogo = within(screen.getByRole('dialog'))
  await waitFor(() => expect(dialogo.getByLabelText('Punitorio')).toHaveValue(1200))
  const fecha = dialogo.getByLabelText('Fecha de pago')
  await usuario.clear(fecha)
  await usuario.type(fecha, '2026-08-11')
  await waitFor(() => expect(sugerir).toHaveBeenLastCalledWith('2026-08-11'))
  await waitFor(() => expect(dialogo.getByLabelText('Punitorio')).toHaveValue(0))
  expect(dialogo.getByText('ARS 60.000')).toBeInTheDocument()
})

it('manda el payload con el punitorio editado y la referencia', async () => {
  const usuario = userEvent.setup()
  const props = renderModal()
  const dialogo = within(screen.getByRole('dialog'))
  await waitFor(() => expect(dialogo.getByLabelText('Punitorio')).toHaveValue(1200))
  await usuario.clear(dialogo.getByLabelText('Punitorio'))
  await usuario.type(dialogo.getByLabelText('Punitorio'), '0')
  await usuario.selectOptions(dialogo.getByLabelText('Medio'), 'efectivo')
  await usuario.type(dialogo.getByLabelText('Referencia'), 'Caja 1')
  await usuario.click(dialogo.getByRole('button', { name: 'Registrar pago' }))
  await waitFor(() => expect(props.onConfirmar).toHaveBeenCalledWith({
    fecha_pago: hoyIso(), monto: 60000, punitorio: 0, medio: 'efectivo', referencia: 'Caja 1', notas: undefined,
  }))
})

it('un monto mayor al saldo deshabilita el envío', async () => {
  const usuario = userEvent.setup()
  renderModal()
  const dialogo = within(screen.getByRole('dialog'))
  await usuario.clear(dialogo.getByLabelText(/^Monto/))
  await usuario.type(dialogo.getByLabelText(/^Monto/), '70000')
  expect(dialogo.getByRole('button', { name: 'Registrar pago' })).toBeDisabled()
})

it('muestra el detail del backend si el registro falla', async () => {
  const usuario = userEvent.setup()
  renderModal({ onConfirmar: vi.fn().mockRejectedValue(new Error('El contrato no está vigente')) })
  const dialogo = within(screen.getByRole('dialog'))
  await waitFor(() => expect(dialogo.getByLabelText('Punitorio')).toHaveValue(1200))
  await usuario.click(dialogo.getByRole('button', { name: 'Registrar pago' }))
  expect(await dialogo.findByRole('alert')).toHaveTextContent('El contrato no está vigente')
})
