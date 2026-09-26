import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Reportes from './Reportes'
import { reportesApi } from '../../../api/reportes'
import { operacionesApi } from '../../../api/operaciones'
import { usuariosApi } from '../../../api/usuarios'

vi.mock('../../../api/reportes', () => ({
  reportesApi: {
    operaciones: vi.fn(), comisiones: vi.fn(), embudo: vi.fn(), alquileres: vi.fn(), urlCsv: vi.fn(() => '/csv'),
  },
}))
vi.mock('../../../api/operaciones', () => ({ operacionesApi: { pipelines: vi.fn() } }))
vi.mock('../../../api/usuarios', () => ({ usuariosApi: { listar: vi.fn() } }))

const FILA = {
  mes: '2026-08', moneda: 'ARS', ganadas: 2, perdidas: 1,
  monto_ganado: '3000000.00', comisiones: '90000.00', comisiones_cobradas: '30000.00',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(reportesApi.urlCsv).mockReturnValue('/csv')
  vi.mocked(operacionesApi.pipelines).mockResolvedValue([{ id: 1, name: 'Venta', is_active: true, stage_count: 5 }])
  vi.mocked(usuariosApi.listar).mockResolvedValue([{ id: 7, name: 'Ana', email: 'a@m.ar' }])
  vi.mocked(reportesApi.operaciones).mockResolvedValue({
    desde: '2026-01-01', hasta: '2026-09-20', pipeline_id: null, agente_id: null,
    filas: [FILA, { ...FILA, moneda: 'USD', ganadas: 1 }], totales: [{ ...FILA, mes: 'total' }, { ...FILA, mes: 'total', moneda: 'USD' }],
  })
  vi.mocked(reportesApi.embudo).mockResolvedValue({
    desde: '2026-01-01', hasta: '2026-09-20', pipeline_id: 1, pipeline: 'Venta', ganadas: 2, perdidas: 1,
    tasa_cierre_pct: '66.67', dias_promedio_cierre: '12.50',
    etapas: [{
      stage_id: 1, nombre: 'Consulta', position: 1, is_won: false, is_lost: false,
      ingresaron: 10, actuales: 3, dias_promedio: '4.00', conversion_pct: '50.00',
    }],
  })
})

const renderPagina = (url = '/admin/reportes') => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes><Route path="/admin/reportes" element={<Reportes />} /></Routes>
  </MemoryRouter>,
)

it('arranca en Operaciones, muestra la tabla y el CSV con los filtros vigentes', async () => {
  renderPagina('/admin/reportes?desde=2026-01-01&agente_id=7')
  expect(await screen.findByText('ago 2026')).toBeInTheDocument()
  expect(reportesApi.operaciones).toHaveBeenCalledWith(expect.objectContaining({ desde: '2026-01-01', agente_id: 7 }))
  expect(screen.getByRole('link', { name: 'Exportar CSV' })).toHaveAttribute('href', '/csv')
  expect(reportesApi.urlCsv).toHaveBeenCalledWith('operaciones', expect.objectContaining({ desde: '2026-01-01', agente_id: 7 }))
})

it('la pestaña Embudo pide el pipeline y muestra la tasa de cierre', async () => {
  const usuario = userEvent.setup()
  renderPagina()
  await screen.findByText('ago 2026')
  await usuario.click(screen.getByRole('tab', { name: 'Embudo' }))
  await waitFor(() => expect(reportesApi.embudo).toHaveBeenCalledWith(expect.objectContaining({ pipeline_id: 1 })))
  expect(await screen.findByText(/Tasa de cierre 66,67 %/)).toBeInTheDocument()
  expect(screen.getByText('50 % avanzan · 4 días · 3 ahora')).toBeInTheDocument()
})

it('el selector de moneda filtra las filas', async () => {
  const usuario = userEvent.setup()
  renderPagina()
  await screen.findByText('ago 2026')
  // ARS es la elegida por defecto (empate → alfabético): encabezado + 1 fila + total.
  expect(screen.getAllByRole('row')).toHaveLength(3)
  await usuario.selectOptions(screen.getByLabelText('Moneda'), 'USD')
  expect(await screen.findAllByText('USD 3.000.000')).toHaveLength(2) // fila + total
  expect(screen.getAllByRole('row')).toHaveLength(3)
})
