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
  honorarios_venta_pct: null, honorarios_alquiler_pct: null, punitorio_diario_pct: null, dias_gracia: 0,
  dias_aviso_recordatorios: 30, email_configurado: false, recordatorios_configurado: false, actualizado_en: '',
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

it('guarda punitorio y días de gracia, y muestra si el email está configurado', async () => {
  const usuario = userEvent.setup()
  vi.mocked(inmobiliariaApi.obtener).mockResolvedValue({ ...INMO, email_configurado: true })
  vi.mocked(inmobiliariaApi.actualizar).mockResolvedValue({ ...INMO, punitorio_diario_pct: 0.1, dias_gracia: 3 })
  render(<Configuracion />)

  await screen.findByDisplayValue('Mambo Groups')
  expect(screen.getByTestId('estado-email')).toHaveTextContent('Envío de emails: configurado')
  await usuario.type(screen.getByLabelText('% diario de punitorio'), '0.1')
  await usuario.clear(screen.getByLabelText('Días de gracia'))
  await usuario.type(screen.getByLabelText('Días de gracia'), '3')
  await usuario.click(screen.getByRole('button', { name: 'Guardar' }))

  await waitFor(() =>
    expect(inmobiliariaApi.actualizar).toHaveBeenCalledWith(expect.objectContaining({ punitorio_diario_pct: 0.1, dias_gracia: 3 })),
  )
})

it('sin SMTP avisa que el envío de emails no está configurado', async () => {
  vi.mocked(inmobiliariaApi.obtener).mockResolvedValue(INMO)
  render(<Configuracion />)
  await screen.findByDisplayValue('Mambo Groups')
  expect(screen.getByTestId('estado-email')).toHaveTextContent('no configurado (definir SMTP_* en el servidor)')
})

it('guarda los días de aviso y muestra si el email diario está configurado', async () => {
  const usuario = userEvent.setup()
  vi.mocked(inmobiliariaApi.obtener).mockResolvedValue({ ...INMO, recordatorios_configurado: true })
  vi.mocked(inmobiliariaApi.actualizar).mockResolvedValue({ ...INMO, dias_aviso_recordatorios: 60 })
  render(<Configuracion />)

  await screen.findByDisplayValue('Mambo Groups')
  expect(screen.getByTestId('estado-recordatorios')).toHaveTextContent('Email diario de recordatorios: configurado')
  await usuario.clear(screen.getByLabelText('Días de aviso de recordatorios'))
  await usuario.type(screen.getByLabelText('Días de aviso de recordatorios'), '60')
  await usuario.click(screen.getByRole('button', { name: 'Guardar' }))

  await waitFor(() =>
    expect(inmobiliariaApi.actualizar).toHaveBeenCalledWith(expect.objectContaining({ dias_aviso_recordatorios: 60 })),
  )
})

it('sin token avisa que el email diario no está configurado', async () => {
  vi.mocked(inmobiliariaApi.obtener).mockResolvedValue(INMO)
  render(<Configuracion />)
  await screen.findByDisplayValue('Mambo Groups')
  expect(screen.getByTestId('estado-recordatorios'))
    .toHaveTextContent('no configurado (definir RECORDATORIOS_TOKEN y SMTP_* en el servidor)')
})
