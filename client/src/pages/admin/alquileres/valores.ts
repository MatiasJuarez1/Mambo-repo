import type { Contrato, Moneda, RolParteContrato } from '../../../types/alquileres'
import type { PersonaBrief } from '../../../types/persona'
import type { ValoresContrato } from '../../../components/crm/FormularioContrato/FormularioContrato'

const porRol = (c: Contrato, rol: RolParteContrato): PersonaBrief[] =>
  c.partes.filter(p => p.rol === rol).map(p => ({ id: p.person_id, full_name: p.full_name }))

/** Lleva un contrato del backend a los valores del formulario (edición y renovación). */
export function valoresDesdeContrato(c: Contrato): ValoresContrato {
  return {
    propiedad:        { id: c.propiedad.id, titulo: c.propiedad.titulo },
    inquilinos:       porRol(c, 'inquilino'),
    propietarios:     porRol(c, 'propietario'),
    garantes:         porRol(c, 'garante'),
    fecha_inicio:     c.fecha_inicio,
    fecha_fin:        c.fecha_fin,
    dia_vencimiento:  String(c.dia_vencimiento),
    monto_inicial:    String(Number(c.monto_inicial)),
    moneda:           c.moneda as Moneda,
    indice:           c.indice,
    frecuencia_meses: c.frecuencia_meses === null ? '' : String(c.frecuencia_meses),
    porcentaje_fijo:  c.porcentaje_fijo === null ? '' : String(Number(c.porcentaje_fijo)),
    administrado:     c.administrado,
    honorarios_pct:   c.honorarios_pct === null ? '' : String(Number(c.honorarios_pct)),
    punitorio_diario_pct: c.punitorio_diario_pct === null ? '' : String(Number(c.punitorio_diario_pct)),
    notas:            c.notas ?? '',
  }
}
