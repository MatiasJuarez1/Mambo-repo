import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Lleva la vista al principio cada vez que se cambia de página.
 *
 * En una SPA el navegador no reinicia el scroll al navegar: React Router cambia el
 * contenido pero la posición se mantiene, así que entrar a una propiedad desde la
 * mitad del listado dejaba la ficha empezada por el medio, con la foto arriba fuera
 * de pantalla.
 *
 * Depende solo de `pathname`, no de `search`: cambiar un filtro del listado
 * (`?ciudad=...`) tiene que dejar al visitante donde estaba mirando, no devolverlo
 * al encabezado en cada selección.
 */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    // Un enlace con ancla (#contacto) ya pide una posición concreta; forzar el
    // inicio la anularía.
    if (hash) return
    window.scrollTo(0, 0)
  }, [pathname, hash])

  return null
}
