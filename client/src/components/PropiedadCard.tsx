import { Link } from 'react-router-dom'
import type { PropiedadListItem } from '../types/propiedad'
import { formatPrecio, imagenPrincipal, LABEL_OPERACION, LABEL_TIPO } from '../lib/propiedad'
import './PropiedadCard.css'

export default function PropiedadCard({ propiedad: p }: { propiedad: PropiedadListItem }) {
  const img = imagenPrincipal(p)
  const loc = [p.ubicacion?.ciudad, p.ubicacion?.provincia].filter(Boolean).join(', ')

  return (
    <Link to={`/propiedades/${p.id}`} className="prop-card">
      <div className="prop-card-img">
        {img
          ? <img src={img} alt={p.titulo} loading="lazy" />
          : <div className="prop-card-img-empty" />
        }
        <span className="prop-card-badge">{LABEL_OPERACION[p.tipo_operacion]}</span>
      </div>

      <div className="prop-card-body">
        <p className="prop-card-tipo">{LABEL_TIPO[p.tipo_propiedad]}</p>
        <h3 className="prop-card-titulo">{p.titulo}</h3>
        {loc && <p className="prop-card-loc">{loc}</p>}

        <div className="prop-card-stats">
          {p.dormitorios != null && <span>{p.dormitorios} dorm.</span>}
          {p.banos != null && <span>{p.banos} baño{p.banos !== 1 ? 's' : ''}</span>}
          {p.m2_cubiertos != null && <span>{p.m2_cubiertos} m²</span>}
          {p.m2_totales != null && p.m2_cubiertos == null && <span>{p.m2_totales} m² tot.</span>}
        </div>

        <p className="prop-card-precio">{formatPrecio(p.precio, p.moneda)}</p>
      </div>
    </Link>
  )
}
