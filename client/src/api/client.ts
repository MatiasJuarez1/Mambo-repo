const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

async function request<T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
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
