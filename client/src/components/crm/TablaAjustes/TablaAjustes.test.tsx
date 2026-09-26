import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TablaAjustes, { primerPendiente } from './TablaAjustes'
import type { Ajuste } from '../../../types/alquileres'

const ajuste = (over: Partial<Ajuste>): Ajuste => ({
  id: 1, fecha_prevista: '2026-04-01', estado: 'pendiente', coeficiente: null,
  monto_anterior: null, monto_nuevo: null, aplicado_at: null, notas: null, ...over,
})

const AJUSTES: Ajuste[] = [
  ajuste({ id: 1, fecha_prevista: '2026-04-01', estado: 'aplicado', coeficiente: '1.100000', monto_anterior: '100000.00', monto_nuevo: '110000.00' }),
  ajuste({ id: 2, fecha_prevista: '2026-07-01', estado: 'omitido', notas: 'Acordado con el inquilino' }),
  ajuste({ id: 3, fecha_prevista: '2026-10-01' }),
  ajuste({ id: 4, fecha_prevista: '2027-01-01' }),
]

it('primerPendiente es el pendiente de fecha más antigua', () => {
  expect(primerPendiente(AJUSTES)?.id).toBe(3)
  expect(primerPendiente(AJUSTES.slice(0, 2))).toBeNull()
})

it('renderiza estados, montos y notas; solo el primer pendiente tiene Aplicar habilitado', () => {
  render(<TablaAjustes ajustes={AJUSTES} moneda="ARS" contratoVigente onAplicar={() => {}} onOmitir={() => {}} />)
  expect(screen.getByText('Aplicado')).toBeInTheDocument()
  expect(screen.getByText('ARS 100.000 → ARS 110.000')).toBeInTheDocument()
  expect(screen.getByText('Acordado con el inquilino')).toBeInTheDocument()

  const aplicar = screen.getAllByRole('button', { name: 'Aplicar' })
  expect(aplicar).toHaveLength(2)
  expect(aplicar[0]).toBeEnabled()
  expect(aplicar[1]).toBeDisabled()
  expect(aplicar[1]).toHaveAttribute('title', 'Resolvé primero el ajuste anterior')
})

it('sin contrato vigente no hay acciones', () => {
  render(<TablaAjustes ajustes={AJUSTES} moneda="ARS" contratoVigente={false} onAplicar={() => {}} onOmitir={() => {}} />)
  expect(screen.queryByRole('button', { name: 'Aplicar' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Omitir' })).not.toBeInTheDocument()
})

it('Aplicar y Omitir avisan con el ajuste elegido', async () => {
  const usuario = userEvent.setup()
  const onAplicar = vi.fn()
  const onOmitir = vi.fn()
  render(<TablaAjustes ajustes={AJUSTES} moneda="ARS" contratoVigente onAplicar={onAplicar} onOmitir={onOmitir} />)
  await usuario.click(screen.getAllByRole('button', { name: 'Aplicar' })[0])
  expect(onAplicar).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }))
  await usuario.click(screen.getAllByRole('button', { name: 'Omitir' })[1])
  expect(onOmitir).toHaveBeenCalledWith(expect.objectContaining({ id: 4 }))
})
