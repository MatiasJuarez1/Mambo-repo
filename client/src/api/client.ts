export const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

async function request<T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
): Promise<T> {
  // Con FormData dejamos que el navegador ponga el Content-Type (incluye el boundary
  // del multipart); con JSON lo seteamos y serializamos nosotros.
  const esFormData = body instanceof FormData

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: esFormData ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : esFormData ? body : JSON.stringify(body),
  })

  if (res.status === 204) return undefined as T

  const data = await res.json()

  if (!res.ok) {
    const message = data?.detail ?? `Error ${res.status}`
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message))
  }

  return data as T
}

export const api = {
  get:    <T>(path: string)                  => request<T>('GET',    path),
  post:   <T>(path: string, body: unknown)   => request<T>('POST',   path, body),
  put:    <T>(path: string, body: unknown)   => request<T>('PUT',    path, body),
  delete: <T>(path: string)                  => request<T>('DELETE', path),
}
