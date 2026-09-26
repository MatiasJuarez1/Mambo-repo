import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ActividadesLista from './Lista'
import { actividadesApi } from '../../../api/actividades'
import { usuariosApi } from '../../../api/usuarios'
import type { Actividad } from '../../../types/actividad'

// `personasApi`, `propiedadesApi` y `operacionesApi` no se referencian fuera de
// `vi.mock` (los selectores no se ejercitan en estos tests): importarlos sin
// usarlos violaría `noUnusedLocals`, así que los mocks se registran solo por
// la ruta del módulo, sin bindings locales.

vi.mock('../../../api/actividades', () => ({
  actividadesApi: {
    listar: vi.fn(), crear: vi.fn(), marcarHecha: vi.fn(), cancelar: vi.fn(), eliminar: vi.fn(),
  },
}))
vi.mock('../../../api/usuarios', () => ({ usuariosApi: { listar: vi.fn() } }))
vi.mock('../../../api/personas', () => ({
  personasApi: { listar: vi.fn().mockResolvedValue({ total: 0, items: [] }), crear: vi.fn() },
}))
vi.mock('../../../api/propiedades', () => ({ propiedadesApi: { listar: vi.fn().mockResolvedValue([]) } }))
vi.mock('../../../api/operaciones', () => ({ operacionesApi: { listar: vi.fn().mockResolvedValue({ total: 0, items: [] }) } }))

const AHORA = new Date('2026-09-21T12:00:00Z')

const VENCIDA: Actividad = {
  id: 1, title: 'Mostrar depto Rivadavia', activity_type: 'visita', status: 'pendiente',
  description: null, due_at: '2026-09-20T10:00:00Z', done_at: null,
  assigned_to: { id: 2, name: 'Ana P.', email: 'ana@mambo.com.ar' },
  created_by: { id: 1, name: 'Admin', email: 'admin@mambo.com.ar' },
  person: { id: 5, full_name: 'Fam. Gómez' }, propiedad: null, deal: null,
  created_at: '2026-09-19T10:00:00Z', updated_at: '2026-09-19T10:00:00Z',
}

const PENDIENTE_FUTURA: Actividad = {
  ...VENCIDA, id: 2, title: 'Llamar por seña', due_at: '2026-10-01T10:00:00Z', propiedad: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.setSystemTime(AHORA)
  vi.mocked(usuariosApi.listar).mockResolvedValue([
    { id: 1, name: 'Admin', email: 'admin@mambo.com.ar' },
    { id: 2, name: 'Ana P.', email: 'ana@mambo.com.ar' },
  ])
})

afterEach(() => vi.useRealTimers())

it('lista vacía muestra el aviso', async () => {
  vi.mocked(actividadesApi.listar).mockResolvedValue({ total: 0, items: [] })
  render(<ActividadesLista />)
  expect(await screen.findByText('No hay actividades')).toBeInTheDocument()
})

it('sin filtro por defecto pide todas las actividades', async () => {
  vi.mocked(actividadesApi.listar).mockResolvedValue({ total: 0, items: [] })
  render(<ActividadesLista />)
  await waitFor(() => expect(actividadesApi.listar).toHaveBeenCalledWith({}))
})

it('renderiza filas y marca la vencida', async () => {
  vi.mocked(actividadesApi.listar).mockResolvedValue({ total: 2, items: [VENCIDA, PENDIENTE_FUTURA] })
  render(<ActividadesLista />)

  const filaVencida = (await screen.findByText('Mostrar depto Rivadavia')).closest('tr')!
  expect(within(filaVencida).getByText('Vencida')).toBeInTheDocument()

  const filaFutura = screen.getByText('Llamar por seña').closest('tr')!
  expect(within(filaFutura).queryByText('Vencida')).not.toBeInTheDocument()
})

it('cambiar el filtro de estado dispara un nuevo listado', async () => {
  vi.mocked(actividadesApi.listar).mockResolvedValue({ total: 0, items: [] })
  const usuario = userEvent.setup()
  render(<ActividadesLista />)
  await screen.findByText('No hay actividades')

  await usuario.selectOptions(screen.getByLabelText('Estado'), 'hecha')
  await waitFor(() => expect(actividadesApi.listar).toHaveBeenLastCalledWith({ status: 'hecha' }))
})

