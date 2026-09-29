import { render, screen } from '@testing-library/react'
import HistorialCambios from './HistorialCambios'
import { auditoriaApi, type CambioRegistrado } from '../../../api/auditoria'

vi.mock('../../../api/auditoria', () => ({
  auditoriaApi: { listar: vi.fn() },
}))

const listarMock = vi.mocked(auditoriaApi.listar)

function cambio(over: Partial<CambioRegistrado>): CambioRegistrado {
  return {
    id: 1,
    entidad: 'propiedad',
    entidad_id: 7,
    accion: 'editar',
    cambios: {},
    usuario: { id: 1, name: 'Paulo', email: 'paulo@mambo.com.ar' },
    creado_en: '2026-09-29T14:30:00Z',
    ...over,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('HistorialCambios', () => {
  it('pide el historial de la entidad y muestra antes → después', async () => {
    listarMock.mockResolvedValue({
      total: 2,
      items: [
        cambio({ id: 2, cambios: { precio: ['100000', '120000'], descripcion: ['a', 'b'] } }),
        cambio({ id: 1, accion: 'crear', usuario: null, cambios: { titulo: 'Casa' } }),
      ],
    })

    render(<HistorialCambios entidad="propiedad" entidadId={7} />)

    expect(listarMock).toHaveBeenCalledWith('propiedad', 7)
    expect(await screen.findByText('Edición')).toBeInTheDocument()
    expect(screen.getByText('100000 → 120000')).toBeInTheDocument()
    // Una descripción no se vuelca entera: solo se avisa que cambió.
    expect(screen.getByText('modificada')).toBeInTheDocument()
    expect(screen.getByText('Paulo')).toBeInTheDocument()
    // El alta no lista campos, y sin usuario la hizo el sistema.
    expect(screen.getByText('Alta')).toBeInTheDocument()
    expect(screen.getByText('Sistema')).toBeInTheDocument()
  })

  it('avisa cuando no hay cambios', async () => {
    listarMock.mockResolvedValue({ total: 0, items: [] })

    render(<HistorialCambios entidad="contrato" entidadId={3} />)

    expect(await screen.findByText('Sin cambios registrados todavía.')).toBeInTheDocument()
  })

  it('muestra el error si la API falla', async () => {
    listarMock.mockRejectedValue(new Error('Permisos insuficientes'))

    render(<HistorialCambios entidad="propiedad" entidadId={7} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Permisos insuficientes')
  })
})
