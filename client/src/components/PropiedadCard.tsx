import { Link } from 'react-router-dom'
import type { PropiedadListItem } from '../types/propiedad'
import {
  etiquetaCierre,
  formatPrecio,
  LABEL_OPERACION,
  LABEL_TIPO,
  mediaUrl,
  medioPrincipal,
} from '../lib/propiedad'
import { srcSetDeMedio } from '../lib/imagen'
import './PropiedadCard.css'

export default function PropiedadCard({ propiedad: p }: { propiedad: PropiedadListItem }) {
  // El medio entero y no solo su URL: de ahí salen también las variantes del `srcset`.
  const foto = medioPrincipal(p)
  const loc = [p.ubicacion?.ciudad, p.ubicacion?.provincia].filter(Boolean).join(', ')
  // Si la operación ya se cerró, la ficha se sigue mostrando pero atenuada y con
  // una faja encima: sirve de antecedente, no de oferta vigente.
  const cierre = etiquetaCierre(p)

  return (
    <Link
      to={`/propiedades/${p.id}`}
      className={cierre ? 'prop-card prop-card--cerrada' : 'prop-card'}
    >
      <div className="prop-card-img">
        {foto
          ? <img
              src={mediaUrl(foto.url)}
              srcSet={srcSetDeMedio(foto)}
              /* Una columna en móvil, dos hasta 860 y tres arriba: el mismo
                 recorrido que hace la grilla del listado. */
              sizes="(max-width: 640px) 100vw, (max-width: 860px) 50vw, 33vw"
              alt={p.titulo}
              loading="lazy"
              /* No son las medidas reales de la foto (la API no las expone): son
                 la proporción 3:2 del hueco, para que el navegador reserve el
                 espacio antes de bajarla. El alto real ya lo fija `.prop-card-img`. */
              width={600}
              height={400}
            />
          : <div className="prop-card-img-empty" />
        }
        <span className="prop-card-badge">{LABEL_OPERACION[p.tipo_operacion]}</span>
        {cierre && <span className="prop-card-faja">{cierre}</span>}
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
