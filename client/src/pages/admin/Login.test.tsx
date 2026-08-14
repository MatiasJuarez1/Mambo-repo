import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Login from './Login'
import { AuthProvider } from '../../context/AuthContext'
import { authApi } from '../../api/auth'

vi.mock('../../api/auth', () => ({
  authApi: {
    login: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
  },
}))

const meMock = vi.mocked(authApi.me)
const loginMock = vi.mocked(authApi.login)

const USUARIO = {
  id: 1,
  email: 'admin@mambo.com',
  is_active: true,
  roles: ['admin'],
  person_id: null,
}

/**
 * Monta el login con el resto del panel de mentira alrededor, para poder ver a
 * dónde termina yendo el usuario. `state` simula la ruta que lo mandó acá.
 */
function renderLogin(state?: { desde: string }) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[{ pathname: '/admin/login', state }]}>
        <Routes>
          <Route path="/admin/login" element={<Login />} />
          <Route path="/admin" element={<p>Dashboard del panel</p>} />
          <Route path="/admin/propiedades" element={<p>Listado de propiedades</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
}

function campoEmail() {
  return screen.getByLabelText('Email')
}

function campoContrasena() {
  return screen.getByLabelText('Contraseña')
}

function botonEntrar() {
  return screen.getByRole('button', { name: 'Entrar' })
}

/** Completa el formulario y lo envía. */
async function entrar(usuario: ReturnType<typeof userEvent.setup>, password = 'secreta') {
  await usuario.type(campoEmail(), 'admin@mambo.com')
  await usuario.type(campoContrasena(), password)
  await usuario.click(botonEntrar())
}

beforeEach(() => {
  vi.clearAllMocks()
  meMock.mockResolvedValue(null)
})

describe('Login — formulario', () => {
  it('tiene los dos campos con su etiqueta asociada', async () => {
    renderLogin()

    expect(campoEmail()).toHaveAttribute('type', 'email')
    expect(campoContrasena()).toHaveAttribute('type', 'password')
    await waitFor(() => expect(meMock).toHaveBeenCalled())
  })
})

describe('Login — entrada exitosa', () => {
  it('manda las credenciales y lleva al panel', async () => {
    const usuario = userEvent.setup()
    loginMock.mockResolvedValue(USUARIO)
    renderLogin()

    await entrar(usuario)

    expect(loginMock).toHaveBeenCalledWith({
      email: 'admin@mambo.com',
      password: 'secreta',
    })
    expect(await screen.findByText('Dashboard del panel')).toBeInTheDocument()
  })

  it('devuelve al usuario a la pantalla que había pedido antes del desalojo', async () => {
    const usuario = userEvent.setup()
    loginMock.mockResolvedValue(USUARIO)
    renderLogin({ desde: '/admin/propiedades' })

    await entrar(usuario)

    expect(await screen.findByText('Listado de propiedades')).toBeInTheDocument()
  })

  it('con una sesión ya abierta pasa de largo sin mostrar el formulario', async () => {
    meMock.mockResolvedValue(USUARIO)

    renderLogin()

    expect(await screen.findByText('Dashboard del panel')).toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
  })
})

describe('Login — credenciales incorrectas', () => {
  it('muestra el error del backend y se queda en la pantalla', async () => {
    const usuario = userEvent.setup()
    loginMock.mockRejectedValue(new Error('Credenciales inválidas'))
    renderLogin()

    await entrar(usuario, 'incorrecta')

    // role="alert" para que el lector de pantalla lo anuncie sin buscarlo.
    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciales inválidas')
    expect(screen.queryByText('Dashboard del panel')).not.toBeInTheDocument()
    expect(campoEmail()).toBeInTheDocument()
  })

  it('un reintento limpia el error anterior antes de mostrar el nuevo resultado', async () => {
    const usuario = userEvent.setup()
    loginMock.mockRejectedValueOnce(new Error('Credenciales inválidas'))
    loginMock.mockResolvedValue(USUARIO)
    renderLogin()

    await entrar(usuario, 'incorrecta')
    await screen.findByRole('alert')

    await usuario.click(botonEntrar())

    expect(await screen.findByText('Dashboard del panel')).toBeInTheDocument()
  })

  it('si el backend no contesta muestra un mensaje entendible, no un error crudo', async () => {
    const usuario = userEvent.setup()
    loginMock.mockRejectedValue('sin conexión')
    renderLogin()

    await entrar(usuario)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos iniciar sesión. Probá de nuevo.',
    )
  })

  it('no vuelca en pantalla el JSON de un 422 de validación', async () => {
    const usuario = userEvent.setup()
    // Así llega el detail de FastAPI cuando falla la validación del cuerpo:
    // una lista de errores por campo que el cliente HTTP serializa al mensaje.
    loginMock.mockRejectedValue(
      new Error('[{"loc":["body","password"],"msg":"String should have at least 6 characters"}]'),
    )
    renderLogin()

    await entrar(usuario)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos iniciar sesión. Probá de nuevo.',
    )
  })
})
