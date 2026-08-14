import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { authApi } from '../api/auth'
import { registrarSesionExpirada } from '../api/client'
import type { Credenciales, Usuario } from '../types/auth'

interface Sesion {
  /** Usuario conectado, o `null` si no hay sesión. */
  usuario: Usuario | null
  /** True mientras se resuelve la consulta inicial al backend. */
  cargando: boolean
  login: (credenciales: Credenciales) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<Sesion | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [cargando, setCargando] = useState(true)

  // La cookie de sesión es httponly, así que el JS no puede mirarla: la única
  // forma de saber si el usuario sigue conectado es preguntárselo al backend.
  // `vigente` evita escribir estado si el componente ya se desmontó.
  useEffect(() => {
    let vigente = true

    authApi
      .me()
      .then(u => { if (vigente) setUsuario(u) })
      .finally(() => { if (vigente) setCargando(false) })

    return () => { vigente = false }
  }, [])

  // Un 401 en cualquier request significa que la sesión se murió mientras se
  // trabajaba (venció o la revocaron). Solo se limpia el usuario: la redirección
  // la hace sola `RutaProtegida` al quedarse sin sesión, y así el 401 de una
  // pantalla pública no arrastra a nadie al login.
  useEffect(() => registrarSesionExpirada(() => setUsuario(null)), [])

  const login = useCallback(async (credenciales: Credenciales) => {
    setUsuario(await authApi.login(credenciales))
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } catch {
      // Si el backend no contesta igual cerramos acá: dejar la pantalla como si
      // el usuario siguiera adentro sería peor que perder la revocación remota.
    }
    setUsuario(null)
  }, [])

  return (
    <AuthContext.Provider value={{ usuario, cargando, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): Sesion {
  const contexto = useContext(AuthContext)
  if (!contexto) throw new Error('useAuth() necesita estar dentro de <AuthProvider>')
  return contexto
}
