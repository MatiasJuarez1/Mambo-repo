/** La moneda con más filas del reporte; empate → la primera en orden alfabético; vacío → ARS. */
export function monedaMasFrecuente(filas: { moneda: string }[]): string {
  const conteo = new Map<string, number>()
  filas.forEach(f => conteo.set(f.moneda, (conteo.get(f.moneda) ?? 0) + 1))
  return [...conteo.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? 'ARS'
}
