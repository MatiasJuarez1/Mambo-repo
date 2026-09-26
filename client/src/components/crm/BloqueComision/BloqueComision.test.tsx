import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BloqueComision from './BloqueComision'
import { operacionesApi } from '../../../api/operaciones'
import type { Operacion } from '../../../types/operacion'
import type { Comision } from '../../../types/comision'

vi.mock('../../../api/operaciones', () => ({ operacionesApi: { comision: vi.fn(), guardarComision: vi.fn() } }))

const OP = { id: 9, amount: 1000000, currency: 'ARS', assigned_to_user_id: 1, is_won: true } as Operacion
const COMISION: Comision = {
  deal_id: 9, monto_operacion: '1000000.00', moneda: 'ARS', pct: '3.00', monto: '30000.00',
  cobrada: true, fecha_cobro: '2026-09-10', notas: null, sin_monto: false, updated_at: '',
  reparto: [{ user_id: 1, nombre: 'Ana', pct: '60.00', monto: '18000.00' }],
}

beforeEach(() => vi.clearAllMocks())

it('muestra la comisión, el reparto y lo que queda para la inmobiliaria', async () => {
  vi.mocked(operacionesApi.comision).mockResolvedValue(COMISION)
  render(<BloqueComision operacion={OP} usuarios={[]} />)
  expect(await screen.findByText('ARS 30.000')).toBeInTheDocument()
  expect(screen.getByText('Cobrada 10/09/2026')).toBeInTheDocument()
  expect(screen.getByText(/Ana · 60 % · ARS 18.000/)).toBeInTheDocument()
  expect(screen.getByText(/Inmobiliaria · 40 % · ARS 12.000/)).toBeInTheDocument()
})

it('sin comisión ofrece cargarla y guarda', async () => {
  const usuario = userEvent.setup()
  vi.mocked(operacionesApi.comision)
    .mockRejectedValueOnce(new Error('La operación no tiene comisión cargada'))
    .mockResolvedValue(COMISION)
  vi.mocked(operacionesApi.guardarComision).mockResolvedValue(COMISION)
  render(<BloqueComision operacion={OP} usuarios={[{ id: 1, name: 'Ana', email: 'a@m.ar' }]} />)
  expect(await screen.findByText('Sin comisión cargada')).toBeInTheDocument()
  await usuario.click(screen.getByRole('button', { name: 'Cargar comisión' }))
  await usuario.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(operacionesApi.guardarComision).toHaveBeenCalledWith(9, expect.objectContaining({ monto_operacion: 1000000 }))
  expect(await screen.findByText('ARS 30.000')).toBeInTheDocument()
})

it('marca la operación sin monto', async () => {
  vi.mocked(operacionesApi.comision).mockResolvedValue({
    ...COMISION, monto_operacion: '0.00', monto: '0.00', sin_monto: true, reparto: [],
  })
  render(<BloqueComision operacion={OP} usuarios={[]} />)
  expect(await screen.findByText(/no tiene monto/)).toBeInTheDocument()
})
