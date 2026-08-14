import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import RutaProtegida from './RutaProtegida'
import { AuthProvider } from '../context/AuthContext'
import { authApi } from '../api/auth'

vi.mock('../api/auth', () => ({
  authApi: {
    login: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
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

/** Promesa que se resuelve cuando el test quiere: sirve para congelar la carga. */
function promesaManual<T>() {
  let resolver!: (valor: T) => void
  const promesa = new Promise<T>(r => { resolver = r })
  return { promesa, resolver }
}

/** Login de mentira que además delata de qué ruta lo mandaron. */
function LoginFalso() {
  const { state } = useLocation()
  return (
    <div>
      <p>Pantalla de login</p>
      <span data-testid="desde">{(state as { desde?: string } | null)?.desde ?? ''}</span>
    </div>
  )
}

function renderPanel(url = '/admin/propiedades') {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/admin/login" element={<LoginFalso />} />
          <Route path="/admin" element={<RutaProtegida />}>
            <Route path="propiedades" element={<p>Listado de propiedades</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  meMock.mockResolvedValue(null)
})

describe('RutaProtegida', () => {
  it('con sesión válida muestra el panel', async () => {
    meMock.mockResolvedValue(USUARIO)

    renderPanel()

    expect(await screen.findByText('Listado de propiedades')).toBeInTheDocument()
  })

  it('sin sesión manda al login', async () => {
    renderPanel()

    expect(await screen.findByText('Pantalla de login')).toBeInTheDocument()
    expect(screen.queryByText('Listado de propiedades')).not.toBeInTheDocument()
  })

  it('mientras verifica la sesión no muestra ni el panel ni el login', async () => {
    const { promesa, resolver } = promesaManual<typeof USUARIO | null>()
    meMock.mockReturnValue(promesa)

    renderPanel()

    // El requisito: el contenido admin no puede parpadear antes de la redirección.
    expect(screen.queryByText('Listado de propiedades')).not.toBeInTheDocument()
    expect(screen.queryByText('Pantalla de login')).not.toBeInTheDocument()
    expect(screen.getByText(/verificando/i)).toBeInTheDocument()

    resolver(USUARIO)
    await waitFor(() => expect(screen.getByText('Listado de propiedades')).toBeInTheDocument())
  })

  it('le pasa al login a dónde iba el usuario, para poder devolverlo ahí', async () => {
    renderPanel('/admin/propiedades')

    await screen.findByText('Pantalla de login')
    expect(screen.getByTestId('desde')).toHaveTextContent('/admin/propiedades')
  })
})
