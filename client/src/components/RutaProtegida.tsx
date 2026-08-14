import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './RutaProtegida.css'

/**
 * Puerta del panel: deja pasar solo con sesión y manda al login si no la hay.
 *
 * Se usa como ruta padre de `/admin/*`; las pantallas cuelgan de su `<Outlet />`.
 */
export default function RutaProtegida() {
  const { usuario, cargando } = useAuth()
  const location = useLocation()

  // Mientras no sepamos si hay sesión no se renderiza nada del panel. Si se
  // mostrara y después redirigiéramos, el contenido admin parpadearía a la vista
  // de cualquiera y además dispararía sus requests, que volverían 401.
  if (cargando) {
    return <p className="ruta-protegida-espera">Verificando sesión...</p>
  }

  // `desde` viaja en el state para que el login devuelva al usuario a donde iba.
  if (!usuario) {
    return <Navigate to="/admin/login" replace state={{ desde: location.pathname }} />
  }

  return <Outlet />
}
