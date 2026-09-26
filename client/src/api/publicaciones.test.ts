import { publicacionesApi } from './publicaciones'

it('urlDescarga apunta al endpoint del ZIP de esa publicación', () => {
  expect(publicacionesApi.urlDescarga(12)).toMatch(/\/api\/v1\/publicaciones\/12\/descargar$/)
})
