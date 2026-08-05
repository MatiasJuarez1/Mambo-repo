import type { Persona } from '../pages/public/equipo'
import { altDe, fotoDe } from '../pages/public/equipo'
import './PersonaCard.css'

export default function PersonaCard({ persona: p }: { persona: Persona }) {
  return (
    <article className="persona-card">
      <div className="persona-card-foto">
        <img src={fotoDe(p)} alt={altDe(p)} width={560} height={560} loading="lazy" />
      </div>

      <div className="persona-card-body">
        <h3 className="persona-card-nombre">{p.nombre}</h3>
        <p className="persona-card-rol">{p.rol}</p>
        <p className="persona-card-cita">{p.cita}</p>
        {p.bio.map((parrafo, i) => (
          <p key={i} className="persona-card-bio">{parrafo}</p>
        ))}
      </div>
    </article>
  )
}
