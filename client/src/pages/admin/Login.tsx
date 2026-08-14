import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import './Login.css'

/**
 * Mensaje para el usuario a partir de lo que tiró el login.
 *
 * El cliente HTTP convierte el `detail` del backend en el `message` del Error
 * ("Credenciales incorrectas"), que ya viene redactado para mostrarse. Lo que no
 * se muestra es: un throw que no sea Error (la red caída) y el 422 de validación
 * de FastAPI, que llega con el detalle serializado en JSON —una lista de errores
 * por campo— y en pantalla sería un mamarracho.
 */
function mensajeDeError(e: unknown): string {
  const mensaje = e instanceof Error ? e.message : ''
  const esPresentable = mensaje !== '' && !mensaje.startsWith('[') && !mensaje.startsWith('{')

  return esPresentable ? mensaje : 'No pudimos iniciar sesión. Probá de nuevo.'
}

export default function Login() {
  const { usuario, cargando, login } = useAuth()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  // A dónde iba el usuario cuando lo mandaron al login (lo pone `RutaProtegida`).
  const destino = (location.state as { desde?: string } | null)?.desde ?? '/admin'

  // Con sesión viva esta pantalla no tiene sentido. Es también el camino por el
  // que sale del login al entrar: `login()` guarda el usuario en el contexto y
  // este mismo return se encarga de la redirección, sin un navigate() aparte.
  if (!cargando && usuario) return <Navigate to={destino} replace />

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      await login({ email, password })
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="login-marca">
          <span className="logo-mambo">Mambo</span>
          <span className="logo-groups">Group · Admin</span>
        </div>

        <h1 className="login-titulo">Ingresá al panel</h1>

        {error && (
          <p className="login-error" role="alert">{error}</p>
        )}

        <label className="login-label" htmlFor="login-email">Email</label>
        <input
          id="login-email"
          className="login-input"
          type="email"
          autoComplete="username"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />

        <label className="login-label" htmlFor="login-password">Contraseña</label>
        {/* El mínimo espeja el `min_length=6` de LoginRequest en el backend: sin
            esto, una contraseña más corta vuelve 422 en vez de 401. Ninguna
            contraseña válida puede tener menos, así que no deja a nadie afuera. */}
        <input
          id="login-password"
          className="login-input"
          type="password"
          autoComplete="current-password"
          minLength={6}
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />

        {/* Estilado en Login.css y no con las clases .btn del panel: esta
            pantalla vive fuera de AdminLayout y no debe depender de su hoja. */}
        <button type="submit" className="login-boton" disabled={enviando}>
          {enviando ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
