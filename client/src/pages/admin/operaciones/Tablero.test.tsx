import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Tablero from './Tablero'
import { operacionesApi } from '../../../api/operaciones'
import type { OperacionListItem, Pipeline } from '../../../types/operacion'

vi.mock('../../../api/operaciones', () => ({
  operacionesApi: { pipelines: vi.fn(), pipeline: vi.fn(), listar: vi.fn(), moverEtapa: vi.fn() },
}))

const VENTA: Pipeline = {
  id: 1, name: 'Venta', description: null, is_active: true, created_at: '',
  stages: [
    { id: 1, pipeline_id: 1, name: 'Consulta', position: 1, is_won: false, is_lost: false },
    { id: 2, pipeline_id: 1, name: 'Visita', position: 2, is_won: false, is_lost: false },
    { id: 4, pipeline_id: 1, name: 'Ganada', position: 4, is_won: true, is_lost: false },
    { id: 5, pipeline_id: 1, name: 'Perdida', position: 5, is_won: false, is_lost: true },
  ],
}
const OP: OperacionListItem = {
  id: 9, title: 'Compra casa', pipeline_id: 1, stage_id: 1, assigned_to_user_id: null, property_id: null,
  propiedad: null, amount: null, currency: 'ARS', is_won: false, is_lost: false, stage_changed_at: '',
  dias_en_etapa: 0, parties: [], created_at: '',
}

beforeEach(() => {
  localStorage.clear()
  vi.mocked(operacionesApi.pipelines).mockResolvedValue([
    { id: 1, name: 'Venta', is_active: true, stage_count: 4 },
    { id: 2, name: 'Alquiler', is_active: true, stage_count: 4 },
  ])
  vi.mocked(operacionesApi.pipeline).mockResolvedValue(VENTA)
  vi.mocked(operacionesApi.listar).mockResolvedValue({ total: 1, items: [OP] })
})

it('agrupa por etapa y colapsa ganada/perdida con el conteo', async () => {
  render(<MemoryRouter><Tablero /></MemoryRouter>)
  expect(await screen.findByRole('heading', { name: /Consulta/ })).toBeInTheDocument()
  expect(screen.getByText('Compra casa')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Ganada · 0/ })).toBeInTheDocument()
})

it('un 409 al mover deja la tarjeta donde estaba y muestra el detail', async () => {
  const usuario = userEvent.setup()
  vi.mocked(operacionesApi.moverEtapa).mockRejectedValue(new Error('La propiedad está dada de baja'))
  render(<MemoryRouter><Tablero /></MemoryRouter>)
  await screen.findByText('Compra casa')

  await usuario.selectOptions(screen.getByLabelText('Etapa'), '4')

  expect(await screen.findByText('La propiedad está dada de baja')).toBeInTheDocument()
  await waitFor(() => expect(screen.getByLabelText('Etapa')).toHaveValue('1'))
})
