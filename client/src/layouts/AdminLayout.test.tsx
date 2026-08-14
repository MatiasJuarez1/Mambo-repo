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
              <Route path="propiedades" element={<p>Listado de propiedades</p>} />
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

// jsdom no calcula CSS: acá no se puede verificar que el sidebar esté fuera de
// pantalla ni que la topbar esté oculta en escritorio (eso va a la checklist
// manual). Lo que sí se puede verificar —y es lo que se rompe en silencio— es
// el contrato de comportamiento del drawer.
describe('AdminLayout — drawer móvil', () => {
  const hamburguesa = () => screen.getByRole('button', { name: 'Menú' })

  async function abrirMenu() {
    const usuario = userEvent.setup()
    renderPanel()
    await screen.findByText('Dashboard del panel')

    await usuario.click(hamburguesa())
    expect(hamburguesa()).toHaveAttribute('aria-expanded', 'true')

    return usuario
  }

  it('la hamburguesa apunta al sidebar y alterna aria-expanded', async () => {
    const usuario = userEvent.setup()
    renderPanel()
    await screen.findByText('Dashboard del panel')

    const sidebar = screen.getByRole('complementary', { name: 'Navegación del panel' })
    expect(hamburguesa()).toHaveAttribute('aria-controls', sidebar.id)
    expect(hamburguesa()).toHaveAttribute('aria-expanded', 'false')

    await usuario.click(hamburguesa())
    expect(hamburguesa()).toHaveAttribute('aria-expanded', 'true')

    await usuario.click(hamburguesa())
    expect(hamburguesa()).toHaveAttribute('aria-expanded', 'false')
  })

  it('al abrir, el foco va al primer enlace de la navegación', async () => {
    await abrirMenu()

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveFocus()
  })

  it('cierra con Escape', async () => {
    const usuario = await abrirMenu()

    await usuario.keyboard('{Escape}')

    expect(hamburguesa()).toHaveAttribute('aria-expanded', 'false')
  })

  it('cierra al hacer clic en el overlay', async () => {
    const usuario = await abrirMenu()

    await usuario.click(screen.getByTestId('admin-overlay'))

    expect(hamburguesa()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('admin-overlay')).not.toBeInTheDocument()
  })

  it('cierra al navegar a otra sección', async () => {
    const usuario = await abrirMenu()

    await usuario.click(screen.getByRole('link', { name: 'Propiedades' }))

    await screen.findByText('Listado de propiedades')
    expect(hamburguesa()).toHaveAttribute('aria-expanded', 'false')
  })

  it('bloquea el scroll del body mientras está abierto y lo restaura al cerrar', async () => {
    const usuario = await abrirMenu()

    expect(document.body.style.overflow).toBe('hidden')

    await usuario.keyboard('{Escape}')

    expect(document.body.style.overflow).toBe('')
  })

  it('no deja el body bloqueado si el panel se desmonta con el menú abierto', async () => {
    const usuario = userEvent.setup()
    const { unmount } = renderPanel()
    await screen.findByText('Dashboard del panel')

    await usuario.click(hamburguesa())
    expect(document.body.style.overflow).toBe('hidden')

    unmount()

    expect(document.body.style.overflow).toBe('')
  })

  it('la topbar rotula la sección en la que está el usuario', async () => {
    const usuario = await abrirMenu()
    expect(screen.getByText('Dashboard', { selector: '.admin-topbar-titulo' })).toBeInTheDocument()

    await usuario.click(screen.getByRole('link', { name: 'Propiedades' }))
    await screen.findByText('Listado de propiedades')

    expect(
      screen.getByText('Propiedades', { selector: '.admin-topbar-titulo' }),
    ).toBeInTheDocument()
  })
})
