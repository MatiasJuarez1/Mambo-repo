import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TablaGastos from './TablaGastos'
import type { Gasto, LiquidacionEnLista } from '../../../types/alquileres'

const LIQ: LiquidacionEnLista = {
  id: 9, contrato_id: 3, propiedad: { id: 7, titulo: 'Depto', estado_comercial: 'cerrada' }, moneda: 'ARS',
  periodo: '2026-07-01', numero: 1, numero_formateado: '0001-00000001',
  total_cobrado: '0.00', total_punitorios: '0.00', honorarios_pct: '8.00', honorarios_monto: '0.00',
  total_gastos: '15000.00', total_a_transferir: '-15000.00', estado: 'emitida', anulada: false, motivo_anulacion: null, fecha_pago: null,
  comprobante_pdf_url: null, enviado_email_at: null, notas: null, created_at: '',
}

const GASTOS: Gasto[] = [
  { id: 1, contrato_id: 3, fecha: '2026-07-05', tipo: 'expensas', concepto: 'Expensas julio', monto: '15000.00', comprobante_url: 'https://r2/g1.pdf', liquidacion_id: 9, created_at: '' },
  { id: 2, contrato_id: 3, fecha: '2026-08-02', tipo: 'reparacion', concepto: 'Plomero', monto: '30000.00', comprobante_url: null, liquidacion_id: null, created_at: '' },
]

function renderTabla(over: Partial<React.ComponentProps<typeof TablaGastos>> = {}) {
  const props = {
    gastos: GASTOS, moneda: 'ARS', liquidaciones: [LIQ],
    onCrear: vi.fn().mockResolvedValue(undefined), onEditar: vi.fn().mockResolvedValue(undefined),
    onBorrar: vi.fn().mockResolvedValue(undefined), onSubirComprobante: vi.fn().mockResolvedValue(undefined),
    onQuitarComprobante: vi.fn().mockResolvedValue(undefined),
    ...over,
  }
  render(<TablaGastos {...props} />)
  return props
}

it('filas con tipo, monto, comprobante y total; el liquidado no se edita', () => {
  renderTabla()
  expect(screen.getByText('Expensas')).toBeInTheDocument()
  expect(screen.getByText('ARS 15.000')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Ver comprobante' })).toHaveAttribute('href', 'https://r2/g1.pdf')
  expect(screen.getByText('Liquidado en N° 0001-00000001')).toBeInTheDocument()
  expect(screen.getByText('ARS 45.000')).toBeInTheDocument()
  // Solo el gasto sin liquidar tiene acciones.
  expect(screen.getAllByRole('button', { name: 'Editar' })).toHaveLength(1)
  expect(screen.getByRole('button', { name: 'Subir comprobante' })).toBeInTheDocument()
})

it('el alta inline manda el payload y el archivo', async () => {
  const usuario = userEvent.setup()
  const props = renderTabla()
  await usuario.click(screen.getByRole('button', { name: '+ Agregar gasto' }))
  const form = within(screen.getByRole('form', { name: 'Nuevo gasto' }))
  await usuario.selectOptions(form.getByLabelText('Tipo'), 'impuesto')
  await usuario.type(form.getByLabelText('Concepto'), 'ABL agosto')
  await usuario.type(form.getByLabelText('Monto'), '8000')
  const archivo = new File(['x'], 'abl.pdf', { type: 'application/pdf' })
  await usuario.upload(form.getByLabelText('Comprobante (opcional)'), archivo)
  await usuario.click(form.getByRole('button', { name: 'Agregar gasto' }))
  await waitFor(() => expect(props.onCrear).toHaveBeenCalledWith(
    expect.objectContaining({ tipo: 'impuesto', concepto: 'ABL agosto', monto: 8000 }), archivo,
  ))
  await waitFor(() => expect(screen.queryByRole('form', { name: 'Nuevo gasto' })).not.toBeInTheDocument())
})

it('editar abre el formulario precargado y manda los cambios', async () => {
  const usuario = userEvent.setup()
  const props = renderTabla()
  await usuario.click(screen.getByRole('button', { name: 'Editar' }))
  const dialogo = within(screen.getByRole('dialog'))
  expect(dialogo.getByLabelText('Concepto')).toHaveValue('Plomero')
  await usuario.clear(dialogo.getByLabelText('Monto'))
  await usuario.type(dialogo.getByLabelText('Monto'), '35000')
  await usuario.click(dialogo.getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(props.onEditar).toHaveBeenCalledWith(GASTOS[1], { fecha: '2026-08-02', tipo: 'reparacion', concepto: 'Plomero', monto: 35000 }))
})

it('borrar pide confirmación y muestra el 409 del backend', async () => {
  const usuario = userEvent.setup()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  renderTabla({ onBorrar: vi.fn().mockRejectedValue(new Error('El gasto ya fue liquidado')) })
  await usuario.click(screen.getByRole('button', { name: 'Borrar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('El gasto ya fue liquidado')
})
