import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { busquedasApi, type Busqueda, type CriteriosBusqueda } from '../../../api/busquedas'
import type { PropiedadBrief } from '../../../types/reserva'
import type { TipoOperacion, TipoPropiedad } from '../../../types/propiedad'
import { LABEL_OPERACION, LABEL_TIPO } from '../../../lib/propiedad'
import { formatearMonto } from '../../../lib/formato'
import Badge from '../../Badge'
import './BloqueBusquedas.css'

/** "Departamento en alquiler · Yerba Buena · hasta ARS 150.000 · 2+ dorm." */
export function resumirBusqueda(b: CriteriosBusqueda): string {
  const que = [
    b.tipo_propiedad ? LABEL_TIPO[b.tipo_propiedad] : 'Cualquier propiedad',
    b.tipo_operacion ? `en ${LABEL_OPERACION[b.tipo_operacion].toLowerCase()}` : null,
  ].filter(Boolean).join(' ')
  const partes = [que]
  if (b.ciudad) partes.push(b.ciudad)
  const moneda = b.moneda ?? ''
  if (b.precio_min != null && b.precio_max != null) {
    partes.push(`${formatearMonto(b.precio_min, moneda)} a ${formatearMonto(b.precio_max, moneda)}`)
  } else if (b.precio_max != null) {
    partes.push(`hasta ${formatearMonto(b.precio_max, moneda)}`)
  } else if (b.precio_min != null) {
    partes.push(`desde ${formatearMonto(b.precio_min, moneda)}`)
  }
  if (b.dormitorios_min != null) partes.push(`${b.dormitorios_min}+ dorm.`)
  return partes.join(' · ')
}

/** Texto opcional de un input: vacío viaja como `null` ("cualquiera"). */
function texto(fd: FormData, campo: string): string | null {
  const v = String(fd.get(campo) ?? '').trim()
  return v || null
}

function numero(fd: FormData, campo: string): number | null {
  const v = texto(fd, campo)
  return v === null ? null : Number(v)
}

interface Props {
  personaId: number
}

/**
 * Qué busca esta persona. Cuando entra una propiedad que le sirve, el agente que
 * cargó la búsqueda recibe una tarea para ofrecérsela (lo hace el backend).
 *
 * El alta es un `<form>` propio: este bloque vive en la ficha de la persona,
 * que no tiene formulario alrededor.
 */
