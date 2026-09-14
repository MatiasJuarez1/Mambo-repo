import { describe, it, expect } from 'vitest'
import { construirQuery } from './query'

describe('construirQuery', () => {
  it('devuelve cadena vacía para objeto vacío', () => {
    expect(construirQuery({} as object)).toBe('')
  })

  it('serializa un objeto simple', () => {
    const result = construirQuery({ a: '1', b: '2' })
    // URLSearchParams no garantiza orden, así que verificamos ambas opciones
    expect(result === '?a=1&b=2' || result === '?b=2&a=1').toBe(true)
  })

  it('omite valores undefined', () => {
    const result = construirQuery({ a: '1', b: undefined })
    expect(result).toBe('?a=1')
  })

  it('omite strings vacíos', () => {
    const result = construirQuery({ a: '1', b: '' })
    expect(result).toBe('?a=1')
  })

  it('omite tanto undefined como strings vacíos', () => {
    const result = construirQuery({ a: '1', b: undefined, c: '' })
    expect(result).toBe('?a=1')
  })

  it('serializa valores numéricos', () => {
    const result = construirQuery({ skip: 0, limit: 10 })
    expect(result === '?skip=0&limit=10' || result === '?limit=10&skip=0').toBe(true)
  })

  it('serializa valores booleanos', () => {
    const result = construirQuery({ active: true })
    expect(result).toBe('?active=true')
  })
})
