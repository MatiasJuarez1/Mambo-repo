import { api, registrarSesionExpirada } from './client'

const fetchMock = vi.fn()

/** Respuesta mínima con lo que `request` mira: status, ok y json(). */
function respuesta(status: number, cuerpo: unknown = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => cuerpo,
  }
}

/** Baja del manejador global registrado en el test, si hubo alguno. */
let bajaManejador: (() => void) | null = null

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(respuesta(200, {}))
})

afterEach(() => {
  bajaManejador?.()
  bajaManejador = null
  vi.unstubAllGlobals()
})

/** Opciones con las que se llamó a `fetch` en la enésima request. */
function opcionesDeFetch(indice = 0) {
  return fetchMock.mock.calls[indice][1] as RequestInit
}

describe('client — cookie de sesión', () => {
  it('adjunta las credenciales en un GET', async () => {
    await api.get('/api/v1/propiedades')

    expect(opcionesDeFetch().credentials).toBe('include')
  })

  it('adjunta las credenciales también al escribir', async () => {
    await api.post('/api/v1/propiedades', { titulo: 'Casa' })
    await api.put('/api/v1/propiedades/1', { titulo: 'Casa' })
    await api.delete('/api/v1/propiedades/1')

    expect(opcionesDeFetch(0).credentials).toBe('include')
    expect(opcionesDeFetch(1).credentials).toBe('include')
    expect(opcionesDeFetch(2).credentials).toBe('include')
  })

  it('no rompe el envío de FormData: sigue sin Content-Type propio', async () => {
    const fd = new FormData()

    await api.post('/api/v1/propiedades/1/medios/upload', fd)

    expect(opcionesDeFetch().headers).toBeUndefined()
    expect(opcionesDeFetch().body).toBe(fd)
    expect(opcionesDeFetch().credentials).toBe('include')
  })
})

describe('client — manejo global del 401', () => {
  it('avisa al manejador cuando una request cae por sesión vencida', async () => {
    const alExpirar = vi.fn()
    bajaManejador = registrarSesionExpirada(alExpirar)
    fetchMock.mockResolvedValue(respuesta(401, { detail: 'No autenticado' }))

    await expect(api.get('/api/v1/propiedades')).rejects.toThrow('No autenticado')

    expect(alExpirar).toHaveBeenCalledTimes(1)
  })

  it('no avisa cuando la request pide omitirlo: los endpoints de auth esperan el 401', async () => {
    const alExpirar = vi.fn()
    bajaManejador = registrarSesionExpirada(alExpirar)
    fetchMock.mockResolvedValue(respuesta(401, { detail: 'No autenticado' }))

    await expect(
      api.get('/auth/me', { omitirSesionExpirada: true }),
    ).rejects.toThrow('No autenticado')

    expect(alExpirar).not.toHaveBeenCalled()
  })

  it('otros errores no cuentan como sesión vencida', async () => {
    const alExpirar = vi.fn()
    bajaManejador = registrarSesionExpirada(alExpirar)
    fetchMock.mockResolvedValue(respuesta(403, { detail: 'Permisos insuficientes' }))

    await expect(api.get('/api/v1/propiedades')).rejects.toThrow('Permisos insuficientes')

    expect(alExpirar).not.toHaveBeenCalled()
  })

  it('dado de baja el manejador, un 401 ya no avisa a nadie', async () => {
    const alExpirar = vi.fn()
    registrarSesionExpirada(alExpirar)()
    fetchMock.mockResolvedValue(respuesta(401, { detail: 'No autenticado' }))

    await expect(api.get('/api/v1/propiedades')).rejects.toThrow('No autenticado')

    expect(alExpirar).not.toHaveBeenCalled()
  })
})
