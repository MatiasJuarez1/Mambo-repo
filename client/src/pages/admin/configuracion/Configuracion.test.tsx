import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Configuracion from './Configuracion'
import { inmobiliariaApi } from '../../../api/inmobiliaria'
import type { Inmobiliaria } from '../../../types/inmobiliaria'

vi.mock('../../../api/inmobiliaria', () => ({
  inmobiliariaApi: { obtener: vi.fn(), actualizar: vi.fn(), subirLogo: vi.fn() },
}))

const INMO: Inmobiliaria = {
  id: 1, nombre: 'Mambo Groups', logo_url: null, telefono: null, email: null, cuit: null, direccion: null,
  honorarios_venta_pct: null, honorarios_alquiler_pct: null, actualizado_en: '',
}

it('carga los datos y guarda los cambios', async () => {
  const usuario = userEvent.setup()
  vi.mocked(inmobiliariaApi.obtener).mockResolvedValue(INMO)
  vi.mocked(inmobiliariaApi.actualizar).mockResolvedValue({ ...INMO, honorarios_venta_pct: 3 })
  render(<Configuracion />)

  expect(await screen.findByDisplayValue('Mambo Groups')).toBeInTheDocument()
  await usuario.type(screen.getByLabelText('Honorarios de venta (%)'), '3')
  await usuario.click(screen.getByRole('button', { name: 'Guardar' }))

  await waitFor(() =>
    expect(inmobiliariaApi.actualizar).toHaveBeenCalledWith(expect.objectContaining({ honorarios_venta_pct: 3 })),
  )
  expect(await screen.findByText('Guardado')).toBeInTheDocument()
})

it('muestra el error del backend si no se puede guardar', async () => {
  const usuario = userEvent.setup()
  vi.mocked(inmobiliariaApi.obtener).mockResolvedValue(INMO)
  vi.mocked(inmobiliariaApi.actualizar).mockRejectedValue(new Error('Solo un administrador puede modificar la configuración'))
  render(<Configuracion />)

  await screen.findByDisplayValue('Mambo Groups')
  await usuario.click(screen.getByRole('button', { name: 'Guardar' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Solo un administrador')
})
