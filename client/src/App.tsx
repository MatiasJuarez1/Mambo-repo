import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'

// Sesión
import { AuthProvider } from './context/AuthContext'
import RutaProtegida from './components/RutaProtegida'
import RutaBeta from './components/RutaBeta'
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
import PersonasLista        from './pages/admin/personas/Lista'
import PersonaFormulario    from './pages/admin/personas/Formulario'
import PersonaFicha         from './pages/admin/personas/Ficha'
import ReservasLista        from './pages/admin/reservas/Lista'
import ReservaFormulario    from './pages/admin/reservas/Formulario'
import Tablero              from './pages/admin/operaciones/Tablero'
import OperacionFormulario  from './pages/admin/operaciones/Formulario'
import OperacionFicha       from './pages/admin/operaciones/Ficha'
import ActividadesLista       from './pages/admin/actividades/Lista'
import Configuracion        from './pages/admin/configuracion/Configuracion'
import Reportes             from './pages/admin/reportes/Reportes'
import ContratosLista       from './pages/admin/alquileres/Lista'
import CobrosLista          from './pages/admin/alquileres/Cobros'
import LiquidacionesLista  from './pages/admin/alquileres/Liquidaciones'
import RecordatoriosPagina  from './pages/admin/alquileres/Recordatorios'
import ContratoNuevo        from './pages/admin/alquileres/Nuevo'
import ContratoFicha        from './pages/admin/alquileres/Ficha'
import ContratoEditar       from './pages/admin/alquileres/Editar'
import ContratoRenovar      from './pages/admin/alquileres/Renovar'

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

              {/* CRM a prueba: solo con el rol beta (ver lib/beta.ts). */}
              <Route element={<RutaBeta />}>
                <Route path="personas">
                  <Route index             element={<PersonasLista />} />
                  <Route path="nueva"      element={<PersonaFormulario />} />
                  <Route path=":id"        element={<PersonaFicha />} />
                  <Route path=":id/editar" element={<PersonaFormulario />} />
                </Route>

                <Route path="reservas">
                  <Route index        element={<ReservasLista />} />
                  <Route path="nueva" element={<ReservaFormulario />} />
                </Route>

                <Route path="operaciones">
                  <Route index        element={<Tablero />} />
                  <Route path="nueva" element={<OperacionFormulario />} />
                  <Route path=":id"   element={<OperacionFicha />} />
                </Route>

                <Route path="actividades" element={<ActividadesLista />} />

                <Route path="alquileres">
                  <Route index               element={<ContratosLista />} />
                  <Route path="cobros"       element={<CobrosLista />} />
                  <Route path="liquidaciones" element={<LiquidacionesLista />} />
                  <Route path="recordatorios" element={<RecordatoriosPagina />} />
                  <Route path="nuevo"        element={<ContratoNuevo />} />
                  <Route path=":id"          element={<ContratoFicha />} />
                  <Route path=":id/editar"   element={<ContratoEditar />} />
                  <Route path=":id/renovar"  element={<ContratoRenovar />} />
                </Route>

                <Route path="configuracion" element={<Configuracion />} />
                <Route path="reportes"      element={<Reportes />} />
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
