import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { publicacionesApi } from '../../../api/publicaciones'
import SelectorPropiedad from '../../../components/crm/SelectorPropiedad/SelectorPropiedad'
import type { PropiedadElegida } from '../../../components/crm/SelectorPropiedad/SelectorPropiedad'
import type { EstadoPublicacion } from '../../../types/publicacion'

export default function PublicacionFormulario() {
  const navigate = useNavigate()
  const { id } = useParams()
  const editando = Boolean(id)

  const [propiedad, setPropiedad]     = useState<PropiedadElegida | null>(null)
  const [titulo, setTitulo]           = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [estado, setEstado]           = useState<EstadoPublicacion>('activa')
  const [precio, setPrecio]           = useState('')
  const [moneda, setMoneda]           = useState('ARS')
  const [slug, setSlug]               = useState('')
  const [guardando, setGuardando]     = useState(false)
  // Arranca en `true` cuando hay `id`: hasta que resuelva `obtener`, los campos
  // están vacíos y guardar mandaría `null` explícito sobre datos reales (este
  // formulario lo manda a propósito en edición, ver comentario en `guardar`).
  const [cargando, setCargando]       = useState(editando)
  const [error, setError]             = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    publicacionesApi.obtener(Number(id))
      .then(p => {
        setTitulo(p.titulo)
        setDescripcion(p.descripcion ?? '')
        // Una publicación borrada no se edita (el backend la esconde con 404), así
        // que el select solo maneja los dos estados vivos.
        setEstado(p.estado === 'eliminada' ? 'pausada' : p.estado)
        setPrecio(p.precio_publicado === null ? '' : String(p.precio_publicado))
        setMoneda(p.moneda_publicada)
        setSlug(p.slug ?? '')
        setPropiedad(p.propiedad ? { id: p.propiedad.id, titulo: p.propiedad.titulo } : null)
        setCargando(false)
      })
      // Si falla la carga no hay datos válidos para editar: `cargando` queda en
      // `true` a propósito, así el botón sigue deshabilitado en vez de habilitar
      // un guardado que borraría todo.
      .catch(e => setError(e.message))
  }, [id])

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (cargando) return
    if (!editando && !propiedad) {
      setError('Elegí la propiedad que se va a publicar')
      return
    }

    setGuardando(true)
    setError(null)
    try {
      // Edición y alta arman el payload distinto para los campos opcionales
      // (descripción, slug, precio) porque `undefined` desaparece al serializar el
      // body: el backend recibe la clave ausente y no puede distinguir "no lo toques"
      // de "vacialo". En alta eso es lo que queremos (que aplique sus defaults), pero
      // en edición vaciar un campo que ya tenía valor necesita un `null` explícito.
      if (editando) {
        await publicacionesApi.actualizar(Number(id), {
          titulo,
          descripcion: descripcion || null,
          estado,
          precio_publicado: precio ? Number(precio) : null,
          moneda_publicada: moneda,
          slug: slug || null,
        })
      } else if (propiedad) {
        await publicacionesApi.crear({
          propiedad_id: propiedad.id,
          titulo,
          descripcion: descripcion || undefined,
          estado,
          precio_publicado: precio ? Number(precio) : undefined,
          moneda_publicada: moneda,
          slug: slug || undefined,
        })
      }
      navigate('/admin/publicaciones')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <span className="section-label">Inventario</span>
          <h1>{editando ? 'Editar publicación' : 'Nueva publicación'}</h1>
        </div>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      <form onSubmit={guardar} className="admin-card form">
        <div className="form-field full">
          {/* En edición va bloqueada: mover una publicación de propiedad no tiene
              caso de uso y `PublicacionUpdate` ni siquiera acepta `propiedad_id`. */}
          <SelectorPropiedad valor={propiedad} onChange={setPropiedad} bloqueada={editando} />
        </div>

        <div className="form-field full">
          <label htmlFor="titulo">Título</label>
          <input id="titulo" required value={titulo} onChange={e => setTitulo(e.target.value)} />
        </div>

        <div className="form-field full">
          <label htmlFor="descripcion">Descripción</label>
          <textarea
            id="descripcion"
            rows={6}
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
          />
        </div>

        <div className="form-row">
          <div className="form-field" style={{ maxWidth: 140 }}>
            <label htmlFor="estado">Estado</label>
            <select
              id="estado"
              value={estado}
              onChange={e => setEstado(e.target.value as EstadoPublicacion)}
            >
              <option value="activa">Activa</option>
              <option value="pausada">Pausada</option>
            </select>
          </div>
          <div className="form-field" style={{ maxWidth: 100 }}>
            <label htmlFor="moneda">Moneda</label>
            <select id="moneda" value={moneda} onChange={e => setMoneda(e.target.value)}>
              <option>ARS</option>
              <option>USD</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="precio">Precio publicado</label>
            <input
              id="precio"
              type="number"
              min={0}
              value={precio}
              onChange={e => setPrecio(e.target.value)}
            />
          </div>
        </div>

        <div className="form-field full">
          <label htmlFor="slug">Slug</label>
          <input id="slug" value={slug} onChange={e => setSlug(e.target.value)} />
          <p className="form-hint">
            Opcional: identificador único del aviso. Todavía no se usa en ninguna URL del sitio
            público, es para cuando esa pantalla exista.
          </p>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={() => navigate(-1)}>Cancelar</button>
          <button type="submit" className="btn btn-magenta" disabled={guardando || cargando}>
            {guardando
              ? 'Guardando...'
              : cargando
                ? 'Cargando...'
                : editando
                  ? 'Guardar cambios'
                  : 'Crear publicación'}
          </button>
        </div>
      </form>
    </div>
  )
}
