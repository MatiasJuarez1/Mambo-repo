import { diasHasta, formatearFecha, formatearMonto } from './formato'

describe('formatearMonto', () => {
  it('usa separador de miles argentino y la moneda adelante', () => {
    expect(formatearMonto(1234567.5, 'USD')).toBe('USD 1.234.567,5')
  })
  it('devuelve un guion sin monto', () => {
    expect(formatearMonto(null, 'ARS')).toBe('—')
  })
})

describe('formatearFecha', () => {
  it('muestra dd/mm/aaaa', () => {
    expect(formatearFecha('2026-09-11T15:00:00Z')).toBe('11/09/2026')
  })
  it('devuelve un guion sin fecha', () => {
    expect(formatearFecha(null)).toBe('—')
  })
})

describe('diasHasta', () => {
  it('cuenta días enteros desde hoy, negativo si ya pasó', () => {
    const hoy = new Date('2026-09-11T12:00:00Z')
    expect(diasHasta('2026-09-14T00:00:00Z', hoy)).toBe(2)
    expect(diasHasta('2026-09-10T00:00:00Z', hoy)).toBe(-2)
    expect(diasHasta(null, hoy)).toBeNull()
  })
})
