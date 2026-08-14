/**
 * Host de la API.
 *
 * En producción queda vacío a propósito: el front y la API se sirven bajo el
 * mismo origen porque `vercel.json` reenvía `/api/*` y `/auth/*` a Render. Que el
 * navegador vea un solo origen es lo que mantiene la cookie de sesión como
 * cookie propia (`SameSite=Lax`) y evita el CORS; si el front llamara al dominio
 * de Render directamente, la cookie pasaría a ser de terceros y Safari e iOS la
 * bloquearían, dejando el panel admin inaccesible en esos navegadores.
 *
 * En desarrollo apunta al uvicorn local. `VITE_API_URL` pisa ambos casos.
 */
export const BASE_URL =
  import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:8000' : '')

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface OpcionesRequest {
  /**
   * Deja pasar el 401 sin avisar al manejador global. Lo usan los endpoints de
   * auth, para los que un 401 es una respuesta normal —no hay sesión, o las
   * credenciales son incorrectas— y no una sesión que se cayó en pleno uso.
   */
  omitirSesionExpirada?: boolean
}

/**
 * Único suscriptor al 401: el contexto de sesión. La referencia vive acá, fuera
 * de React, porque `request` es una función suelta y no puede usar hooks; el
 * contexto se registra al montarse y se da de baja al desmontarse.
 */
let alExpirarSesion: (() => void) | null = null

/**
 * Registra el manejador global de 401 y devuelve la función para darlo de baja.
 * La baja solo limpia si el manejador sigue siendo el propio, para que un
 * desmontaje tardío no pise el registro de otro montaje.
 */
export function registrarSesionExpirada(manejador: () => void): () => void {
  alExpirarSesion = manejador
  return () => {
    if (alExpirarSesion === manejador) alExpirarSesion = null
  }
}

async function request<T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  opciones: OpcionesRequest = {},
): Promise<T> {
  // Con FormData dejamos que el navegador ponga el Content-Type (incluye el boundary
  // del multipart); con JSON lo seteamos y serializamos nosotros.
  const esFormData = body instanceof FormData

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: esFormData ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : esFormData ? body : JSON.stringify(body),
    // La sesión viaja en una cookie httponly y el front corre en otro origen que
    // la API (:5173 contra :8000): sin esto el navegador no la adjunta y toda
    // request autenticada vuelve 401.
    credentials: 'include',
  })

  // Sesión vencida o revocada mientras se trabajaba: se avisa una sola vez, al
  // contexto, que limpia el usuario y deja que las rutas protegidas manden al login.
  if (res.status === 401 && !opciones.omitirSesionExpirada) alExpirarSesion?.()

  if (res.status === 204) return undefined as T

  const data = await res.json()

  if (!res.ok) {
    const message = data?.detail ?? `Error ${res.status}`
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message))
  }

  return data as T
}

export const api = {
  get:    <T>(path: string, opciones?: OpcionesRequest)                 => request<T>('GET',    path, undefined, opciones),
  post:   <T>(path: string, body: unknown, opciones?: OpcionesRequest)  => request<T>('POST',   path, body,      opciones),
  put:    <T>(path: string, body: unknown, opciones?: OpcionesRequest)  => request<T>('PUT',    path, body,      opciones),
  delete: <T>(path: string, opciones?: OpcionesRequest)                 => request<T>('DELETE', path, undefined, opciones),
}
