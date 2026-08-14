import { render, screen } from '@testing-library/react'
import App from './App'
import { authApi } from './api/auth'
import { propiedadesApi } from './api/propiedades'

// El wiring de rutas es lo que se prueba acá; las dos APIs que tocan las
// pantallas admin al montar se mockean para que no salgan a la red.
vi.mock('./api/auth', () => ({
  authApi: {
    login: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
  },
}))

vi.mock('./api/propiedades', () => ({
  propiedadesApi: {
    listar: vi.fn(),
    ciudades: vi.fn(),
  },
}))

const meMock = vi.mocked(authApi.me)

const USUARIO = {
  id: 1,
  email: 'admin@mambo.com',
  is_active: true,
  roles: ['admin'],
  person_id: null,
}

/** Renderiza la app en una URL concreta: `App` trae su propio BrowserRouter. */
function renderEn(url: string) {
  window.history.pushState({}, '', url)
  return render(<App />)
}

beforeEach(() => {
  vi.clearAllMocks()
  meMock.mockResolvedValue(null)
  vi.mocked(propiedadesApi.listar).mockResolvedValue([])
  vi.mocked(propiedadesApi.ciudades).mockResolvedValue([])
})

describe('App — acceso al panel', () => {
  it('sin sesión, /admin termina en el login', async () => {
    renderEn('/admin')

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument()
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
  })

  it('sin sesión, el contenido del panel no aparece en ningún momento', async () => {
    renderEn('/admin/propiedades')

    // Verificación en curso: ni panel ni login todavía.
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText(/verificando/i)).toBeInTheDocument()

    await screen.findByRole('button', { name: 'Entrar' })
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('con sesión, /admin renderiza el panel', async () => {
    meMock.mockResolvedValue(USUARIO)

    renderEn('/admin')

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByText('admin@mambo.com')).toBeInTheDocument()
  })

  it('el sitio público no consulta la sesión: ahí no hay nada que proteger', async () => {
    renderEn('/propiedades')

    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(meMock).not.toHaveBeenCalled()
  })
})
