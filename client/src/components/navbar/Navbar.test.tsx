import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Navbar from './Navbar'
import { SERVICIOS } from '../../pages/public/catalogo-servicios'

function renderNavbar() {
  return render(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>,
  )
}

// Escritorio y drawer coexisten en el DOM y se alternan con `display: none`,
// pero jsdom no aplica hojas de estilo ni evalúa media queries: acá los dos
// están siempre presentes. Por eso cada consulta se acota a su mitad — sin
// esto, "Propiedades" o "Contacto" devuelven dos resultados y las pruebas
// pasarían por el lado equivocado.
const filaEscritorio = () => within(document.querySelector('.navbar-links') as HTMLElement)
const panelMovil = () => screen.getByRole('navigation', { name: 'Menú de navegación' })
const hamburguesa = () => screen.getByRole('button', { name: 'Menú' })

describe('Navbar — fila de escritorio', () => {
  it('ya no ofrece los desplegables de Venta ni de Alquiler', () => {
    renderNavbar()
    expect(screen.queryByRole('button', { name: /Venta/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Alquiler/ })).not.toBeInTheDocument()
  })

  it('ofrece un desplegable Propiedades y uno Servicios', () => {
    renderNavbar()
    expect(filaEscritorio().getByRole('button', { name: /Propiedades/ })).toBeInTheDocument()
    expect(filaEscritorio().getByRole('button', { name: /Servicios/ })).toBeInTheDocument()
  })

  it('arranca con los desplegables cerrados', () => {
    renderNavbar()
    expect(filaEscritorio().getByRole('button', { name: /Propiedades/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('Propiedades abre cinco enlaces, ninguno con tipo_operacion', async () => {
    const usuario = userEvent.setup()
    renderNavbar()

    const toggle = filaEscritorio().getByRole('button', { name: /Propiedades/ })
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

    await usuario.click(filaEscritorio().getByRole('button', { name: /Servicios/ }))

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

    const toggle = filaEscritorio().getByRole('button', { name: /Propiedades/ })
    await usuario.click(toggle)
    expect(document.querySelector('.navbar-dropdown-menu')).toBeInTheDocument()

    await usuario.click(document.body)
    expect(document.querySelector('.navbar-dropdown-menu')).not.toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('mantiene el resto de la navegación', () => {
    renderNavbar()
    const bloqueIzquierdo = within(document.querySelector('.navbar-left') as HTMLElement)
    expect(bloqueIzquierdo.getByRole('link', { name: 'Quiénes somos' })).toBeInTheDocument()
    expect(filaEscritorio().getByRole('link', { name: 'Contacto' })).toBeInTheDocument()
    expect(filaEscritorio().getByRole('link', { name: 'Acceso al panel' })).toBeInTheDocument()
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
    // cualquiera que entre al sitio. Vale para las dos mitades: el drawer
    // repite el icono, no lo rotula.
    expect(screen.queryByRole('link', { name: 'Administración' })).not.toBeInTheDocument()
    expect(filaEscritorio().getByRole('link', { name: 'Acceso al panel' })).toHaveAttribute(
      'href',
      '/admin',
    )
    expect(within(panelMovil()).getByRole('link', { name: 'Acceso al panel' })).toHaveAttribute(
      'href',
      '/admin',
    )
  })

  it('Contacto se destaca como pastilla y no como link suelto', () => {
    renderNavbar()
    const contacto = filaEscritorio().getByRole('link', { name: 'Contacto' })
    expect(contacto).toHaveClass('navbar-contacto-btn')
    expect(contacto).toHaveAttribute('href', '#contacto')
  })
})

describe('Navbar — drawer móvil', () => {
  it('la hamburguesa apunta al panel y arranca cerrada', () => {
    renderNavbar()

    expect(hamburguesa()).toHaveAttribute('aria-expanded', 'false')
    expect(hamburguesa()).toHaveAttribute('aria-controls', panelMovil().id)
    expect(panelMovil()).not.toHaveClass('abierto')
  })

  it('alterna aria-expanded y la clase del panel sin cambiar de rótulo', async () => {
    const usuario = userEvent.setup()
    renderNavbar()

    await usuario.click(hamburguesa())
    expect(hamburguesa()).toHaveAttribute('aria-expanded', 'true')
    expect(panelMovil()).toHaveClass('abierto')

    // El rótulo no cambia a "Cerrar menú": el estado ya lo dice aria-expanded, y
    // un nombre que muta hace que el lector anuncie otro control.
    await usuario.click(screen.getByRole('button', { name: 'Menú' }))
    expect(hamburguesa()).toHaveAttribute('aria-expanded', 'false')
    expect(panelMovil()).not.toHaveClass('abierto')
  })

  it('al abrir manda el foco al primer enlace del panel', async () => {
    const usuario = userEvent.setup()
    renderNavbar()

    await usuario.click(hamburguesa())

    const primero = within(panelMovil()).getAllByRole('link')[0]
    expect(primero).toHaveFocus()
    expect(primero).toHaveTextContent('Quiénes somos')
  })

  it('cierra con Escape', async () => {
    const usuario = userEvent.setup()
    renderNavbar()

    await usuario.click(hamburguesa())
    await usuario.keyboard('{Escape}')

    expect(hamburguesa()).toHaveAttribute('aria-expanded', 'false')
  })

  it('cierra al hacer clic en el overlay, que sólo existe con el menú abierto', async () => {
    const usuario = userEvent.setup()
    renderNavbar()

    expect(screen.queryByTestId('navbar-drawer-overlay')).not.toBeInTheDocument()

    await usuario.click(hamburguesa())
    await usuario.click(screen.getByTestId('navbar-drawer-overlay'))

    expect(hamburguesa()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('navbar-drawer-overlay')).not.toBeInTheDocument()
  })

  it('cierra al navegar', async () => {
    const usuario = userEvent.setup()
    renderNavbar()

    await usuario.click(hamburguesa())
    await usuario.click(within(panelMovil()).getByRole('link', { name: 'Quiénes somos' }))

    expect(hamburguesa()).toHaveAttribute('aria-expanded', 'false')
  })

  it('cierra al tocar Contacto, que es un ancla y no cambia la ruta', async () => {
    const usuario = userEvent.setup()
    renderNavbar()

    await usuario.click(hamburguesa())
    await usuario.click(within(panelMovil()).getByRole('link', { name: 'Contacto' }))

    expect(hamburguesa()).toHaveAttribute('aria-expanded', 'false')
  })

  it('bloquea el scroll del body mientras está abierto y lo restaura al cerrar', async () => {
    const usuario = userEvent.setup()
    renderNavbar()

    expect(document.body.style.overflow).toBe('')

    await usuario.click(hamburguesa())
    expect(document.body.style.overflow).toBe('hidden')

    await usuario.click(hamburguesa())
    expect(document.body.style.overflow).toBe('')
  })

  it('restaura el scroll del body si la navbar se desmonta con el menú abierto', async () => {
    const usuario = userEvent.setup()
    const { unmount } = renderNavbar()

    await usuario.click(hamburguesa())
    expect(document.body.style.overflow).toBe('hidden')

    unmount()
    expect(document.body.style.overflow).toBe('')
  })

  it('los desplegables son acordeones y no menús flotantes', async () => {
    const usuario = userEvent.setup()
    renderNavbar()

    await usuario.click(hamburguesa())
    const panel = within(panelMovil())

    await usuario.click(panel.getByRole('button', { name: /Propiedades/ }))
    const sublista = document.getElementById('navbar-drawer-propiedades') as HTMLElement
    const enlaces = within(sublista).getAllByRole('link')
    expect(enlaces).toHaveLength(5)
    enlaces.forEach(a => {
      expect(a.getAttribute('href')).toContain('/propiedades?tipo_propiedad=')
    })

    // El acordeón vive dentro del panel, no en un menú absoluto centrado: el
    // markup flotante de escritorio no se reusa acá.
    expect(sublista.closest('.navbar-drawer')).toBe(panelMovil())
  })

  it('los acordeones abren y cierran de forma independiente', async () => {
    const usuario = userEvent.setup()
    renderNavbar()

    await usuario.click(hamburguesa())
    const panel = within(panelMovil())
    const propiedades = panel.getByRole('button', { name: /Propiedades/ })
    const servicios = panel.getByRole('button', { name: /Servicios/ })

    expect(propiedades).toHaveAttribute('aria-expanded', 'false')
    expect(panel.queryByRole('link', { name: 'Casas' })).not.toBeInTheDocument()

    await usuario.click(propiedades)
    await usuario.click(servicios)
    expect(propiedades).toHaveAttribute('aria-expanded', 'true')
    expect(servicios).toHaveAttribute('aria-expanded', 'true')

    // Cerrar uno no toca al otro: cada acordeón tiene su propio estado.
    await usuario.click(propiedades)
    expect(propiedades).toHaveAttribute('aria-expanded', 'false')
    expect(servicios).toHaveAttribute('aria-expanded', 'true')
    expect(panel.getByRole('link', { name: SERVICIOS[0].titulo })).toBeInTheDocument()
  })

  it('el panel ofrece los mismos destinos que la fila de escritorio', async () => {
    const usuario = userEvent.setup()
    renderNavbar()

    await usuario.click(hamburguesa())
    const panel = within(panelMovil())

    expect(panel.getByRole('link', { name: 'Quiénes somos' })).toHaveAttribute('href', '/nosotros')
    expect(panel.getByRole('link', { name: 'Contacto' })).toHaveClass('navbar-contacto-btn')
    expect(panel.getByRole('link', { name: 'Acceso al panel' })).toBeInTheDocument()
    expect(panel.getByRole('button', { name: /Propiedades/ })).toBeInTheDocument()
    expect(panel.getByRole('button', { name: /Servicios/ })).toBeInTheDocument()
  })

  /**
   * Regresión de un bug que ningún test podía ver y que dejaba el menú móvil
   * inservible: con el drawer adentro de `<nav class="navbar">`, el
   * `backdrop-filter` de la navbar la convierte en bloque contenedor de sus
   * descendientes `position: fixed`. El `top: var(--navbar-h); bottom: 0` del
   * panel se resolvía entonces contra los 61px de la barra en lugar de contra
   * la ventana: quedaba de alto 0 y su `overflow` recortaba el menú entero. El
   * botón alternaba `aria-expanded` y el foco entraba, pero no se veía nada.
   *
   * jsdom no calcula layout, así que no puede reproducir el síntoma. Lo que sí
   * puede es fijar la condición estructural que lo causaba.
   */
  it('el drawer se monta fuera de .navbar (el backdrop-filter lo colapsaría)', () => {
    const { container } = renderNavbar()

    const barra = container.querySelector('.navbar')
    const panel = container.querySelector('.navbar-drawer')

    expect(barra).not.toBeNull()
    expect(panel).not.toBeNull()
    expect(barra!.contains(panel!)).toBe(false)
  })
})