export default function BloqueBusquedas({ personaId }: Props) {
  const [busquedas, setBusquedas] = useState<Busqueda[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [agregando, setAgregando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [abierta, setAbierta] = useState<{ id: number; propiedades: PropiedadBrief[] } | null>(null)

  useEffect(() => {
    let activo = true
    setBusquedas(null)
    busquedasApi.listar(personaId)
      .then(b => { if (activo) setBusquedas(b) })
      .catch((e: unknown) => {
        if (activo) setError(e instanceof Error ? e.message : 'No se pudieron cargar las búsquedas')
      })
    return () => { activo = false }
  }, [personaId])

  const reemplazar = (b: Busqueda) =>
    setBusquedas(prev => (prev ?? []).map(x => (x.id === b.id ? b : x)))

  async function crear(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const hayPrecio = texto(fd, 'precio_min') !== null || texto(fd, 'precio_max') !== null
    setGuardando(true)
    setError(null)
    try {
      const nueva = await busquedasApi.crear(personaId, {
        tipo_operacion: texto(fd, 'tipo_operacion') as TipoOperacion | null,
        tipo_propiedad: texto(fd, 'tipo_propiedad') as TipoPropiedad | null,
        ciudad: texto(fd, 'ciudad'),
        moneda: hayPrecio ? texto(fd, 'moneda') : null,
        precio_min: numero(fd, 'precio_min'),
        precio_max: numero(fd, 'precio_max'),
        dormitorios_min: numero(fd, 'dormitorios_min'),
        notas: texto(fd, 'notas'),
      })
      setBusquedas(prev => [nueva, ...(prev ?? [])])
      setAgregando(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la búsqueda')
    } finally {
      setGuardando(false)
    }
  }

  async function alternar(b: Busqueda) {
    setError(null)
    try {
      reemplazar(await busquedasApi.actualizar(b.id, { activa: !b.activa }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la búsqueda')
    }
  }

  async function borrar(b: Busqueda) {
    if (!window.confirm(`¿Borrar la búsqueda "${resumirBusqueda(b)}"?`)) return
    setError(null)
    try {
      await busquedasApi.borrar(b.id)
      setBusquedas(prev => (prev ?? []).filter(x => x.id !== b.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo borrar la búsqueda')
    }
  }

  async function verCoincidencias(b: Busqueda) {
    if (abierta?.id === b.id) { setAbierta(null); return }
    setError(null)
    try {
      const r = await busquedasApi.coincidencias(b.id)
      setAbierta({ id: b.id, propiedades: r.propiedades })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las coincidencias')
    }
  }

  return (
    <section className="admin-card">
      <div className="bloque-busquedas-cabecera">
        <h2 className="form-section-title">Búsquedas</h2>
        {!agregando && (
          <button type="button" className="btn btn-outline btn-chico" onClick={() => setAgregando(true)}>
            Agregar búsqueda
          </button>
        )}
      </div>

      {agregando && (
        <form className="bloque-busquedas-form" onSubmit={crear}>
          <div className="form-field">
            <label htmlFor="busqueda-operacion">Operación</label>
            <select id="busqueda-operacion" name="tipo_operacion" defaultValue="">
              <option value="">Cualquiera</option>
              {(Object.keys(LABEL_OPERACION) as TipoOperacion[]).map(t => (
                <option key={t} value={t}>{LABEL_OPERACION[t]}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="busqueda-tipo">Tipo</label>
            <select id="busqueda-tipo" name="tipo_propiedad" defaultValue="">
              <option value="">Cualquiera</option>
              {(Object.keys(LABEL_TIPO) as TipoPropiedad[]).map(t => (
                <option key={t} value={t}>{LABEL_TIPO[t]}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="busqueda-ciudad">Ciudad</label>
            <input id="busqueda-ciudad" name="ciudad" placeholder="Cualquiera" maxLength={120} />
          </div>
          <div className="form-field">
            <label htmlFor="busqueda-moneda">Moneda</label>
            <select id="busqueda-moneda" name="moneda" defaultValue="ARS">
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="busqueda-min">Precio desde</label>
            <input id="busqueda-min" name="precio_min" type="number" min={0} step="any" />
          </div>
          <div className="form-field">
            <label htmlFor="busqueda-max">Precio hasta</label>
            <input id="busqueda-max" name="precio_max" type="number" min={0} step="any" />
          </div>
          <div className="form-field">
            <label htmlFor="busqueda-dorm">Dormitorios (mín.)</label>
            <input id="busqueda-dorm" name="dormitorios_min" type="number" min={0} step={1} />
          </div>
          <div className="form-field bloque-busquedas-notas">
            <label htmlFor="busqueda-notas">Notas</label>
            <input id="busqueda-notas" name="notas" placeholder="Ej.: con cochera, cerca del colegio" />
          </div>
          <div className="bloque-busquedas-acciones">
            <button type="button" className="btn btn-outline" onClick={() => setAgregando(false)}>Cancelar</button>
            <button type="submit" className="btn btn-magenta" disabled={guardando}>
              {guardando ? 'Guardando...' : 'Guardar búsqueda'}
            </button>
          </div>
        </form>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}
      {!error && busquedas === null && <p className="lista-estado">Cargando...</p>}
      {busquedas !== null && busquedas.length === 0 && !agregando && (
        <p className="lista-estado">Sin búsquedas guardadas</p>
      )}

      {busquedas !== null && busquedas.length > 0 && (
        <ul className="bloque-busquedas-lista">
          {busquedas.map(b => (
            <li key={b.id} className={b.activa ? undefined : 'bloque-busquedas-pausada'}>
              <div className="bloque-busquedas-fila">
                <div>
                  <strong>{resumirBusqueda(b)}</strong>
                  {b.notas && <small className="bloque-busquedas-nota">{b.notas}</small>}
                </div>
                <div className="tabla-acciones">
                  {b.activa
                    ? (
                      <button type="button" className="btn btn-outline btn-chico" onClick={() => void verCoincidencias(b)}>
                        {b.coincidencias === 1 ? '1 coincidencia' : `${b.coincidencias} coincidencias`}
                      </button>
                    )
                    : <Badge value="pausada" label="Pausada" />}
                  <button type="button" className="btn btn-outline btn-chico" onClick={() => void alternar(b)}>
                    {b.activa ? 'Pausar' : 'Reactivar'}
                  </button>
                  <button type="button" className="btn btn-outline btn-chico" onClick={() => void borrar(b)}>
                    Borrar
                  </button>
                </div>
              </div>
              {abierta?.id === b.id && (
                abierta.propiedades.length === 0
                  ? <p className="lista-estado">Ninguna propiedad disponible la cumple hoy.</p>
                  : (
                    <ul className="bloque-busquedas-coincidencias">
                      {abierta.propiedades.map(p => (
                        <li key={p.id}><Link to={`/admin/propiedades/${p.id}/editar`}>{p.titulo}</Link></li>
                      ))}
                    </ul>
                  )
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
