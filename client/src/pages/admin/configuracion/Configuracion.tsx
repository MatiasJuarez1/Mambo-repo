import { useEffect, useState } from 'react'
import { inmobiliariaApi } from '../../../api/inmobiliaria'
import type { Inmobiliaria } from '../../../types/inmobiliaria'
import './Configuracion.css'

type Campo =
  | 'nombre' | 'telefono' | 'email' | 'cuit' | 'direccion'
  | 'honorarios_venta_pct' | 'honorarios_alquiler_pct'

const CAMPOS: { campo: Campo; label: string; tipo?: string }[] = [
  { campo: 'nombre',                  label: 'Nombre' },
  { campo: 'telefono',                label: 'Teléfono' },
  { campo: 'email',                   label: 'Email', tipo: 'email' },
  { campo: 'cuit',                    label: 'CUIT' },
  { campo: 'direccion',               label: 'Dirección' },
  { campo: 'honorarios_venta_pct',    label: 'Honorarios de venta (%)', tipo: 'number' },
  { campo: 'honorarios_alquiler_pct', label: 'Honorarios de alquiler (%)', tipo: 'number' },
]

const VACIO: Record<Campo, string> = {
  nombre: '', telefono: '', email: '', cuit: '', direccion: '',
  honorarios_venta_pct: '', honorarios_alquiler_pct: '',
}

/**
 * Datos de la inmobiliaria: el único lugar donde vive su nombre, logo y
 * honorarios por defecto. El menú ya la oculta a quien no es admin; si igual
 * llega un PUT sin permiso, el 403 del backend se muestra tal cual.
 */
export default function Configuracion() {
  const [datos, setDatos]   = useState<Inmobiliaria | null>(null)
  const [form, setForm]     = useState<Record<Campo, string>>(VACIO)
  const [estado, setEstado] = useState<'idle' | 'guardando' | 'guardado'>('idle')
  const [error, setError]   = useState<string | null>(null)

  useEffect(() => {
    inmobiliariaApi.obtener()
      .then(i => {
        setDatos(i)
        setForm({
          nombre:    i.nombre,
          telefono:  i.telefono ?? '',
          email:     i.email ?? '',
          cuit:      i.cuit ?? '',
          direccion: i.direccion ?? '',
          honorarios_venta_pct:    i.honorarios_venta_pct === null ? '' : String(i.honorarios_venta_pct),
          honorarios_alquiler_pct: i.honorarios_alquiler_pct === null ? '' : String(i.honorarios_alquiler_pct),
        })
      })
      .catch(e => setError(e.message))
  }, [])

  const set = (campo: Campo, valor: string) => {
    setForm(f => ({ ...f, [campo]: valor }))
    setEstado('idle')
  }

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setEstado('guardando')
    setError(null)
    try {
      const actualizado = await inmobiliariaApi.actualizar({
        nombre:    form.nombre,
        telefono:  form.telefono || null,
        email:     form.email || null,
        cuit:      form.cuit || null,
        direccion: form.direccion || null,
        honorarios_venta_pct:    form.honorarios_venta_pct ? Number(form.honorarios_venta_pct) : null,
        honorarios_alquiler_pct: form.honorarios_alquiler_pct ? Number(form.honorarios_alquiler_pct) : null,
      })
      setDatos(actualizado)
      setEstado('guardado')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
      setEstado('idle')
    }
  }

  const subirLogo = async (archivo: File | undefined) => {
    if (!archivo) return
    setError(null)
    try {
      setDatos(await inmobiliariaApi.subirLogo(archivo))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo subir el logo')
    }
  }

  return (
    <div>
      <div className="admin-page-header"><h1>Configuración</h1></div>
      {error && <p className="form-error" role="alert">{error}</p>}

      <form onSubmit={guardar} className="admin-card form">
        <h2 className="form-section-title">Inmobiliaria</h2>
        <div className="form-row">
          {CAMPOS.map(({ campo, label, tipo }) => (
            <div key={campo} className={`form-field${campo === 'direccion' ? ' full' : ''}`}>
              <label htmlFor={campo}>{label}</label>
              <input
                id={campo}
                type={tipo ?? 'text'}
                step={tipo === 'number' ? '0.01' : undefined}
                min={tipo === 'number' ? 0 : undefined}
                value={form[campo]}
                onChange={e => set(campo, e.target.value)}
              />
            </div>
          ))}
        </div>

        <h2 className="form-section-title">Logo</h2>
        {datos?.logo_url && <img src={datos.logo_url} alt="Logo de la inmobiliaria" className="config-logo" />}
        <div className="form-field">
          <label htmlFor="logo">Subir logo</label>
          {/* Se sube al instante, aparte del resto del formulario. */}
          <input id="logo" type="file" accept="image/*" onChange={e => subirLogo(e.target.files?.[0])} />
        </div>

        <div className="form-actions">
          {estado === 'guardado' && <span className="form-hint">Guardado</span>}
          <button type="submit" className="btn btn-magenta" disabled={estado === 'guardando'}>
            {estado === 'guardando' ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  )
}
