import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ContratoFicha from './Ficha'
import { alquileresApi } from '../../../api/alquileres'
import { inmobiliariaApi } from '../../../api/inmobiliaria'
import { documentosApi } from '../../../api/documentos'
import type { Cobro, Contrato, Liquidacion, Pago } from '../../../types/alquileres'

vi.mock('../../../api/alquileres', () => ({
  alquileresApi: {
    obtener: vi.fn(), finalizar: vi.fn(), rescindir: vi.fn(),
    aplicarAjuste: vi.fn(), omitirAjuste: vi.fn(), subirPdf: vi.fn(), quitarPdf: vi.fn(),
    punitorio: vi.fn(), registrarPago: vi.fn(), editarCobro: vi.fn(), anularCobro: vi.fn(),
    anularPago: vi.fn(), enviarRecibo: vi.fn(),
    crearGasto: vi.fn(), editarGasto: vi.fn(), borrarGasto: vi.fn(), subirComprobante: vi.fn(), quitarComprobante: vi.fn(),
    previewLiquidacion: vi.fn(), liquidar: vi.fn(), pagarLiquidacion: vi.fn(), enviarLiquidacion: vi.fn(),
    anularLiquidacion: vi.fn(), urlBorradorLiquidacion: (id: number, periodo: string) => `/api/pdf/${id}/${periodo}`,
  },
}))
vi.mock('../../../api/inmobiliaria', () => ({ inmobiliariaApi: { obtener: vi.fn() } }))
vi.mock('../../../api/documentos', () => ({
  documentosApi: { listar: vi.fn().mockResolvedValue([]), subir: vi.fn(), eliminar: vi.fn() },
}))

const CONTRATO: Contrato = {
  id: 3, property_id: 7, propiedad: { id: 7, titulo: 'Depto en La Plata', estado_comercial: 'cerrada' },
  partes: [
    { person_id: 1, full_name: 'Ana Pérez', rol: 'inquilino' },
    { person_id: 2, full_name: 'Juan López', rol: 'propietario' },
  ],
  estado: 'vigente', fecha_inicio: '2026-01-01', fecha_fin: '2099-01-01', moneda: 'ARS',
  monto_vigente: '100000.00', proximo_ajuste: '2026-10-01', administrado: false, vencidos: 0,
  deal_id: 9, deal: { id: 9, title: 'Alquiler depto' }, contrato_anterior: null, renovacion: null,
  dia_vencimiento: 10, monto_inicial: '100000.00', indice: 'icl', frecuencia_meses: 3, porcentaje_fijo: null,
  honorarios_pct: null, punitorio_diario_pct: null, fecha_rescision: null, motivo_rescision: null, pdf_url: null, notas: null,
  ajustes: [
    { id: 31, fecha_prevista: '2026-10-01', estado: 'pendiente', coeficiente: null, monto_anterior: null, monto_nuevo: null, aplicado_at: null, notas: null },
  ],
  cobros: [], gastos: [], liquidaciones: [], resumen_cobros: null,
  created_at: '', updated_at: '',
}

const PAGO: Pago = {
  id: 501, fecha_pago: '2026-02-12', monto: '100000.00', punitorio: '0.00', total: '100000.00', medio: 'transferencia',
  referencia: 'TR-1', recibo_numero: 7, recibo_numero_formateado: '0001-00000007', recibo_pdf_url: 'https://r2/recibos/3/7.pdf',
  enviado_email_at: null, anulado_at: null, motivo_anulacion: null, liquidacion_id: null, notas: null,
  registrado_por: { id: 1, name: 'Admin' }, whatsapp_url: 'https://wa.me/5491100000000?text=hola', created_at: '',
}

const COBROS: Cobro[] = [
  { id: 101, contrato_id: 3, periodo: '2026-01-01', fecha_vencimiento: '2026-01-10', monto: '100000.00', estado: 'pendiente',
    pagado: '0.00', saldo: '100000.00', dias_atraso: 40, vencido: true, notas: null, pagos: [] },
  { id: 102, contrato_id: 3, periodo: '2026-02-01', fecha_vencimiento: '2026-02-10', monto: '100000.00', estado: 'pagado',
    pagado: '100000.00', saldo: '0.00', dias_atraso: 0, vencido: false, notas: null, pagos: [PAGO] },
]

const LIQUIDACION: Liquidacion = {
  id: 9, contrato_id: 3, propiedad: CONTRATO.propiedad, moneda: 'ARS', periodo: '2026-02-01',
  numero: 1, numero_formateado: '0001-00000001', total_cobrado: '100000.00', total_punitorios: '0.00',
  honorarios_pct: '8.00', honorarios_monto: '8000.00', total_gastos: '0.00', total_a_transferir: '92000.00',
  estado: 'emitida', anulada: false, motivo_anulacion: null, fecha_pago: null,
  comprobante_pdf_url: 'https://r2/liq/1.pdf', enviado_email_at: null, notas: null, created_at: '',
  pagos: [], gastos: [], whatsapp_url: null,
}

