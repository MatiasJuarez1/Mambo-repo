import { render, screen } from '@testing-library/react'
import DatosContacto from './DatosContacto'
import {
  DIRECCION,
  EMAIL_CONTACTO,
  HORARIO,
  TELEFONO_DISPLAY,
  TELEFONO_NUMERO,
  WHATSAPP_DISPLAY,
  WHATSAPP_NUMERO,
} from '../config/contacto'

describe('DatosContacto', () => {
  it('muestra la dirección completa de la oficina', () => {
    render(<DatosContacto />)
    // Los <br /> parten el texto en tres nodos: se consulta el link entero.
    const oficina = screen.getByRole('link', { name: new RegExp(DIRECCION.calle) })
    expect(oficina).toHaveTextContent(DIRECCION.calle)
    expect(oficina).toHaveTextContent(DIRECCION.detalle)
    expect(oficina).toHaveTextContent(DIRECCION.ciudad)
  })

  it('el teléfono se puede marcar y el WhatsApp abre el chat', () => {
    render(<DatosContacto />)

    expect(screen.getByRole('link', { name: TELEFONO_DISPLAY })).toHaveAttribute(
      'href',
      `tel:${TELEFONO_NUMERO}`,
    )
    // Son dos números distintos: el error fácil es que uno pise al otro.
    expect(TELEFONO_NUMERO).not.toContain(WHATSAPP_NUMERO)

    const wsp = screen.getByRole('link', { name: WHATSAPP_DISPLAY })
    expect(wsp.getAttribute('href')).toContain(`https://wa.me/${WHATSAPP_NUMERO}`)
  })

  it('el mail abre el cliente de correo', () => {
    render(<DatosContacto />)
    expect(screen.getByRole('link', { name: EMAIL_CONTACTO })).toHaveAttribute(
      'href',
      `mailto:${EMAIL_CONTACTO}`,
    )
  })

  it('el horario se muestra como texto, no como link', () => {
    render(<DatosContacto />)
    expect(screen.getByText(HORARIO)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: HORARIO })).not.toBeInTheDocument()
  })

  it('la dirección enlaza a un mapa que se abre en otra pestaña', () => {
    render(<DatosContacto />)
    const mapa = screen.getByRole('link', { name: new RegExp(DIRECCION.calle) })
    expect(mapa).toHaveAttribute('target', '_blank')
    expect(mapa).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
