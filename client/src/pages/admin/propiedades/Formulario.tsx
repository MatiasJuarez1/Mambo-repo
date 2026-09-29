import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { propiedadesApi } from '../../../api/propiedades'
import type { TipoPropiedad, TipoOperacion, EstadoComercial, Medio, Propiedad, Caracteristica } from '../../../types/propiedad'
import type { PersonaBrief } from '../../../types/persona'
import SelectorPersona from '../../../components/crm/SelectorPersona/SelectorPersona'
import BloqueDocumentos from '../../../components/crm/BloqueDocumentos/BloqueDocumentos'
import HistorialCambios from '../../../components/crm/HistorialCambios/HistorialCambios'
import BloqueInteresados from '../../../components/crm/BloqueInteresados/BloqueInteresados'
import { etiquetaEstado, mediaUrl, ordenarMedios, esTildada, CATALOGO_CARACTERISTICAS, VALOR_TILDADO } from '../../../lib/propiedad'
import { formatearFecha, formatearMonto } from '../../../lib/formato'
import { veCrm } from '../../../lib/beta'
import { useAuth } from '../../../context/AuthContext'
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
  m2_terreno:      string
  m2_construidos:  string
  m2_cubiertos:    string
  m2_propios:      string
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
  dormitorios: '', banos: '',
  m2_terreno: '', m2_construidos: '', m2_cubiertos: '', m2_propios: '', m2_totales: '',
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

  // Fotos ya guardadas de la propiedad. Las nuevas se suben al instante al
  // backend (que las procesa) y se agregan acá con la URL que devuelve.
  const [medios, setMedios]     = useState<Medio[]>([])
  const [subiendo, setSubiendo] = useState(false)
  const [arrastrando, setArrastrando] = useState<number | null>(null)
  const [guardandoOrden, setGuardandoOrden] = useState(false)

  // Características ya guardadas de la propiedad. Igual que las fotos, cada
  // cambio va al backend en el acto.
  const [caracteristicas, setCaracteristicas] = useState<Caracteristica[]>([])
  const [nuevaClave, setNuevaClave] = useState('')
  const [nuevoValor, setNuevoValor] = useState('')
  const [guardandoCaract, setGuardandoCaract] = useState(false)

  // Dueño de la propiedad. Va aparte del FormState porque no es un string
  // sino una persona elegida con el buscador.
  const [propietario, setPropietario] = useState<PersonaBrief | null>(null)
  const { usuario } = useAuth()
  const crm = veCrm(usuario)
  const esAdmin = usuario?.roles.includes('admin') ?? false

  // Contrato de alquiler activo, si lo hay: solo se muestra, lo maneja Alquileres.
  const [contratoVigente, setContratoVigente] = useState<Propiedad['contrato_vigente']>(null)

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
          m2_terreno:       p.m2_terreno?.toString() ?? '',
          m2_construidos:   p.m2_construidos?.toString() ?? '',
          m2_cubiertos:     p.m2_cubiertos?.toString() ?? '',
          m2_propios:       p.m2_propios?.toString() ?? '',
          m2_totales:       p.m2_totales?.toString() ?? '',
          direccion:        p.ubicacion?.direccion ?? '',
          ciudad:           p.ubicacion?.ciudad ?? '',
          provincia:        p.ubicacion?.provincia ?? '',
          pais:             p.ubicacion?.pais ?? 'AR',
          codigo_postal:    p.ubicacion?.codigo_postal ?? '',
        })
        setMedios(ordenarMedios(p.medios))
        setCaracteristicas(p.caracteristicas)
        setPropietario(p.propietario)
        setContratoVigente(p.contrato_vigente)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id, esEdicion])

  const set = (key: keyof FormState, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }))

  // ── Fotos ──
  // Se suben una por una al backend apenas se seleccionan; el servidor las
  // valida, procesa y devuelve la URL ya lista para mostrar.
  const subirArchivos = async (files: FileList | null) => {
    if (!files || !id) return
    setSubiendo(true)
    setError(null)
    try {
      for (const archivo of Array.from(files)) {
        const medio = await propiedadesApi.subirMedio(Number(id), archivo)
        setMedios(prev => [...prev, medio])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir la foto')
    } finally {
      setSubiendo(false)
    }
  }

  const borrarMedio = async (medioId: number) => {
    if (!id) return
    try {
      await propiedadesApi.eliminarMedio(Number(id), medioId)
      setMedios(prev => prev.filter(m => m.id !== medioId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo borrar la foto')
    }
  }

  // Se guarda al soltar, sin botón aparte. Optimista, como subir y borrar: la
  // grilla cambia en el acto y después se pisa con lo que devuelve el backend,
  // que es quien decide cuál queda como principal.
  const soltarSobre = async (destinoId: number) => {
    const origenId = arrastrando
    setArrastrando(null)
    if (!id || origenId === null || origenId === destinoId || guardandoOrden || subiendo) return

    // La foto toma el lugar del destino: hacia adelante queda después de él,
    // hacia atrás queda antes. Así se puede mandar una foto al final o al principio.
    const desde = medios.findIndex(m => m.id === origenId)
    const hasta = medios.findIndex(m => m.id === destinoId)
    const nuevo = [...medios]
    const [movido] = nuevo.splice(desde, 1)
    nuevo.splice(hasta, 0, movido)
    setMedios(nuevo)

    setError(null)
    setGuardandoOrden(true)
    try {
      setMedios(await propiedadesApi.reordenarMedios(Number(id), nuevo.map(m => m.id)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo reordenar las fotos')
    } finally {
      setGuardandoOrden(false)
    }
  }

  // ── Características ──
  // Igual que las fotos: cada cambio va al backend en el acto. `guardandoCaract`
  // evita que un doble click mande dos pedidos antes de que el estado se
  // actualice (el mismo defecto que tenían las fotos, corregido ahí con
  // `guardandoOrden`).
  const esDelCatalogo = (c: Caracteristica) =>
    esTildada(c.valor) && (CATALOGO_CARACTERISTICAS as readonly string[]).includes(c.clave)

  // Devuelve si la característica se guardó, para que quien llama decida qué
  // hacer con su propio estado (p. ej. `agregarLibre` solo limpia los campos
  // cuando el POST salió bien: si falla, el usuario no debería perder lo escrito).
  const agregarCaracteristica = async (clave: string, valor: string): Promise<boolean> => {
    if (!id || guardandoCaract) return false
    setError(null)
    setGuardandoCaract(true)
    try {
      const nueva = await propiedadesApi.agregarCaracteristica(Number(id), { clave, valor })
      setCaracteristicas(prev => [...prev, nueva])
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo agregar la característica')
      return false
    } finally {
      setGuardandoCaract(false)
    }
  }

  const quitarCaracteristica = async (caracteristicaId: number) => {
    if (!id || guardandoCaract) return
    setError(null)
    setGuardandoCaract(true)
    try {
      await propiedadesApi.eliminarCaracteristica(Number(id), caracteristicaId)
      setCaracteristicas(prev => prev.filter(c => c.id !== caracteristicaId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo quitar la característica')
    } finally {
      setGuardandoCaract(false)
    }
  }

  const alternarDelCatalogo = (clave: string) => {
    const existente = caracteristicas.find(c => c.clave === clave && esTildada(c.valor))
    if (existente) quitarCaracteristica(existente.id)
    else agregarCaracteristica(clave, VALOR_TILDADO)
  }

  const agregarLibre = async () => {
    const clave = nuevaClave.trim()
    if (!clave) return
    const ok = await agregarCaracteristica(clave, nuevoValor.trim() || VALOR_TILDADO)
    if (ok) {
      setNuevaClave('')
      setNuevoValor('')
    }
  }

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
      m2_terreno:       num(form.m2_terreno),
      m2_construidos:   num(form.m2_construidos),
      m2_cubiertos:     num(form.m2_cubiertos),
      m2_propios:       num(form.m2_propios),
      m2_totales:       num(form.m2_totales),
      // `null` (y no `undefined`) para que al editar el backend borre el
      // propietario que había; `undefined` lo dejaría como estaba. Sin CRM el
      // campo no se muestra, así que no se manda: no hay que pisar lo cargado.
      propietario_persona_id: crm ? propietario?.id ?? null : undefined,
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
        navigate('/admin/propiedades')
      } else {
        // Al crear vamos a la edición: las fotos necesitan el id recién asignado
        // por el backend, así que se agregan en el paso siguiente.
        const prop = await propiedadesApi.crear(payload)
        navigate(`/admin/propiedades/${prop.id}/editar`)
      }
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
        <div>
          <span className="section-label">Inventario</span>
          <h1>{esEdicion ? 'Editar propiedad' : 'Nueva propiedad'}</h1>
        </div>
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
              <label htmlFor="estado_comercial">Estado comercial</label>
              {/* Las etiquetas se derivan de la operación elegida arriba: el valor que
                  se guarda sigue siendo `cerrada` (es el enum de la base), pero quien
                  carga la propiedad lee "Vendida" o "Alquilada" según corresponda. */}
              <select
                id="estado_comercial"
                value={form.estado_comercial}
                onChange={e => set('estado_comercial', e.target.value as EstadoComercial)}
              >
                {(['disponible','reservada','cerrada','baja'] as EstadoComercial[]).map(t => (
                  <option key={t} value={t}>{etiquetaEstado(t, form.tipo_operacion)}</option>
                ))}
              </select>
              <p className="form-hint">
                {form.estado_comercial === 'baja'
                  ? 'No se muestra en el sitio público.'
                  : form.estado_comercial === 'disponible'
                    ? 'Se muestra como disponible.'
                    : 'Se muestra en el sitio con una faja encima.'}
              </p>
            </div>
          </div>
        </div>

        {/* ── Propietario ── */}
        {crm && (
        <div className="admin-card form-section">
          <h2 className="form-section-title">Propietario</h2>
          <SelectorPersona valor={propietario} onChange={setPropietario} label="Propietario" />
          <p className="form-hint">
            La persona que figura como dueña. Aparece en su ficha como "Propietario".
          </p>
        </div>
        )}

        {/* ── Contrato de alquiler ── */}
        {crm && esEdicion && (
          <div className="admin-card form-section">
            <h2 className="form-section-title">Contrato de alquiler</h2>
            {contratoVigente
              ? (
                <p className="form-valor">
                  {formatearMonto(contratoVigente.monto_vigente, contratoVigente.moneda)} · vence el {formatearFecha(contratoVigente.fecha_fin)}{' '}
                  <Link to={`/admin/alquileres/${contratoVigente.id}`} className="btn btn-outline btn-chico">Ver contrato</Link>
                </p>
              )
              : (
                <div>
                  <Link to={`/admin/alquileres/nuevo?property_id=${id}`} className="btn btn-outline btn-chico">Cargar contrato</Link>
                  <p className="form-hint">Sin contrato vigente.</p>
                </div>
              )}
          </div>
        )}

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
              <label htmlFor="dormitorios">Dormitorios</label>
              <input id="dormitorios" type="number" min="0" value={form.dormitorios} onChange={e => set('dormitorios', e.target.value)} placeholder="—" />
            </div>
            <div className="form-field">
              <label htmlFor="banos">Baños</label>
              <input id="banos" type="number" min="0" value={form.banos} onChange={e => set('banos', e.target.value)} placeholder="—" />
            </div>
          </div>
          {/* Todas opcionales: se carga solo la que aplica a la propiedad. */}
          <div className="form-row">
            {([
              ['m2_terreno',     'm² terreno'],
              ['m2_construidos', 'm² construidos'],
              ['m2_cubiertos',   'm² cubiertos'],
              ['m2_propios',     'm² propios'],
              ['m2_totales',     'm² totales'],
            ] as const).map(([campo, etiqueta]) => (
              <div className="form-field" key={campo}>
                <label htmlFor={campo}>{etiqueta}</label>
                <input id={campo} type="number" min="0" step="0.01" value={form[campo]} onChange={e => set(campo, e.target.value)} placeholder="—" />
              </div>
            ))}
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

        {/* ── Características ── */}
        {esEdicion && (
          <div className="admin-card form-section">
            <h2 className="form-section-title">Características</h2>
            <p className="form-hint">Se guardan al instante al tildarlas.</p>

            <div className="caract-grid">
              {CATALOGO_CARACTERISTICAS.map(item => (
                <label key={item} className="caract-check">
                  <input
                    type="checkbox"
                    checked={caracteristicas.some(c => c.clave === item && esTildada(c.valor))}
                    onChange={() => alternarDelCatalogo(item)}
                    disabled={guardandoCaract}
                  />
                  {item}
                </label>
              ))}
            </div>

            {caracteristicas.some(c => !esDelCatalogo(c)) && (
              <div className="caract-libres">
                {caracteristicas.filter(c => !esDelCatalogo(c)).map(c => (
                  <span key={c.id} className="caract-chip">
                    {esTildada(c.valor) ? c.clave : `${c.clave}: ${c.valor}`}
                    <button
                      type="button"
                      onClick={() => quitarCaracteristica(c.id)}
                      aria-label={`Quitar ${c.clave}`}
                      disabled={guardandoCaract}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="form-row">
              <div className="form-field">
                <label htmlFor="caract-clave">Otra característica</label>
                <input
                  id="caract-clave"
                  value={nuevaClave}
                  onChange={e => setNuevaClave(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarLibre() } }}
                  placeholder="Ej: Orientación"
                />
              </div>
              <div className="form-field">
                <label htmlFor="caract-valor">Valor</label>
                <input
                  id="caract-valor"
                  value={nuevoValor}
                  onChange={e => setNuevoValor(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarLibre() } }}
                  placeholder="Ej: Norte (opcional)"
                />
              </div>
              <div className="form-field caract-agregar">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={agregarLibre}
                  disabled={!nuevaClave.trim() || guardandoCaract}
                >
                  Agregar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Fotos ── */}
        <div className="admin-card form-section">
          <h2 className="form-section-title">Fotos</h2>
          {esEdicion ? (
            <p className="form-hint">
              La primera foto se usa como principal. Arrastralas para cambiar el orden; se guarda al soltar.
            </p>
          ) : (
            <p className="form-hint">
              Guardá la propiedad para poder agregar fotos.
            </p>
          )}

          {esEdicion && (
            <div className="fotos-grid">
              {/* Fotos ya guardadas, servidas por el backend */}
              {medios.map(m => (
                <div
                  key={m.id}
                  className={`foto-item${arrastrando === m.id ? ' arrastrando' : ''}`}
                  draggable={!guardandoOrden && !subiendo}
                  onDragStart={e => {
                    e.dataTransfer?.setData('text/plain', String(m.id))
                    setArrastrando(m.id)
                  }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault()
                    soltarSobre(m.id)
                  }}
                  onDragEnd={() => setArrastrando(null)}
                >
                  <img src={mediaUrl(m.url)} alt={m.descripcion ?? 'Foto de la propiedad'} />
                  {m.es_principal && <span className="foto-principal">Principal</span>}
                  <button
                    type="button"
                    className="foto-quitar"
                    onClick={() => borrarMedio(m.id)}
                    aria-label="Borrar foto"
                    disabled={guardandoOrden}
                  >
                    ×
                  </button>
                </div>
              ))}

              {/* Selector: sube al instante al backend */}
              <label className="foto-agregar">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  disabled={subiendo || guardandoOrden}
                  onChange={e => {
                    subirArchivos(e.target.files)
                    e.target.value = ''
                  }}
                />
                <span className="foto-agregar-icono">+</span>
                <span>{subiendo ? 'Subiendo...' : 'Agregar fotos'}</span>
              </label>
            </div>
          )}
        </div>

        {/* ── Documentos ── */}
        {crm && esEdicion && <BloqueDocumentos entidad={{ propiedadId: Number(id) }} />}

        {/* ── A quién ofrecérsela: búsquedas guardadas que la cumplen ── */}
        {crm && esEdicion && <BloqueInteresados propiedadId={Number(id)} />}

        {/* ── Historial: quién cambió precio, estado, etc. Solo admin. ── */}
        {esAdmin && esEdicion && <HistorialCambios entidad="propiedad" entidadId={Number(id)} />}

        {/* ── Acciones ── */}
        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={() => navigate('/admin/propiedades')}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-magenta" disabled={saving}>
            {saving ? 'Guardando...' : esEdicion ? 'Guardar cambios' : 'Crear propiedad'}
          </button>
        </div>

      </form>
    </div>
  )
}
