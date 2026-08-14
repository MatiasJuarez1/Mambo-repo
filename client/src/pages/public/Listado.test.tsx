import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import Listado from './Listado'
import { propiedadesApi } from '../../api/propiedades'

vi.mock('../../api/propiedades', () => ({
  propiedadesApi: {
    listar: vi.fn(),
    ciudades: vi.fn(),
  },
}))

const listarMock = vi.mocked(propiedadesApi.listar)
const ciudadesMock = vi.mocked(propiedadesApi.ciudades)

const CIUDADES = ['San Miguel de Tucumán', 'Tafí Viejo', 'Yerba Buena']

/** Espía de la URL, para comprobar que los filtros escriben el query string. */
function Ubicacion() {
  const { search } = useLocation()
  return <div data-testid="ubicacion">{search}</div>
}

function renderListado(url = '/propiedades') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Listado />
      <Ubicacion />
    </MemoryRouter>,
  )
}

/** El select de zonas, identificado por su etiqueta accesible. */
function selectZona() {
  return screen.getByLabelText('Zona') as HTMLSelectElement
}

beforeEach(() => {
  vi.clearAllMocks()
  listarMock.mockResolvedValue([])
  ciudadesMock.mockResolvedValue(CIUDADES)
})

describe('Listado — filtro de zona', () => {
  it('el filtro de ciudad es un select y se llena con las zonas de la API', async () => {
    renderListado()

    await waitFor(() => {
      expect(selectZona().options).toHaveLength(CIUDADES.length + 1)
    })

    const select = selectZona()
    expect(select.tagName).toBe('SELECT')
    expect([...select.options].map(o => o.textContent)).toEqual([
      'Todas las zonas',
      ...CIUDADES,
    ])
    expect(select.value).toBe('')
  })

  it('si el endpoint de ciudades falla, la página igual renderiza y el select queda con la opción vacía', async () => {
    ciudadesMock.mockRejectedValue(new Error('500'))

    renderListado()

    // La página se muestra igual: no hay pantalla de error por esto.
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()

    await waitFor(() => {
      expect(listarMock).toHaveBeenCalled()
    })

    const select = selectZona()
    expect([...select.options].map(o => o.textContent)).toEqual(['Todas las zonas'])
    expect(screen.queryByText('500')).not.toBeInTheDocument()
  })

  it('una ciudad de la URL que no está en la lista aparece igual como opción seleccionada', async () => {
    renderListado('/propiedades?ciudad=Lules')

    await waitFor(() => {
      expect(selectZona().options.length).toBeGreaterThan(1)
    })

    const select = selectZona()
    expect(select.value).toBe('Lules')
    expect([...select.options].map(o => o.value)).toEqual(['', 'Lules', ...CIUDADES])
  })

  it('no duplica la ciudad de la URL cuando ya viene en la lista', async () => {
    renderListado('/propiedades?ciudad=Yerba Buena')

    await waitFor(() => {
      expect(selectZona().options).toHaveLength(CIUDADES.length + 1)
    })

    expect(selectZona().value).toBe('Yerba Buena')
  })

  it('elegir una zona actualiza el query param y vuelve a pedir propiedades', async () => {
    const usuario = userEvent.setup()
    renderListado()

    await waitFor(() => {
      expect(selectZona().options).toHaveLength(CIUDADES.length + 1)
    })

    await usuario.selectOptions(selectZona(), 'Yerba Buena')

    expect(screen.getByTestId('ubicacion')).toHaveTextContent('ciudad=Yerba+Buena')
    await waitFor(() => {
      expect(listarMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ ciudad: 'Yerba Buena' }),
      )
    })
  })

  it('volver a "Todas las zonas" borra el query param', async () => {
    const usuario = userEvent.setup()
    renderListado('/propiedades?ciudad=Yerba Buena')

    await waitFor(() => {
      expect(selectZona().options).toHaveLength(CIUDADES.length + 1)
    })

    await usuario.selectOptions(selectZona(), '')

    expect(screen.getByTestId('ubicacion')).not.toHaveTextContent('ciudad=')
  })
})

describe('Listado — filtro de tipo', () => {
  it('usa los labels en plural de OPCIONES_TIPO', async () => {
    renderListado()

    const select = screen.getByLabelText('Tipo de propiedad') as HTMLSelectElement
    expect([...select.options].map(o => o.textContent)).toEqual([
      'Todos los tipos',
      'Casas',
      'Departamentos',
      'Lotes y terrenos',
      'Locales comerciales',
      'Oficinas',
    ])

    await waitFor(() => expect(ciudadesMock).toHaveBeenCalled())
  })
})

describe('Listado — filtro de operación', () => {
  it('mantiene la opción Temporal, que no se ofrece en la barra del hero', async () => {
    renderListado()

    const select = screen.getByLabelText('Operación') as HTMLSelectElement
    expect([...select.options].map(o => o.value)).toEqual([
      '',
      'venta',
      'alquiler',
      'temporal',
    ])

    await waitFor(() => expect(ciudadesMock).toHaveBeenCalled())
  })
})
