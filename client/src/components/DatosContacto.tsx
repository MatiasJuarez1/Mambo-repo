import {
  DIRECCION,
  EMAIL_CONTACTO,
  HORARIO,
  LINK_MAPA,
  TELEFONO_DISPLAY,
  TELEFONO_NUMERO,
  WHATSAPP_DISPLAY,
  linkWhatsApp,
} from '../config/contacto'

const MENSAJE_WSP = 'Hola Mambo Groups! Escribo desde la web.'

/**
 * Ficha de contacto: oficinas, teléfonos, mail y horario. La usan el bloque
 * #contacto de las páginas públicas y el footer; el layout (columna angosta o
 * fila) lo decide el contenedor, no este componente.
 */
export default function DatosContacto() {
  return (
    <ul className="datos-contacto">
      <li className="datos-contacto-item">
        <span className="datos-contacto-label">Oficinas</span>
        <a
          className="datos-contacto-valor"
          href={LINK_MAPA}
          target="_blank"
          rel="noopener noreferrer"
        >
          {DIRECCION.calle}
          <br />
          {DIRECCION.detalle}
          <br />
          {DIRECCION.ciudad}
        </a>
      </li>

      <li className="datos-contacto-item">
        <span className="datos-contacto-label">WhatsApp</span>
        <a
          className="datos-contacto-valor"
          href={linkWhatsApp(MENSAJE_WSP)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {WHATSAPP_DISPLAY}
        </a>
      </li>

      <li className="datos-contacto-item">
        <span className="datos-contacto-label">Teléfono</span>
        {/* href en formato internacional para que marque igual desde afuera del país */}
        <a className="datos-contacto-valor" href={`tel:${TELEFONO_NUMERO}`}>
          {TELEFONO_DISPLAY}
        </a>
      </li>

      <li className="datos-contacto-item">
        <span className="datos-contacto-label">Email</span>
        <a className="datos-contacto-valor" href={`mailto:${EMAIL_CONTACTO}`}>
          {EMAIL_CONTACTO}
        </a>
      </li>

      <li className="datos-contacto-item">
        <span className="datos-contacto-label">Horario</span>
        {/* Sin link: es el único dato que no se puede accionar. */}
        <span className="datos-contacto-valor datos-contacto-texto">{HORARIO}</span>
      </li>
    </ul>
  )
}
