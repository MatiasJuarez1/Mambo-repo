import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import NavbarDrawer from './NavbarDrawer'
import NavbarDropdown from './NavbarDropdown'
import { ENTRADAS_PROPIEDADES, ENTRADAS_SERVICIOS } from './entradas'

const ID_DRAWER = 'navbar-drawer'

export default function Navbar() {
  // Sólo tiene efecto bajo 860px: arriba de ese ancho la fila de escritorio
  // está a la vista y ni la hamburguesa ni el drawer se renderizan
  // (`display: none` por CSS, no por `matchMedia`, para que no parpadee en la
  // primera pintura y no haya un ancho de ventana que sincronizar en JS).
  const [menuAbierto, setMenuAbierto] = useState(false)

  // Estable entre renders: el drawer la usa como dependencia de sus efectos.
  const cerrarMenu = useCallback(() => setMenuAbierto(false), [])

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

        {/* La hamburguesa lleva un rótulo estable —"Menú", no "Abrir/Cerrar
            menú"—: el estado ya lo comunica `aria-expanded`, y un nombre que
            cambia al apretar hace que el lector de pantalla anuncie un control
            distinto en vez del mismo control abierto. */}
        <button
          type="button"
          className="navbar-hamburguesa"
          aria-label="Menú"
          aria-expanded={menuAbierto}
          aria-controls={ID_DRAWER}
          onClick={() => setMenuAbierto(abierto => !abierto)}
        >
          <span className="navbar-hamburguesa-barra" aria-hidden="true" />
          <span className="navbar-hamburguesa-barra" aria-hidden="true" />
          <span className="navbar-hamburguesa-barra" aria-hidden="true" />
        </button>
      </div>

      <NavbarDrawer id={ID_DRAWER} abierto={menuAbierto} alCerrar={cerrarMenu} />
    </nav>
  )
}
