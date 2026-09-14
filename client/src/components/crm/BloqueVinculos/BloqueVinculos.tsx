import type { ReactNode } from 'react'
import './BloqueVinculos.css'

interface Props {
  titulo: string
  vacio: string
  children: ReactNode
}

/**
 * Bloque de la ficha de persona. Un bloque vacío dice "Sin …" en vez de
 * desaparecer, para que la ficha tenga siempre la misma forma.
 */
export default function BloqueVinculos({ titulo, vacio, children }: Props) {
  const hayContenido = Array.isArray(children) ? children.length > 0 : children != null
  return (
    <section className="admin-card bloque-vinculos">
      <h2 className="bloque-vinculos-titulo">{titulo}</h2>
      {hayContenido ? <ul className="bloque-vinculos-lista">{children}</ul> : <p className="bloque-vinculos-vacio">{vacio}</p>}
    </section>
  )
}
