import { render, screen } from '@testing-library/react'
import Badge from './Badge'

it('mapea hecha a verde y cancelada a rojo, con etiqueta capitalizada', () => {
  render(<Badge value="hecha" />)
  expect(screen.getByText('Hecha')).toHaveClass('badge-ok')

  render(<Badge value="cancelada" />)
  expect(screen.getByText('Cancelada')).toHaveClass('badge-baja')
})
