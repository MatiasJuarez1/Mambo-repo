import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Navbar from './Navbar'
import { SERVICIOS } from '../pages/public/catalogo-servicios'

function renderNavbar() {
  return render(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>,
  )
}

describe('Navbar', () => {
  it('ya no ofrece los desplegables de Venta ni de Alquiler', () => {
    renderNavbar()
    expect(screen.queryByRole('button', { name: /Venta/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Alquiler/ })).not.toBeInTheDocument()
  })

  it('ofrece un desplegable Propiedades y uno Servicios', () => {
    renderNavbar()
    expect(screen.getByRole('button', { name: /Propiedades/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Servicios/ })).toBeInTheDocument()
  })

  it('arranca con los desplegables cerrados', () => {
    renderNavbar()
    expect(screen.getByRole('button', { name: /Propiedades/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('Propiedades abre cinco enlaces, ninguno con tipo_operacion', async () => {
    const usuario = userEvent.setup()
    renderNavbar()

    const toggle = screen.getByRole('button', { name: /Propiedades/ })
    await usuario.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    const menu = document.querySelector('.navbar-dropdown-menu') as HTMLElement
    const enlaces = within(menu).getAllByRole('link')
    expect(enlaces).toHaveLength(5)

    enlaces.forEach(a => {
      const href = a.getAttribute('href') ?? ''
      expect(href).toContain('/propiedades?tipo_propiedad=')
      expect(href).not.toContain('tipo_operacion')
    })
  })

  it('Servicios abre los cinco enlaces con ancla /servicios#<slug>', async () => {
    const usuario = userEvent.setup()
    renderNavbar()

    await usuario.click(screen.getByRole('button', { name: /Servicios/ }))

    const menu = document.querySelector('.navbar-dropdown-menu') as HTMLElement
    const enlaces = within(menu).getAllByRole('link')
    expect(enlaces).toHaveLength(SERVICIOS.length)
    expect(enlaces.map(a => a.getAttribute('href'))).toEqual(
      SERVICIOS.map(s => `/servicios#${s.slug}`),
    )
    expect(enlaces.map(a => a.textContent)).toEqual(SERVICIOS.map(s => s.titulo))
  })

  it('cierra el desplegable al hacer clic afuera', async () => {
    const usuario = userEvent.setup()
    renderNavbar()

    const toggle = screen.getByRole('button', { name: /Propiedades/ })
    await usuario.click(toggle)
    expect(document.querySelector('.navbar-dropdown-menu')).toBeInTheDocument()

    await usuario.click(document.body)
    expect(document.querySelector('.navbar-dropdown-menu')).not.toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('mantiene el resto de la navegación', () => {
    renderNavbar()
    expect(screen.getByRole('link', { name: 'Quiénes somos' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Contacto' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Acceso al panel' })).toBeInTheDocument()
  })

  it('el logo sube al principio aunque ya estés en el home', async () => {
    const scrollTo = vi.fn()
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo
    renderNavbar()

    await userEvent.click(screen.getByRole('link', { name: /Mambo Group/i }))

    // Estando en el home la ruta no cambia, así que ScrollToTop no se entera:
    // sin este onClick, apretar el logo no haría nada.
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
  })

  it('no rotula la entrada al panel para el visitante', () => {
    renderNavbar()

    // El icono de cuenta sigue llevando a /admin, pero la navbar pública ya no
    // anuncia un botón "Administración": no hace falta señalizarle esa puerta a
    // cualquiera que entre al sitio.
    expect(screen.queryByRole('link', { name: 'Administración' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Acceso al panel' })).toHaveAttribute('href', '/admin')
  })

  it('Contacto se destaca como pastilla y no como link suelto', () => {
    renderNavbar()
    const contacto = screen.getByRole('link', { name: 'Contacto' })
    expect(contacto).toHaveClass('navbar-contacto-btn')
    expect(contacto).toHaveAttribute('href', '#contacto')
  })
})
