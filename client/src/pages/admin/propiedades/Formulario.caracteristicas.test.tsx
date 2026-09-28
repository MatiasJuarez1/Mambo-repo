import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PropiedadFormulario from './Formulario'
import { propiedadesApi } from '../../../api/propiedades'
import type { Caracteristica, Propiedad } from '../../../types/propiedad'
import { useAuth } from '../../../context/AuthContext'

vi.mock('../../../api/propiedades', () => ({
  propiedadesApi: {
    obtener: vi.fn(), crear: vi.fn(), actualizar: vi.fn(),
    subirMedio: vi.fn(), eliminarMedio: vi.fn(), reordenarMedios: vi.fn(),
    agregarCaracteristica: vi.fn(), eliminarCaracteristica: vi.fn(),
  },
}))
vi.mock('../../../context/AuthContext', () => ({ useAuth: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAuth).mockReturnValue({
    usuario: { id: 1, email: 'a@mambo.com.ar', is_active: true, roles: ['admin'], person_id: null },
    cargando: false, login: vi.fn(), logout: vi.fn(),
  })
})

function caract(id: number, clave: string, valor: string): Caracteristica {
  return { id, propiedad_id: 7, clave, valor, creado_en: '' }
}

function propiedad(caracteristicas: Caracteristica[]): Propiedad {
  return {
    id: 7, titulo: 'Casa', descripcion: null,
    tipo_propiedad: 'casa', tipo_operacion: 'venta', estado_comercial: 'disponible',
    moneda: 'ARS', precio: null, dormitorios: null, banos: null,
    m2_terreno: null, m2_construidos: null, m2_cubiertos: null, m2_propios: null, m2_totales: null,
    ubicacion: null, medios: [], caracteristicas,
    propietario: null, propietario_persona_id: null, contrato_vigente: null,
    creado_en: '', actualizado_en: '', eliminado_en: null,
  } as unknown as Propiedad
}

function renderEn(ruta: string) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/admin/propiedades/nueva" element={<PropiedadFormulario />} />
        <Route path="/admin/propiedades/:id/editar" element={<PropiedadFormulario />} />
      </Routes>
    </MemoryRouter>,
  )
}

it('muestra tildadas las del catálogo que ya tiene la propiedad', async () => {
  vi.mocked(propiedadesApi.obtener).mockResolvedValue(propiedad([caract(1, 'Piscina', 'si')]))
  renderEn('/admin/propiedades/7/editar')

  expect(await screen.findByRole('checkbox', { name: 'Piscina' })).toBeChecked()
  expect(screen.getByRole('checkbox', { name: 'Asador' })).not.toBeChecked()
})

it('reconoce tildadas legacy guardadas como "Sí" (datos de siembra)', async () => {
  vi.mocked(propiedadesApi.obtener).mockResolvedValue(propiedad([caract(1, 'Balcón', 'Sí')]))
  renderEn('/admin/propiedades/7/editar')

  expect(await screen.findByRole('checkbox', { name: 'Balcón' })).toBeChecked()
  expect(screen.queryByText('Balcón: Sí')).not.toBeInTheDocument()
})

it('tildar crea la característica con valor "si"', async () => {
  const usuario = userEvent.setup()
  vi.mocked(propiedadesApi.obtener).mockResolvedValue(propiedad([]))
  vi.mocked(propiedadesApi.agregarCaracteristica).mockResolvedValue(caract(9, 'Asador', 'si'))
  renderEn('/admin/propiedades/7/editar')

  await usuario.click(await screen.findByRole('checkbox', { name: 'Asador' }))

  expect(propiedadesApi.agregarCaracteristica).toHaveBeenCalledWith(7, { clave: 'Asador', valor: 'si' })
  await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Asador' })).toBeChecked())
})

