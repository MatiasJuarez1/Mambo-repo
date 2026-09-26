import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ContratosLista from './Lista'
import { alquileresApi } from '../../../api/alquileres'
import type { ContratoEnLista } from '../../../types/alquileres'

vi.mock('../../../api/alquileres', () => ({ alquileresApi: { listar: vi.fn() } }))

const CONTRATO: ContratoEnLista = {
  id: 3, property_id: 7, propiedad: { id: 7, titulo: 'Depto en La Plata', estado_comercial: 'cerrada' },
  partes: [
    { person_id: 1, full_name: 'Ana Pérez', rol: 'inquilino' },
    { person_id: 2, full_name: 'Juan López', rol: 'propietario' },
  ],
  estado: 'vigente', fecha_inicio: '2026-01-01', fecha_fin: '2027-01-01', moneda: 'ARS',
  monto_vigente: '150000.00', proximo_ajuste: '2026-10-01', administrado: false, vencidos: 0,
}

beforeEach(() => {
  vi.mocked(alquileresApi.listar).mockResolvedValue({ total: 1, items: [CONTRATO] })
})

function renderLista(url = '/admin/alquileres') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes><Route path="/admin/alquileres" element={<ContratosLista />} /></Routes>
    </MemoryRouter>,
  )
}

it('lista vigentes por defecto y renderiza la fila', async () => {
  renderLista()
  expect(await screen.findByRole('link', { name: 'Depto en La Plata' })).toHaveAttribute('href', '/admin/alquileres/3')
  expect(screen.getByRole('link', { name: 'Ana Pérez' })).toHaveAttribute('href', '/admin/personas/1')
  expect(screen.queryByText('Juan López')).not.toBeInTheDocument()
  expect(screen.getByText('ARS 150.000')).toBeInTheDocument()
  expect(screen.getByText('01/10/2026')).toBeInTheDocument()
  expect(within(screen.getByRole('table')).getByText('Vigente')).toBeInTheDocument()
  expect(alquileresApi.listar).toHaveBeenCalledWith(expect.objectContaining({ estado: 'vigente' }))
})

it('lee los filtros de la query string, como los linkean los tiles', async () => {
  renderLista('/admin/alquileres?vence_en_dias=90&estado=todos')
  await screen.findByRole('link', { name: 'Depto en La Plata' })
  expect(alquileresApi.listar).toHaveBeenCalledWith(expect.objectContaining({ vence_en_dias: 90, estado: undefined }))
  expect(screen.getByLabelText('Vencen en ≤ días')).toHaveValue(90)
})

it('cambiar un filtro vuelve a pedir la lista', async () => {
  const usuario = userEvent.setup()
  renderLista()
  await screen.findByRole('link', { name: 'Depto en La Plata' })
  await usuario.selectOptions(screen.getByLabelText('Estado'), 'rescindido')
  await waitFor(() => expect(alquileresApi.listar).toHaveBeenLastCalledWith(expect.objectContaining({ estado: 'rescindido' })))
})

it('muestra el error de la API', async () => {
  vi.mocked(alquileresApi.listar).mockRejectedValue(new Error('Sin conexión'))
  renderLista()
  expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión')
})

it('sin_liquidar=1 viaja como filtro y la columna de vencidos linkea a la ficha', async () => {
  vi.mocked(alquileresApi.listar).mockResolvedValue({ total: 1, items: [{ ...CONTRATO, administrado: true, vencidos: 2 }] })
  renderLista('/admin/alquileres?sin_liquidar=1')
  await screen.findByRole('link', { name: 'Depto en La Plata' })
  expect(alquileresApi.listar).toHaveBeenCalledWith(expect.objectContaining({ sin_liquidar: true }))
  expect(screen.getByLabelText('Sin liquidar')).toBeChecked()
  expect(screen.getByRole('link', { name: '2' })).toHaveAttribute('href', '/admin/alquileres/3')
})
