import { etapaInicialSegunOperacion, LABEL_ROL, rolInicialSegunOperacion } from './crm'

describe('rolInicialSegunOperacion', () => {
  it('comprador para venta, inquilino para alquiler y temporal', () => {
    expect(rolInicialSegunOperacion('venta')).toBe('comprador')
    expect(rolInicialSegunOperacion('alquiler')).toBe('inquilino')
    expect(rolInicialSegunOperacion('temporal')).toBe('inquilino')
  })
})

describe('etapaInicialSegunOperacion', () => {
  it('una reserva convertida entra en Oferta (venta) o Reserva (alquiler)', () => {
    expect(etapaInicialSegunOperacion('venta')).toEqual({ pipeline: 'Venta', etapa: 'Oferta' })
    expect(etapaInicialSegunOperacion('alquiler')).toEqual({ pipeline: 'Alquiler', etapa: 'Reserva' })
  })
})

it('todos los roles tienen etiqueta', () => {
  expect(Object.keys(LABEL_ROL)).toEqual(
    expect.arrayContaining(['propietario', 'comprador', 'vendedor', 'inquilino', 'interesado']),
  )
})
