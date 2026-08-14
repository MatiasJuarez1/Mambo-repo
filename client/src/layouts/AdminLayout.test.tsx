import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AdminLayout from './AdminLayout'
import RutaProtegida from '../components/RutaProtegida'
import { AuthProvider } from '../context/AuthContext'
import { authApi } from '../api/auth'
import { api } from '../api/client'

vi.mock('../api/auth', () => ({
  authApi: {
    login: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
  },
}))

const meMock = vi.mocked(authApi.me)
const logoutMock = vi.mocked(authApi.logout)

const USUARIO = {
  id: 1,
  email: 'admin@mambo.com',
  is_active: true,
  roles: ['admin'],
  person_id: null,
}

// Se monta el panel con su ruta protegida encima, que es como vive en la app:
// así se ve de verdad a dónde cae el usuario después de salir.
function renderPanel() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/admin/login" element={<p>Pantalla de login</p>} />
          <Route path="/admin" element={<RutaProtegida />}>
            <Route element={<AdminLayout />}>
              <Route index element={<p>Dashboard del panel</p>} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  meMock.mockResolvedValue(USUARIO)
  logoutMock.mockResolvedValue({ message: 'Sesión cerrada' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AdminLayout — sesión', () => {
  it('muestra el email del usuario conectado', async () => {
    renderPanel()

    expect(await screen.findByText('admin@mambo.com')).toBeInTheDocument()
  })

  it('el botón de salir cierra la sesión y deja al usuario en el login', async () => {
    const usuario = userEvent.setup()
    renderPanel()
    await screen.findByText('Dashboard del panel')

    await usuario.click(screen.getByRole('button', { name: 'Salir' }))

    expect(logoutMock).toHaveBeenCalled()
    await waitFor(() => expect(screen.getByText('Pantalla de login')).toBeInTheDocument())
    expect(screen.queryByText('Dashboard del panel')).not.toBeInTheDocument()
  })

  it('si el token vence en pleno uso, el 401 saca al usuario del panel', async () => {
    renderPanel()
    await screen.findByText('Dashboard del panel')

    // Cualquier request del panel —guardar una propiedad, listar— vuelve 401.
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

    expect(screen.getByText('Pantalla de login')).toBeInTheDocument()
    expect(screen.queryByText('Dashboard del panel')).not.toBeInTheDocument()
  })
})
