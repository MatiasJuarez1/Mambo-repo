// Datos de contacto de Mambo Groups. Única fuente: los consumen el bloque
// #contacto de las páginas públicas, el footer y el botón de WhatsApp del
// detalle de propiedad. Si cambia un número, cambia acá y en ningún otro lado.

// Formato internacional sin + ni espacios, como lo pide wa.me (+54 9 381 636 5449).
export const WHATSAPP_NUMERO = '5493816365449'
export const WHATSAPP_DISPLAY = '381 636-5449'

// Celular de oficina, distinto del WhatsApp.
export const TELEFONO_NUMERO = '+5493813668123'
export const TELEFONO_DISPLAY = '381 366-8123'

export const EMAIL_CONTACTO = 'info@mambogroups.com'

export const DIRECCION = {
  calle: 'San Martín 930',
  detalle: 'Piso 3, Oficina 1',
  ciudad: 'San Miguel de Tucumán',
}

export const HORARIO = 'Lunes a viernes, 9.30 a 17 h'

/** Construye un link de WhatsApp con mensaje prellenado. */
export function linkWhatsApp(mensaje: string): string {
  return `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensaje)}`
}

/**
 * Búsqueda en Google Maps por la dirección escrita, no un place ID: si la ficha
 * del negocio todavía no existe o cambia, el link sigue llevando a la cuadra.
 */
export const LINK_MAPA = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  `${DIRECCION.calle}, ${DIRECCION.ciudad}`,
)}`
