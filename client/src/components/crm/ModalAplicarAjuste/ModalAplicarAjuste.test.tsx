import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ModalAplicarAjuste from './ModalAplicarAjuste'
import type { Ajuste } from '../../../types/alquileres'

const AJUSTE: Ajuste = {
  id: 3, fecha_prevista: '2026-10-01', estado: 'pendiente', coeficiente: null,
  monto_anterior: null, monto_nuevo: null, aplicado_at: null, notas: null,
}

function renderModal(over: Partial<React.ComponentProps<typeof ModalAplicarAjuste>> = {}) {
  const onConfirmar = vi.fn().mockResolvedValue(undefined)
  render(
    <ModalAplicarAjuste
      ajuste={AJUSTE} montoActual={100000} moneda="ARS" porcentajeFijo={null}
      onConfirmar={onConfirmar} onCerrar={() => {}} {...over}
    />,
  )
  return { onConfirmar }
}

it('calcula el monto nuevo en vivo y manda solo el coeficiente', async () => {
  const usuario = userEvent.setup()
  const { onConfirmar } = renderModal()
  expect(screen.getByText('…')).toBeInTheDocument()
  await usuario.type(screen.getByLabelText('Coeficiente'), '1.125')
  expect(screen.getByText('ARS 112.500')).toBeInTheDocument()
  await usuario.click(screen.getByRole('button', { name: 'Aplicar' }))
  await waitFor(() => expect(onConfirmar).toHaveBeenCalledWith({ coeficiente: 1.125 }))
})

it('en modo porcentaje manda solo el porcentaje y las notas', async () => {
  const usuario = userEvent.setup()
  const { onConfirmar } = renderModal()
  await usuario.click(screen.getByLabelText('Por porcentaje'))
  await usuario.type(screen.getByLabelText('Porcentaje (%)'), '10')
  expect(screen.getByText('ARS 110.000')).toBeInTheDocument()
  await usuario.type(screen.getByLabelText('Notas'), 'IPC septiembre')
  await usuario.click(screen.getByRole('button', { name: 'Aplicar' }))
  await waitFor(() => expect(onConfirmar).toHaveBeenCalledWith({ porcentaje: 10, notas: 'IPC septiembre' }))
})

it('con porcentaje_fijo arranca en modo porcentaje con el valor precargado', () => {
  renderModal({ porcentajeFijo: 12.5 })
  expect(screen.getByLabelText('Porcentaje (%)')).toHaveValue(12.5)
  expect(screen.getByText('ARS 112.500')).toBeInTheDocument()
})

it('muestra el detail del backend si aplicar falla', async () => {
  const usuario = userEvent.setup()
  const onConfirmar = vi.fn().mockRejectedValue(new Error('Hay un ajuste anterior sin resolver'))
  renderModal({ onConfirmar })
  await usuario.type(screen.getByLabelText('Coeficiente'), '1.1')
  await usuario.click(screen.getByRole('button', { name: 'Aplicar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Hay un ajuste anterior sin resolver')
})
