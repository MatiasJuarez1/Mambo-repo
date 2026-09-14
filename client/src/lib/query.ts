/**
 * Construye una cadena de parámetros de URL omitiendo valores undefined y strings vacíos.
 * @param params Objeto con parámetros a serializar
 * @returns Cadena vacía si no hay parámetros, o `?a=1&b=2` si los hay
 */
export function construirQuery(params: object): string {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') q.set(k, String(v))
  })
  const s = q.toString()
  return s ? `?${s}` : ''
}
