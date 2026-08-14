import { authApi } from './auth'
import { api } from './client'

vi.mock('./client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

const getMock = vi.mocked(api.get)
const postMock = vi.mocked(api.post)

const USUARIO = {
  id: 1,
  email: 'admin@mambo.com',
  is_active: true,
  roles: ['admin'],
  person_id: null,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('authApi.login', () => {
  it('postea las credenciales a /auth/login, sin el prefijo /api/v1', async () => {
    postMock.mockResolvedValue({ message: 'Sesión iniciada', user: USUARIO })

    const usuario = await authApi.login({ email: 'admin@mambo.com', password: 'secreta' })

    expect(postMock).toHaveBeenCalledWith(
      '/auth/login',
      { email: 'admin@mambo.com', password: 'secreta' },
      expect.objectContaining({ omitirSesionExpirada: true }),
    )
    expect(usuario).toEqual(USUARIO)
  })

  it('propaga el error de credenciales incorrectas para que lo muestre la pantalla', async () => {
    postMock.mockRejectedValue(new Error('Credenciales inválidas'))

    await expect(
      authApi.login({ email: 'admin@mambo.com', password: 'mala' }),
    ).rejects.toThrow('Credenciales inválidas')
  })
})

describe('authApi.me', () => {
  it('devuelve el usuario de la sesión vigente', async () => {
    getMock.mockResolvedValue(USUARIO)

    await expect(authApi.me()).resolves.toEqual(USUARIO)
    expect(getMock).toHaveBeenCalledWith(
      '/auth/me',
      expect.objectContaining({ omitirSesionExpirada: true }),
    )
  })

  it('devuelve null si no hay sesión: el 401 acá es la respuesta esperada', async () => {
    getMock.mockRejectedValue(new Error('No autenticado'))

    await expect(authApi.me()).resolves.toBeNull()
  })
})

describe('authApi.logout', () => {
  it('postea a /auth/logout sin cuerpo', async () => {
    postMock.mockResolvedValue({ message: 'Sesión cerrada' })

    await authApi.logout()

    expect(postMock).toHaveBeenCalledWith('/auth/logout', undefined)
  })
})
