import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import LiquidacionesLista from './Liquidaciones'
import { alquileresApi } from '../../../api/alquileres'
import type { LiquidacionEnLista } from '../../../types/alquileres'

vi.mock('../../../api/alquileres', () => ({ alquileresApi: { listarLiquidaciones: vi.fn() } }))

const LIQ: LiquidacionEnLista = {
  id: 9, contrato_id: 3, propiedad: { id: 7, titulo: 'Depto en La Plata', estado_comercial: 'cerrada' },
  moneda: 'ARS', periodo: '2026-08-01', numero: 2, numero_formateado: '0001-00000002',
  total_cobrado: '750000.00', total_punitorios: '0.00', honorarios_pct: '10.00',
  honorarios_monto: '75000.00', total_gastos: '0.00', total_a_transferir: '675000.00',
  estado: 'emitida', anulada: false, motivo_anulacion: null, fecha_pago: null, comprobante_pdf_url: '/media/liquidaciones/3/2.pdf',
  enviado_email_at: null, notas: null, created_at: '',
}

beforeEach(() => {
  vi.mocked(alquileresApi.listarLiquidaciones).mockResolvedValue({ total: 1, items: [LIQ] })
})

function renderLista(url = '/admin/alquileres/liquidaciones') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes><Route path="/admin/alquileres/liquidaciones" element={<LiquidacionesLista />} /></Routes>
    </MemoryRouter>,
  )
}

it('lista todas por defecto, con su desglose y el link a la ficha del contrato', async () => {
  renderLista()
  expect(await screen.findByRole('link', { name: 'Depto en La Plata' })).toHaveAttribute('href', '/admin/alquileres/3')
  expect(screen.getByText('Agosto 2026')).toBeInTheDocument()
  expect(screen.getByText('0001-00000002')).toBeInTheDocument()
  expect(screen.getByText('ARS 750.000')).toBeInTheDocument()
  expect(screen.getByText('ARS 675.000')).toBeInTheDocument()
  expect(screen.getByText('Emitida')).toBeInTheDocument()
  expect(screen.getByText('1 liquidación')).toBeInTheDocument()
  expect(alquileresApi.listarLiquidaciones).toHaveBeenCalledWith(expect.objectContaining({ estado: undefined }))
})

// En desarrollo el backend devuelve la URL relativa `/media/...`, que sin el
// host de la API se resolvería contra Vite y daría 404.
it('el comprobante apunta al host de la API', async () => {
  renderLista()
  const link = await screen.findByRole('link', { name: 'Ver PDF' })
  expect(link.getAttribute('href')).toMatch(/\/media\/liquidaciones\/3\/2\.pdf$/)
  expect(link).toHaveAttribute('target', '_blank')
})

it('lee los filtros de la query string', async () => {
  renderLista('/admin/alquileres/liquidaciones?estado=pagada&periodo=2026-08')
  await screen.findByRole('link', { name: 'Depto en La Plata' })
  expect(alquileresApi.listarLiquidaciones).toHaveBeenCalledWith(
    expect.objectContaining({ estado: 'pagada', periodo: '2026-08' }),
  )
  expect(screen.getByLabelText('Estado')).toHaveValue('pagada')
})

it('cambiar el estado vuelve a pedir la lista', async () => {
  const usuario = userEvent.setup()
  renderLista()
  await screen.findByRole('link', { name: 'Depto en La Plata' })
  await usuario.selectOptions(screen.getByLabelText('Estado'), 'pagada')
  await waitFor(() =>
    expect(alquileresApi.listarLiquidaciones).toHaveBeenLastCalledWith(expect.objectContaining({ estado: 'pagada' })),
  )
})

it('una anulada se marca con su motivo y se puede filtrar', async () => {
  const usuario = userEvent.setup()
  vi.mocked(alquileresApi.listarLiquidaciones).mockResolvedValue({
    total: 1, items: [{ ...LIQ, anulada: true, motivo_anulacion: 'Faltaba un gasto' }],
  })
  renderLista()
  expect(await screen.findByText('Anulada')).toBeInTheDocument()
  expect(screen.getByText('Faltaba un gasto')).toBeInTheDocument()
  await usuario.selectOptions(screen.getByLabelText('Estado'), 'anulada')
  await waitFor(() =>
    expect(alquileresApi.listarLiquidaciones).toHaveBeenLastCalledWith(expect.objectContaining({ estado: 'anulada' })),
  )
})

it('muestra el error de la API', async () => {
  vi.mocked(alquileresApi.listarLiquidaciones).mockRejectedValue(new Error('Sin conexión'))
  renderLista()
  expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión')
})
