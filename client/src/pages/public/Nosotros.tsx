import { Link } from 'react-router-dom'
import { EMAIL_CONTACTO } from '../../config/contacto'
import './Nosotros.css'

const foto = '/imagen-mambo1.jpg'

// TODO: reemplazar por los valores reales del grupo.
const valores = [
  {
    num: '01',
    titulo: 'Claridad',
    desc: 'Cada operación se explica sin letra chica: condiciones, plazos y costos sobre la mesa.',
  },
  {
    num: '02',
    titulo: 'Orden',
    desc: 'Documentación, seguimiento y tiempos gestionados con método de principio a fin.',
  },
  {
    num: '03',
    titulo: 'Decisión',
    desc: 'Información concreta del mercado local para que elijas con criterio, no por impulso.',
  },
]

// TODO: cargar el equipo real (nombre, rol y foto) cuando esté definido.
const equipo = [
  { nombre: 'Nombre Apellido', rol: 'Dirección' },
  { nombre: 'Nombre Apellido', rol: 'Comercial' },
  { nombre: 'Nombre Apellido', rol: 'Administración' },
]

// TODO: reemplazar por las cifras reales del grupo.
const cifras = [
  { valor: '+10', label: 'Años en el mercado tucumano' },
  { valor: '+200', label: 'Operaciones concretadas' },
  { valor: '100%', label: 'Acompañamiento personalizado' },
]

export default function Nosotros() {
  return (
    <div className="nosotros-page">
      {/* ── Hero ── */}
      <section className="nosotros-hero">
        <div className="section-container">
          <p className="nosotros-eyebrow">Mambo Groups</p>
          <h1 className="nosotros-title">
            Quiénes<br />
            <em>somos</em>
          </h1>
          <p className="nosotros-lead">
            Un grupo inmobiliario de Tucumán enfocado en lotes, casas e inversiones,
            con un modo de trabajo simple: claridad, orden y decisiones bien informadas.
          </p>
        </div>
      </section>

      {/* ── Historia ── */}
      <section className="nosotros-historia">
        <div className="section-container nosotros-historia-grid">
          <div className="nosotros-historia-texto">
            <span className="section-label">El grupo</span>
            <h2>Una forma distinta de acompañar</h2>
            {/* TODO: reemplazar por la historia real del grupo. */}
            <p>
              Mambo Groups nació para ordenar una industria que muchas veces se mueve
              a media palabra. Trabajamos con propiedades del mercado local, revisadas
              una por una, y acompañamos a cada cliente durante todo el proceso.
            </p>
            <p>
              Conocemos las zonas, los valores reales y las oportunidades que todavía
              no se publicaron. Eso nos permite recomendar en función de tu objetivo
              —vivir o invertir— y no de lo que haya disponible ese día.
            </p>
          </div>

          <div
            className="nosotros-historia-foto"
            style={{ backgroundImage: `url(${foto})` }}
            role="img"
            aria-label="Equipo de Mambo Groups"
          />
        </div>
      </section>

      {/* ── Cifras ── */}
      <section className="nosotros-cifras">
        <div className="section-container nosotros-cifras-grid">
          {cifras.map(c => (
            <div key={c.label} className="nosotros-cifra">
              <span className="nosotros-cifra-valor">{c.valor}</span>
              <span className="nosotros-cifra-label">{c.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Valores ── */}
      <section className="nosotros-valores">
        <div className="section-container">
          <div className="section-header">
            <h2>Cómo trabajamos</h2>
            <p>Tres principios que ordenan cada operación que tomamos.</p>
          </div>

          <div className="nosotros-valores-grid">
            {valores.map(v => (
              <div key={v.num} className="nosotros-valor-card">
                <span className="cat-num">{v.num}</span>
                <h3>{v.titulo}</h3>
                <p>{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Equipo ── */}
      <section className="nosotros-equipo">
        <div className="section-container">
          <div className="section-header">
            <h2>El equipo</h2>
            <p>Las personas detrás de cada operación.</p>
          </div>

          <div className="nosotros-equipo-grid">
            {equipo.map((p, i) => (
              <div key={i} className="nosotros-persona">
                <div className="nosotros-persona-foto" aria-hidden="true" />
                <h3>{p.nombre}</h3>
                <p>{p.rol}</p>
              </div>
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
