import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import PersonasLista from './Lista'
import { personasApi } from '../../../api/personas'

vi.mock('../../../api/personas', () => ({
  personasApi: { listar: vi.fn(), etiquetas: vi.fn() },
}))

const listar = vi.mocked(personasApi.listar)
const etiquetas = vi.mocked(personasApi.etiquetas)

const ANA = {
  id: 1, full_name: 'Ana Pérez', document_type: 'DNI', document_number: '30111222',
  created_at: '', tags: ['inversor'],
  roles: { propietario: 2, comprador: 0, vendedor: 0, inquilino: 0, interesado: 0 },
}

beforeEach(() => {
  listar.mockResolvedValue({ total: 1, items: [ANA] })
  etiquetas.mockResolvedValue([{ nombre: 'inversor', cantidad: 1 }])
})

function renderLista() {
  return render(<MemoryRouter><PersonasLista /></MemoryRouter>)
}

it('lista personas con chips de rol y etiquetas', async () => {
  renderLista()
  expect(await screen.findByText('Ana Pérez')).toBeInTheDocument()
  expect(screen.getByText('Propietario · 2')).toBeInTheDocument()
  expect(screen.getByText('inversor')).toBeInTheDocument()
  // Acotado a la fila: el <select> de filtro "Rol" también tiene una opción
  // "Comprador" en el DOM (siempre, sin depender de los datos), así que
  // buscarla en todo el documento da un falso positivo.
  const fila = screen.getByText('Ana Pérez').closest('tr') as HTMLElement
  expect(within(fila).queryByText(/Comprador/)).not.toBeInTheDocument()
})

it('los filtros arman la query', async () => {
  const usuario = userEvent.setup()
  renderLista()
  await screen.findByText('Ana Pérez')

  await usuario.selectOptions(screen.getByLabelText('Rol'), 'propietario')
  await waitFor(() => expect(listar).toHaveBeenLastCalledWith(expect.objectContaining({ rol: 'propietario' })))

  await usuario.selectOptions(screen.getByLabelText('Etiqueta'), 'inversor')
  await waitFor(() => expect(listar).toHaveBeenLastCalledWith(expect.objectContaining({ tag: 'inversor' })))
})
