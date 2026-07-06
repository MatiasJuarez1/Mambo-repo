import { Link, NavLink } from 'react-router-dom'

export default function Navbar() {
  // TODO: reemplazar por verificación de rol cuando esté implementado el auth
  const esAdmin = true

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-logo">
          <span className="logo-mambo">Mambo</span>
          <span className="logo-groups">Groups</span>
        </Link>

        <ul className="navbar-links">
          <li>
            <NavLink to="/propiedades">Propiedades</NavLink>
          </li>
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
        </ul>
      </div>
    </nav>
  )
}
