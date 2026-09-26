import { render, screen } from '@testing-library/react'
import GraficoEmbudo from './GraficoEmbudo'

it('una fila por etapa, proporcional al máximo', () => {
  render(<GraficoEmbudo etapas={[{ nombre: 'Consulta', valor: 10, detalle: '50 %' }, { nombre: 'Visita', valor: 5 }]} />)
  const filas = screen.getAllByRole('listitem')
  expect(filas).toHaveLength(2)
  expect(filas[0].querySelector('.embudo-barra')).toHaveStyle({ width: '100%' })
  expect(filas[1].querySelector('.embudo-barra')).toHaveStyle({ width: '50%' })
  expect(screen.getByText('50 %')).toBeInTheDocument()
})

it('con ceros las barras quedan en 0 %', () => {
  render(<GraficoEmbudo etapas={[{ nombre: 'Consulta', valor: 0 }]} />)
  expect(document.querySelector('.embudo-barra')).toHaveStyle({ width: '0%' })
})
