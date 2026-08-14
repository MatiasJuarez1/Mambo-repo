import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import BuscadorHero from './BuscadorHero'
import { propiedadesApi } from '../api/propiedades'

// El buscador pide las zonas al montar: se mockea la API entera para que los
// tests no dependan de la red ni del backend.
vi.mock('../api/propiedades', () => ({
  propiedadesApi: { ciudades: vi.fn() },
}))

const ciudadesMock = vi.mocked(propiedadesApi.ciudades)

/** Espía de la navegación: publica el destino actual del router. */
function Ubicacion() {
  const { pathname, search, hash } = useLocation()
  return <span data-testid="ubicacion">{pathname + search + hash}</span>
}

function destino() {
  return screen.getByTestId('ubicacion').textContent
}

async function montar() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <BuscadorHero />
      <Ubicacion />
    </MemoryRouter>,
  )
  // El pedido de zonas resuelve después del render: se lo deja asentar para
  // que la actualización de estado no quede fuera de act().
  await act(async () => {})
}

function botonBuscar() {
  return screen.getByRole('button', { name: /buscar|ver servicio/i })
}

beforeEach(() => {
  ciudadesMock.mockReset()
  ciudadesMock.mockResolvedValue([])
})

describe('BuscadorHero — modo Propiedades', () => {
  it('sin filtros elegidos navega a /propiedades sin query string', async () => {
    await montar()

    await userEvent.click(botonBuscar())

    expect(destino()).toBe('/propiedades')
  })

  it('manda solo los filtros con valor y omite los vacíos', async () => {
    await montar()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Operación' }), 'venta')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Tipo' }), 'casa')
    await userEvent.click(botonBuscar())

    expect(destino()).toBe('/propiedades?tipo_operacion=venta&tipo_propiedad=casa')
  })

  it('ofrece las zonas que devuelve el backend y las manda como ciudad', async () => {
    ciudadesMock.mockResolvedValue(['San Miguel de Tucumán', 'Yerba Buena'])
    await montar()

    const zona = screen.getByRole('combobox', { name: 'Zona' })
    expect(screen.getByRole('option', { name: 'San Miguel de Tucumán' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Yerba Buena' })).toBeInTheDocument()

    await userEvent.selectOptions(zona, 'Yerba Buena')
    await userEvent.click(botonBuscar())

    expect(destino()).toBe('/propiedades?ciudad=Yerba+Buena')
  })

  it('si el endpoint de zonas falla, la barra sigue usable con solo "Todo Tucumán"', async () => {
    ciudadesMock.mockRejectedValue(new Error('502'))
    await montar()

    const zona = screen.getByRole('combobox', { name: 'Zona' })
    expect(zona).toBeInTheDocument()
    expect(Array.from(zona.querySelectorAll('option')).map(o => o.textContent)).toEqual([
      'Todo Tucumán',
    ])

    await userEvent.click(botonBuscar())
    expect(destino()).toBe('/propiedades')
  })
})

describe('BuscadorHero — conmutador', () => {
  it('refleja la pestaña activa en aria-selected', async () => {
    await montar()

    const propiedades = screen.getByRole('tab', { name: 'Propiedades' })
    const servicios   = screen.getByRole('tab', { name: 'Servicios' })

    expect(propiedades).toHaveAttribute('aria-selected', 'true')
    expect(servicios).toHaveAttribute('aria-selected', 'false')

    await userEvent.click(servicios)

    expect(propiedades).toHaveAttribute('aria-selected', 'false')
    expect(servicios).toHaveAttribute('aria-selected', 'true')
  })

  it('al pasar a Servicios cambia los campos y el texto del botón', async () => {
    await montar()

    await userEvent.click(screen.getByRole('tab', { name: 'Servicios' }))

    expect(screen.queryByRole('combobox', { name: 'Operación' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Tipo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Zona' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '¿Qué necesitás?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver servicio' })).toBeInTheDocument()
  })

  it('conserva lo elegido al volver a la pestaña anterior', async () => {
    await montar()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Operación' }), 'alquiler')
    await userEvent.click(screen.getByRole('tab', { name: 'Servicios' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Propiedades' }))

    expect(screen.getByRole('combobox', { name: 'Operación' })).toHaveValue('alquiler')
  })
})

describe('BuscadorHero — modo Servicios', () => {
  it('navega al ancla del servicio elegido', async () => {
    await montar()

    await userEvent.click(screen.getByRole('tab', { name: 'Servicios' }))
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: '¿Qué necesitás?' }),
      'puesta-en-valor',
    )
    await userEvent.click(botonBuscar())

    expect(destino()).toBe('/servicios#puesta-en-valor')
  })

  it('sin servicio elegido navega a /servicios', async () => {
    await montar()

    await userEvent.click(screen.getByRole('tab', { name: 'Servicios' }))
    await userEvent.click(botonBuscar())

    expect(destino()).toBe('/servicios')
  })
})
