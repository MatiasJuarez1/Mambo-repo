import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthProvider, useAuth } from './AuthContext'
import { authApi } from '../api/auth'
import { api } from '../api/client'

// Se mockea solo la capa de auth: `api/client` queda real para poder probar que
// un 401 de cualquier endpoint desaloja la sesión.
vi.mock('../api/auth', () => ({
  authApi: {
    login: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
  },
}))

const meMock = vi.mocked(authApi.me)
const loginMock = vi.mocked(authApi.login)
const logoutMock = vi.mocked(authApi.logout)

const USUARIO = {
  id: 1,
  email: 'admin@mambo.com',
  is_active: true,
  roles: ['admin'],
  person_id: null,
}

/** Ventana al contexto: muestra el estado y deja disparar login / logout. */
function Sonda() {
  const { usuario, cargando, login, logout } = useAuth()

  return (
    <div>
      <p data-testid="estado">
        {cargando ? 'verificando' : usuario ? usuario.email : 'sin sesión'}
      </p>
      <button onClick={() => login({ email: 'admin@mambo.com', password: 'secreta' }).catch(() => {})}>
        Entrar
      </button>
      <button onClick={() => logout()}>Salir</button>
    </div>
  )
}

function renderSonda() {
  return render(
    <AuthProvider>
      <Sonda />
    </AuthProvider>,
  )
}

function estado() {
  return screen.getByTestId('estado')
}

beforeEach(() => {
  vi.clearAllMocks()
  meMock.mockResolvedValue(null)
  logoutMock.mockResolvedValue({ message: 'Sesión cerrada' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AuthContext — sesión al montar', () => {
  it('le pregunta al backend si hay sesión viva, porque la cookie es httponly', async () => {
    meMock.mockResolvedValue(USUARIO)

    renderSonda()

    // Antes de que conteste el backend no se afirma nada sobre la sesión.
    expect(estado()).toHaveTextContent('verificando')

    await waitFor(() => expect(estado()).toHaveTextContent('admin@mambo.com'))
    expect(meMock).toHaveBeenCalled()
  })

  it('sin sesión deja de cargar y queda sin usuario', async () => {
    renderSonda()

    await waitFor(() => expect(estado()).toHaveTextContent('sin sesión'))
  })
})

describe('AuthContext — login y logout', () => {
  it('login guarda el usuario que devuelve la API', async () => {
    const usuario = userEvent.setup()
    loginMock.mockResolvedValue(USUARIO)
    renderSonda()
    await waitFor(() => expect(estado()).toHaveTextContent('sin sesión'))

    await usuario.click(screen.getByRole('button', { name: 'Entrar' }))

    await waitFor(() => expect(estado()).toHaveTextContent('admin@mambo.com'))
    expect(loginMock).toHaveBeenCalledWith({ email: 'admin@mambo.com', password: 'secreta' })
  })

  it('un login fallido deja la sesión como estaba y propaga el error', async () => {
    const usuario = userEvent.setup()
    loginMock.mockRejectedValue(new Error('Credenciales inválidas'))
    renderSonda()
    await waitFor(() => expect(estado()).toHaveTextContent('sin sesión'))

    await usuario.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(estado()).toHaveTextContent('sin sesión')
  })

  it('logout avisa al backend y limpia el usuario', async () => {
    const usuario = userEvent.setup()
    meMock.mockResolvedValue(USUARIO)
    renderSonda()
    await waitFor(() => expect(estado()).toHaveTextContent('admin@mambo.com'))

    await usuario.click(screen.getByRole('button', { name: 'Salir' }))

    await waitFor(() => expect(estado()).toHaveTextContent('sin sesión'))
    expect(logoutMock).toHaveBeenCalled()
  })

  it('si el logout del backend falla, en este navegador la sesión se cierra igual', async () => {
    const usuario = userEvent.setup()
    meMock.mockResolvedValue(USUARIO)
    logoutMock.mockRejectedValue(new Error('502'))
    renderSonda()
    await waitFor(() => expect(estado()).toHaveTextContent('admin@mambo.com'))

    await usuario.click(screen.getByRole('button', { name: 'Salir' }))

    await waitFor(() => expect(estado()).toHaveTextContent('sin sesión'))
  })
})

describe('AuthContext — 401 global', () => {
  it('un 401 de cualquier endpoint desaloja la sesión', async () => {
    meMock.mockResolvedValue(USUARIO)
    renderSonda()
    await waitFor(() => expect(estado()).toHaveTextContent('admin@mambo.com'))

    // Token vencido en pleno uso: la request siguiente vuelve 401.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 401,
        ok: false,
        json: async () => ({ detail: 'No autenticado' }),
      }),
    )
    await act(async () => {
      await api.get('/api/v1/propiedades').catch(() => {})
    })

    expect(estado()).toHaveTextContent('sin sesión')
  })
})
