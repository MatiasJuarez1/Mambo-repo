import { Link } from 'react-router-dom'
import PersonaCard from '../../components/PersonaCard'
import { EMAIL_CONTACTO } from '../../config/contacto'
import { altDe, EQUIPO, FUNDADORA, fotoDe } from './equipo'
import './Nosotros.css'

export default function Nosotros() {
  return (
    <div className="nosotros-page">
      {/* ── Hero ── */}
      <section className="nosotros-hero">
        <div className="section-container">
          <p className="nosotros-eyebrow">Mambo Group</p>
          <h1 className="nosotros-title">
            Quiénes<br />
            <em>somos</em>
          </h1>
          <p className="nosotros-lead">
            Un grupo inmobiliario de Tucumán que trabaja con una convicción simple:
            detrás de cada propiedad hay una familia, un proyecto de vida y una decisión
            que merece ser acompañada.
          </p>
        </div>
      </section>

      {/* ── Historia ── */}
      <section className="nosotros-historia">
        <div className="section-container nosotros-historia-grid">
          <div className="nosotros-historia-texto">
            <span className="section-label">El grupo</span>
            <h2>Una forma distinta de acompañar</h2>
            <p>
              Mambo Group nació de una decisión: llevar más de veinte años de experiencia
              liderando empresas y equipos de trabajo al mercado inmobiliario, y hacerlo de
              otra manera. Más humana, más cercana, más comprometida con las personas.
            </p>
            <p>
              Esa forma de trabajar se sostiene sobre tres cosas que no negociamos:
              transparencia en cada operación, capacitación permanente del equipo y un
              acompañamiento genuino antes, durante y después de cada negocio.
            </p>
          </div>

          <div
            className="nosotros-historia-foto"
            style={{ backgroundImage: 'url(/imagen-mambo1.jpg)' }}
            role="img"
            aria-label="Equipo de Mambo Group"
          />
        </div>
      </section>

      {/* ── Equipo ── */}
      <section className="nosotros-equipo">
        <div className="section-container">
          <div className="section-header">
            <h2>El equipo</h2>
            <p>Las personas detrás de cada operación.</p>
          </div>

          {/* Fundadora: fila propia. Su bio es el doble de larga que las demás. */}
          <article className="nosotros-fundadora">
            <div className="nosotros-fundadora-foto">
              <img
                src={fotoDe(FUNDADORA)}
                alt={altDe(FUNDADORA)}
                width={800}
                height={1067}
              />
            </div>

            <div className="nosotros-fundadora-texto">
              <h3>{FUNDADORA.nombre}</h3>
              <p className="nosotros-fundadora-rol">{FUNDADORA.rol}</p>
              <blockquote className="nosotros-fundadora-cita">{FUNDADORA.cita}</blockquote>
              {FUNDADORA.bio.map((parrafo, i) => (
                <p key={i} className="nosotros-fundadora-bio">{parrafo}</p>
              ))}
            </div>
          </article>
        </div>
      </section>

      {/* ── Grid del equipo ── */}
      <section className="nosotros-equipo-grid-section">
        <div className="section-container">
          <div className="nosotros-equipo-grid">
            {EQUIPO.map(p => (
              <PersonaCard key={p.slug} persona={p} />
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="cta-section" id="contacto">
        <h2>Hablemos de tu próximo paso</h2>
        <p>
          Contanos qué estás buscando y te armamos una selección de propiedades
          que se ajuste a tu objetivo.
        </p>
        <div className="nosotros-cta-acciones">
          <a href={`mailto:${EMAIL_CONTACTO}`} className="btn-white">Contactanos</a>
          <Link to="/propiedades" className="btn-hero">Ver propiedades</Link>
        </div>
      </section>
    </div>
  )
}
