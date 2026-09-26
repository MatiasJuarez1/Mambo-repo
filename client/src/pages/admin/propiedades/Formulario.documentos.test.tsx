import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PropiedadFormulario from './Formulario'
import { propiedadesApi } from '../../../api/propiedades'
import { documentosApi } from '../../../api/documentos'
import type { Propiedad } from '../../../types/propiedad'

vi.mock('../../../api/propiedades', () => ({
  propiedadesApi: {
    obtener: vi.fn(), crear: vi.fn(), actualizar: vi.fn(),
    subirMedio: vi.fn(), eliminarMedio: vi.fn(),
  },
}))
vi.mock('../../../api/personas', () => ({
  personasApi: { listar: vi.fn().mockResolvedValue({ total: 0, items: [] }), crear: vi.fn() },
}))
vi.mock('../../../api/documentos', () => ({
  documentosApi: { listar: vi.fn(), subir: vi.fn(), eliminar: vi.fn() },
}))
vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    usuario: { id: 1, email: 'paulo@admin.com', is_active: true, roles: ['admin', 'beta'], person_id: null },
  }),
}))

const PROPIEDAD = {
  id: 7, titulo: 'Casa', descripcion: null,
  tipo_propiedad: 'casa', tipo_operacion: 'venta', estado_comercial: 'disponible',
  moneda: 'ARS', precio: null, dormitorios: null, banos: null, m2_cubiertos: null, m2_totales: null,
  ubicacion: null, medios: [], caracteristicas: [],
  propietario: null, propietario_persona_id: null,
  creado_en: '', actualizado_en: '', eliminado_en: null,
} as unknown as Propiedad

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

beforeEach(() => vi.clearAllMocks())

it('al crear no muestra la sección Documentos (todavía no hay id)', async () => {
  renderEn('/admin/propiedades/nueva')
  expect(await screen.findByRole('heading', { name: 'Fotos' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Documentos' })).not.toBeInTheDocument()
  expect(documentosApi.listar).not.toHaveBeenCalled()
})

it('al editar muestra Documentos y lista los de la propiedad', async () => {
  vi.mocked(propiedadesApi.obtener).mockResolvedValue(PROPIEDAD)
  vi.mocked(documentosApi.listar).mockResolvedValue([])
  renderEn('/admin/propiedades/7/editar')
  expect(await screen.findByRole('heading', { name: 'Documentos' })).toBeInTheDocument()
  expect(await screen.findByText('No hay documentos cargados')).toBeInTheDocument()
  expect(documentosApi.listar).toHaveBeenCalledWith({ propiedadId: 7 })
})
