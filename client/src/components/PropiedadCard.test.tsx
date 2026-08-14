import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PropiedadCard from './PropiedadCard'
import type { EstadoComercial, PropiedadListItem, TipoOperacion } from '../types/propiedad'

function propiedad(over: Partial<PropiedadListItem> = {}): PropiedadListItem {
  return {
    id: 1,
    titulo: 'Casa en el centro',
    tipo_propiedad: 'casa',
    tipo_operacion: 'venta',
    estado_comercial: 'disponible',
    moneda: 'USD',
    precio: 120000,
    dormitorios: 3,
    banos: 2,
    m2_cubiertos: 140,
    m2_totales: 200,
    creado_en: '2026-01-01T10:00:00',
    ubicacion: null,
    medios: [],
    ...over,
  }
}

function renderCard(over: Partial<PropiedadListItem> = {}) {
  const p = propiedad(over)
  const { container } = render(
    <MemoryRouter>
      <PropiedadCard propiedad={p} />
    </MemoryRouter>,
  )
  return { container, tarjeta: container.querySelector('.prop-card')! }
}

/** La faja diagonal, si la tarjeta la tiene. */
function faja(container: HTMLElement) {
  return container.querySelector('.prop-card-faja')
}

describe('PropiedadCard — operaciones cerradas', () => {
  it('una propiedad disponible no lleva faja ni queda atenuada', () => {
    const { container, tarjeta } = renderCard({ estado_comercial: 'disponible' })

    expect(faja(container)).toBeNull()
    expect(tarjeta.className).not.toContain('prop-card--cerrada')
  })

  it.each([
    ['venta', 'Vendido'],
    ['alquiler', 'Alquilado'],
    ['temporal', 'Alquilado'],
  ] as [TipoOperacion, string][])(
    'una operación cerrada de %s muestra la faja "%s"',
    (tipo_operacion, esperado) => {
      const { container } = renderCard({ estado_comercial: 'cerrada', tipo_operacion })

      expect(faja(container)).toHaveTextContent(esperado)
    },
  )

  it('una propiedad reservada muestra la faja "Reservado"', () => {
    const { container } = renderCard({ estado_comercial: 'reservada' })

    expect(faja(container)).toHaveTextContent('Reservado')
  })

  it('la tarjeta cerrada se marca con su clase para atenuarla', () => {
    const { tarjeta } = renderCard({ estado_comercial: 'cerrada' })

    expect(tarjeta.className).toContain('prop-card--cerrada')
  })

  it('sigue siendo un enlace al detalle aunque esté cerrada', () => {
    renderCard({ id: 42, estado_comercial: 'cerrada' })

    expect(screen.getByRole('link')).toHaveAttribute('href', '/propiedades/42')
  })

  it('una propiedad dada de baja no lleva faja: no debería llegar al sitio público', () => {
    const { container } = renderCard({ estado_comercial: 'baja' as EstadoComercial })

    expect(faja(container)).toBeNull()
  })

  it('el título y el precio se siguen mostrando en una operación cerrada', () => {
    renderCard({ estado_comercial: 'cerrada', precio: 120000, moneda: 'USD' })

    expect(screen.getByText('Casa en el centro')).toBeInTheDocument()
    expect(screen.getByText('U$D 120.000')).toBeInTheDocument()
  })
})
