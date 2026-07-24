import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import './AdminLayout.css'

const grupos = [
  {
    titulo: 'Inventario',
    items: [
      { to: '/admin/propiedades',   label: 'Propiedades' },
      { to: '/admin/publicaciones', label: 'Publicaciones' },
    ],
  },
]

export default function AdminLayout() {
  const navigate = useNavigate()

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-logo" onClick={() => navigate('/admin')}>
          <span className="logo-mambo">Mambo</span>
          <span className="logo-groups">Group · Admin</span>
        </div>

        <nav className="admin-nav">
          <NavLink to="/admin" end className={({ isActive }) => `admin-nav-item${isActive ? ' active' : ''}`}>
            Dashboard
          </NavLink>

          {grupos.map(g => (
            <div key={g.titulo}>
              <p className="admin-nav-group">{g.titulo}</p>
              {g.items.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) => `admin-nav-item${isActive ? ' active' : ''}`}
                >
                  {label}
                </NavLink>
              ))}
            </div>
          ))}

          <p className="admin-nav-group">CRM</p>
          <span className="admin-nav-item admin-nav-item-soon">Contactos</span>
          <span className="admin-nav-item admin-nav-item-soon">Consultas</span>
        </nav>

        <div className="admin-sidebar-footer">
          <NavLink to="/" className="admin-nav-item">← Ver sitio</NavLink>
        </div>
      </aside>

      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  )
}
