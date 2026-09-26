import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import PropiedadFormulario from './Formulario'
import { propiedadesApi } from '../../../api/propiedades'
import { personasApi } from '../../../api/personas'
import type { Propiedad } from '../../../types/propiedad'
import { useAuth } from '../../../context/AuthContext'

vi.mock('../../../api/propiedades', () => ({
  propiedadesApi: {
    obtener: vi.fn(), crear: vi.fn(), actualizar: vi.fn(),
    subirMedio: vi.fn(), eliminarMedio: vi.fn(),
  },
}))
vi.mock('../../../api/personas', () => ({
  personasApi: { listar: vi.fn(), crear: vi.fn() },
}))
vi.mock('../../../api/documentos', () => ({
  documentosApi: { listar: vi.fn().mockResolvedValue([]), subir: vi.fn(), eliminar: vi.fn() },
}))
vi.mock('../../../context/AuthContext', () => ({ useAuth: vi.fn() }))

function sesionCon(roles: string[]) {
  vi.mocked(useAuth).mockReturnValue({
    usuario: { id: 1, email: 'paulo@admin.com', is_active: true, roles, person_id: null },
    cargando: false, login: vi.fn(), logout: vi.fn(),
  })
}

beforeEach(() => sesionCon(['admin', 'beta']))

const ANA = {
  id: 3, full_name: 'Ana Pérez', document_type: null, document_number: null, created_at: '',
  tags: [], roles: { propietario: 0, comprador: 0, vendedor: 0, inquilino: 0, garante: 0, interesado: 0 },
}

// Lo mínimo que el formulario lee de una propiedad existente.
const PROPIEDAD = {
  id: 7, titulo: 'Casa', descripcion: null,
  tipo_propiedad: 'casa', tipo_operacion: 'venta', estado_comercial: 'disponible',
  moneda: 'ARS', precio: null, dormitorios: null, banos: null, m2_cubiertos: null, m2_totales: null,
  ubicacion: null, medios: [], caracteristicas: [],
  propietario: { id: 3, full_name: 'Ana Pérez' }, propietario_persona_id: 3,
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

it('al crear manda el propietario elegido', async () => {
  const usuario = userEvent.setup()
  vi.mocked(personasApi.listar).mockResolvedValue({ total: 1, items: [ANA] })
  vi.mocked(propiedadesApi.crear).mockResolvedValue({ id: 10 } as never)
  vi.mocked(propiedadesApi.obtener).mockResolvedValue({ ...PROPIEDAD, id: 10, medios: [] })
  renderEn('/admin/propiedades/nueva')

  await usuario.type(screen.getByPlaceholderText(/Casa 3 dormitorios/), 'Casa')
  await usuario.type(screen.getByRole('combobox', { name: 'Propietario' }), 'Ana')
  await usuario.click(await screen.findByRole('option', { name: /Ana Pérez/ }))
  await usuario.click(screen.getByRole('button', { name: 'Crear propiedad' }))

  await waitFor(() =>
    expect(propiedadesApi.crear).toHaveBeenCalledWith(expect.objectContaining({ propietario_persona_id: 3 })),
  )
})

it('al editar muestra el propietario actual y quitarlo manda null', async () => {
  const usuario = userEvent.setup()
  vi.mocked(propiedadesApi.obtener).mockResolvedValue(PROPIEDAD)
  vi.mocked(propiedadesApi.actualizar).mockResolvedValue(PROPIEDAD)
  renderEn('/admin/propiedades/7/editar')

  expect(await screen.findByText('Ana Pérez')).toBeInTheDocument()
  await usuario.click(screen.getByRole('button', { name: 'Quitar' }))
  await usuario.click(screen.getByRole('button', { name: 'Guardar cambios' }))

  await waitFor(() =>
    expect(propiedadesApi.actualizar).toHaveBeenCalledWith(7, expect.objectContaining({ propietario_persona_id: null })),
  )
})

it('sin el rol beta no muestra el propietario ni lo pisa al guardar', async () => {
  const usuario = userEvent.setup()
  sesionCon(['admin'])
  vi.mocked(propiedadesApi.obtener).mockResolvedValue(PROPIEDAD)
  vi.mocked(propiedadesApi.actualizar).mockResolvedValue(PROPIEDAD)
  renderEn('/admin/propiedades/7/editar')

  await usuario.click(await screen.findByRole('button', { name: 'Guardar cambios' }))

  expect(screen.queryByRole('combobox', { name: 'Propietario' })).not.toBeInTheDocument()
  await waitFor(() => expect(propiedadesApi.actualizar).toHaveBeenCalled())
  expect(vi.mocked(propiedadesApi.actualizar).mock.lastCall?.[1].propietario_persona_id).toBeUndefined()
})
