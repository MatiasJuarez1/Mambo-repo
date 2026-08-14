import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { propiedadesApi } from '../../api/propiedades'
import type { PropiedadListItem } from '../../types/propiedad'
import PropiedadCard from '../../components/PropiedadCard'
import BuscadorHero from '../../components/BuscadorHero'
import DatosContacto from '../../components/DatosContacto'
import { linkWhatsApp } from '../../config/contacto'

const MENSAJE_WSP = 'Hola Mambo Groups! Vi la web y quería hacerles una consulta.'

// Loop mudo de fondo. El poster es el frame 0, así no hay salto al arrancar.
// En mobile y con "reducir movimiento" activado el CSS oculta el video y deja
// el poster: ver .hero-col-photo en index.css.
//
// El archivo viene recortado a 720x860 desde el original vertical de 720x1280:
// el object-fit: cover descartaba techo y mesa igual, y no encodearlos permite
// gastar esos bits en la franja que sí se ve.
const heroVideo  = '/hero.mp4'
const heroPoster = '/hero-poster.jpg'

const categorias = [
  { num: '01', label: 'Lotes',         desc: 'Terrenos estratégicamente ubicados en las mejores zonas de Tucumán.' },
  { num: '02', label: 'Casas',         desc: 'Residencias diseñadas para adaptarse a tu estilo de vida y presupuesto.' },
  { num: '03', label: 'Inversiones',   desc: 'Opciones de alto rendimiento para hacer crecer tu capital inmobiliario.' },
  { num: '04', label: 'Oportunidades', desc: 'Ofertas exclusivas del mercado local con condiciones únicas.' },
]

export default function Home() {
  const [destacadas, setDestacadas] = useState<PropiedadListItem[]>([])
  const [cargando, setCargando]     = useState(true)

  useEffect(() => {
    propiedadesApi
      .listar({ estado_comercial: 'disponible', limit: 3 })
      .then(setDestacadas)
      .catch(() => setDestacadas([]))
      .finally(() => setCargando(false))
  }, [])

  return (
    <>
      {/* ── Hero ── */}
      <section className="hero">
        <div className="hero-col-text">
          <span className="eyebrow">Tucumán, Argentina</span>
          <h1>
            Oportunidades<br />
            <em>inmobiliarias</em>
          </h1>
          <p className="hero-sub">
            Lotes&nbsp;·&nbsp;Casas&nbsp;·&nbsp;Inversiones
          </p>
          <Link to="/propiedades" className="btn-hero">
            Ver propiedades
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>
        <div className="hero-col-photo" style={{ backgroundImage: `url(${heroPoster})` }}>
          <video
            className="hero-video"
            src={heroVideo}
            poster={heroPoster}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-hidden="true"
            tabIndex={-1}
          />
        </div>

        <BuscadorHero />
      </section>

      {/* ── Values strip ── */}
      <div className="values">
        <p>Decisión &nbsp;·&nbsp; Orden &nbsp;·&nbsp; Claridad</p>
      </div>

      {/* ── Propiedades destacadas ── */}
      <section className="destacadas">
        <div className="section-container">
          <div className="destacadas-header">
            <div>
              <span className="section-label">Selección</span>
              <h2>Propiedades destacadas</h2>
            </div>
            <Link to="/propiedades" className="destacadas-link">Ver todas →</Link>
          </div>

          {cargando && <p className="destacadas-estado">Cargando propiedades...</p>}
          {!cargando && destacadas.length === 0 && (
            <p className="destacadas-estado">Pronto vas a ver acá nuestras propiedades destacadas.</p>
          )}
          {!cargando && destacadas.length > 0 && (
            <div className="destacadas-grid">
              {destacadas.map(p => <PropiedadCard key={p.id} propiedad={p} />)}
            </div>
          )}
        </div>
      </section>

      {/* ── Categorías ── */}
      <section className="categorias" id="propiedades">
        <div className="section-container">
          <div className="section-header">
            <h2>¿Qué estás buscando?</h2>
            <p>Encontrá la oportunidad que se adapta a tus objetivos.</p>
          </div>
          <div className="categorias-grid">
            {categorias.map((cat) => (
              <div key={cat.num} className="categoria-card">
                <span className="cat-num">{cat.num}</span>
                <h3>{cat.label}</h3>
                <p>{cat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="cta-section cta-con-datos">
        <div className="cta-inner">
          <div className="cta-mensaje">
            <h2>Asesoramiento personalizado</h2>
            <p>
              Nuestro equipo te acompaña en cada paso de tu decisión
              inmobiliaria, con claridad y sin vueltas.
            </p>
            <a
              href={linkWhatsApp(MENSAJE_WSP)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-cta"
            >
              Contactanos
            </a>
          </div>
          <DatosContacto />
        </div>
      </section>
    </>
  )
}
