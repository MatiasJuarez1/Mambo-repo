import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BloqueDocumentos from './BloqueDocumentos'
import { documentosApi } from '../../../api/documentos'
import type { DocumentoOut } from '../../../types/documento'

vi.mock('../../../api/documentos', () => ({
  documentosApi: { listar: vi.fn(), subir: vi.fn(), eliminar: vi.fn() },
}))

const DOCS: DocumentoOut[] = [
  {
    id: 1, tipo: 'informe_dominio', archivo_url: 'https://r2/dominio.pdf', nombre_original: 'dominio_av.pdf',
    tamano_bytes: 1_258_291, subido_por: 'Matías J.', created_at: '2026-09-18T12:00:00Z',
  },
  {
    id: 2, tipo: 'dni', archivo_url: '/media/documentos/persona/3/x.jpg', nombre_original: 'dni_comprador.jpg',
    tamano_bytes: 348_160, subido_por: 'Ana P.', created_at: '2026-09-19T12:00:00Z',
  },
]

beforeEach(() => vi.clearAllMocks())

it('lista vacía muestra el aviso', async () => {
  vi.mocked(documentosApi.listar).mockResolvedValue([])
  render(<BloqueDocumentos entidad={{ propiedadId: 7 }} />)
  expect(await screen.findByText('No hay documentos cargados')).toBeInTheDocument()
  expect(documentosApi.listar).toHaveBeenCalledWith({ propiedadId: 7 })
})

it('renderiza filas con etiqueta del tipo, nombre, tamaño, autor, fecha y link Ver', async () => {
  vi.mocked(documentosApi.listar).mockResolvedValue(DOCS)
  render(<BloqueDocumentos entidad={{ personaId: 3 }} />)
  expect(await screen.findByText('Informe de dominio')).toBeInTheDocument()
  expect(screen.getByText('dominio_av.pdf')).toBeInTheDocument()
  expect(screen.getByText('1,2 MB')).toBeInTheDocument()
  expect(screen.getByText('Matías J.')).toBeInTheDocument()
  expect(screen.getByText('18/09/2026')).toBeInTheDocument()
  const links = screen.getAllByRole('link', { name: 'Ver' })
  expect(links[0]).toHaveAttribute('href', 'https://r2/dominio.pdf')
  // La URL relativa (storage local) se resuelve contra el host de la API.
  expect(links[1]).toHaveAttribute('href', expect.stringContaining('/media/documentos/persona/3/x.jpg'))
})

it('subir manda entidad, tipo y archivo, y agrega la fila sin recargar', async () => {
  const usuario = userEvent.setup()
  vi.mocked(documentosApi.listar).mockResolvedValue([])
  vi.mocked(documentosApi.subir).mockResolvedValue(DOCS[1])
  render(<BloqueDocumentos entidad={{ dealId: 9 }} />)
  await screen.findByText('No hay documentos cargados')

  const boton = screen.getByRole('button', { name: 'Subir' })
  expect(boton).toBeDisabled()

  await usuario.selectOptions(screen.getByLabelText('Tipo'), 'dni')
  const archivo = new File(['x'], 'dni_comprador.jpg', { type: 'image/jpeg' })
  await usuario.upload(screen.getByLabelText('Archivo'), archivo)
  expect(boton).toBeEnabled()
  await usuario.click(boton)

  await waitFor(() => expect(documentosApi.subir).toHaveBeenCalledWith({ dealId: 9 }, 'dni', archivo))
  expect(await screen.findByText('dni_comprador.jpg')).toBeInTheDocument()
  expect(documentosApi.listar).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Subir' })).toBeDisabled()
})

it('muestra el error del backend al subir', async () => {
  const usuario = userEvent.setup()
  vi.mocked(documentosApi.listar).mockResolvedValue([])
  vi.mocked(documentosApi.subir).mockRejectedValue(new Error('El documento supera los 10 MB'))
  render(<BloqueDocumentos entidad={{ contratoId: 2 }} />)
  await screen.findByText('No hay documentos cargados')
  await usuario.upload(screen.getByLabelText('Archivo'), new File(['x'], 'a.pdf', { type: 'application/pdf' }))
  await usuario.click(screen.getByRole('button', { name: 'Subir' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('El documento supera los 10 MB')
})

it('borrar pide confirmación y saca la fila', async () => {
  const usuario = userEvent.setup()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.mocked(documentosApi.listar).mockResolvedValue(DOCS)
  vi.mocked(documentosApi.eliminar).mockResolvedValue(undefined)
  render(<BloqueDocumentos entidad={{ propiedadId: 7 }} />)
  await screen.findByText('dominio_av.pdf')

  await usuario.click(screen.getAllByRole('button', { name: 'Borrar' })[0])
  expect(window.confirm).toHaveBeenCalledWith('¿Borrar el documento "dominio_av.pdf"?')
  await waitFor(() => expect(documentosApi.eliminar).toHaveBeenCalledWith(1))
  await waitFor(() => expect(screen.queryByText('dominio_av.pdf')).not.toBeInTheDocument())
  expect(screen.getByText('dni_comprador.jpg')).toBeInTheDocument()
})

it('si cancela la confirmación no borra', async () => {
  const usuario = userEvent.setup()
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  vi.mocked(documentosApi.listar).mockResolvedValue(DOCS)
  render(<BloqueDocumentos entidad={{ propiedadId: 7 }} />)
  await screen.findByText('dominio_av.pdf')
  await usuario.click(screen.getAllByRole('button', { name: 'Borrar' })[0])
  expect(documentosApi.eliminar).not.toHaveBeenCalled()
})

it('error al cargar ofrece reintentar', async () => {
  const usuario = userEvent.setup()
  vi.mocked(documentosApi.listar)
    .mockRejectedValueOnce(new Error('Error 500'))
    .mockResolvedValue(DOCS)
  render(<BloqueDocumentos entidad={{ propiedadId: 7 }} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Error 500')
  await usuario.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByText('dominio_av.pdf')).toBeInTheDocument()
})
