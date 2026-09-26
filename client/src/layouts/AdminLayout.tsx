import { useEffect, useRef, useState } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { veCrm } from '../lib/beta'
import './AdminLayout.css'

const grupos: { titulo: string; beta?: true; items: { to: string; label: string; end?: boolean }[] }[] = [
  {
    titulo: 'Inventario',
    items: [
      { to: '/admin/propiedades',   label: 'Propiedades' },
      { to: '/admin/publicaciones', label: 'Publicaciones' },
    ],
  },
  {
    titulo: 'CRM',
    beta: true,
    items: [
      { to: '/admin/personas',    label: 'Personas' },
      { to: '/admin/reservas',    label: 'Reservas' },
      { to: '/admin/operaciones', label: 'Operaciones' },
      { to: '/admin/actividades', label: 'Actividades' },
      // `/recordatorios` y `/cobros` van antes que `/alquileres` porque el título de
      // la topbar sale del primer enlace cuyo `to` es prefijo de la ruta actual.
      { to: '/admin/alquileres/recordatorios', label: 'Recordatorios', end: false },
      { to: '/admin/alquileres/cobros', label: 'Cobros', end: false },
      { to: '/admin/alquileres/liquidaciones', label: 'Liquidaciones', end: false },
      { to: '/admin/alquileres',  label: 'Contratos', end: true },
    ],
  },
  {
    titulo: 'Análisis',
    beta: true,
    items: [{ to: '/admin/reportes', label: 'Reportes' }],
  },
]

// Los enlaces del sidebar son también la fuente del título de la topbar: si
// mañana se suma una sección, el rótulo móvil sale solo y no hay una segunda
// tabla que actualizar (y olvidar).
const ENLACES = grupos.flatMap(g => g.items)

function tituloDeSeccion(pathname: string) {
  return ENLACES.find(({ to }) => pathname.startsWith(to))?.label ?? 'Dashboard'
}

export default function AdminLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { usuario, logout } = useAuth()
  const crm = veCrm(usuario)

  // Sólo tiene efecto bajo 860px: arriba de ese ancho el sidebar está siempre a
  // la vista y la hamburguesa no se renderiza (`display: none` por CSS, no por
  // `matchMedia`, para que no parpadee en la primera pintura).
  const [menuAbierto, setMenuAbierto] = useState(false)
  const navRef = useRef<HTMLElement>(null)

  // Cierra al navegar. Sin esto el drawer queda abierto tapando la pantalla a la
  // que el usuario acaba de entrar.
  useEffect(() => {
    setMenuAbierto(false)
  }, [pathname])

  useEffect(() => {
    if (!menuAbierto) return

    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setMenuAbierto(false)
    }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [menuAbierto])

  // Bloquea el scroll de atrás mientras el drawer está abierto. El valor previo
  // se guarda y se restaura en el cleanup —no se pisa con `''`— para que el
  // body no quede bloqueado si el layout se desmonta con el menú abierto (por
  // ejemplo, si vence la sesión y `RutaProtegida` manda al login).
  useEffect(() => {
    if (!menuAbierto) return

    const overflowPrevio = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflowPrevio
    }
  }, [menuAbierto])

  // Al abrir, el foco entra al drawer: quien navega con teclado o lector de
  // pantalla no tiene que recorrer el resto de la página para llegar al menú.
  useEffect(() => {
    if (!menuAbierto) return
    navRef.current?.querySelector('a')?.focus()
  }, [menuAbierto])

  return (
    <div className="admin-shell">
      {/* La topbar existe sólo bajo 860px; en escritorio sería una franja vacía
          robándole alto al contenido. */}
      <header className="admin-topbar">
        <button
          type="button"
          className="admin-hamburguesa"
          aria-label="Menú"
          aria-expanded={menuAbierto}
          aria-controls="admin-sidebar"
          onClick={() => setMenuAbierto(abierto => !abierto)}
        >
          <span className="admin-hamburguesa-barra" aria-hidden="true" />
          <span className="admin-hamburguesa-barra" aria-hidden="true" />
          <span className="admin-hamburguesa-barra" aria-hidden="true" />
        </button>
        <span className="admin-topbar-titulo">{tituloDeSeccion(pathname)}</span>
      </header>

      {/* El overlay se monta sólo con el menú abierto: no hay nada que interceptar
          clics cuando está cerrado, ni en móvil ni en escritorio. */}
      {menuAbierto && (
        <div
          className="admin-overlay"
          data-testid="admin-overlay"
          aria-hidden="true"
          onClick={() => setMenuAbierto(false)}
        />
      )}

      <aside
        id="admin-sidebar"
        className={`admin-sidebar${menuAbierto ? ' abierto' : ''}`}
        aria-label="Navegación del panel"
      >
        <div className="admin-sidebar-logo" onClick={() => navigate('/admin')}>
          <span className="logo-mambo">Mambo</span>
          <span className="logo-groups">Group · Admin</span>
        </div>

        <nav className="admin-nav" ref={navRef}>
          <NavLink to="/admin" end className={({ isActive }) => `admin-nav-item${isActive ? ' active' : ''}`}>
            Dashboard
          </NavLink>

          {grupos.filter(g => !g.beta || crm).map(g => (
            <div key={g.titulo}>
              <p className="admin-nav-group">{g.titulo}</p>
              {g.items.map(({ to, label, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) => `admin-nav-item${isActive ? ' active' : ''}`}
                >
                  {label}
                </NavLink>
              ))}
            </div>
          ))}

          {crm && usuario?.roles.includes('admin') && (
            <div>
              <p className="admin-nav-group">Ajustes</p>
              <NavLink to="/admin/configuracion" className={({ isActive }) => `admin-nav-item${isActive ? ' active' : ''}`}>
                Configuración
              </NavLink>
            </div>
          )}
        </nav>

        <div className="admin-sidebar-footer">
          {/* Al cerrar sesión el contexto se queda sin usuario y `RutaProtegida`
              —que envuelve a todo el panel— manda al login sola. */}
          {usuario && (
            <div className="admin-sesion">
              <span className="admin-sesion-email" title={usuario.email}>{usuario.email}</span>
              <button type="button" className="admin-sesion-salir" onClick={() => logout()}>
                Salir
              </button>
            </div>
          )}

          <NavLink to="/" className="admin-nav-item">← Ver sitio</NavLink>
        </div>
      </aside>

      {/* El div interno es el que topea el ancho de lectura (ver
          `.admin-main-inner`): el fondo hueso tiene que seguir llegando hasta
          el borde de la ventana, así que el tope no puede ir en el `main`. */}
      <main className="admin-main">
        <div className="admin-main-inner">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
