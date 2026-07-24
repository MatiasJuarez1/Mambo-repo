import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { propiedadesApi } from '../../api/propiedades'
import type { PropiedadListItem } from '../../types/propiedad'
import PropiedadCard from '../../components/PropiedadCard'

const hero = '/imagen-mambo.jpg'

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
        <div className="hero-col-photo" style={{ backgroundImage: `url(${hero})` }} />

        {/* Buscador flotante (maquetado — el filtrado real llega en un paso siguiente) */}
        <div className="hero-search">
          <span className="hero-search__label">Quick Search</span>

          <label className="qs-field">
            <svg className="qs-ico" viewBox="0 0 24 24" width="20" height="20" fill="none"
                 stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                 aria-hidden="true">
              <path d="M7 7h11l-3-3M17 17H6l3 3" />
            </svg>
            <span className="qs-text">
              <span className="qs-cap">Operación</span>
              <select className="qs-select" defaultValue="" aria-label="Operación">
                <option value="">Venta/Alquiler</option>
                <option>Venta</option>
                <option>Alquiler</option>
              </select>
            </span>
          </label>

          <label className="qs-field">
            <svg className="qs-ico" viewBox="0 0 24 24" width="20" height="20" fill="none"
                 stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                 aria-hidden="true">
              <path d="M4 11l8-6 8 6M6 10v9h12v-9" />
            </svg>
            <span className="qs-text">
              <span className="qs-cap">Tipo</span>
              <select className="qs-select" defaultValue="" aria-label="Tipo">
                <option value="">Lotes/Casas/Comercial</option>
                <option>Lotes</option>
                <option>Casas</option>
                <option>Comercial</option>
              </select>
            </span>
          </label>

          <label className="qs-field">
            <svg className="qs-ico" viewBox="0 0 24 24" width="20" height="20" fill="none"
                 stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                 aria-hidden="true">
              <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" />
              <circle cx="12" cy="10" r="2.4" />
            </svg>
            <span className="qs-text">
              <span className="qs-cap">Zona</span>
              <select className="qs-select" defaultValue="" aria-label="Zona">
                <option value="">Tucumán</option>
                <option>San Miguel de Tucumán</option>
                <option>Yerba Buena</option>
                <option>Tafí Viejo</option>
              </select>
            </span>
          </label>

          <Link to="/propiedades" className="qs-buscar">Buscar</Link>
        </div>
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
      <section className="cta-section" id="contacto">
        <h2>Asesoramiento personalizado</h2>
        <p>
          Nuestro equipo te acompaña en cada paso de tu decisión
          inmobiliaria, con claridad y sin vueltas.
        </p>
        <a href="mailto:info@mambogroups.com" className="btn-white">
          Contactanos
        </a>
      </section>
    </>
  )
}
