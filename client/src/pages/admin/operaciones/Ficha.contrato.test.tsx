import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import OperacionFicha from './Ficha'
import { operacionesApi } from '../../../api/operaciones'
import { usuariosApi } from '../../../api/usuarios'
import { alquileresApi } from '../../../api/alquileres'
import { documentosApi } from '../../../api/documentos'
import type { Operacion, Pipeline } from '../../../types/operacion'

vi.mock('../../../api/operaciones', () => ({
  operacionesApi: { obtener: vi.fn(), pipeline: vi.fn(), comision: vi.fn().mockRejectedValue(new Error('sin comisión')) },
}))
vi.mock('../../../api/usuarios', () => ({ usuariosApi: { listar: vi.fn() } }))
vi.mock('../../../api/alquileres', () => ({ alquileresApi: { porDeal: vi.fn() } }))
vi.mock('../../../api/personas', () => ({ personasApi: { listar: vi.fn() } }))
vi.mock('../../../api/documentos', () => ({
  documentosApi: { listar: vi.fn().mockResolvedValue([]), subir: vi.fn(), eliminar: vi.fn() },
}))

const ALQUILER: Pipeline = {
  id: 2, name: 'Alquiler', description: null, is_active: true, created_at: '',
  stages: [{ id: 5, pipeline_id: 2, name: 'Firmado', position: 3, is_won: true, is_lost: false }],
}

const DEAL: Operacion = {
  id: 9, title: 'Alquiler depto', pipeline_id: 2, stage_id: 5, assigned_to_user_id: null,
  property_id: 7, propiedad: { id: 7, titulo: 'Depto', estado_comercial: 'cerrada' },
  amount: 150000, currency: 'ARS', is_won: true, is_lost: false, stage_changed_at: '', dias_en_etapa: 1,
  parties: [], created_at: '', notes: null, closed_at: null, updated_at: '',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(operacionesApi.obtener).mockResolvedValue(DEAL)
  vi.mocked(operacionesApi.pipeline).mockResolvedValue(ALQUILER)
  vi.mocked(usuariosApi.listar).mockResolvedValue([])
})

function renderFicha() {
  return render(
    <MemoryRouter initialEntries={['/admin/operaciones/9']}>
      <Routes><Route path="/admin/operaciones/:id" element={<OperacionFicha />} /></Routes>
    </MemoryRouter>,
  )
}

it('deal de Alquiler ganado sin contrato: ofrece "Crear contrato" con el deal precargado', async () => {
  vi.mocked(alquileresApi.porDeal).mockRejectedValue(new Error('El deal no tiene contrato'))
  renderFicha()
  expect(await screen.findByRole('link', { name: 'Crear contrato' })).toHaveAttribute('href', '/admin/alquileres/nuevo?deal_id=9')
  expect(screen.queryByRole('link', { name: 'Ver contrato' })).not.toBeInTheDocument()
})

it('deal con contrato: ofrece "Ver contrato"', async () => {
  vi.mocked(alquileresApi.porDeal).mockResolvedValue({ id: 3 } as never)
  renderFicha()
  expect(await screen.findByRole('link', { name: 'Ver contrato' })).toHaveAttribute('href', '/admin/alquileres/3')
  expect(screen.queryByRole('link', { name: 'Crear contrato' })).not.toBeInTheDocument()
})

it('deal no ganado: no consulta el contrato ni muestra botones', async () => {
  vi.mocked(operacionesApi.obtener).mockResolvedValue({ ...DEAL, is_won: false })
  renderFicha()
  await screen.findByRole('heading', { name: 'Alquiler depto' })
  expect(alquileresApi.porDeal).not.toHaveBeenCalled()
  expect(screen.queryByRole('link', { name: /contrato/ })).not.toBeInTheDocument()
})

it('muestra la sección Documentos de la operación', async () => {
  renderFicha()
  expect(await screen.findByRole('heading', { name: 'Documentos' })).toBeInTheDocument()
  expect(documentosApi.listar).toHaveBeenCalledWith({ dealId: 9 })
})
