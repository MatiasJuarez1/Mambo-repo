import { SERVICIOS, SERVICIOS_INTRO } from './catalogo-servicios'

describe('SERVICIOS', () => {
  it('tiene exactamente cinco servicios', () => {
    expect(SERVICIOS).toHaveLength(5)
  })

  it('no repite slugs (se usan como anclas de URL)', () => {
    const slugs = SERVICIOS.map(s => s.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('todos los slugs tienen contenido', () => {
    SERVICIOS.forEach(s => {
      expect(s.slug.trim()).not.toBe('')
    })
  })

  it('ningún servicio se queda sin items', () => {
    SERVICIOS.forEach(s => {
      expect(s.items.length).toBeGreaterThan(0)
    })
  })

  it('numera de 01 a 05 en orden', () => {
    expect(SERVICIOS.map(s => s.num)).toEqual(['01', '02', '03', '04', '05'])
  })

  it('todos tienen título y bajada', () => {
    SERVICIOS.forEach(s => {
      expect(s.titulo.trim()).not.toBe('')
      expect(s.bajada.trim()).not.toBe('')
    })
  })
})

describe('SERVICIOS_INTRO', () => {
  it('no está vacío', () => {
    expect(SERVICIOS_INTRO.trim()).not.toBe('')
  })
})
