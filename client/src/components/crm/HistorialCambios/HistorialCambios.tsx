import { useEffect, useState } from 'react'
import { auditoriaApi, type CambioRegistrado, type EntidadAuditada } from '../../../api/auditoria'
import { formatearFechaHora } from '../../../lib/formato'
import './HistorialCambios.css'

interface Props {
  entidad: EntidadAuditada
  entidadId: number
}

/** Nombres legibles de los campos que más se editan; el resto se muestra con su clave. */
const ETIQUETAS: Record<string, string> = {
  titulo: 'Título',
  descripcion: 'Descripción',
  precio: 'Precio',
  moneda: 'Moneda',
  estado_comercial: 'Estado',
  tipo_operacion: 'Operación',
  tipo_propiedad: 'Tipo',
  propietario_persona_id: 'Propietario',
  eliminado_en: 'Baja',
  monto: 'Monto',
  monto_inicial: 'Monto inicial',
  estado: 'Estado',
  fecha_inicio: 'Inicio',
  fecha_fin: 'Fin',
}

const ACCION: Record<CambioRegistrado['accion'], string> = {
  crear: 'Alta',
  editar: 'Edición',
  baja: 'Baja',
  borrar: 'Borrado',
}

function etiqueta(campo: string): string {
  return ETIQUETAS[campo] ?? campo.replace(/_/g, ' ')
}

function valor(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  return String(v)
}

/** En una edición, cada campo trae `[antes, después]`. */
function esPar(v: unknown): v is [unknown, unknown] {
  return Array.isArray(v) && v.length === 2
}

function Detalle({ cambio }: { cambio: CambioRegistrado }) {
  if (cambio.accion !== 'editar') return null
  const campos = Object.entries(cambio.cambios).filter(([, v]) => esPar(v))
  // Las descripciones largas no entran en una línea: basta con saber que cambió.
  return (
    <ul className="historial-cambios-campos">
      {campos.map(([campo, par]) => {
        const [antes, despues] = par as [unknown, unknown]
        return (
          <li key={campo}>
            <strong>{etiqueta(campo)}:</strong>{' '}
            {campo === 'descripcion'
              ? 'modificada'
              : <>{valor(antes)} → {valor(despues)}</>}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Quién cambió qué y cuándo, para una entidad. Solo para admins: el endpoint
 * responde 403 al resto, así que quien lo monta debe chequear el rol antes.
 *
 * No renderiza `<form>`: vive adentro del formulario de la propiedad.
 */
export default function HistorialCambios({ entidad, entidadId }: Props) {
  const [cambios, setCambios] = useState<CambioRegistrado[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    setCambios(null)
    setError(null)
    auditoriaApi.listar(entidad, entidadId)
      .then(r => { if (activo) setCambios(r.items) })
      .catch((e: unknown) => {
        if (activo) setError(e instanceof Error ? e.message : 'No se pudo cargar el historial')
      })
    return () => { activo = false }
  }, [entidad, entidadId])

  return (
    <section className="admin-card">
      <h2 className="form-section-title">Historial de cambios</h2>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!error && cambios === null && <p className="lista-estado">Cargando...</p>}
      {cambios !== null && cambios.length === 0 && (
        <p className="lista-estado">Sin cambios registrados todavía.</p>
      )}
      {cambios !== null && cambios.length > 0 && (
        <ol className="historial-cambios">
          {cambios.map(c => (
            <li key={c.id}>
              <div className="historial-cambios-cabecera">
                <span className="historial-cambios-accion">{ACCION[c.accion]}</span>
                <span>{c.usuario?.name ?? 'Sistema'}</span>
                <time dateTime={c.creado_en}>{formatearFechaHora(c.creado_en)}</time>
              </div>
              <Detalle cambio={c} />
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
