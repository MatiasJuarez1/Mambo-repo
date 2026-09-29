import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import BloqueBusquedas, { resumirBusqueda } from './BloqueBusquedas'
import { busquedasApi, type Busqueda } from '../../../api/busquedas'

vi.mock('../../../api/busquedas', () => ({
  busquedasApi: {
    listar: vi.fn(), crear: vi.fn(), actualizar: vi.fn(), borrar: vi.fn(), coincidencias: vi.fn(),
  },
}))

const api = vi.mocked(busquedasApi)

function busqueda(over: Partial<Busqueda> = {}): Busqueda {
  return {
    id: 1,
    person: { id: 4, full_name: 'Ana Pérez' },
    tipo_operacion: 'alquiler',
    tipo_propiedad: 'depto',
    ciudad: 'Yerba Buena',
    moneda: 'ARS',
    precio_min: null,
    precio_max: '150000.00',
    dormitorios_min: 2,
    notas: null,
    activa: true,
    created_at: '2026-09-29T10:00:00Z',
    coincidencias: 2,
    ...over,
  }
}

function renderBloque() {
  return render(
    <MemoryRouter>
      <BloqueBusquedas personaId={4} />
    </MemoryRouter>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('resumirBusqueda', () => {
  it('arma una línea con los criterios cargados', () => {
    expect(resumirBusqueda(busqueda())).toBe(
      'Departamento en alquiler · Yerba Buena · hasta ARS 150.000 · 2+ dorm.',
    )
  })

  it('sin criterios dice "Cualquier propiedad"', () => {
    expect(resumirBusqueda(busqueda({
      tipo_operacion: null, tipo_propiedad: null, ciudad: null, moneda: null,
      precio_max: null, dormitorios_min: null,
    }))).toBe('Cualquier propiedad')
  })
})

describe('BloqueBusquedas', () => {
  it('lista las búsquedas y abre sus coincidencias', async () => {
    api.listar.mockResolvedValue([busqueda()])
    api.coincidencias.mockResolvedValue({
      busqueda_id: 1,
      propiedades: [{ id: 9, titulo: 'Depto céntrico', estado_comercial: 'disponible' }],
    })
    renderBloque()

    const boton = await screen.findByRole('button', { name: '2 coincidencias' })
    expect(api.listar).toHaveBeenCalledWith(4)
    await userEvent.click(boton)

    expect(api.coincidencias).toHaveBeenCalledWith(1)
    expect(await screen.findByRole('link', { name: 'Depto céntrico' }))
      .toHaveAttribute('href', '/admin/propiedades/9/editar')
  })

  it('crea una búsqueda: los campos vacíos viajan como null y sin precio no manda moneda', async () => {
    api.listar.mockResolvedValue([])
    api.crear.mockResolvedValue(busqueda({ id: 7, tipo_propiedad: null, coincidencias: 0 }))
    renderBloque()
    await screen.findByText('Sin búsquedas guardadas')

    await userEvent.click(screen.getByRole('button', { name: 'Agregar búsqueda' }))
    await userEvent.selectOptions(screen.getByLabelText('Operación'), 'alquiler')
    await userEvent.type(screen.getByLabelText('Ciudad'), '  Yerba Buena ')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar búsqueda' }))

    expect(api.crear).toHaveBeenCalledWith(4, {
      tipo_operacion: 'alquiler',
      tipo_propiedad: null,
      ciudad: 'Yerba Buena',
      moneda: null,
      precio_min: null,
      precio_max: null,
      dormitorios_min: null,
      notas: null,
    })
    expect(await screen.findByRole('button', { name: '0 coincidencias' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar búsqueda' })).not.toBeInTheDocument()
  })

  it('pausar reemplaza la búsqueda por la que devuelve la API', async () => {
    api.listar.mockResolvedValue([busqueda()])
    api.actualizar.mockResolvedValue(busqueda({ activa: false, coincidencias: 0 }))
    renderBloque()

    await userEvent.click(await screen.findByRole('button', { name: 'Pausar' }))

    expect(api.actualizar).toHaveBeenCalledWith(1, { activa: false })
    expect(await screen.findByRole('button', { name: 'Reactivar' })).toBeInTheDocument()
    expect(screen.getByText('Pausada')).toBeInTheDocument()
  })

  it('muestra el error de la API', async () => {
    api.listar.mockRejectedValue(new Error('Permisos insuficientes'))
    renderBloque()

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Permisos insuficientes'))
  })
})
