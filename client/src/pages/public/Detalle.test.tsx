import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import Detalle from './Detalle'
import { propiedadesApi } from '../../api/propiedades'
import { consultasApi } from '../../api/consultas'
import type { EstadoComercial, Medio, Propiedad, TipoOperacion } from '../../types/propiedad'

vi.mock('../../api/propiedades', () => ({
  propiedadesApi: { obtener: vi.fn() },
}))

vi.mock('../../api/consultas', () => ({
  consultasApi: { enviar: vi.fn() },
}))

const obtenerMock = vi.mocked(propiedadesApi.obtener)
const enviarMock = vi.mocked(consultasApi.enviar)

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

describe('Detalle — solicitar visita', () => {
  async function completarFormulario() {
    const user = userEvent.setup()
    await user.click(screen.getByText('Solicitar visita'))
    await user.type(screen.getByLabelText('Nombre'), 'Laura')
    await user.type(screen.getByLabelText('Apellido'), 'Gómez')
    await user.type(screen.getByLabelText('Teléfono'), '11 5555-1234')
    await user.type(screen.getByLabelText('Mensaje'), '  ¿Acepta mascotas?  ')
    // El input de fecha no admite tipeo en jsdom: se le asigna el valor directo.
    const fecha = screen.getByLabelText('¿Qué día te gustaría visitarla?') as HTMLInputElement
    fecha.value = '2099-10-15'
    return user
  }

  it('manda la consulta a la API y muestra la confirmación', async () => {
    enviarMock.mockResolvedValue({ mensaje: '¡Gracias! Te vamos a contactar.' })
    await renderDetalle()

    const user = await completarFormulario()
    await user.click(screen.getByText('Enviar solicitud'))

    expect(enviarMock).toHaveBeenCalledWith({
      propiedad_id: 1,
      nombre: 'Laura',
      apellido: 'Gómez',
      telefono: '11 5555-1234',
      email: undefined,
      fecha_preferida: '2099-10-15',
      mensaje: '¿Acepta mascotas?',
      sitio_web: undefined,
    })
    expect(await screen.findByText('¡Gracias! Te vamos a contactar.')).toBeInTheDocument()
    expect(screen.queryByText('Enviar solicitud')).not.toBeInTheDocument()
  })

  it('si la API falla, muestra el error y deja reintentar', async () => {
    enviarMock.mockRejectedValue(new Error('Recibimos varias consultas seguidas.'))
    await renderDetalle()

    const user = await completarFormulario()
    await user.click(screen.getByText('Enviar solicitud'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Recibimos varias consultas seguidas.')
    expect(screen.getByText('Enviar solicitud')).toBeEnabled()
  })
})

describe('Detalle — título de la pestaña', () => {
  it('lo antepone mientras la ficha está abierta y lo restaura al salir', async () => {
    document.title = 'Mambo Propiedades'
    obtenerMock.mockResolvedValue(propiedad())
    const { unmount } = render(
      <MemoryRouter initialEntries={['/propiedades/1']}>
        <Routes>
          <Route path="/propiedades/:id" element={<Detalle />} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(document.title).toBe('Casa en el centro | Mambo Propiedades'))

    unmount()

    expect(document.title).toBe('Mambo Propiedades')
  })
})

describe('Detalle — visor de fotos', () => {
  // 16 fotos: el mosaico muestra 5 y el "+11 fotos" tapa el resto, que es el
  // caso que motivó el visor.
  const fotos: Medio[] = Array.from({ length: 16 }, (_, i) => ({
    id: i + 1,
    propiedad_id: 1,
    tipo_medio: 'imagen',
    url: `/media/foto-${i + 1}.jpg`,
    descripcion: null,
    orden: i,
    es_principal: i === 0,
    variantes: null,
    creado_en: '',
  }))

  const contador = () => within(screen.getByRole('dialog')).getByText(/^\d+ \/ 16$/)
  const fotoVisible = () =>
    within(screen.getByRole('dialog')).getByRole('img', { name: /^Foto \d+ de Casa en el centro$/ })

  it('el "+11 fotos" abre el visor en la primera que no entra en el mosaico', async () => {
    await renderDetalle({ medios: fotos })

    await userEvent.click(screen.getByRole('button', { name: /Ver 11 fotos más/ }))

    expect(contador()).toHaveTextContent('6 / 16')
    expect(fotoVisible()).toHaveAttribute('src', expect.stringContaining('foto-6.jpg'))
  })

  it('llega a todas las fotos, con flechas, teclado y la tira de miniaturas', async () => {
    const user = userEvent.setup()
    await renderDetalle({ medios: fotos })
    await user.click(screen.getByRole('button', { name: /Ver las 16 fotos/ }))
    expect(contador()).toHaveTextContent('1 / 16')

    await user.click(screen.getByRole('button', { name: 'Foto siguiente' }))
    expect(contador()).toHaveTextContent('2 / 16')

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' })
    expect(contador()).toHaveTextContent('1 / 16')

    await user.click(screen.getByRole('button', { name: 'Foto 16 de 16' }))
    expect(fotoVisible()).toHaveAttribute('src', expect.stringContaining('foto-16.jpg'))

    // Circular: después de la última vuelve a la primera.
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' })
    expect(contador()).toHaveTextContent('1 / 16')
  })

  it('en el celular se pasa de foto deslizando el dedo', async () => {
    await renderDetalle({ medios: fotos })
    await userEvent.click(screen.getByRole('button', { name: /Ver las 16 fotos/ }))
    const foto = fotoVisible()

    fireEvent.touchStart(foto, { touches: [{ clientX: 300, clientY: 200 }] })
    fireEvent.touchMove(foto, { touches: [{ clientX: 150, clientY: 210 }] })
    fireEvent.touchEnd(foto, { touches: [] })

    expect(contador()).toHaveTextContent('2 / 16')
  })

  it('un toque sin desplazamiento no cambia de foto', async () => {
    await renderDetalle({ medios: fotos })
    await userEvent.click(screen.getByRole('button', { name: /Ver las 16 fotos/ }))
    const foto = fotoVisible()

    fireEvent.touchStart(foto, { touches: [{ clientX: 300, clientY: 200 }] })
    fireEvent.touchEnd(foto, { touches: [] })

    expect(contador()).toHaveTextContent('1 / 16')
  })

  it('se cierra con Escape y con el botón, y devuelve el scroll a la página', async () => {
    const user = userEvent.setup()
    await renderDetalle({ medios: fotos })

    await user.click(screen.getByRole('button', { name: /Ver las 16 fotos/ }))
    expect(document.body.style.overflow).toBe('hidden')
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('')

    await user.click(screen.getByRole('button', { name: 'Foto 2 de Casa en el centro' }))
    expect(contador()).toHaveTextContent('2 / 16')
    await user.click(screen.getByRole('button', { name: 'Cerrar fotos' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('con una sola foto no ofrece flechas ni miniaturas', async () => {
    await renderDetalle({ medios: fotos.slice(0, 1) })

    await userEvent.click(screen.getByRole('button', { name: /Ver la foto de/ }))

    expect(screen.queryByRole('button', { name: 'Foto siguiente' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Foto 1 de 1$/ })).not.toBeInTheDocument()
  })
})
