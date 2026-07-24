import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

// Tipos de propiedad ofrecidos en cada desplegable de operación.
// El `tipo` viaja como query param a /propiedades, donde el Listado filtra.
const TIPOS_MENU = [
  { tipo: 'casa',    label: 'Casas' },
  { tipo: 'depto',   label: 'Departamentos' },
  { tipo: 'terreno', label: 'Lotes y terrenos' },
  { tipo: 'local',   label: 'Locales comerciales' },
  { tipo: 'oficina', label: 'Oficinas' },
] as const

function OperacionDropdown({ operacion, titulo }: { operacion: string; titulo: string }) {
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
          {TIPOS_MENU.map(({ tipo, label }) => (
            <li key={tipo}>
              <Link
                to={`/propiedades?tipo_operacion=${operacion}&tipo_propiedad=${tipo}`}
                onClick={() => setAbierto(false)}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

export default function Navbar() {
  // TODO: reemplazar por verificación de rol cuando esté implementado el auth
  const esAdmin = true

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <div className="navbar-left">
          <Link to="/" className="navbar-logo">
            <img
              src="/logo-mambo-horizontal.png"
              alt="Mambo Group — Soluciones Inmobiliarias"
              className="navbar-logo-img"
            />
          </Link>
          <Link to="/nosotros" className="navbar-quienes">Quiénes somos</Link>
        </div>

        <ul className="navbar-links">
          <OperacionDropdown operacion="venta" titulo="Venta" />
          <OperacionDropdown operacion="alquiler" titulo="Alquiler" />
          <li>
            <a href="#contacto">Contacto</a>
          </li>
          {/* Visible siempre por ahora — condicionado al rol cuando haya auth */}
          {esAdmin && (
            <li>
              <Link to="/admin" className="navbar-admin-btn">
                Administración
              </Link>
            </li>
          )}
          <li>
            <Link to="/admin" className="navbar-account" aria-label="Cuenta">
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
