import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { propiedadesApi } from '../../../api/propiedades'
import type { TipoPropiedad, TipoOperacion, EstadoComercial } from '../../../types/propiedad'
import './Formulario.css'

interface FormState {
  // Datos básicos
  titulo:          string
  descripcion:     string
  tipo_propiedad:  TipoPropiedad
  tipo_operacion:  TipoOperacion
  estado_comercial: EstadoComercial
  // Precio
  moneda:          string
  precio:          string
  // Medidas
  dormitorios:     string
  banos:           string
  m2_cubiertos:    string
  m2_totales:      string
  // Ubicación
  direccion:       string
  ciudad:          string
  provincia:       string
  pais:            string
  codigo_postal:   string
}

const INITIAL: FormState = {
  titulo: '', descripcion: '',
  tipo_propiedad: 'otro', tipo_operacion: 'venta', estado_comercial: 'disponible',
  moneda: 'ARS', precio: '',
  dormitorios: '', banos: '', m2_cubiertos: '', m2_totales: '',
  direccion: '', ciudad: '', provincia: '', pais: 'AR', codigo_postal: '',
}

const num = (v: string) => v === '' ? undefined : Number(v)

export default function PropiedadFormulario() {
  const { id }     = useParams()
  const navigate   = useNavigate()
  const esEdicion  = Boolean(id)

  const [form, setForm]       = useState<FormState>(INITIAL)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  // ── Cargar datos en modo edición ──
  useEffect(() => {
    if (!esEdicion) return
    setLoading(true)
    propiedadesApi.obtener(Number(id))
      .then(p => {
        setForm({
          titulo:           p.titulo,
          descripcion:      p.descripcion ?? '',
          tipo_propiedad:   p.tipo_propiedad,
          tipo_operacion:   p.tipo_operacion,
          estado_comercial: p.estado_comercial,
          moneda:           p.moneda,
          precio:           p.precio?.toString() ?? '',
          dormitorios:      p.dormitorios?.toString() ?? '',
          banos:            p.banos?.toString() ?? '',
          m2_cubiertos:     p.m2_cubiertos?.toString() ?? '',
          m2_totales:       p.m2_totales?.toString() ?? '',
          direccion:        p.ubicacion?.direccion ?? '',
          ciudad:           p.ubicacion?.ciudad ?? '',
          provincia:        p.ubicacion?.provincia ?? '',
          pais:             p.ubicacion?.pais ?? 'AR',
          codigo_postal:    p.ubicacion?.codigo_postal ?? '',
        })
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id, esEdicion])

  const set = (key: keyof FormState, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }))

  // ── Submit ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const payload = {
      titulo:           form.titulo,
      descripcion:      form.descripcion || undefined,
      tipo_propiedad:   form.tipo_propiedad,
      tipo_operacion:   form.tipo_operacion,
      estado_comercial: form.estado_comercial,
      moneda:           form.moneda,
      precio:           num(form.precio),
      dormitorios:      num(form.dormitorios),
      banos:            num(form.banos),
      m2_cubiertos:     num(form.m2_cubiertos),
      m2_totales:       num(form.m2_totales),
      ubicacion: {
        direccion:     form.direccion || undefined,
        ciudad:        form.ciudad    || undefined,
        provincia:     form.provincia || undefined,
        pais:          form.pais      || undefined,
        codigo_postal: form.codigo_postal || undefined,
      },
    }

    try {
      if (esEdicion) {
        await propiedadesApi.actualizar(Number(id), payload)
      } else {
        await propiedadesApi.crear(payload)
      }
      navigate('/admin/propiedades')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="lista-estado">Cargando...</p>

  return (
    <div>
      <div className="admin-page-header">
        <h1>{esEdicion ? 'Editar propiedad' : 'Nueva propiedad'}</h1>
      </div>

      {error && <p className="form-error">{error}</p>}

      <form onSubmit={handleSubmit} className="prop-form">

        {/* ── Datos básicos ── */}
        <div className="admin-card form-section">
          <h2 className="form-section-title">Datos básicos</h2>

          <div className="form-field full">
            <label>Título *</label>
            <input
              required
              value={form.titulo}
              onChange={e => set('titulo', e.target.value)}
              placeholder="Ej: Casa 3 dormitorios en Yerba Buena"
            />
          </div>

          <div className="form-field full">
            <label>Descripción</label>
            <textarea
              rows={4}
              value={form.descripcion}
              onChange={e => set('descripcion', e.target.value)}
              placeholder="Descripción de la propiedad..."
            />
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Tipo de propiedad</label>
              <select value={form.tipo_propiedad} onChange={e => set('tipo_propiedad', e.target.value as TipoPropiedad)}>
                {(['casa','depto','local','terreno','oficina','otro'] as TipoPropiedad[]).map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Tipo de operación</label>
              <select value={form.tipo_operacion} onChange={e => set('tipo_operacion', e.target.value as TipoOperacion)}>
                {(['venta','alquiler','temporal'] as TipoOperacion[]).map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Estado comercial</label>
              <select value={form.estado_comercial} onChange={e => set('estado_comercial', e.target.value as EstadoComercial)}>
                {(['disponible','reservada','cerrada','baja'] as EstadoComercial[]).map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ── Precio ── */}
        <div className="admin-card form-section">
          <h2 className="form-section-title">Precio</h2>
          <div className="form-row">
            <div className="form-field" style={{ maxWidth: 100 }}>
              <label>Moneda</label>
              <select value={form.moneda} onChange={e => set('moneda', e.target.value)}>
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div className="form-field">
              <label>Precio</label>
              <input
                type="number"
                min="0"
                value={form.precio}
                onChange={e => set('precio', e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
        </div>

        {/* ── Medidas ── */}
        <div className="admin-card form-section">
          <h2 className="form-section-title">Medidas y ambientes</h2>
          <div className="form-row">
            <div className="form-field">
              <label>Dormitorios</label>
              <input type="number" min="0" value={form.dormitorios} onChange={e => set('dormitorios', e.target.value)} placeholder="—" />
            </div>
            <div className="form-field">
              <label>Baños</label>
              <input type="number" min="0" value={form.banos} onChange={e => set('banos', e.target.value)} placeholder="—" />
            </div>
            <div className="form-field">
              <label>m² cubiertos</label>
              <input type="number" min="0" value={form.m2_cubiertos} onChange={e => set('m2_cubiertos', e.target.value)} placeholder="—" />
            </div>
            <div className="form-field">
              <label>m² totales</label>
              <input type="number" min="0" value={form.m2_totales} onChange={e => set('m2_totales', e.target.value)} placeholder="—" />
            </div>
          </div>
        </div>

        {/* ── Ubicación ── */}
        <div className="admin-card form-section">
          <h2 className="form-section-title">Ubicación</h2>
          <div className="form-field full">
            <label>Dirección</label>
            <input value={form.direccion} onChange={e => set('direccion', e.target.value)} placeholder="Ej: Av. Mate de Luna 2500" />
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>Ciudad</label>
              <input value={form.ciudad} onChange={e => set('ciudad', e.target.value)} placeholder="Tucumán" />
            </div>
            <div className="form-field">
              <label>Provincia</label>
              <input value={form.provincia} onChange={e => set('provincia', e.target.value)} placeholder="Tucumán" />
            </div>
            <div className="form-field">
              <label>Código postal</label>
              <input value={form.codigo_postal} onChange={e => set('codigo_postal', e.target.value)} placeholder="4000" />
            </div>
          </div>
        </div>

        {/* ── Acciones ── */}
        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={() => navigate('/admin/propiedades')}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-pink" disabled={saving}>
            {saving ? 'Guardando...' : esEdicion ? 'Guardar cambios' : 'Crear propiedad'}
          </button>
        </div>

      </form>
    </div>
  )
}
