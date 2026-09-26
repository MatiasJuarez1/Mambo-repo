import { useEffect, useState } from 'react'
import { inmobiliariaApi } from '../../../api/inmobiliaria'
import type { Inmobiliaria } from '../../../types/inmobiliaria'
import './Configuracion.css'

type Campo =
  | 'nombre' | 'telefono' | 'email' | 'cuit' | 'direccion'
  | 'honorarios_venta_pct' | 'honorarios_alquiler_pct'
  | 'punitorio_diario_pct' | 'dias_gracia' | 'dias_aviso_recordatorios'

const CAMPOS: { campo: Campo; label: string; tipo?: string; step?: string }[] = [
  { campo: 'nombre',                  label: 'Nombre' },
  { campo: 'telefono',                label: 'Teléfono' },
  { campo: 'email',                   label: 'Email', tipo: 'email' },
  { campo: 'cuit',                    label: 'CUIT' },
  { campo: 'direccion',               label: 'Dirección' },
  { campo: 'honorarios_venta_pct',    label: 'Honorarios de venta (%)', tipo: 'number' },
  { campo: 'honorarios_alquiler_pct', label: 'Honorarios de alquiler (%)', tipo: 'number' },
  { campo: 'punitorio_diario_pct',    label: '% diario de punitorio', tipo: 'number', step: '0.001' },
  { campo: 'dias_gracia',             label: 'Días de gracia', tipo: 'number', step: '1' },
  { campo: 'dias_aviso_recordatorios', label: 'Días de aviso de recordatorios', tipo: 'number', step: '1' },
]

const VACIO: Record<Campo, string> = {
  nombre: '', telefono: '', email: '', cuit: '', direccion: '',
  honorarios_venta_pct: '', honorarios_alquiler_pct: '',
  punitorio_diario_pct: '', dias_gracia: '0', dias_aviso_recordatorios: '30',
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
          punitorio_diario_pct:    i.punitorio_diario_pct === null ? '' : String(i.punitorio_diario_pct),
          dias_gracia:             String(i.dias_gracia),
          dias_aviso_recordatorios: String(i.dias_aviso_recordatorios),
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
        punitorio_diario_pct:    form.punitorio_diario_pct ? Number(form.punitorio_diario_pct) : null,
        dias_gracia:             form.dias_gracia ? Number(form.dias_gracia) : 0,
        dias_aviso_recordatorios: form.dias_aviso_recordatorios ? Number(form.dias_aviso_recordatorios) : 30,
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
      <div className="admin-page-header">
        <div>
          <span className="section-label">Ajustes</span>
          <h1>Configuración</h1>
        </div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}

      <form onSubmit={guardar} className="admin-card form">
        <h2 className="form-section-title">Inmobiliaria</h2>
        <div className="form-row">
          {CAMPOS.map(({ campo, label, tipo, step }) => (
            <div key={campo} className={`form-field${campo === 'direccion' ? ' full' : ''}`}>
              <label htmlFor={campo}>{label}</label>
              <input
                id={campo}
                type={tipo ?? 'text'}
                step={tipo === 'number' ? (step ?? '0.01') : undefined}
                min={tipo === 'number' ? (campo === 'dias_aviso_recordatorios' ? 1 : 0) : undefined}
                value={form[campo]}
                onChange={e => set(campo, e.target.value)}
              />
            </div>
          ))}
        </div>

        <p className="form-hint">
          El punitorio se cobra por cada día de atraso después de los días de gracia (0,1 = 0,1 % del alquiler por día).
          Cada contrato puede pisar el porcentaje. Los días de aviso son la ventana de la bandeja de
          recordatorios del dashboard y del email diario.
        </p>

        <h2 className="form-section-title">Envío de emails</h2>
        <p className="form-hint" data-testid="estado-email">
          {datos?.email_configurado
            ? 'Envío de emails: configurado. Los recibos y liquidaciones se pueden mandar desde la ficha del contrato.'
            : 'Envío de emails: no configurado (definir SMTP_* en el servidor).'}
        </p>
        <p className="form-hint" data-testid="estado-recordatorios">
          {datos?.recordatorios_configurado
            ? 'Email diario de recordatorios: configurado. Sale cada mañana a todo el staff con lo que vence en los próximos días de aviso.'
            : 'Email diario de recordatorios: no configurado (definir RECORDATORIOS_TOKEN y SMTP_* en el servidor).'}
        </p>

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
