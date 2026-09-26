import type { Usuario } from '../types/auth'

// Mientras el CRM está a prueba en producción solo lo ven los usuarios con este
// rol. Para liberarlo a todos alcanza con que `veCrm` devuelva `true`.
export const ROL_BETA = 'beta'

export function veCrm(usuario: Usuario | null): boolean {
  return usuario?.roles.includes(ROL_BETA) ?? false
}
