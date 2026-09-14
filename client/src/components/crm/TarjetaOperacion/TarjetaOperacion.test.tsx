import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import TarjetaOperacion from './TarjetaOperacion'
import type { Etapa, OperacionListItem } from '../../../types/operacion'

const ETAPAS: Etapa[] = [
  { id: 1, pipeline_id: 1, name: 'Consulta', position: 1, is_won: false, is_lost: false },
  { id: 2, pipeline_id: 1, name: 'Visita', position: 2, is_won: false, is_lost: false },
  { id: 4, pipeline_id: 1, name: 'Ganada', position: 4, is_won: true, is_lost: false },
]
const OP: OperacionListItem = {
  id: 9, title: 'Compra casa', pipeline_id: 1, stage_id: 1, assigned_to_user_id: null, property_id: 7,
  propiedad: { id: 7, titulo: 'Casa', estado_comercial: 'disponible' }, amount: 120000, currency: 'USD',
  is_won: false, is_lost: false, stage_changed_at: '', dias_en_etapa: 4,
  parties: [{ id: 1, deal_id: 9, person_id: 1, person: { id: 1, full_name: 'Ana Pérez' }, role: 'comprador', notes: null, created_at: '' }],
  created_at: '',
}

it('muestra título, propiedad, monto, partes y días en etapa', () => {
  render(<MemoryRouter><TarjetaOperacion operacion={OP} etapas={ETAPAS} onMover={vi.fn()} /></MemoryRouter>)
  expect(screen.getByRole('link', { name: 'Compra casa' })).toHaveAttribute('href', '/admin/operaciones/9')
  expect(screen.getByText('Casa')).toBeInTheDocument()
  expect(screen.getByText('USD 120.000')).toBeInTheDocument()
  expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
  expect(screen.getByText('4 días')).toBeInTheDocument()
})

it('cambiar el selector llama a onMover con la etapa nueva', async () => {
  const usuario = userEvent.setup()
  const onMover = vi.fn().mockResolvedValue(undefined)
  render(<MemoryRouter><TarjetaOperacion operacion={OP} etapas={ETAPAS} onMover={onMover} /></MemoryRouter>)
  await usuario.selectOptions(screen.getByLabelText('Etapa'), '2')
  await waitFor(() => expect(onMover).toHaveBeenCalledWith(2))
})
