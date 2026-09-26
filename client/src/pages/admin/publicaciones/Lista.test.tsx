import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PublicacionesLista from './Lista'
import { publicacionesApi } from '../../../api/publicaciones'
import { useAuth } from '../../../context/AuthContext'
import type { PublicacionListItem } from '../../../types/publicacion'

vi.mock('../../../api/publicaciones', () => ({
  publicacionesApi: {
    listar: vi.fn(),
    actualizar: vi.fn(),
    urlDescarga: (id: number) => `http://api.test/api/v1/publicaciones/${id}/descargar`,
  },
}))

vi.mock('../../../context/AuthContext', () => ({ useAuth: vi.fn() }))

const PUBLICACION: PublicacionListItem = {
  id: 3,
  propiedad_id: 7,
  titulo: 'Casa 3 ambientes con jardín',
  descripcion: 'Luminosa',
  estado: 'activa',
  precio_publicado: 120000,
  moneda_publicada: 'USD',
  slug: null,
  publicada_en: '2026-09-20T10:00:00Z',
  creado_en: '2026-09-20T10:00:00Z',
  propiedad: { id: 7, titulo: 'Casa en Rivadavia' } as never,
}

function sesionCon(roles: string[]) {
  vi.mocked(useAuth).mockReturnValue({
    usuario: { id: 1, email: 'staff@mambo.com.ar', is_active: true, roles, person_id: null },
    cargando: false,
    login: vi.fn(),
    logout: vi.fn(),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  sesionCon(['staff'])
  vi.mocked(publicacionesApi.listar).mockResolvedValue([PUBLICACION])
  vi.mocked(publicacionesApi.actualizar).mockResolvedValue({ ...PUBLICACION, estado: 'pausada' } as never)
})

function renderLista() {
  return render(
    <MemoryRouter initialEntries={['/admin/publicaciones']}>
      <Routes>
        <Route path="/admin/publicaciones" element={<PublicacionesLista />} />
      </Routes>
    </MemoryRouter>,
  )
}

it('lista las publicaciones con su propiedad y su precio', async () => {
  renderLista()

  expect(await screen.findByText('Casa 3 ambientes con jardín')).toBeInTheDocument()
  expect(screen.getByText('Casa en Rivadavia')).toBeInTheDocument()
  expect(screen.getByText('USD 120.000')).toBeInTheDocument()
})

it('filtrar por estado vuelve a pedir el listado', async () => {
  const usuario = userEvent.setup()
  renderLista()
  await screen.findByText('Casa 3 ambientes con jardín')

  await usuario.selectOptions(screen.getByLabelText('Estado'), 'pausada')

  await waitFor(() =>
    expect(publicacionesApi.listar).toHaveBeenCalledWith(
      expect.objectContaining({ estado: 'pausada' }),
    ),
  )
})

it('pausar manda el estado nuevo y recarga la lista', async () => {
  const usuario = userEvent.setup()
  renderLista()

  await usuario.click(await screen.findByRole('button', { name: 'Pausar' }))

  await waitFor(() => expect(publicacionesApi.actualizar).toHaveBeenCalledWith(3, { estado: 'pausada' }))
  expect(publicacionesApi.listar).toHaveBeenCalledTimes(2)
})

it('el agente logueado ve el botón de descargar apuntando al ZIP', async () => {
  renderLista()

  const link = await screen.findByRole('link', { name: 'Descargar material' })
  expect(link).toHaveAttribute('href', 'http://api.test/api/v1/publicaciones/3/descargar')
  expect(link).toHaveAttribute('download')
})

it('un usuario sin rol no ve el botón de descargar', async () => {
  sesionCon([])
  renderLista()
  await screen.findByText('Casa 3 ambientes con jardín')

  expect(screen.queryByRole('link', { name: 'Descargar material' })).not.toBeInTheDocument()
})

it('muestra el mensaje del backend si una acción falla', async () => {
  const usuario = userEvent.setup()
  vi.mocked(publicacionesApi.actualizar).mockRejectedValue(new Error('Publicación no encontrada'))
  renderLista()

  await usuario.click(await screen.findByRole('button', { name: 'Pausar' }))

  expect(await screen.findByText('Publicación no encontrada')).toBeInTheDocument()
})

it('avisa cuando no hay publicaciones', async () => {
  vi.mocked(publicacionesApi.listar).mockResolvedValue([])
  renderLista()

  expect(await screen.findByText('No hay publicaciones.')).toBeInTheDocument()
})
