import { api } from './client'
import type { Credenciales, RespuestaLogin, Usuario } from '../types/auth'

// Los endpoints de sesión cuelgan de la raíz: a diferencia de las propiedades,
// no van bajo /api/v1.
const BASE = '/auth'

// Un 401 en estos tres endpoints es una respuesta esperada (no hay sesión o las
// credenciales no sirven), no una sesión que se cayó en pleno uso: se los excluye
// del manejador global para que no dispare el desalojo.
const SIN_DESALOJO = { omitirSesionExpirada: true } as const

export const authApi = {
  /** Inicia sesión y devuelve el usuario. La sesión queda en la cookie httponly. */
  login: async (credenciales: Credenciales): Promise<Usuario> => {
    const { user } = await api.post<RespuestaLogin>(`${BASE}/login`, credenciales, SIN_DESALOJO)
    return user
  },

  logout: () => api.post<{ message: string }>(`${BASE}/logout`, undefined),

  /**
   * Usuario de la sesión vigente, o `null` si no hay ninguna.
   *
   * Preguntarle al backend es la única vía: la cookie es httponly y el JS no
   * puede leerla. Cualquier fallo —401, red caída, backend abajo— se resuelve
   * como "sin sesión": es lo seguro, porque el panel no se abre sin usuario.
   */
  me: async (): Promise<Usuario | null> => {
    try {
      return await api.get<Usuario>(`${BASE}/me`, SIN_DESALOJO)
    } catch {
      return null
    }
  },
}
