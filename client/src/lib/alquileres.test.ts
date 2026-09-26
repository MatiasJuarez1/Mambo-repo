import {
  calcularMontoNuevo, chipRecordatorio, coeficienteDesdePorcentaje, diasEntre, etiquetaEstadoCobro,
  etiquetaTipoRecordatorio, generarFechasAjuste, mesAnterior, nombreMes, periodoYm, sumarDias, sumarMeses,
} from './alquileres'

describe('sumarMeses', () => {
  it('suma meses y recorta al último día del mes destino', () => {
    expect(sumarMeses('2026-01-31', 1)).toBe('2026-02-28')
    expect(sumarMeses('2026-11-15', 3)).toBe('2027-02-15')
    expect(sumarMeses('2026-03-01', 24)).toBe('2028-03-01')
  })
})

describe('sumarDias', () => {
  it('cruza el fin de mes y de año', () => {
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('generarFechasAjuste', () => {
  it('genera inicio + k·frecuencia mientras sea anterior al fin', () => {
    expect(generarFechasAjuste('2026-01-01', '2027-01-01', 3))
      .toEqual(['2026-04-01', '2026-07-01', '2026-10-01'])
  })
  it('no incluye una fecha igual al fin', () => {
    expect(generarFechasAjuste('2026-01-01', '2026-07-01', 6)).toEqual([])
  })
  it('sin frecuencia o sin fechas, vacío', () => {
    expect(generarFechasAjuste('2026-01-01', '2027-01-01', null)).toEqual([])
    expect(generarFechasAjuste('', '2027-01-01', 3)).toEqual([])
  })
})

describe('cálculo del ajuste', () => {
  it('redondea a dos decimales', () => {
    expect(calcularMontoNuevo(100000, 1.1234)).toBe(112340)
    expect(calcularMontoNuevo(100, 1.005)).toBe(100.5)
  })
  it('convierte porcentaje en coeficiente', () => {
    expect(coeficienteDesdePorcentaje(12.5)).toBeCloseTo(1.125)
  })
})

describe('nombreMes / periodoYm / mesAnterior', () => {
  it('rotula el período con el mes en castellano', () => {
    expect(nombreMes('2026-09-01')).toBe('Septiembre 2026')
    expect(nombreMes('2027-01')).toBe('Enero 2027')
  })

  it('recorta a YYYY-MM y retrocede un mes cruzando el año', () => {
    expect(periodoYm('2026-09-01')).toBe('2026-09')
    expect(mesAnterior('2026-09-18')).toBe('2026-08')
    expect(mesAnterior('2027-01-05')).toBe('2026-12')
  })
})

describe('diasEntre', () => {
  it('cuenta días enteros y es negativo si la fecha ya pasó', () => {
    expect(diasEntre('2026-09-18', '2026-09-25')).toBe(7)
    expect(diasEntre('2026-09-18', '2026-09-10')).toBe(-8)
    expect(diasEntre('2026-12-30', '2027-01-02')).toBe(3)
  })
})

describe('etiquetaEstadoCobro', () => {
  const HOY = '2026-09-18'
  const base = { estado: 'pendiente' as const, dias_atraso: 0 }

  it('pendiente lejos del vencimiento está al día', () => {
    expect(etiquetaEstadoCobro({ ...base, fecha_vencimiento: '2026-10-10' }, HOY)).toEqual({ texto: 'Al día', color: 'ok' })
  })

  it('avisa cuando vence en 7 días o menos, y el mismo día', () => {
    expect(etiquetaEstadoCobro({ ...base, fecha_vencimiento: '2026-09-25' }, HOY).texto).toBe('Vence en 7 días')
    expect(etiquetaEstadoCobro({ ...base, fecha_vencimiento: '2026-09-19' }, HOY).texto).toBe('Vence en 1 día')
    expect(etiquetaEstadoCobro({ ...base, fecha_vencimiento: '2026-09-18' }, HOY).texto).toBe('Vence hoy')
  })

  it('con atraso manda el atraso, sea pendiente o parcial', () => {
    expect(etiquetaEstadoCobro({ estado: 'pendiente', fecha_vencimiento: '2026-09-10', dias_atraso: 8 }, HOY))
      .toEqual({ texto: 'Vencido 8 días', color: 'baja' })
    expect(etiquetaEstadoCobro({ estado: 'parcial', fecha_vencimiento: '2026-09-17', dias_atraso: 1 }, HOY).texto)
      .toBe('Vencido 1 día')
  })

  it('parcial sin vencer, pagado y anulado usan su estado', () => {
    expect(etiquetaEstadoCobro({ estado: 'parcial', fecha_vencimiento: '2026-10-10', dias_atraso: 0 }, HOY).texto).toBe('Parcial')
    expect(etiquetaEstadoCobro({ estado: 'pagado', fecha_vencimiento: '2026-08-10', dias_atraso: 0 }, HOY)).toEqual({ texto: 'Pagado', color: 'ok' })
    expect(etiquetaEstadoCobro({ estado: 'anulado', fecha_vencimiento: '2026-08-10', dias_atraso: 0 }, HOY)).toEqual({ texto: 'Anulado', color: 'neutro' })
  })
})

describe('chipRecordatorio', () => {
  it('atrasado en rojo, hoy/mañana/≤7 en naranja, lejos en gris', () => {
    expect(chipRecordatorio({ dias: -3 })).toEqual({ texto: 'Hace 3 días', color: 'baja' })
    expect(chipRecordatorio({ dias: -1 })).toEqual({ texto: 'Hace 1 día', color: 'baja' })
    expect(chipRecordatorio({ dias: 0 })).toEqual({ texto: 'Hoy', color: 'espera' })
    expect(chipRecordatorio({ dias: 1 })).toEqual({ texto: 'Mañana', color: 'espera' })
    expect(chipRecordatorio({ dias: 5 })).toEqual({ texto: 'En 5 días', color: 'espera' })
    expect(chipRecordatorio({ dias: 20 })).toEqual({ texto: 'En 20 días', color: 'neutro' })
  })
})

describe('etiquetaTipoRecordatorio', () => {
  it('traduce los cuatro tipos', () => {
    expect(etiquetaTipoRecordatorio('cobro_vencido')).toBe('Cobros vencidos')
    expect(etiquetaTipoRecordatorio('cobro_por_vencer')).toBe('Cobros por vencer')
    expect(etiquetaTipoRecordatorio('ajuste')).toBe('Ajustes')
    expect(etiquetaTipoRecordatorio('fin_contrato')).toBe('Contratos que terminan')
  })
})
