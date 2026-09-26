import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import BandejaRecordatorios from './BandejaRecordatorios'
import type { Recordatorio, Recordatorios } from '../../../types/alquileres'

const base = {
  contrato_id: 3, propiedad: { id: 7, titulo: 'Depto en La Plata', estado_comercial: 'cerrada' as const },
  inquilinos: [{ person_id: 1, full_name: 'Ana Pérez', rol: 'inquilino' as const }], moneda: 'ARS',
}

const ITEMS: Recordatorio[] = [
  { ...base, tipo: 'cobro_vencido',    fecha: '2026-09-13', dias: -5, referencia_id: 101, monto: '120000.00', detalle: 'Agosto 2026' },
  { ...base, tipo: 'ajuste',           fecha: '2026-09-15', dias: -3, referencia_id: 55,  monto: '120000.00', detalle: 'Ajuste ICL' },
  { ...base, tipo: 'cobro_por_vencer', fecha: '2026-09-28', dias: 10, referencia_id: 102, monto: '120000.00', detalle: 'Septiembre 2026' },
  { ...base, tipo: 'fin_contrato',     fecha: '2026-10-13', dias: 25, referencia_id: 3,   monto: '120000.00', detalle: 'Termina el contrato' },
]

function datos(items: Recordatorio[], dias = 30): Recordatorios {
  const por_tipo = { cobro_vencido: 0, cobro_por_vencer: 0, ajuste: 0, fin_contrato: 0 }
  items.forEach(i => { por_tipo[i.tipo] += 1 })
  return { hoy: '2026-09-18', dias, total: items.length, por_tipo, items }
}

const renderBandeja = (d: Recordatorios, compacto = false) =>
  render(<MemoryRouter><BandejaRecordatorios datos={d} compacto={compacto} /></MemoryRouter>)

it('agrupa por tipo en el orden del email, con chip y link a la ficha', () => {
  renderBandeja(datos(ITEMS))
  const titulos = screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)
  expect(titulos).toEqual(['Cobros vencidos (1)', 'Cobros por vencer (1)', 'Ajustes (1)', 'Contratos que terminan (1)'])

  const vencidos = screen.getByRole('region', { name: 'Cobros vencidos (1)' })
  expect(within(vencidos).getByRole('link', { name: 'Depto en La Plata' }))
    .toHaveAttribute('href', '/admin/alquileres/3#cobro-101')
  expect(within(vencidos).getByText('Hace 5 días')).toBeInTheDocument()
  expect(within(vencidos).getByText('ARS 120.000')).toBeInTheDocument()
  expect(within(vencidos).getByText('Agosto 2026')).toBeInTheDocument()

  const fin = screen.getByRole('region', { name: 'Contratos que terminan (1)' })
  expect(within(fin).getByRole('link', { name: 'Depto en La Plata' })).toHaveAttribute('href', '/admin/alquileres/3')
  expect(within(fin).getByText('En 25 días')).toBeInTheDocument()
})

it('vacía: lo dice con la ventana', () => {
  renderBandeja(datos([], 60))
  expect(screen.getByText('Nada pendiente en los próximos 60 días.')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { level: 3 })).toBeNull()
})

it('compacta: corta a 8 y ofrece ver todos', () => {
  const muchos = Array.from({ length: 11 }, (_, i) => ({ ...ITEMS[0], referencia_id: 200 + i, fecha: `2026-09-0${(i % 9) + 1}` }))
  renderBandeja(datos(muchos), true)
  expect(screen.getAllByRole('listitem')).toHaveLength(8)
  expect(screen.getByRole('link', { name: 'Ver los 11' })).toHaveAttribute('href', '/admin/alquileres/recordatorios')
})
