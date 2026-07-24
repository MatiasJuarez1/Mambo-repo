import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

// Layouts
import PublicLayout  from './layouts/PublicLayout'
import AdminLayout   from './layouts/AdminLayout'

// Páginas públicas
import Home     from './pages/public/Home'
import Listado  from './pages/public/Listado'
import Detalle  from './pages/public/Detalle'
import Nosotros from './pages/public/Nosotros'

// Páginas admin
import Dashboard            from './pages/admin/Dashboard'
import PropiedadesLista     from './pages/admin/propiedades/Lista'
import PropiedadFormulario  from './pages/admin/propiedades/Formulario'
import PublicacionesLista   from './pages/admin/publicaciones/Lista'
import PublicacionFormulario from './pages/admin/publicaciones/Formulario'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* ── Sección pública ── */}
        <Route element={<PublicLayout />}>
          <Route index               element={<Home />} />
          <Route path="propiedades"  element={<Listado />} />
          <Route path="propiedades/:id" element={<Detalle />} />
          <Route path="nosotros"     element={<Nosotros />} />
        </Route>

        {/* ── Sección admin ── */}
        <Route path="admin" element={<AdminLayout />}>
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

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </BrowserRouter>
  )
}
