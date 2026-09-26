import { render, screen } from '@testing-library/react'
import ChipsRol from './ChipsRol'

it('muestra solo los roles con cantidad y la cantidad al lado', () => {
  render(<ChipsRol roles={{ propietario: 2, comprador: 0, vendedor: 1, inquilino: 0, garante: 0, interesado: 0 }} />)
  expect(screen.getByText('Propietario · 2')).toBeInTheDocument()
  expect(screen.getByText('Vendedor · 1')).toBeInTheDocument()
  expect(screen.queryByText(/Comprador/)).not.toBeInTheDocument()
})

it('sin roles muestra "Sin vínculos"', () => {
  render(<ChipsRol roles={{ propietario: 0, comprador: 0, vendedor: 0, inquilino: 0, garante: 0, interesado: 0 }} />)
  expect(screen.getByText('Sin vínculos')).toBeInTheDocument()
})
