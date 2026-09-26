import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import RecordatoriosPagina from './Recordatorios'
import { alquileresApi } from '../../../api/alquileres'
import type { Recordatorios } from '../../../types/alquileres'

vi.mock('../../../api/alquileres', () => ({ alquileresApi: { recordatorios: vi.fn() } }))

const DATOS: Recordatorios = {
  hoy: '2026-09-18', dias: 30, total: 1,
  por_tipo: { cobro_vencido: 1, cobro_por_vencer: 0, ajuste: 0, fin_contrato: 0 },
  items: [{
    tipo: 'cobro_vencido', fecha: '2026-09-13', dias: -5, contrato_id: 3, referencia_id: 101,
    propiedad: { id: 7, titulo: 'Depto en La Plata', estado_comercial: 'cerrada' },
    inquilinos: [{ person_id: 1, full_name: 'Ana Pérez', rol: 'inquilino' }],
    moneda: 'ARS', monto: '120000.00', detalle: 'Agosto 2026',
  }],
}

beforeEach(() => {
  vi.mocked(alquileresApi.recordatorios).mockImplementation(async dias => ({ ...DATOS, dias: dias ?? 30 }))
})

const renderPagina = (url = '/admin/alquileres/recordatorios') => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes><Route path="/admin/alquileres/recordatorios" element={<RecordatoriosPagina />} /></Routes>
  </MemoryRouter>,
)

it('sin dias en la URL pide el default y muestra la bandeja con los conteos', async () => {
  renderPagina()
  expect(await screen.findByRole('link', { name: 'Depto en La Plata' })).toBeInTheDocument()
  expect(alquileresApi.recordatorios).toHaveBeenCalledWith(undefined)
  expect(screen.getByText('Cobros vencidos: 1')).toBeInTheDocument()
  expect(screen.getByText('Ajustes: 0')).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Próximos 30 días')
})

it('lee dias de la URL y el selector lo cambia', async () => {
  const usuario = userEvent.setup()
  renderPagina('/admin/alquileres/recordatorios?dias=7')
  await screen.findByRole('link', { name: 'Depto en La Plata' })
  expect(alquileresApi.recordatorios).toHaveBeenCalledWith(7)

  await usuario.selectOptions(screen.getByLabelText('Ventana'), '90')
  await waitFor(() => expect(alquileresApi.recordatorios).toHaveBeenCalledWith(90))
  expect(await screen.findByRole('heading', { level: 1, name: /Próximos 90 días/ })).toBeInTheDocument()
})

it('muestra el error de carga', async () => {
  vi.mocked(alquileresApi.recordatorios).mockRejectedValue(new Error('Sin conexión'))
  renderPagina()
  expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión')
})
