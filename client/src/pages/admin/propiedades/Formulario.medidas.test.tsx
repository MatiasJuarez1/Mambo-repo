import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PropiedadFormulario from './Formulario'
import { propiedadesApi } from '../../../api/propiedades'
import type { Propiedad } from '../../../types/propiedad'
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
  // Sin rol beta: el form no muestra propietario ni documentos (menos mocks).
  vi.mocked(useAuth).mockReturnValue({
    usuario: { id: 1, email: 'a@mambo.com.ar', is_active: true, roles: ['admin'], person_id: null },
    cargando: false, login: vi.fn(), logout: vi.fn(),
  })
})

const PROPIEDAD = {
  id: 7, titulo: 'Casa', descripcion: null,
  tipo_propiedad: 'casa', tipo_operacion: 'venta', estado_comercial: 'disponible',
  moneda: 'ARS', precio: null, dormitorios: null, banos: null,
  m2_terreno: 600, m2_construidos: null, m2_cubiertos: null, m2_propios: 240, m2_totales: null,
  ubicacion: null, medios: [], caracteristicas: [],
  propietario: null, propietario_persona_id: null, contrato_vigente: null,
  creado_en: '', actualizado_en: '', eliminado_en: null,
} as unknown as Propiedad

function renderEn(ruta: string) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/admin/propiedades/nueva" element={<PropiedadFormulario />} />
        <Route path="/admin/propiedades/:id/editar" element={<PropiedadFormulario />} />
        <Route path="/admin/propiedades" element={<p>lista</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

it('al crear manda las superficies cargadas y deja afuera las vacías', async () => {
  const usuario = userEvent.setup()
  vi.mocked(propiedadesApi.crear).mockResolvedValue({ id: 10 } as never)
  vi.mocked(propiedadesApi.obtener).mockResolvedValue({ ...PROPIEDAD, id: 10 })
  renderEn('/admin/propiedades/nueva')

  await usuario.type(screen.getByPlaceholderText(/Casa 3 dormitorios/), 'Casa')
  await usuario.type(screen.getByLabelText('m² terreno'), '600')
  await usuario.type(screen.getByLabelText('m² construidos'), '250')
  await usuario.type(screen.getByLabelText('m² propios'), '240')
  await usuario.click(screen.getByRole('button', { name: 'Crear propiedad' }))

  await waitFor(() => expect(propiedadesApi.crear).toHaveBeenCalled())
  const payload = vi.mocked(propiedadesApi.crear).mock.lastCall![0]
  expect(payload).toMatchObject({ m2_terreno: 600, m2_construidos: 250, m2_propios: 240 })
  expect(payload.m2_cubiertos).toBeUndefined()
  expect(payload.m2_totales).toBeUndefined()
})

it('al editar precarga las superficies guardadas', async () => {
  vi.mocked(propiedadesApi.obtener).mockResolvedValue(PROPIEDAD)
  renderEn('/admin/propiedades/7/editar')

  expect(await screen.findByLabelText('m² terreno')).toHaveValue(600)
  expect(screen.getByLabelText('m² propios')).toHaveValue(240)
  expect(screen.getByLabelText('m² construidos')).toHaveValue(null)
})
