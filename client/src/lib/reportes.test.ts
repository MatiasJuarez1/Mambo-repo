import { monedaMasFrecuente } from './reportes'

it('monedaMasFrecuente: la más repetida, empate alfabético, vacío ARS', () => {
  expect(monedaMasFrecuente([{ moneda: 'USD' }, { moneda: 'USD' }, { moneda: 'ARS' }])).toBe('USD')
  expect(monedaMasFrecuente([{ moneda: 'USD' }, { moneda: 'ARS' }])).toBe('ARS')
  expect(monedaMasFrecuente([])).toBe('ARS')
})
