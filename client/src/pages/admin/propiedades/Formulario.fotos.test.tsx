import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PropiedadFormulario from './Formulario'
import { propiedadesApi } from '../../../api/propiedades'
import type { Medio, Propiedad } from '../../../types/propiedad'
import { useAuth } from '../../../context/AuthContext'

vi.mock('../../../api/propiedades', () => ({
  propiedadesApi: {
    obtener: vi.fn(), crear: vi.fn(), actualizar: vi.fn(),
    subirMedio: vi.fn(), eliminarMedio: vi.fn(), reordenarMedios: vi.fn(),
    agregarCaracteristica: vi.fn(), eliminarCaracteristica: vi.fn(),
  },
}))
vi.mock('../../../context/AuthContext', () => ({ useAuth: vi.fn() }))
// El historial de cambios tiene su propio test: acá solo se evita que salga a la red.
vi.mock('../../../api/auditoria', () => ({
  auditoriaApi: { listar: vi.fn().mockResolvedValue({ total: 0, items: [] }) },
}))
vi.mock('../../../api/busquedas', () => ({
  busquedasApi: { listar: vi.fn().mockResolvedValue([]), interesados: vi.fn().mockResolvedValue([]) },
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAuth).mockReturnValue({
    usuario: { id: 1, email: 'a@mambo.com.ar', is_active: true, roles: ['admin'], person_id: null },
    cargando: false, login: vi.fn(), logout: vi.fn(),
  })
})

function medio(id: number, descripcion: string, orden: number): Medio {
  return {
    id, propiedad_id: 7, tipo_medio: 'imagen', url: `/media/${id}.jpg`,
    descripcion, orden, es_principal: orden === 0, variantes: null, creado_en: '',
  }
}

const FOTOS = [medio(1, 'Frente', 0), medio(2, 'Lavadero', 1), medio(3, 'Living', 2)]

const PROPIEDAD = {
  id: 7, titulo: 'Casa', descripcion: null,
  tipo_propiedad: 'casa', tipo_operacion: 'venta', estado_comercial: 'disponible',
  moneda: 'ARS', precio: null, dormitorios: null, banos: null,
  m2_terreno: null, m2_construidos: null, m2_cubiertos: null, m2_propios: null, m2_totales: null,
  ubicacion: null, medios: FOTOS, caracteristicas: [],
  propietario: null, propietario_persona_id: null, contrato_vigente: null,
  creado_en: '', actualizado_en: '', eliminado_en: null,
} as unknown as Propiedad

function renderEdicion() {
  return render(
    <MemoryRouter initialEntries={['/admin/propiedades/7/editar']}>
      <Routes>
        <Route path="/admin/propiedades/:id/editar" element={<PropiedadFormulario />} />
      </Routes>
    </MemoryRouter>,
  )
}

const item = (alt: string) => screen.getByAltText(alt).closest('.foto-item') as HTMLElement

function arrastrar(origen: string, destino: string) {
  fireEvent.dragStart(item(origen))
  fireEvent.dragOver(item(destino))
  fireEvent.drop(item(destino))
  fireEvent.dragEnd(item(origen))
}

it('soltar una foto sobre otra manda el nuevo orden completo', async () => {
  vi.mocked(propiedadesApi.obtener).mockResolvedValue(PROPIEDAD)
  vi.mocked(propiedadesApi.reordenarMedios).mockResolvedValue([FOTOS[0], FOTOS[2], FOTOS[1]])
  renderEdicion()
  await screen.findByAltText('Lavadero')

  arrastrar('Lavadero', 'Living')

  await waitFor(() => expect(propiedadesApi.reordenarMedios).toHaveBeenCalledWith(7, [1, 3, 2]))
  const alts = screen.getAllByRole('img').map(img => img.getAttribute('alt'))
  expect(alts).toEqual(['Frente', 'Living', 'Lavadero'])
})

it('la etiqueta Principal sigue a la foto que queda primera', async () => {
  vi.mocked(propiedadesApi.obtener).mockResolvedValue(PROPIEDAD)
  vi.mocked(propiedadesApi.reordenarMedios).mockResolvedValue([
    { ...FOTOS[2], orden: 0, es_principal: true },
    { ...FOTOS[0], orden: 1, es_principal: false },
    { ...FOTOS[1], orden: 2, es_principal: false },
  ])
  renderEdicion()
  await screen.findByAltText('Living')

  arrastrar('Living', 'Frente')

  await waitFor(() => expect(within(item('Living')).getByText('Principal')).toBeInTheDocument())
  expect(within(item('Frente')).queryByText('Principal')).not.toBeInTheDocument()
})

it('soltar una foto sobre sí misma no llama al backend', async () => {
  vi.mocked(propiedadesApi.obtener).mockResolvedValue(PROPIEDAD)
  renderEdicion()
  await screen.findByAltText('Frente')

  arrastrar('Frente', 'Frente')

  expect(propiedadesApi.reordenarMedios).not.toHaveBeenCalled()
})

