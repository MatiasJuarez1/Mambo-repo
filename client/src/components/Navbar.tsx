import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { OPCIONES_TIPO } from '../lib/propiedad'
import { SERVICIOS } from '../pages/public/catalogo-servicios'

/** Una entrada de un desplegable de la navbar. */
interface EntradaMenu {
  label: string
  to: string
}

/**
 * Desplegable genérico de la navbar: un botón con caret que abre una lista de
 * enlaces. Lo usan tanto "Propiedades" como "Servicios"; el contenido del menú
 * es lo único que cambia entre ellos.
 */
function NavbarDropdown({ titulo, entradas }: { titulo: string; entradas: EntradaMenu[] }) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLLIElement>(null)

  // Cerrar al hacer clic fuera del desplegable.
  useEffect(() => {
    if (!abierto) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [abierto])

  return (
    <li className="navbar-dropdown" ref={ref}>
      <button
        type="button"
        className="navbar-dropdown-toggle"
        aria-expanded={abierto}
        aria-haspopup="true"
        onClick={() => setAbierto(v => !v)}
      >
        {titulo}
        <svg
          className={`navbar-caret${abierto ? ' is-open' : ''}`}
          viewBox="0 0 24 24" width="14" height="14" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          strokeLinejoin="round" aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {abierto && (
        <ul className="navbar-dropdown-menu">
          {entradas.map(({ label, to }) => (
            <li key={to}>
              <Link to={to} onClick={() => setAbierto(false)}>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

// Menú de propiedades: solo filtra por tipo. La operación (venta / alquiler /
// temporal) no es una decisión de navegación — la resuelven la barra del hero y
// los filtros del listado.
const ENTRADAS_PROPIEDADES: EntradaMenu[] = OPCIONES_TIPO.map(({ valor, label }) => ({
  label,
  to: `/propiedades?tipo_propiedad=${valor}`,
}))

// Menú de servicios: cada entrada baja al ancla de su bloque en /servicios.
const ENTRADAS_SERVICIOS: EntradaMenu[] = SERVICIOS.map(({ slug, titulo }) => ({
  label: titulo,
  to: `/servicios#${slug}`,
}))

export default function Navbar() {
  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <div className="navbar-left">
          {/* El onClick cubre el caso que `ScrollToTop` no puede: si ya estás en el
              home, la ruta no cambia y sin esto el logo no haría nada. */}
          <Link to="/" className="navbar-logo" onClick={() => window.scrollTo(0, 0)}>
            <img
              src="/logo-mambo-horizontal.png"
              alt="Mambo Group — Soluciones Inmobiliarias"
              className="navbar-logo-img"
            />
          </Link>
          <Link to="/nosotros" className="navbar-quienes">Quiénes somos</Link>
        </div>

        <ul className="navbar-links">
          <NavbarDropdown titulo="Propiedades" entradas={ENTRADAS_PROPIEDADES} />
          <NavbarDropdown titulo="Servicios" entradas={ENTRADAS_SERVICIOS} />
          <li>
            <a href="#contacto" className="navbar-contacto-btn">Contacto</a>
          </li>
          {/* El acceso al panel es solo este icono, sin botón rotulado: el visitante
              no tiene por qué ver señalizada la puerta de administración. Quien
              corresponda entra igual, y `RutaProtegida` decide si pasa o va al login. */}
          <li>
            <Link to="/admin" className="navbar-account" aria-label="Acceso al panel">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none"
                   stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
                   strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="8" r="3.4" />
                <path d="M5 19.5a7 7 0 0 1 14 0" />
                <circle cx="12" cy="12" r="10.2" stroke="currentColor" strokeWidth="1.1" opacity="0.5" />
              </svg>
            </Link>
          </li>
        </ul>
      </div>
    </nav>
  )
}
