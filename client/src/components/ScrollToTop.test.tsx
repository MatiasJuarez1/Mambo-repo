import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import ScrollToTop from './ScrollToTop'

const scrollTo = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  // jsdom no implementa el scroll de verdad; lo espiamos para verificar la llamada.
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo
})

/** App mínima con dos páginas y enlaces, para provocar navegaciones reales. */
function renderApp(inicial = '/') {
  return render(
    <MemoryRouter initialEntries={[inicial]}>
      <ScrollToTop />
      <Link to="/propiedades">Ir al listado</Link>
      <Link to="/propiedades?ciudad=Yerba+Buena">Filtrar</Link>
      <Link to="/propiedades/7">Ver la casa</Link>
      <Link to="/#contacto">Contacto</Link>
      <Routes>
        <Route path="/" element={<p>home</p>} />
        <Route path="/propiedades" element={<p>listado</p>} />
        <Route path="/propiedades/:id" element={<p>detalle</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ScrollToTop', () => {
  it('sube al principio al entrar a una página', () => {
    renderApp()
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
  })

  it('sube al principio al cambiar de página', async () => {
    renderApp()
    scrollTo.mockClear()

    await userEvent.click(screen.getByText('Ir al listado'))

    expect(screen.getByText('listado')).toBeInTheDocument()
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
  })

  it('sube al principio al abrir una propiedad, para que se vea la foto', async () => {
    renderApp('/propiedades')
    scrollTo.mockClear()

    await userEvent.click(screen.getByText('Ver la casa'))

    expect(screen.getByText('detalle')).toBeInTheDocument()
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
  })

  it('NO mueve la vista al cambiar solo los filtros del listado', async () => {
    renderApp('/propiedades')
    scrollTo.mockClear()

    await userEvent.click(screen.getByText('Filtrar'))

    // Mismo pathname, solo cambió el query string: el visitante sigue mirando lo mismo.
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('NO pisa el destino de un enlace con ancla', async () => {
    renderApp('/propiedades')
    scrollTo.mockClear()

    await userEvent.click(screen.getByText('Contacto'))

    expect(scrollTo).not.toHaveBeenCalled()
  })
})
