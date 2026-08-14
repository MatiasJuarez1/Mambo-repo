import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import DatosContacto from '../../components/DatosContacto'
import { linkWhatsApp } from '../../config/contacto'
import { SERVICIOS, SERVICIOS_INTRO } from './catalogo-servicios'
import './Servicios.css'

// Sin nombrar un servicio puntual: el CTA está al pie, después de los cinco
// bloques, y a esa altura no hay forma honesta de saber cuál le interesó.
// Alcanza con que el mensaje diga de dónde salió el contacto.
const MENSAJE_WSP =
  'Hola Mambo Groups! Vi la página de servicios y quería hacerles una consulta.'

// Títulos abreviados para el índice lateral. Los del dato son largos ("Administración
// y Gestión de Urbanizaciones") y en una columna angosta se parten en tres líneas,
// que es justo lo que el índice tiene que evitar: las cinco entradas de un vistazo.
// El orden y las anclas siguen siendo los del dato.
const TITULO_INDICE: Record<string, string> = {
  'activos-inmobiliarios': 'Activos inmobiliarios',
  'administracion-alquileres': 'Alquileres y propiedades',
  'puesta-en-valor': 'Puesta en valor',
  urbanizaciones: 'Urbanizaciones',
  'asesoria-financiera': 'Asesoría financiera',
}

export default function Servicios() {
  const { hash } = useLocation()
  const [activo, setActivo] = useState<string>(SERVICIOS[0].slug)

  // ── Servicio visible: marca la entrada del índice ──
  useEffect(() => {
    // jsdom (tests) no implementa IntersectionObserver: sin el chequeo, montar rompe.
    if (typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      entradas => {
        const visibles = entradas.filter(e => e.isIntersecting)
        if (visibles.length === 0) return
        // Scrolleando lento hay dos bloques en pantalla a la vez: gana el de más arriba.
        const primera = visibles.reduce((a, b) =>
          a.boundingClientRect.top <= b.boundingClientRect.top ? a : b,
        )
        setActivo(primera.target.id)
      },
      // La banda de detección arranca debajo de la navbar fija y termina a media
      // pantalla: así el bloque se marca cuando su encabezado entra, no su pie.
      { rootMargin: '-96px 0px -55% 0px', threshold: 0 },
    )

    SERVICIOS.forEach(s => {
      const el = document.getElementById(s.slug)
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [])

  // ── Ancla de entrada (/servicios#puesta-en-valor) ──
  // React Router no scrollea al hash por su cuenta; lo resolvemos a mano.
  useEffect(() => {
    if (!hash) return
    const el = document.getElementById(decodeURIComponent(hash.slice(1)))
    // El hash puede ser inválido, y jsdom no implementa scrollIntoView.
    if (!el || typeof el.scrollIntoView !== 'function') return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash])

  return (
    <div className="servicios-page">
      {/* ── Hero ── */}
      <section className="servicios-hero">
        <div className="section-container">
          <p className="servicios-eyebrow">Servicios</p>
          <h1 className="servicios-title">
            Más que vender propiedades,<br />
            <em>administramos patrimonio</em>
          </h1>
          <p className="servicios-lead">{SERVICIOS_INTRO}</p>
        </div>
      </section>

      {/* ── Cuerpo: índice pegajoso + bloques ── */}
      <div className="servicios-cuerpo">
        <div className="section-container servicios-grid">
          <nav className="servicios-indice" aria-label="Índice de servicios">
            <ul className="servicios-indice-lista">
              {SERVICIOS.map(s => (
                <li key={s.slug}>
                  <a
                    href={`#${s.slug}`}
                    className={
                      s.slug === activo
                        ? 'servicios-indice-item is-activo'
                        : 'servicios-indice-item'
                    }
                    aria-current={s.slug === activo ? 'true' : undefined}
                  >
                    <span className="servicios-indice-num">{s.num}</span>
                    <span className="servicios-indice-titulo">
                      {TITULO_INDICE[s.slug] ?? s.titulo}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="servicios-bloques">
            {SERVICIOS.map(s => (
              <section
                key={s.slug}
                id={s.slug}
                className="servicio"
                aria-labelledby={`titulo-${s.slug}`}
              >
                <p className="servicio-num">{s.num}</p>
                <h2 id={`titulo-${s.slug}`} className="servicio-titulo">
                  {s.titulo}
                </h2>
                <p className="servicio-bajada">{s.bajada}</p>
                <ul className="servicio-items">
                  {s.items.map(item => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </div>

      {/* ── CTA ── */}
      <section className="cta-section cta-con-datos servicios-cta">
        <div className="cta-inner">
          <div className="cta-mensaje">
            <h2>Construimos oportunidades.</h2>
            <p>
              Propiedades, inversiones y asesoramiento inmobiliario con una
              atención personalizada de principio a fin.
            </p>
            <a
              href={linkWhatsApp(MENSAJE_WSP)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-cta"
            >
              Conversemos
            </a>
          </div>
          <DatosContacto />
        </div>
      </section>
    </div>
  )
}