const ADMINISTRADO: Contrato = {
  ...CONTRATO, administrado: true, honorarios_pct: '8.00', cobros: COBROS,
  resumen_cobros: { vencidos: 1, saldo_vencido: '100000.00', proximo_vencimiento: '2026-03-10' },
}

beforeEach(() => {
  vi.mocked(alquileresApi.obtener).mockResolvedValue(CONTRATO)
  vi.mocked(inmobiliariaApi.obtener).mockResolvedValue({
    id: 1, nombre: 'Mambo', logo_url: null, telefono: null, email: null, cuit: null, direccion: null,
    honorarios_venta_pct: null, honorarios_alquiler_pct: null, punitorio_diario_pct: 0.1, dias_gracia: 0,
    dias_aviso_recordatorios: 30, recordatorios_configurado: false, email_configurado: false, actualizado_en: '',
  })
})

function renderFicha() {
  return render(
    <MemoryRouter initialEntries={['/admin/alquileres/3']}>
      <Routes><Route path="/admin/alquileres/:id" element={<ContratoFicha />} /></Routes>
    </MemoryRouter>,
  )
}

it('vigente: cabecera, partes y acciones; Finalizar deshabilitado antes de la fecha de fin', async () => {
  renderFicha()
  expect(await screen.findByRole('heading', { name: 'Depto en La Plata' })).toBeInTheDocument()
  expect(screen.getByText('Vigente')).toBeInTheDocument()
  expect(screen.getAllByText('ARS 100.000').length).toBeGreaterThan(0)
  expect(screen.getByRole('link', { name: 'Deal #9' })).toHaveAttribute('href', '/admin/operaciones/9')
  expect(screen.getByRole('link', { name: 'Ana Pérez' })).toHaveAttribute('href', '/admin/personas/1')
  expect(screen.getByRole('link', { name: 'Editar' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Renovar' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Rescindir' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Finalizar' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Subir PDF' })).toBeInTheDocument()
})

it('rescindido: solo lectura con el motivo visible', async () => {
  vi.mocked(alquileresApi.obtener).mockResolvedValue({
    ...CONTRATO, estado: 'rescindido', fecha_rescision: '2026-06-15', motivo_rescision: 'Se mudó',
  })
  renderFicha()
  expect(await screen.findByText(/Rescindido el 15\/06\/2026: Se mudó/)).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Renovar' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Aplicar' })).not.toBeInTheDocument()
})

