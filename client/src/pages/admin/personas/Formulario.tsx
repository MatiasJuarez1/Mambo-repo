import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { personasApi } from '../../../api/personas'
import type { Contacto, ContactoPayload, EtiquetaConteo, TipoContacto } from '../../../types/persona'
import './Formulario.css'

const TIPOS_CONTACTO: { valor: TipoContacto; label: string }[] = [
  { valor: 'phone', label: 'Teléfono' },
  { valor: 'whatsapp', label: 'WhatsApp' },
  { valor: 'email', label: 'Email' },
  { valor: 'other', label: 'Otro' },
]

interface FormState {
  first_name: string
  last_name: string
  document_type: string
  document_number: string
  notes: string
}

const INICIAL: FormState = { first_name: '', last_name: '', document_type: 'DNI', document_number: '', notes: '' }

export default function PersonaFormulario() {
  const { id } = useParams()
  const navigate = useNavigate()
  const editando = id !== undefined
  const personaId = editando ? Number(id) : null

  const [form, setForm] = useState<FormState>(INICIAL)
  const [contactos, setContactos] = useState<Contacto[]>([])
  const [nuevoContacto, setNuevoContacto] = useState<ContactoPayload>({ type: 'phone', value: '' })
  const [etiquetas, setEtiquetas] = useState<string[]>([])
  const [nuevaEtiqueta, setNuevaEtiqueta] = useState('')
  const [sugeridas, setSugeridas] = useState<EtiquetaConteo[]>([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    personasApi.etiquetas().then(setSugeridas).catch(() => setSugeridas([]))
    if (personaId === null) return
    personasApi.obtener(personaId).then(p => {
      setForm({
        first_name: p.first_name, last_name: p.last_name,
        document_type: p.document_type ?? '', document_number: p.document_number ?? '',
        notes: p.notes ?? '',
      })
      setContactos(p.contacts)
      setEtiquetas(p.tags)
    }).catch(e => setError(e.message))
  }, [personaId])

  const set = (campo: keyof FormState, valor: string) => setForm(f => ({ ...f, [campo]: valor }))

  const agregarEtiqueta = (texto: string) => {
    const limpio = texto.trim()
    if (!limpio || etiquetas.some(t => t.toLowerCase() === limpio.toLowerCase())) return
    setEtiquetas(e => [...e, limpio])
    setNuevaEtiqueta('')
  }

  // En edición los contactos se guardan al toque (son sub-recurso); en alta van
  // dentro del POST de la persona.
  const agregarContacto = async () => {
    if (!nuevoContacto.value.trim()) return
    if (personaId === null) {
      setContactos(c => [...c, { ...nuevoContacto, id: -Date.now(), person_id: 0, is_primary: c.length === 0, created_at: '' }])
    } else {
      try {
        const creado = await personasApi.agregarContacto(personaId, { ...nuevoContacto, is_primary: contactos.length === 0 })
        setContactos(c => [...c, creado])
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'No se pudo agregar el contacto')
        return
      }
    }
    setNuevoContacto({ type: 'phone', value: '' })
  }

  const quitarContacto = async (contacto: Contacto) => {
    if (personaId !== null && contacto.id > 0) {
      try { await personasApi.quitarContacto(personaId, contacto.id) } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'No se pudo quitar'); return
      }
    }
    setContactos(c => c.filter(x => x.id !== contacto.id))
  }

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    setError(null)
    const datos = {
      first_name: form.first_name.trim(), last_name: form.last_name.trim(),
      document_type: form.document_type || undefined, document_number: form.document_number || undefined,
      notes: form.notes || undefined,
    }
    try {
      let guardadaId = personaId
      if (guardadaId === null) {
        const creada = await personasApi.crear({
          ...datos,
          contacts: contactos.map(c => ({ type: c.type, value: c.value, is_primary: c.is_primary })),
        })
        guardadaId = creada.id
      } else {
        await personasApi.editar(guardadaId, datos)
      }
      await personasApi.setEtiquetas(guardadaId, etiquetas)
      navigate(`/admin/personas/${guardadaId}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div>
      <div className="admin-page-header">
        <h1>{editando ? 'Editar persona' : 'Nueva persona'}</h1>
      </div>
      {error && <p className="form-error">{error}</p>}

      <form onSubmit={guardar} className="admin-card form">
        <h2 className="form-section-title">Datos</h2>
        <div className="form-row">
          <div className="form-field">
            <label htmlFor="first_name">Nombre *</label>
            <input id="first_name" required value={form.first_name} onChange={e => set('first_name', e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="last_name">Apellido *</label>
            <input id="last_name" required value={form.last_name} onChange={e => set('last_name', e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-field" style={{ maxWidth: 120 }}>
            <label htmlFor="document_type">Tipo doc.</label>
            <select id="document_type" value={form.document_type} onChange={e => set('document_type', e.target.value)}>
              <option value="">—</option>
              <option value="DNI">DNI</option>
              <option value="CUIT">CUIT</option>
              <option value="CUIL">CUIL</option>
              <option value="Pasaporte">Pasaporte</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="document_number">Número</label>
            <input id="document_number" value={form.document_number} onChange={e => set('document_number', e.target.value)} />
          </div>
        </div>
        <div className="form-field full">
          <label htmlFor="notes">Notas</label>
          <textarea id="notes" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>

        <h2 className="form-section-title">Contactos</h2>
        <ul className="contactos-lista">
          {contactos.map(c => (
            <li key={c.id}>
              <span className="contacto-tipo">{TIPOS_CONTACTO.find(t => t.valor === c.type)?.label ?? c.type}</span>
              <span>{c.value}</span>
              {c.is_primary && <span className="contacto-principal">principal</span>}
              <button type="button" className="btn btn-outline btn-chico" onClick={() => quitarContacto(c)}>Quitar</button>
            </li>
          ))}
        </ul>
        <div className="form-row contacto-nuevo">
          <select aria-label="Tipo de contacto" value={nuevoContacto.type} onChange={e => setNuevoContacto(n => ({ ...n, type: e.target.value as TipoContacto }))}>
            {TIPOS_CONTACTO.map(t => <option key={t.valor} value={t.valor}>{t.label}</option>)}
          </select>
          <input aria-label="Valor del contacto" placeholder="221 555 0000 / mail@…" value={nuevoContacto.value} onChange={e => setNuevoContacto(n => ({ ...n, value: e.target.value }))} />
          <button type="button" className="btn btn-outline" onClick={agregarContacto}>Agregar</button>
        </div>

        <h2 className="form-section-title">Etiquetas</h2>
        <div className="etiquetas-editor">
          {etiquetas.map(t => (
            <span key={t} className="etiqueta">
              {t} <button type="button" aria-label={`Quitar ${t}`} onClick={() => setEtiquetas(e => e.filter(x => x !== t))}>×</button>
            </span>
          ))}
          <input
            aria-label="Nueva etiqueta"
            list="etiquetas-sugeridas"
            placeholder="Escribí y Enter"
            value={nuevaEtiqueta}
            onChange={e => setNuevaEtiqueta(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarEtiqueta(nuevaEtiqueta) } }}
          />
          <datalist id="etiquetas-sugeridas">
            {sugeridas.map(s => <option key={s.nombre} value={s.nombre} />)}
          </datalist>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-magenta" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          <button type="button" className="btn btn-outline" onClick={() => navigate(-1)}>Cancelar</button>
        </div>
      </form>
    </div>
  )
}
