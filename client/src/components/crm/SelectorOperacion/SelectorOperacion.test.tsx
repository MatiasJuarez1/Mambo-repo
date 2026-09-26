import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SelectorOperacion from './SelectorOperacion'
import { operacionesApi } from '../../../api/operaciones'
import type { OperacionListItem } from '../../../types/operacion'

vi.mock('../../../api/operaciones', () => ({
  operacionesApi: { listar: vi.fn() },
}))

const OPERACIONES: OperacionListItem[] = [
  { id: 1, title: 'Venta depto Rivadavia' } as OperacionListItem,
  { id: 2, title: 'Alquiler casa Villa Elisa' } as OperacionListItem,
]

beforeEach(() => vi.clearAllMocks())

it('sin texto no muestra panel ni busca', async () => {
  vi.mocked(operacionesApi.listar).mockResolvedValue({ total: 2, items: OPERACIONES })
  render(<SelectorOperacion valor={null} onChange={vi.fn()} />)
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
})

it('pide el listado con el techo del router (GET /api/v1/deals limita a 200)', async () => {
  vi.mocked(operacionesApi.listar).mockResolvedValue({ total: 2, items: OPERACIONES })
  render(<SelectorOperacion valor={null} onChange={vi.fn()} />)
  await waitFor(() => expect(operacionesApi.listar).toHaveBeenCalledWith({ limit: 200 }))
})

it('filtra por título client-side', async () => {
  vi.mocked(operacionesApi.listar).mockResolvedValue({ total: 2, items: OPERACIONES })
  const usuario = userEvent.setup()
  render(<SelectorOperacion valor={null} onChange={vi.fn()} />)

  await usuario.type(screen.getByRole('combobox'), 'rivadavia')
  await waitFor(() => expect(screen.getByText('Venta depto Rivadavia')).toBeInTheDocument())
  expect(screen.queryByText('Alquiler casa Villa Elisa')).not.toBeInTheDocument()
})

it('elegir una operación llama onChange y limpia el texto', async () => {
  vi.mocked(operacionesApi.listar).mockResolvedValue({ total: 2, items: OPERACIONES })
  const onChange = vi.fn()
  const usuario = userEvent.setup()
  render(<SelectorOperacion valor={null} onChange={onChange} />)

  await usuario.type(screen.getByRole('combobox'), 'rivadavia')
  await waitFor(() => screen.getByText('Venta depto Rivadavia'))
  await usuario.click(screen.getByText('Venta depto Rivadavia'))

  expect(onChange).toHaveBeenCalledWith({ id: 1, title: 'Venta depto Rivadavia' })
})

it('con valor elegido muestra el título y un botón Quitar', () => {
  render(<SelectorOperacion valor={{ id: 1, title: 'Venta depto Rivadavia' }} onChange={vi.fn()} />)
  expect(screen.getByText('Venta depto Rivadavia')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Quitar' })).toBeInTheDocument()
})

it('bloqueada oculta el botón Quitar', () => {
  render(
    <SelectorOperacion
      valor={{ id: 1, title: 'Venta depto Rivadavia' }}
      onChange={vi.fn()}
      bloqueada
    />,
  )
  expect(screen.queryByRole('button', { name: 'Quitar' })).not.toBeInTheDocument()
})
