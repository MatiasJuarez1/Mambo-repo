import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Servicios from './Servicios'
import { DIRECCION, EMAIL_CONTACTO, WHATSAPP_NUMERO } from '../../config/contacto'
import { SERVICIOS, SERVICIOS_INTRO } from './catalogo-servicios'

// jsdom no implementa ninguna de las dos APIs que usa la página: sin estos dobles,
// el observer del índice y el scroll al ancla revientan al montar.
beforeAll(() => {
  class IntersectionObserverFalso {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
    root = null
    rootMargin = ''
    thresholds: number[] = []
  }
  vi.stubGlobal('IntersectionObserver', IntersectionObserverFalso)
  Element.prototype.scrollIntoView = vi.fn()
})

function montar(ruta = '/servicios') {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Servicios />
    </MemoryRouter>,
  )
}

describe('Servicios', () => {
  it('renderiza los cinco títulos de servicio', () => {
    montar()
    SERVICIOS.forEach(s => {
      expect(screen.getByRole('heading', { name: s.titulo })).toBeInTheDocument()
    })
  })

  it('cada bloque tiene un elemento con el id del slug', () => {
    const { container } = montar()
    SERVICIOS.forEach(s => {
      const bloque = container.querySelector(`#${s.slug}`)
      expect(bloque).not.toBeNull()
      expect(bloque?.tagName.toLowerCase()).toBe('section')
    })
  })

  it('el índice tiene cinco enlaces que apuntan a las anclas', () => {
    montar()
    const indice = screen.getByRole('navigation', { name: 'Índice de servicios' })
    const enlaces = within(indice).getAllByRole('link')

    expect(enlaces).toHaveLength(SERVICIOS.length)
    enlaces.forEach((enlace, i) => {
      expect(enlace).toHaveAttribute('href', `#${SERVICIOS[i].slug}`)
    })
  })

  it('renderiza el párrafo diferencial del hero', () => {
    montar()
    expect(screen.getByText(SERVICIOS_INTRO)).toBeInTheDocument()
  })

  it('lista todas las viñetas de Puesta en Valor de Propiedades', () => {
    const { container } = montar()
    const servicio = SERVICIOS.find(s => s.slug === 'puesta-en-valor')!
    const bloque = container.querySelector('#puesta-en-valor') as HTMLElement

    servicio.items.forEach(item => {
      expect(within(bloque).getByText(item)).toBeInTheDocument()
    })
  })

  it('cada sección se anuncia con su propio título', () => {
    const { container } = montar()
    SERVICIOS.forEach(s => {
      const bloque = container.querySelector(`#${s.slug}`)
      expect(bloque).toHaveAttribute('aria-labelledby', `titulo-${s.slug}`)
      expect(container.querySelector(`#titulo-${s.slug}`)).toHaveTextContent(s.titulo)
    })
  })

  it('montar con un hash en la ruta no tira excepción', () => {
    expect(() => montar('/servicios#urbanizaciones')).not.toThrow()
    expect(screen.getByRole('heading', { name: /Urbanizaciones/ })).toBeInTheDocument()
  })

  it('un hash inválido no tira excepción', () => {
    expect(() => montar('/servicios#no-existe')).not.toThrow()
  })

  it('el CTA lleva a WhatsApp con un mensaje prellenado', () => {
    montar()
    const boton = screen.getByRole('link', { name: 'Conversemos' })
    const href = boton.getAttribute('href')!

    expect(href).toContain(`https://wa.me/${WHATSAPP_NUMERO}`)
    // Sin ?text= el chat abre vacío y se pierde el origen del contacto.
    expect(href).toContain('?text=')
    expect(decodeURIComponent(href.split('?text=')[1])).toContain('servicios')
    expect(boton).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('el CTA muestra la ficha de contacto con la oficina y el mail', () => {
    montar()
    expect(
      screen.getByRole('link', { name: new RegExp(DIRECCION.calle) }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: EMAIL_CONTACTO })).toHaveAttribute(
      'href',
      `mailto:${EMAIL_CONTACTO}`,
    )
  })
})
