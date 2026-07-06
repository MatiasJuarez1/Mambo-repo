// Datos de contacto de Mambo Groups.
// TODO: reemplazar WHATSAPP_NUMERO por el número real (formato internacional sin +, ej. 549381...).
export const WHATSAPP_NUMERO = '5493810000000'
export const EMAIL_CONTACTO  = 'info@mambogroups.com'

/** Construye un link de WhatsApp con mensaje prellenado. */
export function linkWhatsApp(mensaje: string): string {
  return `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensaje)}`
}
