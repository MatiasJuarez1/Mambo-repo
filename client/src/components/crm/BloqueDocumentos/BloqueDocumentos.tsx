import { useCallback, useEffect, useRef, useState } from 'react'
import { documentosApi } from '../../../api/documentos'
import type { DocumentoOut, EntidadDocumento, TipoDocumento } from '../../../types/documento'
import { ETIQUETAS_TIPO_DOCUMENTO, TIPOS_DOCUMENTO } from '../../../types/documento'
import { formatearFecha, formatearTamano } from '../../../lib/formato'
import { mediaUrl } from '../../../lib/propiedad'
import './BloqueDocumentos.css'

export const TIPOS_ARCHIVO_DOCUMENTO = 'application/pdf,image/jpeg,image/png,image/heic,image/heif'

interface Props {
  entidad: EntidadDocumento
}

/**
 * Sección "Documentos" de una propiedad, persona, operación o contrato. Un solo
 * componente para las cuatro; la entidad va como discriminated union.
 *
 * No renderiza `<form>`: en `propiedades/Formulario.tsx` vive adentro del form de
 * la propiedad, y un form anidado es HTML inválido.
 */
export default function BloqueDocumentos({ entidad }: Props) {
  const [documentos, setDocumentos] = useState<DocumentoOut[] | null>(null)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [tipo, setTipo] = useState<TipoDocumento>('otro')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputArchivo = useRef<HTMLInputElement>(null)

  // La entidad se compara por su JSON: es un objeto nuevo en cada render del padre.
  const claveEntidad = JSON.stringify(entidad)

  // "Reintentar" incrementa el contador para volver a disparar el efecto.
  const [intento, setIntento] = useState(0)
  const cargar = useCallback(() => setIntento(n => n + 1), [])

  useEffect(() => {
    // Si la entidad cambia antes de que responda el fetch anterior, se descarta esa respuesta.
    let activo = true
    setErrorCarga(null)
    setDocumentos(null)
    documentosApi.listar(entidad)
      .then(d => { if (activo) setDocumentos(d) })
      .catch((e: unknown) => {
        if (activo) setErrorCarga(e instanceof Error ? e.message : 'No se pudieron cargar los documentos')
      })
    return () => { activo = false }
  }, [claveEntidad, intento]) // eslint-disable-line react-hooks/exhaustive-deps

  const subir = async () => {
    if (!archivo) return
    setError(null)
    setSubiendo(true)
    try {
      const nuevo = await documentosApi.subir(entidad, tipo, archivo)
      setDocumentos(prev => [nuevo, ...(prev ?? [])])
      setArchivo(null)
      if (inputArchivo.current) inputArchivo.current.value = ''
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo subir el documento')
    } finally {
      setSubiendo(false)
    }
  }

  const borrar = async (doc: DocumentoOut) => {
    if (!window.confirm(`¿Borrar el documento "${doc.nombre_original}"?`)) return
    setError(null)
    try {
      await documentosApi.eliminar(doc.id)
      setDocumentos(prev => (prev ?? []).filter(d => d.id !== doc.id))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudo borrar el documento')
    }
  }

  return (
    <section className="admin-card">
      <h2 className="form-section-title">Documentos</h2>

      <div className="bloque-documentos-alta">
        <div className="form-field">
          <label htmlFor="documento-tipo">Tipo</label>
          <select id="documento-tipo" value={tipo} onChange={e => setTipo(e.target.value as TipoDocumento)}>
            {TIPOS_DOCUMENTO.map(t => <option key={t} value={t}>{ETIQUETAS_TIPO_DOCUMENTO[t]}</option>)}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="documento-archivo">Archivo</label>
          <input
            id="documento-archivo"
            ref={inputArchivo}
            type="file"
            accept={TIPOS_ARCHIVO_DOCUMENTO}
            onChange={e => setArchivo(e.target.files?.[0] ?? null)}
          />
        </div>
        <button type="button" className="btn btn-outline" disabled={!archivo || subiendo} onClick={subir}>
          {subiendo ? 'Subiendo...' : 'Subir'}
        </button>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      {errorCarga && (
        <p className="form-error" role="alert">
          {errorCarga}{' '}
          <button type="button" className="btn btn-outline btn-chico" onClick={cargar}>Reintentar</button>
        </p>
      )}
      {!errorCarga && documentos === null && <p className="lista-estado">Cargando...</p>}
      {documentos !== null && documentos.length === 0 && <p className="lista-estado">No hay documentos cargados</p>}

      {documentos !== null && documentos.length > 0 && (
        <div className="tabla-wrapper">
          <table className="tabla tabla-documentos">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Archivo</th>
                <th>Subido por</th>
                <th>Fecha</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {documentos.map(d => (
                <tr key={d.id}>
                  <td data-label="Tipo">{ETIQUETAS_TIPO_DOCUMENTO[d.tipo]}</td>
                  <td data-label="Archivo">
                    <span className="bloque-documentos-nombre">{d.nombre_original}</span>
                    <span className="bloque-documentos-tamano">{formatearTamano(d.tamano_bytes)}</span>
                  </td>
                  <td data-label="Subido por">{d.subido_por}</td>
                  <td data-label="Fecha">{formatearFecha(d.created_at)}</td>
                  <td data-label="Acciones">
                    <div className="tabla-acciones">
                      <a className="btn btn-outline btn-chico" href={mediaUrl(d.archivo_url)} target="_blank" rel="noreferrer">Ver</a>
                      <button type="button" className="btn btn-outline btn-chico" onClick={() => void borrar(d)}>Borrar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
