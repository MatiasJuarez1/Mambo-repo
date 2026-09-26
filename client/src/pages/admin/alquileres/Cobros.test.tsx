import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CobrosLista from './Cobros'
import { alquileresApi } from '../../../api/alquileres'
import type { CobroEnLista } from '../../../types/alquileres'

vi.mock('../../../api/alquileres', () => ({ alquileresApi: { listarCobros: vi.fn() } }))

const COBRO: CobroEnLista = {
  id: 101, contrato_id: 3, propiedad: { id: 7, titulo: 'Depto en La Plata', estado_comercial: 'cerrada' },
  inquilinos: [{ person_id: 1, full_name: 'Ana Pérez', rol: 'inquilino' }], moneda: 'ARS',
  periodo: '2026-08-01', fecha_vencimiento: '2026-08-10', monto: '100000.00', estado: 'pendiente',
  pagado: '0.00', saldo: '100000.00', dias_atraso: 39, vencido: true,
}

beforeEach(() => {
  vi.mocked(alquileresApi.listarCobros).mockResolvedValue({ total: 1, items: [COBRO] })
})

function renderLista(url = '/admin/alquileres/cobros') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes><Route path="/admin/alquileres/cobros" element={<CobrosLista />} /></Routes>
    </MemoryRouter>,
  )
}

it('lista vencidos por defecto; la fila linkea a la ficha del contrato', async () => {
  renderLista()
  expect(await screen.findByRole('link', { name: 'Depto en La Plata' })).toHaveAttribute('href', '/admin/alquileres/3')
  expect(screen.getByRole('link', { name: 'Ana Pérez' })).toHaveAttribute('href', '/admin/personas/1')
  expect(screen.getByText('Agosto 2026')).toBeInTheDocument()
  expect(screen.getByText('ARS 100.000')).toBeInTheDocument()
  expect(screen.getByText('39 días')).toBeInTheDocument()
  expect(screen.getByText('Vencido 39 días')).toBeInTheDocument()
  expect(alquileresApi.listarCobros).toHaveBeenCalledWith(expect.objectContaining({ estado: 'vencido' }))
})

it('lee los filtros de la query string, como los linkean los tiles', async () => {
  renderLista('/admin/alquileres/cobros?estado=pagado&vence_en_dias=7')
  await screen.findByRole('link', { name: 'Depto en La Plata' })
  expect(alquileresApi.listarCobros).toHaveBeenCalledWith(expect.objectContaining({ estado: 'pagado', vence_en_dias: 7 }))
  expect(screen.getByLabelText('Estado')).toHaveValue('pagado')
})

it('cambiar el estado vuelve a pedir la lista; "todos" no manda estado', async () => {
  const usuario = userEvent.setup()
  renderLista()
  await screen.findByRole('link', { name: 'Depto en La Plata' })
  await usuario.selectOptions(screen.getByLabelText('Estado'), 'todos')
  await waitFor(() => expect(alquileresApi.listarCobros).toHaveBeenLastCalledWith(expect.objectContaining({ estado: undefined })))
})

it('muestra el error de la API', async () => {
  vi.mocked(alquileresApi.listarCobros).mockRejectedValue(new Error('Sin conexión'))
  renderLista()
  expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión')
})
