import {
  LABEL_TIPO,
  LABEL_OPERACION,
  OPCIONES_TIPO,
  OPCIONES_OPERACION,
  ESTADOS_PUBLICOS,
  etiquetaCierre,
  etiquetaEstado,
  LABEL_ESTADO,
} from './propiedad'

describe('OPCIONES_TIPO', () => {
  it('tiene cinco entradas (todas menos "otro")', () => {
    expect(OPCIONES_TIPO).toHaveLength(5)
  })

  it('usa solo valores válidos del enum TipoPropiedad', () => {
    const validos = Object.keys(LABEL_TIPO)
    OPCIONES_TIPO.forEach(o => {
      expect(validos).toContain(o.valor)
    })
  })

  it('no repite valores', () => {
    const valores = OPCIONES_TIPO.map(o => o.valor)
    expect(new Set(valores).size).toBe(valores.length)
  })

  it('no incluye "otro" porque no es una categoría navegable', () => {
    expect(OPCIONES_TIPO.map(o => o.valor)).not.toContain('otro')
  })

  it('tiene labels en plural, distintos de los de LABEL_TIPO', () => {
    OPCIONES_TIPO.forEach(o => {
      expect(o.label.trim()).not.toBe('')
      expect(o.label).not.toBe(LABEL_TIPO[o.valor])
    })
  })
})

describe('OPCIONES_OPERACION', () => {
  it('ofrece venta y alquiler', () => {
    expect(OPCIONES_OPERACION.map(o => o.valor)).toEqual(['venta', 'alquiler'])
  })

  it('no expone "temporal" en el buscador del hero', () => {
    expect(OPCIONES_OPERACION.map(o => o.valor)).not.toContain('temporal')
  })

  it('usa solo valores válidos del enum TipoOperacion', () => {
    const validos = Object.keys(LABEL_OPERACION)
    OPCIONES_OPERACION.forEach(o => {
      expect(validos).toContain(o.valor)
    })
  })
})

describe('ESTADOS_PUBLICOS', () => {
  it('incluye disponibles, reservadas y cerradas', () => {
    expect([...ESTADOS_PUBLICOS]).toEqual(['disponible', 'reservada', 'cerrada'])
  })

  it('nunca expone las propiedades dadas de baja', () => {
    expect([...ESTADOS_PUBLICOS]).not.toContain('baja')
  })
})

describe('etiquetaCierre', () => {
  it('no etiqueta una propiedad disponible', () => {
    expect(etiquetaCierre({ estado_comercial: 'disponible', tipo_operacion: 'venta' })).toBeNull()
  })

  it('etiqueta las reservadas sin importar la operación', () => {
    expect(etiquetaCierre({ estado_comercial: 'reservada', tipo_operacion: 'venta' }))
      .toBe('Reservado')
    expect(etiquetaCierre({ estado_comercial: 'reservada', tipo_operacion: 'alquiler' }))
      .toBe('Reservado')
  })

  it('distingue vendido de alquilado según la operación', () => {
    expect(etiquetaCierre({ estado_comercial: 'cerrada', tipo_operacion: 'venta' }))
      .toBe('Vendido')
    expect(etiquetaCierre({ estado_comercial: 'cerrada', tipo_operacion: 'alquiler' }))
      .toBe('Alquilado')
  })

  it('trata la operación temporal como un alquiler', () => {
    expect(etiquetaCierre({ estado_comercial: 'cerrada', tipo_operacion: 'temporal' }))
      .toBe('Alquilado')
  })

  it('no etiqueta las dadas de baja: no son una operación cerrada', () => {
    expect(etiquetaCierre({ estado_comercial: 'baja', tipo_operacion: 'venta' })).toBeNull()
  })
})

describe('etiquetaEstado', () => {
  it('traduce "cerrada" a vendida o alquilada según la operación', () => {
    expect(etiquetaEstado('cerrada', 'venta')).toBe('Vendida')
    expect(etiquetaEstado('cerrada', 'alquiler')).toBe('Alquilada')
    expect(etiquetaEstado('cerrada', 'temporal')).toBe('Alquilada')
  })

  it('nunca muestra la palabra "Cerrada" al usuario', () => {
    const operaciones = ['venta', 'alquiler', 'temporal'] as const
    operaciones.forEach(op => {
      expect(etiquetaEstado('cerrada', op)).not.toBe('Cerrada')
    })
  })

  it('deja los demás estados como están', () => {
    expect(etiquetaEstado('disponible', 'venta')).toBe('Disponible')
    expect(etiquetaEstado('reservada', 'alquiler')).toBe('Reservada')
  })

  it('aclara que "baja" es una propiedad retirada, no una operación cerrada', () => {
    expect(etiquetaEstado('baja', 'venta')).toBe('Dada de baja')
  })

  it('concuerda en femenino, porque acompaña a "propiedad"', () => {
    // La faja de la ficha usa el masculino ("VENDIDO"), que es el sello del rubro;
    // acá el texto acompaña al estado de *la propiedad* y va en femenino.
    expect(etiquetaEstado('cerrada', 'venta')).toBe('Vendida')
    expect(etiquetaCierre({ estado_comercial: 'cerrada', tipo_operacion: 'venta' })).toBe('Vendido')
  })
})

describe('LABEL_ESTADO', () => {
  it('cubre los cuatro estados del enum', () => {
    expect(Object.keys(LABEL_ESTADO).sort()).toEqual(
      ['baja', 'cerrada', 'disponible', 'reservada'],
    )
  })

  it('para "cerrada" da una etiqueta que nombra las dos operaciones', () => {
    // Se usa donde no hay una propiedad concreta (el filtro del listado admin
    // abarca ventas y alquileres a la vez), así que tiene que nombrar ambas.
    expect(LABEL_ESTADO.cerrada).toBe('Vendida / Alquilada')
  })
})
