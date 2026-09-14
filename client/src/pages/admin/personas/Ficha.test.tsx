import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PersonaFicha from './Ficha'
import { personasApi } from '../../../api/personas'

vi.mock('../../../api/personas', () => ({
  personasApi: { obtener: vi.fn(), vinculos: vi.fn() },
}))

const PERSONA = {
  id: 1, full_name: 'Ana Pérez', first_name: 'Ana', last_name: 'Pérez', document_type: 'DNI',
  document_number: '30111222', notes: null, created_at: '', updated_at: '', tags: ['inversor'],
  contacts: [{ id: 1, person_id: 1, type: 'whatsapp' as const, value: '2215550000', is_primary: true, created_at: '' }],
  roles: { propietario: 1, comprador: 0, vendedor: 0, inquilino: 0, interesado: 0 },
}

beforeEach(() => {
  vi.mocked(personasApi.obtener).mockResolvedValue(PERSONA)
  vi.mocked(personasApi.vinculos).mockResolvedValue({
    propiedades: [{ id: 5, titulo: 'Depto en La Plata', tipo_operacion: 'venta', estado_comercial: 'disponible', foto_principal: null }],
    reservas: [],
    deals: [{ id: 9, title: 'Compra casa', pipeline: 'Venta', stage: 'Visita', is_won: false, is_lost: false, amount: 100000, currency: 'USD', role: 'comprador', propiedad: { id: 6, titulo: 'Casa', estado_comercial: 'disponible' } }],
    actividades: [],
  })
})

function renderFicha() {
  return render(
    <MemoryRouter initialEntries={['/admin/personas/1']}>
      <Routes><Route path="/admin/personas/:id" element={<PersonaFicha />} /></Routes>
    </MemoryRouter>,
  )
}

it('muestra cabecera, contactos y los cuatro bloques, incluidos los vacíos', async () => {
  renderFicha()
  expect(await screen.findByRole('heading', { name: 'Ana Pérez' })).toBeInTheDocument()
  expect(screen.getByText('Propietario · 1')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /2215550000/ })).toHaveAttribute('href', expect.stringContaining('wa.me'))
  expect(screen.getByRole('link', { name: 'Depto en La Plata' })).toHaveAttribute('href', '/admin/propiedades/5/editar')
  expect(screen.getByRole('link', { name: /Compra casa/ })).toHaveAttribute('href', '/admin/operaciones/9')
  expect(screen.getByText('Sin reservas')).toBeInTheDocument()
  expect(screen.getByText('Sin actividades pendientes')).toBeInTheDocument()
})