it('si el backend falla muestra el error', async () => {
  vi.mocked(propiedadesApi.obtener).mockResolvedValue(PROPIEDAD)
  vi.mocked(propiedadesApi.reordenarMedios).mockRejectedValue(new Error('Sin conexión'))
  renderEdicion()
  await screen.findByAltText('Frente')

  arrastrar('Living', 'Frente')

  expect(await screen.findByText('Sin conexión')).toBeInTheDocument()
})

it('mientras se guarda un orden no se puede arrastrar otra foto', async () => {
  vi.mocked(propiedadesApi.obtener).mockResolvedValue(PROPIEDAD)
  let resolver: (medios: Medio[]) => void
  const pendiente = new Promise<Medio[]>(resolve => { resolver = resolve })
  vi.mocked(propiedadesApi.reordenarMedios).mockReturnValue(pendiente)
  renderEdicion()
  await screen.findByAltText('Lavadero')

  arrastrar('Lavadero', 'Living')
  await waitFor(() => expect(propiedadesApi.reordenarMedios).toHaveBeenCalledTimes(1))

  expect(item('Frente').getAttribute('draggable')).toBe('false')
  expect(item('Living').getAttribute('draggable')).toBe('false')

  // Un segundo drop mientras el primero sigue en curso no debe disparar otro pedido.
  arrastrar('Living', 'Frente')
  expect(propiedadesApi.reordenarMedios).toHaveBeenCalledTimes(1)

  resolver!([FOTOS[0], FOTOS[2], FOTOS[1]])
  await waitFor(() => expect(item('Frente').getAttribute('draggable')).toBe('true'))
  expect(item('Living').getAttribute('draggable')).toBe('true')
})

it('mientras se guarda un orden no se puede borrar ni subir otra foto', async () => {
  vi.mocked(propiedadesApi.obtener).mockResolvedValue(PROPIEDAD)
  let resolver: (medios: Medio[]) => void
  const pendiente = new Promise<Medio[]>(resolve => { resolver = resolve })
  vi.mocked(propiedadesApi.reordenarMedios).mockReturnValue(pendiente)
  const { container } = renderEdicion()
  await screen.findByAltText('Lavadero')

  arrastrar('Lavadero', 'Living')
  await waitFor(() => expect(propiedadesApi.reordenarMedios).toHaveBeenCalledTimes(1))

  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  expect(input).toBeDisabled()
  screen.getAllByRole('button', { name: 'Borrar foto' }).forEach(boton => expect(boton).toBeDisabled())

  resolver!([FOTOS[0], FOTOS[2], FOTOS[1]])
  await waitFor(() => expect(input).not.toBeDisabled())
  screen.getAllByRole('button', { name: 'Borrar foto' }).forEach(boton => expect(boton).not.toBeDisabled())
})

it('mientras se sube una foto no se pueden arrastrar las demás', async () => {
  const usuario = userEvent.setup()
  vi.mocked(propiedadesApi.obtener).mockResolvedValue(PROPIEDAD)
  let resolver: (medio: Medio) => void
  const pendiente = new Promise<Medio>(resolve => { resolver = resolve })
  vi.mocked(propiedadesApi.subirMedio).mockReturnValue(pendiente)
  const { container } = renderEdicion()
  await screen.findByAltText('Frente')

  const archivo = new File(['contenido'], 'foto.jpg', { type: 'image/jpeg' })
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  await usuario.upload(input, archivo)

  await waitFor(() => expect(propiedadesApi.subirMedio).toHaveBeenCalledTimes(1))
  expect(item('Frente').getAttribute('draggable')).toBe('false')

  resolver!(medio(4, 'Nueva', 3))
  await waitFor(() => expect(item('Frente').getAttribute('draggable')).toBe('true'))
})

it('al cargar, ordena como el público: la principal primero aunque no sea la de menor orden', async () => {
  vi.mocked(propiedadesApi.obtener).mockResolvedValue({
    ...PROPIEDAD,
    medios: [
      { ...medio(1, 'Frente', 0), es_principal: false },
      medio(2, 'Lavadero', 1),
      { ...medio(3, 'Living', 2), es_principal: true },
    ],
  } as unknown as Propiedad)
  renderEdicion()

  const alts = await waitFor(() => {
    const imgs = screen.getAllByRole('img')
    expect(imgs).toHaveLength(3)
    return imgs.map(img => img.getAttribute('alt'))
  })
  expect(alts[0]).toBe('Living')
})

it('un reorden exitoso borra el error anterior', async () => {
  vi.mocked(propiedadesApi.obtener).mockResolvedValue(PROPIEDAD)
  vi.mocked(propiedadesApi.reordenarMedios)
    .mockRejectedValueOnce(new Error('Sin conexión'))
    .mockResolvedValueOnce([FOTOS[0], FOTOS[2], FOTOS[1]])
  renderEdicion()
  await screen.findByAltText('Frente')

  arrastrar('Living', 'Frente')
  expect(await screen.findByText('Sin conexión')).toBeInTheDocument()

  arrastrar('Living', 'Frente')
  await waitFor(() => expect(screen.queryByText('Sin conexión')).not.toBeInTheDocument())
})
