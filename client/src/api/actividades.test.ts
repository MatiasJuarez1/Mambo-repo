import { actividadesApi } from './actividades'
import { api } from './client'

vi.mock('./client', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

beforeEach(() => vi.clearAllMocks())

it('listar sin params pega a la ruta base', async () => {
  vi.mocked(api.get).mockResolvedValue({ total: 0, items: [] })
  await actividadesApi.listar()
  expect(api.get).toHaveBeenCalledWith('/api/v1/activities')
})

it('listar con params arma la query', async () => {
  vi.mocked(api.get).mockResolvedValue({ total: 0, items: [] })
  await actividadesApi.listar({ deal_id: 9, status: 'pendiente' })
  expect(api.get).toHaveBeenCalledWith('/api/v1/activities?deal_id=9&status=pendiente')
})

it('crear postea el payload', async () => {
  vi.mocked(api.post).mockResolvedValue({})
  await actividadesApi.crear({ title: 'Llamar', activity_type: 'llamada', person_id: 3 })
  expect(api.post).toHaveBeenCalledWith('/api/v1/activities', {
    title: 'Llamar', activity_type: 'llamada', person_id: 3,
  })
})

it('editar patchea el payload parcial por id', async () => {
  vi.mocked(api.patch).mockResolvedValue({})
  await actividadesApi.editar(5, { title: 'Nuevo título' })
  expect(api.patch).toHaveBeenCalledWith('/api/v1/activities/5', { title: 'Nuevo título' })
})

it('marcarHecha pega al endpoint /done', async () => {
  vi.mocked(api.patch).mockResolvedValue({})
  await actividadesApi.marcarHecha(5)
  expect(api.patch).toHaveBeenCalledWith('/api/v1/activities/5/done')
})

it('cancelar pega al endpoint /cancel', async () => {
  vi.mocked(api.patch).mockResolvedValue({})
  await actividadesApi.cancelar(5)
  expect(api.patch).toHaveBeenCalledWith('/api/v1/activities/5/cancel')
})

it('eliminar pega al DELETE por id', async () => {
  vi.mocked(api.delete).mockResolvedValue(undefined)
  await actividadesApi.eliminar(5)
  expect(api.delete).toHaveBeenCalledWith('/api/v1/activities/5')
})
