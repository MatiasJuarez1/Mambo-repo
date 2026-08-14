import { useEffect, useState, type CSSProperties } from 'react'
import { useParams, Link } from 'react-router-dom'
import { propiedadesApi } from '../../api/propiedades'
import type { Propiedad } from '../../types/propiedad'
import {
  etiquetaCierre,
  formatPrecio,
  LABEL_OPERACION,
  LABEL_TIPO,
  mediaUrl,
} from '../../lib/propiedad'
import { srcSetDeMedio } from '../../lib/imagen'
import { EMAIL_CONTACTO, linkWhatsApp } from '../../config/contacto'
import './Detalle.css'

/**
 * La `<img>` es un detalle interno de los botones de la galería: el contenedor ya
 * define tamaño, radio y recorte, y la foto solo tiene que llenarlo. Antes las
 * fotos eran `background-image`, que no admite `srcset`.
 *
 * `borderRadius: inherit` no es adorno: `.detalle-gal-thumb` redondea el botón
 * pero no tiene `overflow: hidden`, así que sin esto la foto le saldría por las
 * cuatro esquinas.
 */
const FOTO_LLENA: CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  borderRadius: 'inherit',
}

export default function Detalle() {
  const { id } = useParams()
  const [prop, setProp]       = useState<Propiedad | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [imgIdx, setImgIdx]   = useState(0)
  const [mostrarForm, setMostrarForm] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    propiedadesApi.obtener(Number(id))
      .then(p => {
        p.medios.sort((a, b) => {
          if (a.es_principal && !b.es_principal) return -1
          if (!a.es_principal && b.es_principal) return 1
          return a.orden - b.orden
        })
        setProp(p)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return <main className="detalle-page"><p className="detalle-estado">Cargando...</p></main>
  }

  if (error || !prop) {
    return (
      <main className="detalle-page">
        <p className="detalle-estado detalle-error">{error ?? 'Propiedad no encontrada.'}</p>
        <div style={{ textAlign: 'center' }}>
          <Link to="/propiedades" className="btn-primary">← Volver al listado</Link>
        </div>
      </main>
    )
  }

  const imagenes = prop.medios.filter(m => m.tipo_medio === 'imagen')
  // La que se ve grande: la elegida con las miniaturas, o la primera.
  const principal = imagenes[imgIdx] ?? imagenes[0]
  const ubicStr = [prop.ubicacion?.direccion, prop.ubicacion?.ciudad, prop.ubicacion?.provincia]
    .filter(Boolean).join(' · ')

  // Una operación cerrada ya no se puede visitar ni negociar; una reserva, en cambio,
  // se puede caer, así que ahí se avisa pero se mantienen los dos canales abiertos.
  const cierre = etiquetaCierre(prop)
  const operacionCerrada = prop.estado_comercial === 'cerrada'
  const verbo = prop.tipo_operacion === 'venta' ? 'se vendió' : 'se alquiló'

  const mensajeWsp = operacionCerrada
    ? `Hola! Vi que la propiedad "${prop.titulo}" ya ${verbo}. ¿Tienen algo similar disponible?`
    : `Hola! Me interesa la propiedad "${prop.titulo}" (${window.location.href})`

  return (
    <main className="detalle-page">
      {/* Breadcrumb */}
      <div className="detalle-breadcrumb">
        <div className="section-container">
          <Link to="/propiedades">Propiedades</Link>
          <span>›</span>
          <span>{LABEL_TIPO[prop.tipo_propiedad]}</span>
          <span>›</span>
          <span className="detalle-breadcrumb-actual">{prop.titulo}</span>
        </div>
      </div>

      {/* Galería mosaico */}
      <div className="section-container">
        {imagenes.length > 0 ? (
          <div className="detalle-galeria">
            <button
              className="detalle-gal-principal"
              onClick={() => setImgIdx(0)}
              aria-label={`Foto principal de ${prop.titulo}`}
            >
              <img
                src={mediaUrl(principal.url)}
                srcSet={srcSetDeMedio(principal)}
                /* A pantalla completa en móvil; arriba de 860 ocupa las 2/3
                   partes de la galería, que a su vez es casi todo el ancho. */
                sizes="(max-width: 860px) 100vw, 60vw"
                alt={prop.titulo}
                /* Es lo primero que se ve al abrir la ficha (el LCP de esta
                   pantalla): diferir su carga sería empeorarla a propósito. */
                loading="eager"
                /* Proporción del hueco, no medidas reales de la foto: la API no
                   expone dimensiones. El alto lo fija `.detalle-gal-principal`. */
                width={1200}
                height={800}
                style={FOTO_LLENA}
              />
              <span className="detalle-badge">{LABEL_OPERACION[prop.tipo_operacion]}</span>
              {cierre && <span className="detalle-faja">{cierre}</span>}
            </button>
            <div className="detalle-gal-thumbs">
              {imagenes.slice(1, 5).map((m, i) => {
                const esUltima = i === 3 && imagenes.length > 5
                return (
                  <button
                    key={m.id}
                    className="detalle-gal-thumb"
                    onClick={() => setImgIdx(i + 1)}
                    aria-label={`Foto ${i + 2} de ${prop.titulo}`}
                  >
                    <img
                      src={mediaUrl(m.url)}
                      srcSet={srcSetDeMedio(m)}
                      /* Cuatro en fila bajo 860; arriba son dos columnas dentro
                         del tercio derecho de la galería (~15vw cada una). */
                      sizes="(max-width: 860px) 25vw, 15vw"
                      /* El nombre accesible ya lo da el `aria-label` del botón;
                         repetirlo acá lo diría dos veces. */
                      alt=""
                      loading="lazy"
                      width={300}
                      height={200}
                      style={FOTO_LLENA}
                    />
                    {esUltima && <span className="detalle-gal-mas">+{imagenes.length - 5} fotos</span>}
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="detalle-galeria"><div className="detalle-img-empty" /></div>
        )}
      </div>

      {/* Cuerpo 2 columnas */}
      <div className="section-container detalle-layout">
        <div className="detalle-main">
          <span className="detalle-badge-inline">{LABEL_OPERACION[prop.tipo_operacion]}</span>
          <h1 className="detalle-titulo">{prop.titulo}</h1>
          {ubicStr && <p className="detalle-ubicacion">{ubicStr}</p>}

          {(prop.dormitorios != null || prop.banos != null ||
            prop.m2_cubiertos != null || prop.m2_totales != null) && (
            <div className="detalle-specs">
              {prop.dormitorios != null && (
                <div className="detalle-spec"><span className="v">{prop.dormitorios}</span><span className="k">Dormitorios</span></div>
              )}
              {prop.banos != null && (
                <div className="detalle-spec"><span className="v">{prop.banos}</span><span className="k">Baños</span></div>
              )}
              {prop.m2_cubiertos != null && (
                <div className="detalle-spec"><span className="v">{prop.m2_cubiertos}</span><span className="k">m² cubiertos</span></div>
              )}
              {prop.m2_totales != null && (
                <div className="detalle-spec"><span className="v">{prop.m2_totales}</span><span className="k">m² totales</span></div>
              )}
            </div>
          )}

          {prop.descripcion && (
            <div className="detalle-seccion">
              <h2 className="detalle-seccion-titulo">Descripción</h2>
              <p className="detalle-descripcion">{prop.descripcion}</p>
            </div>
          )}

          {prop.caracteristicas.length > 0 && (
            <div className="detalle-seccion">
              <h2 className="detalle-seccion-titulo">Características</h2>
              <div className="detalle-caract-grid">
                {prop.caracteristicas.map(c => (
                  <span key={c.id} className="detalle-caract-item">{c.clave}: {c.valor}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Aside sticky */}
        <aside className="detalle-aside">
          {cierre && (
            <p className="detalle-aviso" role="status">
              {operacionCerrada
                ? `Esta propiedad ya ${verbo}. Queda publicada como antecedente de nuestras operaciones.`
                : 'Esta propiedad está reservada. Podés consultar igual: las reservas a veces no prosperan.'}
            </p>
          )}

          <p className={operacionCerrada ? 'detalle-precio detalle-precio-cerrado' : 'detalle-precio'}>
            {formatPrecio(prop.precio, prop.moneda)}
          </p>
          <p className="detalle-precio-k">
            {operacionCerrada
              ? 'Valor de la operación'
              : `Precio de ${LABEL_OPERACION[prop.tipo_operacion].toLowerCase()}`}
          </p>

          <a className="detalle-btn-wsp" href={linkWhatsApp(mensajeWsp)} target="_blank" rel="noopener noreferrer">
            Consultar por WhatsApp
          </a>

          {/* Sin "Solicitar visita" cuando la operación ya se cerró: no hay nada que
              visitar, y ofrecerlo haría perder el tiempo al visitante y a la oficina.
              En su lugar, el camino hacia lo que sí está disponible. */}
          {operacionCerrada ? (
            <Link to="/propiedades" className="detalle-btn-visita">
              Ver propiedades disponibles
            </Link>
          ) : (
            <button className="detalle-btn-visita" onClick={() => setMostrarForm(v => !v)}>
              Solicitar visita
            </button>
          )}

          {mostrarForm && !operacionCerrada && (
            <form
              className="detalle-form"
              onSubmit={e => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                const cuerpo = `Nombre: ${fd.get('nombre')}\nTeléfono: ${fd.get('telefono')}\nMensaje: ${fd.get('mensaje')}\n\nPropiedad: ${prop.titulo} (${window.location.href})`
                window.location.href =
                  `mailto:${EMAIL_CONTACTO}?subject=${encodeURIComponent('Solicitud de visita: ' + prop.titulo)}&body=${encodeURIComponent(cuerpo)}`
              }}
            >
              <input name="nombre" placeholder="Tu nombre" required />
              <input name="telefono" placeholder="Teléfono" required />
              <textarea name="mensaje" placeholder="¿Cuándo te gustaría visitarla?" rows={3} />
              <button type="submit" className="detalle-btn-enviar">Enviar solicitud</button>
            </form>
          )}
        </aside>
      </div>
    </main>
  )
}