it('finalizado con renovación: muestra la cadena y no ofrece renovar', async () => {
  vi.mocked(alquileresApi.obtener).mockResolvedValue({
    ...CONTRATO, estado: 'finalizado', renovacion: { id: 4, fecha_inicio: '2099-01-02', fecha_fin: '2100-01-01' },
  })
  renderFicha()
  expect(await screen.findByRole('link', { name: /Renovado por #4/ })).toHaveAttribute('href', '/admin/alquileres/4')
  expect(screen.queryByRole('link', { name: 'Renovar' })).not.toBeInTheDocument()
})

it('aplicar un ajuste abre el modal y reemplaza el contrato con la respuesta', async () => {
  const usuario = userEvent.setup()
  vi.mocked(alquileresApi.aplicarAjuste).mockResolvedValue({ ...CONTRATO, monto_vigente: '110000.00', ajustes: [] })
  renderFicha()
  await usuario.click(await screen.findByRole('button', { name: 'Aplicar' }))
  const dialogo = within(screen.getByRole('dialog'))
  await usuario.type(dialogo.getByLabelText('Coeficiente'), '1.1')
  await usuario.click(dialogo.getByRole('button', { name: 'Aplicar' }))
  await waitFor(() => expect(alquileresApi.aplicarAjuste).toHaveBeenCalledWith(3, 31, { coeficiente: 1.1 }))
  expect(await screen.findByText('ARS 110.000')).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('muestra el 409 del backend al omitir', async () => {
  const usuario = userEvent.setup()
  vi.mocked(alquileresApi.omitirAjuste).mockRejectedValue(new Error('El contrato no está vigente'))
  renderFicha()
  await usuario.click(await screen.findByRole('button', { name: 'Omitir' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('El contrato no está vigente')
})

it('rescindir pide fecha y motivo y manda ambos', async () => {
  const usuario = userEvent.setup()
  vi.mocked(alquileresApi.rescindir).mockResolvedValue({ ...CONTRATO, estado: 'rescindido', motivo_rescision: 'Mudanza', fecha_rescision: '2026-06-15' })
  renderFicha()
  await usuario.click(await screen.findByRole('button', { name: 'Rescindir' }))
  const dialogo = within(screen.getByRole('dialog'))
  await usuario.type(dialogo.getByLabelText('Motivo'), 'Mudanza')
  await usuario.click(dialogo.getByRole('button', { name: 'Rescindir' }))
  await waitFor(() => expect(alquileresApi.rescindir).toHaveBeenCalledWith(3, expect.objectContaining({ motivo: 'Mudanza' })))
  expect(await screen.findByText(/Rescindido el/)).toBeInTheDocument()
})

it('no administrado: aviso con link a editar y sin bloques de cobros', async () => {
  renderFicha()
  expect(await screen.findByText(/Contrato no administrado/)).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Cobros' })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Liquidaciones' })).not.toBeInTheDocument()
})

it('administrado: resumen, tabla de cobros, gastos y liquidaciones', async () => {
  vi.mocked(alquileresApi.obtener).mockResolvedValue(ADMINISTRADO)
  renderFicha()
  expect(await screen.findByRole('heading', { name: 'Cobros' })).toBeInTheDocument()
  expect(screen.getByText(/1 vencido · saldo ARS 100.000/)).toBeInTheDocument()
  expect(screen.getByText('Vencido 40 días')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Registrar pago' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Gastos' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Liquidaciones' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Liquidar período' })).toBeInTheDocument()
})

it('registrar un pago precarga el punitorio, manda el payload y reemplaza el cobro', async () => {
  const usuario = userEvent.setup()
  vi.mocked(alquileresApi.obtener).mockResolvedValue(ADMINISTRADO)
  vi.mocked(alquileresApi.punitorio).mockResolvedValue({ monto: '4000.00', dias_atraso: 40, pct: '0.100' })
  vi.mocked(alquileresApi.registrarPago).mockResolvedValue({ ...COBROS[0], estado: 'pagado', pagado: '100000.00', saldo: '0.00', dias_atraso: 0, pagos: [PAGO] })
  renderFicha()
  await usuario.click(await screen.findByRole('button', { name: 'Registrar pago' }))
  const dialogo = within(screen.getByRole('dialog'))
  await waitFor(() => expect(dialogo.getByLabelText('Punitorio')).toHaveValue(4000))
  expect(dialogo.getByText(/40 días de atraso × 0.1 % diario/)).toBeInTheDocument()
  expect(dialogo.getByText('ARS 104.000')).toBeInTheDocument()
  await usuario.click(dialogo.getByRole('button', { name: 'Registrar pago' }))
  await waitFor(() => expect(alquileresApi.registrarPago).toHaveBeenCalledWith(3, 101, expect.objectContaining({ monto: 100000, punitorio: 4000, medio: 'transferencia' })))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('la fila con pagos se expande: recibo, PDF, WhatsApp y email deshabilitado sin SMTP', async () => {
  const usuario = userEvent.setup()
  vi.mocked(alquileresApi.obtener).mockResolvedValue(ADMINISTRADO)
  renderFicha()
  await usuario.click(await screen.findByRole('button', { name: /Febrero 2026/ }))
  const pagos = within(screen.getByRole('list', { name: 'Pagos de Febrero 2026' }))
  expect(pagos.getByText('Recibo N° 0001-00000007')).toBeInTheDocument()
  expect(pagos.getByRole('link', { name: 'Ver PDF' })).toHaveAttribute('href', 'https://r2/recibos/3/7.pdf')
  expect(pagos.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', PAGO.whatsapp_url!)
  expect(pagos.getByRole('button', { name: 'Enviar por email' })).toBeDisabled()
  expect(pagos.getByRole('button', { name: 'Anular' })).toBeInTheDocument()
})

it('aplicar un ajuste avisa cuántos períodos con pagos no se actualizaron', async () => {
  const usuario = userEvent.setup()
  vi.mocked(alquileresApi.obtener).mockResolvedValue(ADMINISTRADO)
  vi.mocked(alquileresApi.aplicarAjuste).mockResolvedValue({ ...ADMINISTRADO, ajustes: [], cobros_no_actualizados: 2 })
  renderFicha()
  await usuario.click(await screen.findByRole('button', { name: 'Aplicar' }))
  const dialogo = within(screen.getByRole('dialog'))
  await usuario.type(dialogo.getByLabelText('Coeficiente'), '1.1')
  await usuario.click(dialogo.getByRole('button', { name: 'Aplicar' }))
  expect(await screen.findByRole('status')).toHaveTextContent('2 períodos con pagos no se actualizaron')
})

it('liquidar: pide el preview, muestra el desglose y recarga la ficha al emitir', async () => {
  const usuario = userEvent.setup()
  vi.mocked(alquileresApi.obtener).mockResolvedValue(ADMINISTRADO)
  vi.mocked(alquileresApi.previewLiquidacion).mockResolvedValue({
    periodo: '2026-02-01', pagos: [PAGO], gastos: [], total_cobrado: '100000.00', total_punitorios: '0.00',
    honorarios_pct: '8.00', honorarios_monto: '8000.00', total_gastos: '0.00', total_a_transferir: '92000.00',
  })
  vi.mocked(alquileresApi.liquidar).mockResolvedValue({} as never)
  renderFicha()
  await usuario.click(await screen.findByRole('button', { name: 'Liquidar período' }))
  const llamadas = vi.mocked(alquileresApi.obtener).mock.calls.length
  const dialogo = within(screen.getByRole('dialog'))
  expect(await dialogo.findByText('ARS 92.000')).toBeInTheDocument()
  expect(dialogo.getByText('Honorarios (8 %)')).toBeInTheDocument()
  await usuario.click(dialogo.getByRole('button', { name: 'Emitir liquidación' }))
  await waitFor(() => expect(alquileresApi.liquidar).toHaveBeenCalledWith(3, expect.objectContaining({ periodo: expect.stringMatching(/^\d{4}-\d{2}$/) })))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  // Emitir recarga la ficha entera: una llamada más a `obtener`.
  expect(vi.mocked(alquileresApi.obtener).mock.calls.length).toBe(llamadas + 1)
})

it('el modal de liquidar ofrece el borrador en PDF del período elegido', async () => {
  const usuario = userEvent.setup()
  vi.mocked(alquileresApi.obtener).mockResolvedValue(ADMINISTRADO)
  vi.mocked(alquileresApi.previewLiquidacion).mockResolvedValue({
    periodo: '2026-02-01', pagos: [PAGO], gastos: [], total_cobrado: '100000.00', total_punitorios: '0.00',
    honorarios_pct: '8.00', honorarios_monto: '8000.00', total_gastos: '0.00', total_a_transferir: '92000.00',
  })
  renderFicha()
  await usuario.click(await screen.findByRole('button', { name: 'Liquidar período' }))
  const dialogo = within(screen.getByRole('dialog'))
  const link = await dialogo.findByRole('link', { name: 'Ver borrador en PDF' })
  expect(link).toHaveAttribute('href', expect.stringContaining('/api/pdf/3/'))
})

it('anular una liquidación pide el motivo y recarga la ficha', async () => {
  const usuario = userEvent.setup()
  vi.mocked(alquileresApi.obtener).mockResolvedValue({ ...ADMINISTRADO, liquidaciones: [LIQUIDACION] })
  vi.mocked(alquileresApi.anularLiquidacion).mockResolvedValue({ ...LIQUIDACION, anulada: true, motivo_anulacion: 'Faltaba un gasto' })
  renderFicha()
  await usuario.click(await screen.findByRole('button', { name: 'Anular' }))
  const dialogo = within(screen.getByRole('dialog'))
  await usuario.type(dialogo.getByLabelText('Motivo'), 'Faltaba un gasto')
  const llamadas = vi.mocked(alquileresApi.obtener).mock.calls.length
  await usuario.click(dialogo.getByRole('button', { name: 'Anular' }))
  await waitFor(() => expect(alquileresApi.anularLiquidacion).toHaveBeenCalledWith(3, 9, 'Faltaba un gasto'))
  // Devuelve pagos y gastos a pendientes, así que la ficha entera se recarga.
  await waitFor(() => expect(vi.mocked(alquileresApi.obtener).mock.calls.length).toBe(llamadas + 1))
})

it('una liquidación anulada se marca y ya no ofrece acciones', async () => {
  const anulada = { ...LIQUIDACION, anulada: true, motivo_anulacion: 'Faltaba un gasto' }
  vi.mocked(alquileresApi.obtener).mockResolvedValue({ ...ADMINISTRADO, liquidaciones: [anulada] })
  renderFicha()
  expect(await screen.findByText('Anulada')).toBeInTheDocument()
  expect(screen.getByText('Faltaba un gasto')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Anular' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Marcar pagada' })).not.toBeInTheDocument()
  // El comprobante emitido sigue accesible como historial.
  expect(screen.getByRole('link', { name: 'Ver PDF' })).toBeInTheDocument()
})

it('muestra la sección Documentos del contrato', async () => {
  renderFicha()
  expect(await screen.findByRole('heading', { name: 'Documentos' })).toBeInTheDocument()
  expect(documentosApi.listar).toHaveBeenCalledWith({ contratoId: 3 })
})
