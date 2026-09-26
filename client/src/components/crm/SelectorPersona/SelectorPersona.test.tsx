import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SelectorPersona from './SelectorPersona'
import { personasApi } from '../../../api/personas'

vi.mock('../../../api/personas', () => ({
  personasApi: { listar: vi.fn(), crear: vi.fn() },
}))

const listar = vi.mocked(personasApi.listar)
const crear = vi.mocked(personasApi.crear)

const ANA = {
  id: 1, full_name: 'Ana Pérez', document_type: null, document_number: null,
  created_at: '', tags: [], roles: { propietario: 1, comprador: 0, vendedor: 0, inquilino: 0, garante: 0, interesado: 0 },
}

beforeEach(() => {
  listar.mockResolvedValue({ total: 1, items: [ANA] })
})

it('busca mientras se tipea y emite la persona elegida', async () => {
  const usuario = userEvent.setup()
  const onChange = vi.fn()
  render(<SelectorPersona valor={null} onChange={onChange} />)

  await usuario.type(screen.getByRole('combobox'), 'Ana')

  await waitFor(() => expect(listar).toHaveBeenCalledWith({ search: 'Ana', limit: 8 }))
  await usuario.click(await screen.findByRole('option', { name: /Ana Pérez/ }))
  expect(onChange).toHaveBeenCalledWith({ id: 1, full_name: 'Ana Pérez' })
})

it('muestra la persona elegida y permite quitarla', async () => {
  const usuario = userEvent.setup()
  const onChange = vi.fn()
  render(<SelectorPersona valor={{ id: 1, full_name: 'Ana Pérez' }} onChange={onChange} />)

  expect(screen.getByText('Ana Pérez')).toBeInTheDocument()
  await usuario.click(screen.getByRole('button', { name: 'Quitar' }))
  expect(onChange).toHaveBeenCalledWith(null)
})

it('crea a la persona inline cuando no existe', async () => {
  const usuario = userEvent.setup()
  listar.mockResolvedValue({ total: 0, items: [] })
  crear.mockResolvedValue({ ...ANA, id: 7, full_name: 'Bruno Díaz', first_name: 'Bruno', last_name: 'Díaz', notes: null, contacts: [], updated_at: '' })
  const onChange = vi.fn()
  render(<SelectorPersona valor={null} onChange={onChange} />)

  await usuario.type(screen.getByRole('combobox'), 'Bruno Díaz')
  await usuario.click(await screen.findByRole('button', { name: /Crear a «Bruno Díaz»/ }))
  await usuario.type(screen.getByLabelText('Teléfono'), '221555')
  await usuario.click(screen.getByRole('button', { name: 'Guardar persona' }))

  await waitFor(() =>
    expect(crear).toHaveBeenCalledWith({
      first_name: 'Bruno', last_name: 'Díaz',
      contacts: [{ type: 'phone', value: '221555', is_primary: true }],
    }),
  )
  expect(onChange).toHaveBeenCalledWith({ id: 7, full_name: 'Bruno Díaz' })
})

it('si la búsqueda falla avisa y deja crear igual', async () => {
  const usuario = userEvent.setup()
  listar.mockRejectedValue(new Error('caído'))
  render(<SelectorPersona valor={null} onChange={vi.fn()} />)

  await usuario.type(screen.getByRole('combobox'), 'Zoe')

  expect(await screen.findByText('No se pudo buscar')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Crear a «Zoe»/ })).toBeInTheDocument()
})
