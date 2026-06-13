import { Link } from 'react-router-dom'

const categorias = [
  { num: '01', label: 'Lotes',         desc: 'Terrenos estratégicamente ubicados en las mejores zonas de Tucumán.' },
  { num: '02', label: 'Casas',         desc: 'Residencias diseñadas para adaptarse a tu estilo de vida y presupuesto.' },
  { num: '03', label: 'Inversiones',   desc: 'Opciones de alto rendimiento para hacer crecer tu capital inmobiliario.' },
  { num: '04', label: 'Oportunidades', desc: 'Ofertas exclusivas del mercado local con condiciones únicas.' },
]

export default function Home() {
  return (
    <>
      {/* ── Hero ── */}
      <section className="hero">
        <div className="hero-content">
          <span className="hero-eyebrow">Tucumán, Argentina</span>
          <h1>
            Oportunidades<br />
            <em>inmobiliarias</em><br />
            en Tucumán
          </h1>
          <p className="hero-sub">
            Lotes&nbsp;·&nbsp;Casas&nbsp;·&nbsp;Inversiones&nbsp;·&nbsp;Oportunidades
          </p>
          <Link to="/propiedades" className="btn-primary">
            Ver propiedades
          </Link>
        </div>
      </section>

      {/* ── Values strip ── */}
      <div className="values">
        <p>Decisión &nbsp;·&nbsp; Orden &nbsp;·&nbsp; Claridad</p>
      </div>

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