it('destildar borra la fila correspondiente', async () => {
  const usuario = userEvent.setup()
  vi.mocked(propiedadesApi.obtener).mockResolvedValue(propiedad([caract(4, 'Terraza', 'si')]))
  vi.mocked(propiedadesApi.eliminarCaracteristica).mockResolvedValue(undefined)
  renderEn('/admin/propiedades/7/editar')

  await usuario.click(await screen.findByRole('checkbox', { name: 'Terraza' }))

  expect(propiedadesApi.eliminarCaracteristica).toHaveBeenCalledWith(7, 4)
  await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Terraza' })).not.toBeChecked())
})

it('agrega y quita una característica libre', async () => {
  const usuario = userEvent.setup()
  vi.mocked(propiedadesApi.obtener).mockResolvedValue(propiedad([]))
  vi.mocked(propiedadesApi.agregarCaracteristica).mockResolvedValue(caract(5, 'Orientación', 'Norte'))
  vi.mocked(propiedadesApi.eliminarCaracteristica).mockResolvedValue(undefined)
  renderEn('/admin/propiedades/7/editar')

  await usuario.type(await screen.findByLabelText('Otra característica'), 'Orientación')
  await usuario.type(screen.getByLabelText('Valor'), 'Norte')
  await usuario.click(screen.getByRole('button', { name: 'Agregar' }))

  expect(propiedadesApi.agregarCaracteristica).toHaveBeenCalledWith(7, { clave: 'Orientación', valor: 'Norte' })
  expect(await screen.findByText('Orientación: Norte')).toBeInTheDocument()

  await usuario.click(screen.getByRole('button', { name: 'Quitar Orientación' }))
  expect(propiedadesApi.eliminarCaracteristica).toHaveBeenCalledWith(7, 5)
  await waitFor(() => expect(screen.queryByText('Orientación: Norte')).not.toBeInTheDocument())
})

it('una libre sin valor se guarda como tildada', async () => {
  const usuario = userEvent.setup()
  vi.mocked(propiedadesApi.obtener).mockResolvedValue(propiedad([]))
  vi.mocked(propiedadesApi.agregarCaracteristica).mockResolvedValue(caract(6, 'Bodega', 'si'))
  renderEn('/admin/propiedades/7/editar')

  await usuario.type(await screen.findByLabelText('Otra característica'), 'Bodega')
  await usuario.click(screen.getByRole('button', { name: 'Agregar' }))

  expect(propiedadesApi.agregarCaracteristica).toHaveBeenCalledWith(7, { clave: 'Bodega', valor: 'si' })
  expect(await screen.findByText('Bodega')).toBeInTheDocument()
})

it('al crear no muestra la sección (la propiedad todavía no existe)', () => {
  renderEn('/admin/propiedades/nueva')

  expect(screen.queryByRole('checkbox', { name: 'Piscina' })).not.toBeInTheDocument()
})

// ── Las dos defensas que ya se aplicaron a fotos (Task 4): sin esto, un doble
// click manda dos POST antes de que el estado se actualice, y un error viejo
// se queda pegado en pantalla aunque la acción siguiente haya funcionado.

