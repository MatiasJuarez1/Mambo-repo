import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import './AdminLayout.css'

const navItems = [
  { to: '/admin',               label: 'Dashboard',      exact: true },
  { to: '/admin/propiedades',   label: 'Propiedades'                 },
  { to: '/admin/publicaciones', label: 'Publicaciones'               },
]

export default function AdminLayout() {
  const navigate = useNavigate()

  return (
    <div className="admin-shell">
      {/* Sidebar */}
      <aside className="admin-sidebar">
        <div className="admin-sidebar-logo" onClick={() => navigate('/admin')}>
          <span className="logo-mambo">Mambo</span>
          <span className="logo-groups">Groups</span>
        </div>

        <nav className="admin-nav">
          {navItems.map(({ to, label, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                `admin-nav-item${isActive ? ' active' : ''}`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <NavLink to="/" className="admin-nav-item">
            ← Ver sitio
          </NavLink>
        </div>
      </aside>

      {/* Contenido */}
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  )
}
