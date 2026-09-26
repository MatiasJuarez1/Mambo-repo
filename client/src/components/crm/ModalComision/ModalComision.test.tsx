import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ModalComision from './ModalComision'
import type { Operacion } from '../../../types/operacion'
import type { Comision } from '../../../types/comision'

const OP = { id: 9, amount: 1000000, currency: 'ARS', assigned_to_user_id: 1 } as Operacion
const USUARIOS = [{ id: 1, name: 'Ana', email: 'a@m.ar' }, { id: 2, name: 'Juan', email: 'j@m.ar' }]
const INICIAL: Comision = {
  deal_id: 9, monto_operacion: '1000000.00', moneda: 'ARS', pct: '3.00', monto: '30000.00',
  cobrada: false, fecha_cobro: null, notas: null, sin_monto: false, updated_at: '',
  reparto: [{ user_id: 1, nombre: 'Ana', pct: '100.00', monto: '30000.00' }],
}

it('recalcula el monto al cambiar el porcentaje y envía el body', async () => {
  const usuario = userEvent.setup()
  const onGuardar = vi.fn().mockResolvedValue(undefined)
  render(<ModalComision operacion={OP} usuarios={USUARIOS} inicial={INICIAL} onGuardar={onGuardar} onCerrar={() => {}} />)

  const pct = screen.getByLabelText('Porcentaje')
  await usuario.clear(pct)
  await usuario.type(pct, '4')
  expect(screen.getByLabelText('Comisión')).toHaveValue(40000)

  await usuario.click(screen.getByRole('checkbox', { name: 'Cobrada' }))
  await usuario.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(onGuardar).toHaveBeenCalledWith({
    monto_operacion: 1000000, pct: 4, monto: 40000, cobrada: true, fecha_cobro: expect.any(String),
    notas: null, reparto: [{ user_id: 1, pct: 100 }],
  })
})

it('bloquea guardar si el reparto supera el 100 %', async () => {
  const usuario = userEvent.setup()
  render(<ModalComision operacion={OP} usuarios={USUARIOS} inicial={INICIAL} onGuardar={vi.fn()} onCerrar={() => {}} />)
  await usuario.click(screen.getByRole('button', { name: 'Agregar agente' }))
  const selects = screen.getAllByLabelText('Agente')
  await usuario.selectOptions(selects[1], '2')
  const pcts = screen.getAllByLabelText('% del agente')
  await usuario.type(pcts[1], '10')
  expect(screen.getByText(/supera el 100 %/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
})

it('sin comisión previa arranca con el monto del deal y el asignado al 100 %', () => {
  render(<ModalComision operacion={OP} usuarios={USUARIOS} onGuardar={vi.fn()} onCerrar={() => {}} />)
  expect(screen.getByLabelText('Monto de la operación')).toHaveValue(1000000)
  expect(screen.getByLabelText('Agente')).toHaveValue('1')
  expect(screen.getByText(/Inmobiliaria 0 %/)).toBeInTheDocument()
})
