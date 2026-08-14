/** Usuario del panel, tal como lo devuelven `POST /auth/login` y `GET /auth/me`. */
export interface Usuario {
  id: number
  email: string
  is_active: boolean
  /** Roles del backend. `admin` habilita el panel; `staff`, la carga de contenido. */
  roles: string[]
  person_id: number | null
}

export interface Credenciales {
  email: string
  password: string
}

/**
 * Cuerpo de `POST /auth/login`. El token **no** viene acá: viaja en una cookie
 * httponly que el JS no puede leer. Lo único aprovechable del cuerpo es `user`.
 */
export interface RespuestaLogin {
  message: string
  user: Usuario
}
