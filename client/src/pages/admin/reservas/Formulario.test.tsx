import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ReservaFormulario from './Formulario'
import { reservasApi } from '../../../api/reservas'
import { propiedadesApi } from '../../../api/propiedades'
import { personasApi } from '../../../api/personas'

vi.mock('../../../api/reservas', () => ({ reservasApi: { crear: vi.fn() } }))
vi.mock('../../../api/propiedades', () => ({ propiedadesApi: { obtener: vi.fn(), listar: vi.fn() } }))
vi.mock('../../../api/personas', () => ({ personasApi: { listar: vi.fn(), crear: vi.fn() } }))

beforeEach(() => {
  vi.mocked(propiedadesApi.obtener).mockResolvedValue({ id: 7, titulo: 'Casa', estado_comercial: 'disponible' } as never)
  vi.mocked(propiedadesApi.listar).mockResolvedValue([])
  vi.mocked(personasApi.listar).mockResolvedValue({
    total: 1,
    items: [{ id: 1, full_name: 'Ana Pérez', document_type: null, document_number: null, created_at: '', tags: [], roles: { propietario: 0, comprador: 0, vendedor: 0, inquilino: 0, garante: 0, interesado: 0 } }],
  })
})

function renderAlta() {
  return render(
    <MemoryRouter initialEntries={['/admin/reservas/nueva?propiedad=7']}>
      <Routes>
        <Route path="/admin/reservas/nueva" element={<ReservaFormulario />} />
        <Route path="/admin/reservas" element={<p>lista de reservas</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

it('preselecciona la propiedad del query param y crea la reserva', async () => {
  const usuario = userEvent.setup()
  vi.mocked(reservasApi.crear).mockResolvedValue({ id: 1 } as never)
  renderAlta()

  expect(await screen.findByText('Casa')).toBeInTheDocument()
  await usuario.type(screen.getByRole('combobox', { name: 'Persona' }), 'Ana')
  await usuario.click(await screen.findByRole('option', { name: /Ana Pérez/ }))
  await usuario.type(screen.getByLabelText('Monto de la seña'), '1500')
  await usuario.click(screen.getByRole('button', { name: 'Reservar' }))

  await waitFor(() =>
    expect(reservasApi.crear).toHaveBeenCalledWith(expect.objectContaining({ property_id: 7, person_id: 1, amount: 1500 })),
  )
  expect(await screen.findByText('lista de reservas')).toBeInTheDocument()
})

it('muestra el 409 del backend tal cual', async () => {
  const usuario = userEvent.setup()
  vi.mocked(reservasApi.crear).mockRejectedValue(new Error('La propiedad 7 ya tiene una reserva activa (id=3)'))
  renderAlta()
  await screen.findByText('Casa')
  await usuario.type(screen.getByRole('combobox', { name: 'Persona' }), 'Ana')
  await usuario.click(await screen.findByRole('option', { name: /Ana Pérez/ }))
  await usuario.click(screen.getByRole('button', { name: 'Reservar' }))
  expect(await screen.findByText(/ya tiene una reserva activa/)).toBeInTheDocument()
})
