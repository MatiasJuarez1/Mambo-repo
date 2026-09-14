import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import OperacionFormulario from './Formulario'
import { operacionesApi } from '../../../api/operaciones'
import { propiedadesApi } from '../../../api/propiedades'
import { personasApi } from '../../../api/personas'
import { usuariosApi } from '../../../api/usuarios'
import type { Pipeline } from '../../../types/operacion'

vi.mock('../../../api/operaciones', () => ({ operacionesApi: { pipelines: vi.fn(), pipeline: vi.fn(), crear: vi.fn() } }))
vi.mock('../../../api/propiedades', () => ({ propiedadesApi: { obtener: vi.fn(), listar: vi.fn() } }))
vi.mock('../../../api/personas', () => ({ personasApi: { obtener: vi.fn(), listar: vi.fn(), crear: vi.fn() } }))
vi.mock('../../../api/usuarios', () => ({ usuariosApi: { listar: vi.fn() } }))

const VENTA: Pipeline = {
  id: 1, name: 'Venta', description: null, is_active: true, created_at: '',
  stages: [
    { id: 1, pipeline_id: 1, name: 'Consulta', position: 1, is_won: false, is_lost: false },
    { id: 3, pipeline_id: 1, name: 'Oferta', position: 3, is_won: false, is_lost: false },
  ],
}

beforeEach(() => {
  vi.mocked(operacionesApi.pipelines).mockResolvedValue([{ id: 1, name: 'Venta', is_active: true, stage_count: 2 }])
  vi.mocked(operacionesApi.pipeline).mockResolvedValue(VENTA)
  vi.mocked(propiedadesApi.obtener).mockResolvedValue({ id: 7, titulo: 'Casa', precio: 150000, moneda: 'USD', tipo_operacion: 'venta' } as never)
  vi.mocked(propiedadesApi.listar).mockResolvedValue([])
  vi.mocked(personasApi.obtener).mockResolvedValue({ id: 1, full_name: 'Ana Pérez' } as never)
  vi.mocked(usuariosApi.listar).mockResolvedValue([])
  vi.mocked(operacionesApi.crear).mockResolvedValue({ id: 22 } as never)
})

it('viene precargada desde una reserva convertida y crea el deal', async () => {
  const usuario = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/admin/operaciones/nueva?propiedad=7&persona=1&rol=comprador&pipeline=Venta&etapa=Oferta']}>
      <Routes>
        <Route path="/admin/operaciones/nueva" element={<OperacionFormulario />} />
        <Route path="/admin/operaciones/:id" element={<p>ficha</p>} />
      </Routes>
    </MemoryRouter>,
  )

  expect(await screen.findByDisplayValue('Casa')).toBeInTheDocument()   // título autocompletado
  expect(screen.getByDisplayValue('150000')).toBeInTheDocument()        // monto autocompletado
  expect(screen.getByText('Ana Pérez')).toBeInTheDocument()             // parte precargada
  await waitFor(() => expect(screen.getByLabelText('Etapa')).toHaveValue('3'))

  await usuario.click(screen.getByRole('button', { name: 'Crear operación' }))

  await waitFor(() =>
    expect(operacionesApi.crear).toHaveBeenCalledWith(expect.objectContaining({
      pipeline_id: 1, stage_id: 3, property_id: 7, title: 'Casa', amount: 150000, currency: 'USD',
      parties: [{ person_id: 1, role: 'comprador' }],
    })),
  )
  expect(await screen.findByText('ficha')).toBeInTheDocument()
})
