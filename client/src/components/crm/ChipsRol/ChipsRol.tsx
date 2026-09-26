import type { Roles, Rol } from '../../../types/persona'
import { LABEL_ROL } from '../../../lib/crm'
import './ChipsRol.css'

const ORDEN: Rol[] = ['propietario', 'comprador', 'vendedor', 'inquilino', 'garante', 'interesado']

/** Roles derivados de una persona. Solo los que tienen vínculos; nunca se editan. */
export default function ChipsRol({ roles }: { roles: Roles }) {
  const activos = ORDEN.filter(rol => roles[rol] > 0)
  if (activos.length === 0) return <span className="chips-rol-vacio">Sin vínculos</span>
  return (
    <span className="chips-rol">
      {activos.map(rol => (
        <span key={rol} className={`chip-rol chip-rol-${rol}`}>
          {LABEL_ROL[rol]} · {roles[rol]}
        </span>
      ))}
    </span>
  )
}
