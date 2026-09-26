import { render, screen } from '@testing-library/react'
import GraficoBarras from './GraficoBarras'

it('dibuja una barra por categoría y serie, con etiquetas', () => {
  render(
    <GraficoBarras
      categorias={['ene 26', 'feb 26']}
      series={[{ nombre: 'Ganadas', valores: [2, 5] }, { nombre: 'Perdidas', valores: [1, 0] }]}
    />,
  )
  const svg = screen.getByRole('img', { name: /Ganadas.*Perdidas/ })
  expect(svg.querySelectorAll('rect.barra')).toHaveLength(4)
  expect(screen.getByText('ene 26')).toBeInTheDocument()
  expect(screen.getByText('feb 26')).toBeInTheDocument()
})

it('con todo en cero no rompe ni divide por cero', () => {
  render(<GraficoBarras categorias={['ene 26']} series={[{ nombre: 'Ganadas', valores: [0] }]} />)
  const barra = document.querySelector('rect.barra')!
  expect(Number(barra.getAttribute('height'))).toBe(0)
})