it('alta manda el payload y agrega la fila sin recargar', async () => {
  vi.mocked(actividadesApi.listar).mockResolvedValue({ total: 0, items: [] })
  vi.mocked(actividadesApi.crear).mockResolvedValue(PENDIENTE_FUTURA)
  const usuario = userEvent.setup()
  render(<ActividadesLista />)
  await screen.findByText('No hay actividades')

  await usuario.click(screen.getByRole('button', { name: '+ Nueva actividad' }))
  // El formulario de alta repite las etiquetas "Tipo"/"Asignado" de la barra de
  // filtros (son campos con el mismo nombre en dos bloques distintos de la
  // pantalla); se acota la búsqueda al `group` del formulario para no ambiguar.
  const formulario = screen.getByRole('group', { name: 'Nueva actividad' })
  await usuario.type(within(formulario).getByLabelText('Título'), 'Llamar por seña')
  await usuario.selectOptions(within(formulario).getByLabelText('Tipo'), 'tarea')
  await usuario.click(within(formulario).getByRole('button', { name: 'Crear' }))

  await waitFor(() => expect(actividadesApi.crear).toHaveBeenCalledWith(
    expect.objectContaining({ title: 'Llamar por seña', activity_type: 'tarea' }),
  ))
  expect(await screen.findByText('Llamar por seña')).toBeInTheDocument()
  expect(actividadesApi.listar).toHaveBeenCalledTimes(1)
})

it('el vencimiento del alta viaja en ISO interpretado como hora local', async () => {
  // El <input type="datetime-local"> entrega "2026-09-22T10:00" sin zona: el alta
  // lo interpreta como hora local del navegador (igual que `formatearFechaHora` al
  // mostrarlo), así que el ISO que sale depende de la zona y se calcula, no se fija.
  vi.mocked(actividadesApi.listar).mockResolvedValue({ total: 0, items: [] })
  vi.mocked(actividadesApi.crear).mockResolvedValue(PENDIENTE_FUTURA)
  const usuario = userEvent.setup()
  render(<ActividadesLista />)
  await screen.findByText('No hay actividades')

  await usuario.click(screen.getByRole('button', { name: '+ Nueva actividad' }))
  const formulario = screen.getByRole('group', { name: 'Nueva actividad' })
  await usuario.type(within(formulario).getByLabelText('Título'), 'Visita')
  await usuario.type(within(formulario).getByLabelText('Vencimiento'), '2026-09-22T10:00')
  await usuario.click(within(formulario).getByRole('button', { name: 'Crear' }))

  await waitFor(() => expect(actividadesApi.crear).toHaveBeenCalledWith(
    expect.objectContaining({ due_at: new Date('2026-09-22T10:00').toISOString() }),
  ))
})

it('marcar hecha actualiza la fila sin recargar la lista', async () => {
  vi.mocked(actividadesApi.listar).mockResolvedValue({ total: 1, items: [PENDIENTE_FUTURA] })
  vi.mocked(actividadesApi.marcarHecha).mockResolvedValue({ ...PENDIENTE_FUTURA, status: 'hecha' })
  const usuario = userEvent.setup()
  render(<ActividadesLista />)
  // Se acota a la fila: "Hecha" también aparece como <option> en el filtro de
  // Estado, que está siempre en el DOM.
  const fila = (await screen.findByText('Llamar por seña')).closest('tr')!

  await usuario.click(within(fila).getByRole('button', { name: 'Hecha' }))
  await waitFor(() => expect(actividadesApi.marcarHecha).toHaveBeenCalledWith(2))
  expect(await within(fila).findByText('Hecha')).toBeInTheDocument()
  expect(actividadesApi.listar).toHaveBeenCalledTimes(1)
})

