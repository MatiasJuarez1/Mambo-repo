import { documentosApi, paramsDeEntidad } from './documentos'
import { api } from './client'

vi.mock('./client', () => ({ api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }))

beforeEach(() => vi.clearAllMocks())

it('paramsDeEntidad traduce cada variante a su query param', () => {
  expect(paramsDeEntidad({ propiedadId: 7 })).toEqual({ propiedad_id: 7 })
  expect(paramsDeEntidad({ personaId: 3 })).toEqual({ persona_id: 3 })
  expect(paramsDeEntidad({ dealId: 9 })).toEqual({ deal_id: 9 })
  expect(paramsDeEntidad({ contratoId: 2 })).toEqual({ contrato_id: 2 })
})

it('listar pega al endpoint con el filtro de la entidad', async () => {
  vi.mocked(api.get).mockResolvedValue([])
  await documentosApi.listar({ dealId: 9 })
  expect(api.get).toHaveBeenCalledWith('/api/v1/documentos?deal_id=9')
})

it('subir manda FormData con tipo, archivo y la entidad', async () => {
  vi.mocked(api.post).mockResolvedValue({})
  const archivo = new File(['x'], 'dni.pdf', { type: 'application/pdf' })
  await documentosApi.subir({ personaId: 3 }, 'dni', archivo)
  const [ruta, body] = vi.mocked(api.post).mock.calls[0]
  expect(ruta).toBe('/api/v1/documentos')
  expect(body).toBeInstanceOf(FormData)
  const fd = body as FormData
  expect(fd.get('tipo')).toBe('dni')
  expect(fd.get('persona_id')).toBe('3')
  expect(fd.get('archivo')).toBe(archivo)
})

it('eliminar pega al DELETE por id', async () => {
  vi.mocked(api.delete).mockResolvedValue(undefined)
  await documentosApi.eliminar(12)
  expect(api.delete).toHaveBeenCalledWith('/api/v1/documentos/12')
})
