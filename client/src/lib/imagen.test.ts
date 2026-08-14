import { ANCHO_MINIATURA, srcSetDeMedio, urlDeVariante, type MedioConVariantes } from './imagen'
import { BASE_URL } from '../api/client'

/**
 * `BASE_URL` sale de la config y no se escribe a mano acá: en desarrollo apunta
 * al uvicorn local y en producción queda vacío, y el test tiene que valer en los
 * dos casos. Lo que se verifica es que las variantes se resuelvan igual que `url`.
 */
function medio(over: Partial<MedioConVariantes> = {}): MedioConVariantes {
  return {
    url: '/media/propiedades/ab12.jpg',
    variantes: null,
    ...over,
  }
}

describe('srcSetDeMedio', () => {
  it('arma un candidato por variante, con el ancho como descriptor `w`', () => {
    const src = srcSetDeMedio(medio({
      variantes: {
        '400':  '/media/propiedades/ab12_400.jpg',
        '800':  '/media/propiedades/ab12_800.jpg',
        '1600': '/media/propiedades/ab12_1600.jpg',
      },
    }))

    expect(src).toBe(
      `${BASE_URL}/media/propiedades/ab12_400.jpg 400w, ` +
      `${BASE_URL}/media/propiedades/ab12_800.jpg 800w, ` +
      `${BASE_URL}/media/propiedades/ab12_1600.jpg 1600w`,
    )
  })

  it('devuelve undefined sin variantes, para que el <img> salga con `src` a secas', () => {
    // `undefined` y no `''`: React omite el atributo entero, que es el
    // comportamiento anterior a las variantes.
    expect(srcSetDeMedio(medio({ variantes: null }))).toBeUndefined()
  })

  it('trata un diccionario vacío como si no hubiera variantes', () => {
    expect(srcSetDeMedio(medio({ variantes: {} }))).toBeUndefined()
  })

  it('con una sola variante arma un srcset de un solo candidato', () => {
    // Una foto de 600px genera solo la de 400: el backend saltea los anchos que
    // no reducen nada. Iterar las tres a ciegas apuntaría a archivos inexistentes.
    const src = srcSetDeMedio(medio({
      variantes: { '400': '/media/propiedades/ab12_400.jpg' },
    }))

    expect(src).toBe(`${BASE_URL}/media/propiedades/ab12_400.jpg 400w`)
  })

  it('no anuncia la imagen completa: su ancho real no se conoce', () => {
    const src = srcSetDeMedio(medio({
      url: '/media/propiedades/ab12.jpg',
      variantes: { '400': '/media/propiedades/ab12_400.jpg' },
    }))

    expect(src).not.toContain('/media/propiedades/ab12.jpg ')
    expect(src).not.toContain('1920w')
  })

  it('ordena los candidatos de menor a mayor aunque lleguen desordenados', () => {
    const src = srcSetDeMedio(medio({
      variantes: { '1600': '/g.jpg', '400': '/ch.jpg', '800': '/m.jpg' },
    }))

    expect(src).toBe(`${BASE_URL}/ch.jpg 400w, ${BASE_URL}/m.jpg 800w, ${BASE_URL}/g.jpg 1600w`)
  })

  it('deja las URLs absolutas intactas (R2 en producción)', () => {
    const src = srcSetDeMedio(medio({
      url: 'https://pub-x.r2.dev/propiedades/ab12.jpg',
      variantes: { '800': 'https://pub-x.r2.dev/propiedades/ab12_800.jpg' },
    }))

    expect(src).toBe('https://pub-x.r2.dev/propiedades/ab12_800.jpg 800w')
  })

  it('descarta una clave que no es un ancho, sin invalidar el resto', () => {
    // Un candidato con descriptor inválido invalida el `srcset` entero en el
    // navegador, así que se filtra acá.
    const src = srcSetDeMedio(medio({
      variantes: { grande: '/x.jpg', '400': '/ch.jpg' },
    }))

    expect(src).toBe(`${BASE_URL}/ch.jpg 400w`)
  })
})

describe('urlDeVariante', () => {
  it('usa la variante del ancho pedido cuando existe', () => {
    const m = medio({ variantes: { '400': '/media/propiedades/ab12_400.jpg' } })

    expect(urlDeVariante(m, ANCHO_MINIATURA)).toBe(`${BASE_URL}/media/propiedades/ab12_400.jpg`)
  })

  it('cae a la imagen completa si esa variante no se generó', () => {
    const m = medio({ variantes: { '800': '/media/propiedades/ab12_800.jpg' } })

    expect(urlDeVariante(m, ANCHO_MINIATURA)).toBe(`${BASE_URL}/media/propiedades/ab12.jpg`)
  })

  it('cae a la imagen completa cuando el medio no tiene variantes', () => {
    expect(urlDeVariante(medio(), ANCHO_MINIATURA)).toBe(`${BASE_URL}/media/propiedades/ab12.jpg`)
  })
})