it('cancelar pide confirmación y actualiza la fila', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.mocked(actividadesApi.listar).mockResolvedValue({ total: 1, items: [PENDIENTE_FUTURA] })
  vi.mocked(actividadesApi.cancelar).mockResolvedValue({ ...PENDIENTE_FUTURA, status: 'cancelada' })
  const usuario = userEvent.setup()
  render(<ActividadesLista />)
  // Idem: "Cancelada" también es un <option> del filtro de Estado.
  const fila = (await screen.findByText('Llamar por seña')).closest('tr')!

  await usuario.click(within(fila).getByRole('button', { name: 'Cancelar' }))
  expect(window.confirm).toHaveBeenCalledWith('¿Cancelar "Llamar por seña"?')
  await waitFor(() => expect(actividadesApi.cancelar).toHaveBeenCalledWith(2))
  expect(await within(fila).findByText('Cancelada')).toBeInTheDocument()
})

it('borrar pide confirmación y saca la fila', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.mocked(actividadesApi.listar).mockResolvedValue({ total: 1, items: [PENDIENTE_FUTURA] })
  vi.mocked(actividadesApi.eliminar).mockResolvedValue(undefined)
  const usuario = userEvent.setup()
  render(<ActividadesLista />)
  await screen.findByText('Llamar por seña')

  await usuario.click(screen.getByRole('button', { name: 'Borrar' }))
  expect(window.confirm).toHaveBeenCalledWith('¿Borrar "Llamar por seña"?')
  await waitFor(() => expect(actividadesApi.eliminar).toHaveBeenCalledWith(2))
  expect(screen.queryByText('Llamar por seña')).not.toBeInTheDocument()
})

it('marcar hecha muestra el error de la API y deja la fila como estaba', async () => {
  vi.mocked(actividadesApi.listar).mockResolvedValue({ total: 1, items: [PENDIENTE_FUTURA] })
  vi.mocked(actividadesApi.marcarHecha).mockRejectedValue(new Error('La actividad ya está completada'))
  const usuario = userEvent.setup()
  render(<ActividadesLista />)
  const fila = (await screen.findByText('Llamar por seña')).closest('tr')!

  await usuario.click(within(fila).getByRole('button', { name: 'Hecha' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('La actividad ya está completada')
  expect(within(fila).getByRole('button', { name: 'Hecha' })).toBeInTheDocument()
  expect(within(fila).getByText('Pendiente')).toBeInTheDocument()
})

it('cancelar muestra el error de la API y deja la fila como estaba', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.mocked(actividadesApi.listar).mockResolvedValue({ total: 1, items: [PENDIENTE_FUTURA] })
  vi.mocked(actividadesApi.cancelar).mockRejectedValue(new Error('La actividad ya está completada'))
  const usuario = userEvent.setup()
  render(<ActividadesLista />)
  const fila = (await screen.findByText('Llamar por seña')).closest('tr')!

  await usuario.click(within(fila).getByRole('button', { name: 'Cancelar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('La actividad ya está completada')
  expect(within(fila).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
})

it('borrar muestra el error de la API y deja la fila en la tabla', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.mocked(actividadesApi.listar).mockResolvedValue({ total: 1, items: [PENDIENTE_FUTURA] })
  vi.mocked(actividadesApi.eliminar).mockRejectedValue(new Error('La actividad ya está completada'))
  const usuario = userEvent.setup()
  render(<ActividadesLista />)
  await screen.findByText('Llamar por seña')

  await usuario.click(screen.getByRole('button', { name: 'Borrar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('La actividad ya está completada')
  expect(screen.getByText('Llamar por seña')).toBeInTheDocument()
})

it('una actividad hecha no muestra los botones Hecha/Cancelar', async () => {
  const hecha: Actividad = { ...PENDIENTE_FUTURA, status: 'hecha', done_at: '2026-09-21T09:00:00Z' }
  vi.mocked(actividadesApi.listar).mockResolvedValue({ total: 1, items: [hecha] })
  render(<ActividadesLista />)
  const fila = (await screen.findByText('Llamar por seña')).closest('tr')!
  expect(within(fila).queryByRole('button', { name: 'Hecha' })).not.toBeInTheDocument()
  expect(within(fila).queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument()
  expect(within(fila).getByRole('button', { name: 'Borrar' })).toBeInTheDocument()
})
