import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PublicacionFormulario from './Formulario'
import { publicacionesApi } from '../../../api/publicaciones'
import { propiedadesApi } from '../../../api/propiedades'

vi.mock('../../../api/publicaciones', () => ({
  publicacionesApi: { obtener: vi.fn(), crear: vi.fn(), actualizar: vi.fn() },
}))
vi.mock('../../../api/propiedades', () => ({
  propiedadesApi: { listar: vi.fn() },
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(propiedadesApi.listar).mockResolvedValue([
    { id: 7, titulo: 'Casa en Rivadavia', estado_comercial: 'disponible' },
  ] as never)
  vi.mocked(publicacionesApi.crear).mockResolvedValue({ id: 3 } as never)
  vi.mocked(publicacionesApi.actualizar).mockResolvedValue({ id: 3 } as never)
  vi.mocked(publicacionesApi.obtener).mockResolvedValue({
    id: 3,
    propiedad_id: 7,
    titulo: 'Casa 3 ambientes',
    descripcion: 'Luminosa',
    estado: 'activa',
    precio_publicado: 120000,
    moneda_publicada: 'USD',
    slug: 'casa-3-ambientes',
    publicada_en: '2026-09-20T10:00:00Z',
    creado_en: '2026-09-20T10:00:00Z',
    actualizado_en: '2026-09-20T10:00:00Z',
    eliminado_en: null,
    propiedad: { id: 7, titulo: 'Casa en Rivadavia' },
  } as never)
})

function renderAlta() {
  return render(
    <MemoryRouter initialEntries={['/admin/publicaciones/nueva']}>
      <Routes>
        <Route path="/admin/publicaciones/nueva" element={<PublicacionFormulario />} />
        <Route path="/admin/publicaciones" element={<p>listado</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

function renderEdicion() {
  return render(
    <MemoryRouter initialEntries={['/admin/publicaciones/3/editar']}>
      <Routes>
        <Route path="/admin/publicaciones/:id/editar" element={<PublicacionFormulario />} />
        <Route path="/admin/publicaciones" element={<p>listado</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

it('no deja crear sin elegir la propiedad', async () => {
  const usuario = userEvent.setup()
  renderAlta()

  await usuario.type(screen.getByLabelText('Título'), 'Casa 3 ambientes')
  await usuario.click(screen.getByRole('button', { name: 'Crear publicación' }))

  expect(await screen.findByText('Elegí la propiedad que se va a publicar')).toBeInTheDocument()
  expect(publicacionesApi.crear).not.toHaveBeenCalled()
})

it('crea la publicación con la propiedad elegida y vuelve al listado', async () => {
  const usuario = userEvent.setup()
  renderAlta()

  await usuario.type(screen.getByRole('combobox', { name: 'Propiedad' }), 'Casa')
  await usuario.click(await screen.findByText('Casa en Rivadavia'))
  await usuario.type(screen.getByLabelText('Título'), 'Casa 3 ambientes')
  await usuario.type(screen.getByLabelText('Precio publicado'), '120000')
  await usuario.click(screen.getByRole('button', { name: 'Crear publicación' }))

  await waitFor(() =>
    expect(publicacionesApi.crear).toHaveBeenCalledWith(
      expect.objectContaining({
        propiedad_id: 7,
        titulo: 'Casa 3 ambientes',
        precio_publicado: 120000,
        estado: 'activa',
      }),
    ),
  )
  expect(await screen.findByText('listado')).toBeInTheDocument()
})

it('en edición precarga los campos y no deja cambiar la propiedad', async () => {
  renderEdicion()

  expect(await screen.findByDisplayValue('Casa 3 ambientes')).toBeInTheDocument()
  expect(screen.getByDisplayValue('Luminosa')).toBeInTheDocument()
  expect(screen.getByDisplayValue('casa-3-ambientes')).toBeInTheDocument()
  expect(screen.getByText('Casa en Rivadavia')).toBeInTheDocument()
  // `bloqueada`: la propiedad de una publicación ya creada no se cambia.
  expect(screen.queryByRole('button', { name: 'Quitar' })).not.toBeInTheDocument()
})

it('guardar en edición manda solo los campos editables', async () => {
  const usuario = userEvent.setup()
  renderEdicion()
  await screen.findByDisplayValue('Casa 3 ambientes')

  await usuario.click(screen.getByRole('button', { name: 'Guardar cambios' }))

  await waitFor(() =>
    expect(publicacionesApi.actualizar).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ titulo: 'Casa 3 ambientes', moneda_publicada: 'USD' }),
    ),
  )
  // `objectContaining` no alcanza para probar la ausencia: hay que mirar el
  // payload real. `PublicacionUpdate` ni siquiera acepta `propiedad_id`, así que
  // mandarlo sería mentirle al backend sobre qué se puede editar.
  const payload = vi.mocked(publicacionesApi.actualizar).mock.calls[0][1]
  expect(payload).not.toHaveProperty('propiedad_id')
  expect(publicacionesApi.crear).not.toHaveBeenCalled()
})

it('en edición no deja guardar hasta que la publicación termine de cargar', async () => {
  const usuario = userEvent.setup()
  let resolverObtener: (valor: unknown) => void = () => {}
  vi.mocked(publicacionesApi.obtener).mockReturnValue(
    new Promise(resolve => {
      resolverObtener = resolve
    }) as never,
  )
  renderEdicion()

  const boton = screen.getByRole('button', { name: 'Cargando...' })
  expect(boton).toBeDisabled()
  await usuario.click(boton)
  expect(publicacionesApi.actualizar).not.toHaveBeenCalled()

  resolverObtener({
    id: 3,
    propiedad_id: 7,
    titulo: 'Casa 3 ambientes',
    descripcion: 'Luminosa',
    estado: 'activa',
    precio_publicado: 120000,
    moneda_publicada: 'USD',
    slug: 'casa-3-ambientes',
    publicada_en: '2026-09-20T10:00:00Z',
    creado_en: '2026-09-20T10:00:00Z',
    actualizado_en: '2026-09-20T10:00:00Z',
    eliminado_en: null,
    propiedad: { id: 7, titulo: 'Casa en Rivadavia' },
  })

  expect(await screen.findByRole('button', { name: 'Guardar cambios' })).toBeEnabled()
})

it('en edición, vaciar la descripción la manda como null (no ausente ni undefined)', async () => {
  const usuario = userEvent.setup()
  renderEdicion()
  await screen.findByDisplayValue('Casa 3 ambientes')

  await usuario.clear(screen.getByLabelText('Descripción'))
  await usuario.click(screen.getByRole('button', { name: 'Guardar cambios' }))

  await waitFor(() =>
    expect(publicacionesApi.actualizar).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ descripcion: null }),
    ),
  )
  const payload = vi.mocked(publicacionesApi.actualizar).mock.calls[0][1]
  expect(payload).toHaveProperty('descripcion', null)
  expect(payload.descripcion).not.toBeUndefined()
})

it('muestra el error del backend sin cambiar de pantalla', async () => {
  const usuario = userEvent.setup()
  vi.mocked(publicacionesApi.actualizar).mockRejectedValue(new Error('El slug ya está en uso'))
  renderEdicion()
  await screen.findByDisplayValue('Casa 3 ambientes')

  await usuario.click(screen.getByRole('button', { name: 'Guardar cambios' }))

  expect(await screen.findByText('El slug ya está en uso')).toBeInTheDocument()
  expect(screen.queryByText('listado')).not.toBeInTheDocument()
})
