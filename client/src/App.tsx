import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'

// Sesión
import { AuthProvider } from './context/AuthContext'
import RutaProtegida from './components/RutaProtegida'
import ScrollToTop from './components/ScrollToTop'

// Layouts
import PublicLayout  from './layouts/PublicLayout'
import AdminLayout   from './layouts/AdminLayout'

// Páginas públicas
import Home     from './pages/public/Home'
import Listado  from './pages/public/Listado'
import Detalle  from './pages/public/Detalle'
import Nosotros from './pages/public/Nosotros'
import Servicios from './pages/public/Servicios'

// Páginas admin
import Login                from './pages/admin/Login'
import Dashboard            from './pages/admin/Dashboard'
import PropiedadesLista     from './pages/admin/propiedades/Lista'
import PropiedadFormulario  from './pages/admin/propiedades/Formulario'
import PublicacionesLista   from './pages/admin/publicaciones/Lista'
import PublicacionFormulario from './pages/admin/publicaciones/Formulario'

/** Ruta contenedora que le da contexto de sesión a toda la rama `/admin`. */
function ProveedorSesionAdmin() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      {/* Va dentro del router y fuera de las rutas: se aplica a toda navegación,
          pública y del panel, sin que cada página tenga que acordarse. */}
      <ScrollToTop />
      <Routes>

        {/* ── Sección pública ── */}
        <Route element={<PublicLayout />}>
          <Route index               element={<Home />} />
          <Route path="propiedades"  element={<Listado />} />
          <Route path="propiedades/:id" element={<Detalle />} />
          <Route path="nosotros"     element={<Nosotros />} />
          <Route path="servicios"    element={<Servicios />} />
        </Route>

        {/* ── Sección admin ──
            El AuthProvider cuelga acá y no de toda la app a propósito: en el
            sitio público no hay sesión que consultar y el GET /auth/me sería un
            pedido de más en cada visita. El login queda dentro (necesita el
            contexto) pero fuera de RutaProtegida: es la puerta, no el panel. */}
        <Route path="admin" element={<ProveedorSesionAdmin />}>
          <Route path="login" element={<Login />} />

          <Route element={<RutaProtegida />}>
            <Route element={<AdminLayout />}>
              <Route index element={<Dashboard />} />

              <Route path="propiedades">
                <Route index              element={<PropiedadesLista />} />
                <Route path="nueva"       element={<PropiedadFormulario />} />
                <Route path=":id/editar"  element={<PropiedadFormulario />} />
              </Route>

              <Route path="publicaciones">
                <Route index              element={<PublicacionesLista />} />
                <Route path="nueva"       element={<PublicacionFormulario />} />
                <Route path=":id/editar"  element={<PublicacionFormulario />} />
              </Route>
            </Route>
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </BrowserRouter>
  )
}
