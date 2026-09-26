import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { veCrm } from '../lib/beta'

/**
 * Puerta de las pantallas del CRM: sin el rol beta, la URL escrita a mano lleva
 * al dashboard. Va dentro de `RutaProtegida`, así que la sesión ya está resuelta.
 */
export default function RutaBeta() {
  const { usuario } = useAuth()
  return veCrm(usuario) ? <Outlet /> : <Navigate to="/admin" replace />
}
