import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FormularioContrato, { type ValoresContrato } from './FormularioContrato'
import { propiedadesApi } from '../../../api/propiedades'
import { personasApi } from '../../../api/personas'

vi.mock('../../../api/propiedades', () => ({ propiedadesApi: { listar: vi.fn() } }))
vi.mock('../../../api/personas', () => ({ personasApi: { listar: vi.fn(), crear: vi.fn() } }))

const COMPLETO: Partial<ValoresContrato> = {
  propiedad:     { id: 7, titulo: 'Depto en La Plata' },
  inquilinos:    [{ id: 1, full_name: 'Ana Pérez' }],
  propietarios:  [{ id: 2, full_name: 'Juan López' }],
  fecha_inicio:  '2026-01-01',
  fecha_fin:     '2027-01-01',
  monto_inicial: '150000',
  indice:        'icl',
  frecuencia_meses: '3',
}

beforeEach(() => {
  vi.mocked(propiedadesApi.listar).mockResolvedValue([])
  vi.mocked(personasApi.listar).mockResolvedValue({ total: 0, items: [] })
})

function renderForm(props: Partial<React.ComponentProps<typeof FormularioContrato>> = {}) {
  const onGuardar = vi.fn().mockResolvedValue(undefined)
  render(
    <FormularioContrato modo="alta" inicial={COMPLETO} onGuardar={onGuardar} onCancelar={() => {}} {...props} />,
  )
  return { onGuardar }
}

it('muestra frecuencia con ICL, la oculta con sin_ajuste y pide porcentaje con porcentaje_fijo', async () => {
  const usuario = userEvent.setup()
  renderForm()
  expect(screen.getByLabelText('Cada (meses)')).toBeInTheDocument()
  expect(screen.queryByLabelText('Porcentaje fijo (%)')).not.toBeInTheDocument()

  await usuario.selectOptions(screen.getByLabelText('Índice'), 'sin_ajuste')
  expect(screen.queryByLabelText('Cada (meses)')).not.toBeInTheDocument()
  expect(screen.getByText('Este contrato no se ajusta.')).toBeInTheDocument()

  await usuario.selectOptions(screen.getByLabelText('Índice'), 'porcentaje_fijo')
  expect(screen.getByLabelText('Cada (meses)')).toBeInTheDocument()
  expect(screen.getByLabelText('Porcentaje fijo (%)')).toBeInTheDocument()
})

it('la vista previa del calendario sigue a inicio, fin y frecuencia', async () => {
  const usuario = userEvent.setup()
  renderForm()
  // 2026-01-01 → 2027-01-01 cada 3 meses: abril, julio y octubre.
  expect(screen.getByText('01/04/2026')).toBeInTheDocument()
  expect(screen.getByText('01/10/2026')).toBeInTheDocument()
  expect(screen.queryByText('01/01/2027')).not.toBeInTheDocument()

  const frecuencia = screen.getByLabelText('Cada (meses)')
  await usuario.clear(frecuencia)
  await usuario.type(frecuencia, '6')
  expect(screen.getByText('01/07/2026')).toBeInTheDocument()
  expect(screen.queryByText('01/04/2026')).not.toBeInTheDocument()
})

it('no manda el formulario sin inquilino o sin propietario', async () => {
  const usuario = userEvent.setup()
  const { onGuardar } = renderForm({ inicial: { ...COMPLETO, propietarios: [] } })
  await usuario.click(screen.getByRole('button', { name: 'Crear contrato' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('al menos un propietario')
  expect(onGuardar).not.toHaveBeenCalled()
})

it('arma el payload con partes por rol y sin frecuencia cuando no hay ajuste', async () => {
  const usuario = userEvent.setup()
  const { onGuardar } = renderForm({ inicial: { ...COMPLETO, garantes: [{ id: 3, full_name: 'Gara Nte' }] } })
  await usuario.selectOptions(screen.getByLabelText('Índice'), 'sin_ajuste')
  await usuario.click(screen.getByRole('button', { name: 'Crear contrato' }))
  await waitFor(() => expect(onGuardar).toHaveBeenCalled())
  expect(onGuardar.mock.calls[0][0]).toMatchObject({
    property_id: 7,
    partes: [
      { person_id: 1, rol: 'inquilino' },
      { person_id: 2, rol: 'propietario' },
      { person_id: 3, rol: 'garante' },
    ],
    monto_inicial: 150000,
    indice: 'sin_ajuste',
    frecuencia_meses: undefined,
    dia_vencimiento: 10,
  })
})

it('muestra el detail del backend si guardar falla', async () => {
  const usuario = userEvent.setup()
  const onGuardar = vi.fn().mockRejectedValue(new Error('La propiedad ya tiene un contrato vigente'))
  renderForm({ onGuardar })
  await usuario.click(screen.getByRole('button', { name: 'Crear contrato' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('ya tiene un contrato vigente')
})

it('en edición con ajustes aplicados deshabilita inicio y monto y avisa', () => {
  renderForm({ modo: 'edicion', camposCongelados: true })
  expect(screen.getByLabelText('Inicio')).toBeDisabled()
  expect(screen.getByLabelText('Monto inicial')).toBeDisabled()
  expect(screen.getByLabelText('Fin')).toBeEnabled()
  expect(screen.getByText(/ya tiene ajustes aplicados/)).toBeInTheDocument()
})

it('en edición avisa que se regeneran los pendientes al cambiar la frecuencia', async () => {
  const usuario = userEvent.setup()
  renderForm({ modo: 'edicion' })
  expect(screen.queryByText(/vuelven a generar/)).not.toBeInTheDocument()
  const frecuencia = screen.getByLabelText('Cada (meses)')
  await usuario.clear(frecuencia)
  await usuario.type(frecuencia, '6')
  expect(screen.getByText(/vuelven a generar/)).toBeInTheDocument()
})
