import {
  diasHasta, etiquetaMes, etiquetaMesCorta, formatearFecha, formatearFechaHora, formatearMonto, formatearPorcentaje,
  formatearTamano,
} from './formato'

describe('formatearMonto', () => {
  it('usa separador de miles argentino y la moneda adelante', () => {
    expect(formatearMonto(1234567.5, 'USD')).toBe('USD 1.234.567,5')
  })
  it('devuelve un guion sin monto', () => {
    expect(formatearMonto(null, 'ARS')).toBe('—')
  })
  it('acepta el string decimal que manda el backend', () => {
    expect(formatearMonto('150000.00', 'ARS')).toBe('ARS 150.000')
    expect(formatearMonto('no-numero', 'ARS')).toBe('—')
  })
})

describe('formatearFecha', () => {
  it('muestra dd/mm/aaaa', () => {
    expect(formatearFecha('2026-09-11T15:00:00Z')).toBe('11/09/2026')
  })
  it('acepta una fecha sin hora, como las `date` del backend', () => {
    expect(formatearFecha('2026-09-11')).toBe('11/09/2026')
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

describe('etiquetas de mes y porcentaje (reportes)', () => {
  it('etiquetaMes y etiquetaMesCorta', () => {
    expect(etiquetaMes('2026-09')).toBe('sep 2026')
    expect(etiquetaMesCorta('2026-09')).toBe('sep 26')
    expect(etiquetaMes('total')).toBe('Total')
  })

  it('formatearPorcentaje acepta string, number y null', () => {
    expect(formatearPorcentaje('33.33')).toBe('33,33 %')
    expect(formatearPorcentaje(3)).toBe('3 %')
    expect(formatearPorcentaje(null)).toBe('—')
  })
})

describe('formatearTamano', () => {
  it('bytes, KB y MB con una decimal y coma', () => {
    expect(formatearTamano(0)).toBe('0 B')
    expect(formatearTamano(512)).toBe('512 B')
    expect(formatearTamano(1024)).toBe('1 KB')
    expect(formatearTamano(348_160)).toBe('340 KB')
    expect(formatearTamano(1_258_291)).toBe('1,2 MB')
    expect(formatearTamano(10 * 1024 * 1024)).toBe('10 MB')
  })
})

describe('formatearFechaHora', () => {
  it('DD/MM/YYYY HH:mm en hora local (el ISO se arma desde partes locales para que el test no dependa del huso)', () => {
    expect(formatearFechaHora(null)).toBe('—')
    expect(formatearFechaHora(new Date(2026, 8, 22, 10, 0).toISOString())).toBe('22/09/2026 10:00')
    expect(formatearFechaHora(new Date(2026, 0, 5, 9, 5).toISOString())).toBe('05/01/2026 09:05')
  })
})
