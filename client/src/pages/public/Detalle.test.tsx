import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Detalle from './Detalle'
import { propiedadesApi } from '../../api/propiedades'
import type { EstadoComercial, Propiedad, TipoOperacion } from '../../types/propiedad'

vi.mock('../../api/propiedades', () => ({
  propiedadesApi: { obtener: vi.fn() },
}))

const obtenerMock = vi.mocked(propiedadesApi.obtener)

function propiedad(over: Partial<Propiedad> = {}): Propiedad {
  return {
    id: 1,
    titulo: 'Casa en el centro',
    descripcion: null,
    tipo_propiedad: 'casa',
    tipo_operacion: 'venta',
    estado_comercial: 'disponible',
    moneda: 'USD',
    precio: 120000,
    dormitorios: 3,
    banos: 2,
    m2_terreno: null,
    m2_construidos: null,
    m2_cubiertos: 140,
    m2_propios: null,
    m2_totales: 200,
    propietario_persona_id: null,
    contrato_vigente: null,
    propietario: null,
    creado_en: '2026-01-01T10:00:00',
    actualizado_en: '2026-01-01T10:00:00',
    eliminado_en: null,
    ubicacion: null,
    medios: [],
    caracteristicas: [],
    ...over,
  }
}

async function renderDetalle(over: Partial<Propiedad> = {}) {
  obtenerMock.mockResolvedValue(propiedad(over))
  render(
    <MemoryRouter initialEntries={['/propiedades/1']}>
      <Routes>
        <Route path="/propiedades/:id" element={<Detalle />} />
      </Routes>
    </MemoryRouter>,
  )
  // Por el encabezado y no por el texto suelto: el título también está en el breadcrumb.
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Casa en el centro' })).toBeInTheDocument(),
  )
}

beforeEach(() => vi.clearAllMocks())

describe('Detalle — propiedad disponible', () => {
  it('ofrece los dos canales de contacto', async () => {
    await renderDetalle({ estado_comercial: 'disponible' })

    expect(screen.getByText('Consultar por WhatsApp')).toBeInTheDocument()
    expect(screen.getByText('Solicitar visita')).toBeInTheDocument()
  })

  it('no muestra ningún aviso de operación cerrada', async () => {
    await renderDetalle({ estado_comercial: 'disponible' })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('Detalle — operación cerrada', () => {
  it.each([
    ['venta', 'vendió'],
    ['alquiler', 'alquiló'],
  ] as [TipoOperacion, string][])(
    'avisa que la propiedad ya se %s',
    async (tipo_operacion, esperado) => {
      await renderDetalle({ estado_comercial: 'cerrada', tipo_operacion })

      expect(screen.getByRole('status')).toHaveTextContent(esperado)
    },
  )

  it('NO ofrece solicitar una visita: la propiedad ya no está en oferta', async () => {
    await renderDetalle({ estado_comercial: 'cerrada' })

    expect(screen.queryByText('Solicitar visita')).not.toBeInTheDocument()
  })

  it('deja un camino hacia lo que sí está disponible', async () => {
    await renderDetalle({ estado_comercial: 'cerrada' })

    expect(screen.getByRole('link', { name: /Ver propiedades disponibles/i }))
      .toHaveAttribute('href', '/propiedades')
  })

  it('el precio se presenta como valor de cierre, no como precio vigente', async () => {
    await renderDetalle({ estado_comercial: 'cerrada', tipo_operacion: 'venta' })

    expect(screen.getByText(/Valor de la operación/i)).toBeInTheDocument()
    expect(screen.queryByText('Precio de venta')).not.toBeInTheDocument()
  })
})

describe('Detalle — propiedad reservada', () => {
  it('avisa que está reservada pero mantiene el contacto', async () => {
    // Una reserva puede caerse: al interesado le sirve poder consultar igual.
    await renderDetalle({ estado_comercial: 'reservada' })

    expect(screen.getByRole('status')).toHaveTextContent(/reservada/i)
    expect(screen.getByText('Consultar por WhatsApp')).toBeInTheDocument()
    expect(screen.getByText('Solicitar visita')).toBeInTheDocument()
  })
})

describe('Detalle — propiedad dada de baja', () => {
  it('no la trata como operación cerrada', async () => {
    await renderDetalle({ estado_comercial: 'baja' as EstadoComercial })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('Detalle — superficies', () => {
  it('muestra solo las superficies cargadas', async () => {
    await renderDetalle({
      m2_terreno: 600, m2_construidos: 250, m2_cubiertos: null, m2_propios: null, m2_totales: 600,
    })

    expect(screen.getByText('m² terreno')).toBeInTheDocument()
    expect(screen.getByText('m² construidos')).toBeInTheDocument()
    expect(screen.getByText('m² totales')).toBeInTheDocument()
    expect(screen.queryByText('m² cubiertos')).not.toBeInTheDocument()
    expect(screen.queryByText('m² propios')).not.toBeInTheDocument()
  })
})

describe('Detalle — características', () => {
  it('las tildadas se muestran solo con el nombre y ✅', async () => {
    await renderDetalle({
      caracteristicas: [{ id: 1, propiedad_id: 1, clave: 'Piscina', valor: 'si', creado_en: '' }],
    })

    expect(screen.getByText('✅ Piscina')).toBeInTheDocument()
    expect(screen.queryByText(/Piscina: si/)).not.toBeInTheDocument()
  })

  it('reconoce tildadas legacy guardadas como "Sí"', async () => {
    await renderDetalle({
      caracteristicas: [{ id: 3, propiedad_id: 1, clave: 'Balcón', valor: 'Sí', creado_en: '' }],
    })

    expect(screen.getByText('✅ Balcón')).toBeInTheDocument()
  })

  it('las de texto libre siguen como "clave: valor"', async () => {
    await renderDetalle({
      caracteristicas: [{ id: 2, propiedad_id: 1, clave: 'Orientación', valor: 'Norte', creado_en: '' }],
    })

    expect(screen.getByText('Orientación: Norte')).toBeInTheDocument()
  })
})