it('mientras se guarda no se puede tildar otra', async () => {
  const usuario = userEvent.setup()
  vi.mocked(propiedadesApi.obtener).mockResolvedValue(propiedad([]))
  let resolver: (c: Caracteristica) => void
  const pendiente = new Promise<Caracteristica>(resolve => { resolver = resolve })
  vi.mocked(propiedadesApi.agregarCaracteristica).mockReturnValue(pendiente)
  renderEn('/admin/propiedades/7/editar')

  await usuario.click(await screen.findByRole('checkbox', { name: 'Asador' }))
  await waitFor(() => expect(propiedadesApi.agregarCaracteristica).toHaveBeenCalledTimes(1))

  expect(screen.getByRole('checkbox', { name: 'Asador' })).toBeDisabled()
  expect(screen.getByRole('checkbox', { name: 'Piscina' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Agregar' })).toBeDisabled()

  // Un segundo click sobre otro ítem mientras el primero sigue en curso no
  // debe disparar otro pedido.
  await usuario.click(screen.getByRole('checkbox', { name: 'Piscina' }))
  expect(propiedadesApi.agregarCaracteristica).toHaveBeenCalledTimes(1)

  resolver!(caract(9, 'Asador', 'si'))
  await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Asador' })).not.toBeDisabled())
  expect(screen.getByRole('checkbox', { name: 'Piscina' })).not.toBeDisabled()
})

it('una acción exitosa borra el error anterior', async () => {
  const usuario = userEvent.setup()
  vi.mocked(propiedadesApi.obtener).mockResolvedValue(propiedad([]))
  vi.mocked(propiedadesApi.agregarCaracteristica)
    .mockRejectedValueOnce(new Error('Sin conexión'))
    .mockResolvedValueOnce(caract(9, 'Asador', 'si'))
  renderEn('/admin/propiedades/7/editar')

  await usuario.click(await screen.findByRole('checkbox', { name: 'Asador' }))
  expect(await screen.findByText('Sin conexión')).toBeInTheDocument()

  await usuario.click(screen.getByRole('checkbox', { name: 'Asador' }))
  await waitFor(() => expect(screen.queryByText('Sin conexión')).not.toBeInTheDocument())
})

// ── Fix round 1: hallazgos de la revisión ──

it('si falla agregar una libre, conserva lo escrito', async () => {
  const usuario = userEvent.setup()
  vi.mocked(propiedadesApi.obtener).mockResolvedValue(propiedad([]))
  vi.mocked(propiedadesApi.agregarCaracteristica).mockRejectedValue(new Error('Sin conexión'))
  renderEn('/admin/propiedades/7/editar')

  await usuario.type(await screen.findByLabelText('Otra característica'), 'Orientación')
  await usuario.type(screen.getByLabelText('Valor'), 'Norte')
  await usuario.click(screen.getByRole('button', { name: 'Agregar' }))

  expect(await screen.findByText('Sin conexión')).toBeInTheDocument()
  expect(screen.getByLabelText('Otra característica')).toHaveValue('Orientación')
  expect(screen.getByLabelText('Valor')).toHaveValue('Norte')
})

it('Enter en la característica libre la agrega sin guardar la propiedad', async () => {
  const usuario = userEvent.setup()
  vi.mocked(propiedadesApi.obtener).mockResolvedValue(propiedad([]))
  vi.mocked(propiedadesApi.agregarCaracteristica).mockResolvedValue(caract(6, 'Bodega', 'si'))
  renderEn('/admin/propiedades/7/editar')

  await usuario.type(await screen.findByLabelText('Otra característica'), 'Bodega{Enter}')

  expect(propiedadesApi.agregarCaracteristica).toHaveBeenCalledWith(7, { clave: 'Bodega', valor: 'si' })
  expect(propiedadesApi.actualizar).not.toHaveBeenCalled()
})

it('mientras se guarda no se puede quitar una característica libre', async () => {
  const usuario = userEvent.setup()
  vi.mocked(propiedadesApi.obtener).mockResolvedValue(propiedad([caract(5, 'Orientación', 'Norte')]))
  let resolver: (c: Caracteristica) => void
  const pendiente = new Promise<Caracteristica>(resolve => { resolver = resolve })
  vi.mocked(propiedadesApi.agregarCaracteristica).mockReturnValue(pendiente)
  renderEn('/admin/propiedades/7/editar')

  await usuario.click(await screen.findByRole('checkbox', { name: 'Asador' }))
  await waitFor(() => expect(propiedadesApi.agregarCaracteristica).toHaveBeenCalledTimes(1))

  expect(screen.getByRole('button', { name: 'Quitar Orientación' })).toBeDisabled()

  resolver!(caract(9, 'Asador', 'si'))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Quitar Orientación' })).not.toBeDisabled())
})
