import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Dashboard from './Dashboard'
import { propiedadesApi } from '../../api/propiedades'
import { reservasApi } from '../../api/reservas'
import { operacionesApi } from '../../api/operaciones'
import { alquileresApi } from '../../api/alquileres'
import { reportesApi } from '../../api/reportes'
import { useAuth } from '../../context/AuthContext'

vi.mock('../../api/propiedades', () => ({ propiedadesApi: { listar: vi.fn() } }))
vi.mock('../../api/reservas', () => ({ reservasApi: { listar: vi.fn() } }))
vi.mock('../../api/operaciones', () => ({ operacionesApi: { listar: vi.fn() } }))
vi.mock('../../api/alquileres', () => ({ alquileresApi: { listar: vi.fn(), resumen: vi.fn(), recordatorios: vi.fn() } }))
vi.mock('../../api/reportes', () => ({ reportesApi: { comisiones: vi.fn(), operaciones: vi.fn() } }))
vi.mock('../../context/AuthContext', () => ({ useAuth: vi.fn() }))

function sesionCon(roles: string[]) {
  vi.mocked(useAuth).mockReturnValue({
    usuario: { id: 1, email: 'paulo@admin.com', is_active: true, roles, person_id: null },
    cargando: false, login: vi.fn(), logout: vi.fn(),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  sesionCon(['admin', 'beta'])
  vi.mocked(reportesApi.comisiones).mockResolvedValue({
    desde: '', hasta: '', agente_id: null, cobrada: false, por_agente: [],
    filas: [{ deal_id: 1 }, { deal_id: 2 }] as never,
  })
  vi.mocked(reportesApi.operaciones).mockResolvedValue({
    desde: '', hasta: '', pipeline_id: null, agente_id: null, totales: [],
    filas: [{ mes: '2026-08', moneda: 'ARS', ganadas: 2, perdidas: 0, monto_ganado: '0', comisiones: '0', comisiones_cobradas: '0' }],
  })
  vi.mocked(propiedadesApi.listar).mockResolvedValue([])
  vi.mocked(reservasApi.listar).mockResolvedValue({ total: 0, items: [] })
  vi.mocked(operacionesApi.listar).mockResolvedValue({ total: 0, items: [] })
  vi.mocked(alquileresApi.listar).mockImplementation(async params =>
    params?.vence_en_dias ? { total: 4, items: [] } : { total: 2, items: [] })
  vi.mocked(alquileresApi.resumen).mockResolvedValue({
    periodo: '2026-09-01', esperado: '450000.00', cobrado: '300000.00', vencidos_cantidad: 3,
    vencido_monto: '150000.00', morosos: 2, liquidaciones_sin_emitir: 5,
  })
  vi.mocked(alquileresApi.recordatorios).mockResolvedValue({
    hoy: '2026-09-18', dias: 30, total: 2,
    por_tipo: { cobro_vencido: 1, cobro_por_vencer: 0, ajuste: 1, fin_contrato: 0 },
    items: [
      { tipo: 'cobro_vencido', fecha: '2026-09-13', dias: -5, contrato_id: 3, referencia_id: 101,
        propiedad: { id: 7, titulo: 'Depto en La Plata', estado_comercial: 'cerrada' },
        inquilinos: [{ person_id: 1, full_name: 'Ana Pérez', rol: 'inquilino' }],
        moneda: 'ARS', monto: '120000.00', detalle: 'Agosto 2026' },
      { tipo: 'ajuste', fecha: '2026-09-15', dias: -3, contrato_id: 3, referencia_id: 55,
        propiedad: { id: 7, titulo: 'Depto en La Plata', estado_comercial: 'cerrada' },
        inquilinos: [{ person_id: 1, full_name: 'Ana Pérez', rol: 'inquilino' }],
        moneda: 'ARS', monto: '120000.00', detalle: 'Ajuste ICL' },
    ],
  })
})

it('los tiles de cobros salen del resumen y linkean a cobros y contratos sin liquidar', async () => {
  render(<MemoryRouter><Dashboard /></MemoryRouter>)
  const vencidos = await screen.findByRole('link', { name: /Cobros vencidos/ })
  expect(vencidos).toHaveTextContent('3')
  expect(vencidos).toHaveTextContent('ARS 150.000')
  expect(vencidos).toHaveAttribute('href', '/admin/alquileres/cobros?estado=vencido')
  const cobrado = screen.getByRole('link', { name: /Cobrado este mes/ })
  expect(cobrado).toHaveTextContent('ARS 300.000')
  expect(cobrado).toHaveTextContent('de ARS 450.000')
  expect(cobrado).toHaveAttribute('href', '/admin/alquileres/cobros?estado=pagado')
  const sinEmitir = screen.getByRole('link', { name: /Liquidaciones sin emitir/ })
  expect(sinEmitir).toHaveTextContent('5')
  expect(sinEmitir).toHaveAttribute('href', '/admin/alquileres?sin_liquidar=1')
})

it('los tiles de alquileres muestran el total y linkean a la lista filtrada', async () => {
  render(<MemoryRouter><Dashboard /></MemoryRouter>)
  const vencen = await screen.findByRole('link', { name: /Contratos que vencen en 90 días/ })
  expect(vencen).toHaveTextContent('4')
  expect(vencen).toHaveAttribute('href', '/admin/alquileres?vence_en_dias=90')
  const ajustes = await screen.findByRole('link', { name: /Ajustes en los próximos 30 días/ })
  expect(ajustes).toHaveTextContent('2')
  expect(ajustes).toHaveAttribute('href', '/admin/alquileres?ajuste_en_dias=30')
  expect(alquileresApi.listar).toHaveBeenCalledWith({ vence_en_dias: 90, limit: 1 })
  expect(alquileresApi.listar).toHaveBeenCalledWith({ ajuste_en_dias: 30, limit: 1 })
})

it('el tile de recordatorios cuenta la bandeja y el bloque la muestra compacta', async () => {
  render(<MemoryRouter><Dashboard /></MemoryRouter>)
  const tile = await screen.findByRole('link', { name: /^Recordatorios/ })
  expect(tile).toHaveTextContent('2')
  expect(tile).toHaveAttribute('href', '/admin/alquileres/recordatorios')
  expect(screen.getByRole('heading', { level: 2, name: 'Próximos 30 días' })).toBeInTheDocument()
  expect(screen.getByText('Cobros vencidos (1)')).toBeInTheDocument()
  expect(screen.getByText('Ajuste ICL')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Ver todos' })).toHaveAttribute('href', '/admin/alquileres/recordatorios')
})

it('muestra las comisiones a cobrar y el gráfico de los últimos meses', async () => {
  render(<MemoryRouter><Dashboard /></MemoryRouter>)
  const tile = await screen.findByRole('link', { name: /Comisiones a cobrar/ })
  expect(tile).toHaveTextContent('2')
  expect(tile).toHaveAttribute('href', '/admin/reportes?tab=comisiones&cobrada=false')
  expect(screen.getByRole('heading', { name: 'Últimos 6 meses' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Ver reportes' })).toHaveAttribute('href', '/admin/reportes')
  expect(await screen.findByText('ago 26')).toBeInTheDocument()
  expect(reportesApi.comisiones).toHaveBeenCalledWith({ cobrada: false })
})

it('sin el rol beta muestra solo el inventario y no consulta el CRM', async () => {
  sesionCon(['admin'])
  render(<MemoryRouter><Dashboard /></MemoryRouter>)
  expect(await screen.findByRole('heading', { name: 'Inventario' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Comercial' })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Alquileres' })).not.toBeInTheDocument()
  expect(reservasApi.listar).not.toHaveBeenCalled()
  expect(alquileresApi.resumen).not.toHaveBeenCalled()
  expect(reportesApi.operaciones).not.toHaveBeenCalled()
})
