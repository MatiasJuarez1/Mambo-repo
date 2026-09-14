import { render, screen } from '@testing-library/react'
import BloqueVinculos from './BloqueVinculos'

it('muestra el estado vacío cuando no hay hijos', () => {
  render(<BloqueVinculos titulo="Propiedades" vacio="Sin propiedades">{[]}</BloqueVinculos>)
  expect(screen.getByRole('heading', { name: 'Propiedades' })).toBeInTheDocument()
  expect(screen.getByText('Sin propiedades')).toBeInTheDocument()
})

it('renderiza los hijos cuando los hay', () => {
  render(<BloqueVinculos titulo="Reservas" vacio="Sin reservas">{[<li key="1">Una</li>]}</BloqueVinculos>)
  expect(screen.getByText('Una')).toBeInTheDocument()
  expect(screen.queryByText('Sin reservas')).not.toBeInTheDocument()
})
