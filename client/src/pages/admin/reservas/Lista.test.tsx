import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ReservasLista from './Lista'
import { reservasApi } from '../../../api/reservas'
import { propiedadesApi } from '../../../api/propiedades'
import type { Reserva } from '../../../types/reserva'

vi.mock('../../../api/reservas', () => ({
  reservasApi: { listar: vi.fn(), cancelar: vi.fn(), vencer: vi.fn(), convertir: vi.fn() },
}))
vi.mock('../../../api/propiedades', () => ({
  propiedadesApi: { obtener: vi.fn() },
}))

const RESERVA: Reserva = {
  id: 4, status: 'activa', person: { id: 1, full_name: 'Ana Pérez' }, property_id: 7,
  propiedad: { id: 7, titulo: 'Casa', estado_comercial: 'reservada' }, amount: 1000, currency: 'USD',
  notes: null, expires_at: '2099-01-01T00:00:00Z', created_by: { id: 1, email: 'a@a' }, created_at: '', updated_at: '',
}

beforeEach(() => {
  vi.mocked(reservasApi.listar).mockResolvedValue({ total: 1, items: [RESERVA] })
  vi.mocked(reservasApi.convertir).mockResolvedValue({ ...RESERVA, status: 'convertida' })
  vi.mocked(propiedadesApi.obtener).mockResolvedValue({ id: 7, tipo_operacion: 'alquiler' } as never)
})

function renderLista() {
  return render(
    <MemoryRouter initialEntries={['/admin/reservas']}>
      <Routes>
        <Route path="/admin/reservas" element={<ReservasLista />} />
        <Route path="/admin/operaciones/nueva" element={<p>alta de operación</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

it('lista activas por defecto', async () => {
  renderLista()
  expect(await screen.findByText('Ana Pérez')).toBeInTheDocument()
  expect(reservasApi.listar).toHaveBeenCalledWith(expect.objectContaining({ status: 'activa' }))
})

it('convertir llama a la API y navega al alta de operación con los datos de la propiedad', async () => {
  const usuario = userEvent.setup()
  renderLista()
  await usuario.click(await screen.findByRole('button', { name: 'Convertir' }))
  await waitFor(() => expect(reservasApi.convertir).toHaveBeenCalledWith(4))
  expect(await screen.findByText('alta de operación')).toBeInTheDocument()
})

it('muestra el detail del backend si una acción falla', async () => {
  const usuario = userEvent.setup()
  vi.mocked(reservasApi.cancelar).mockRejectedValue(new Error("No se puede pasar de 'vencida' a 'cancelada'"))
  renderLista()
  await usuario.click(await screen.findByRole('button', { name: 'Cancelar' }))
  expect(await screen.findByText(/No se puede pasar/)).toBeInTheDocument()
})
