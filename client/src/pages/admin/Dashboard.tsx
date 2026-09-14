import { useEffect, useState } from 'react'
import { propiedadesApi } from '../../api/propiedades'
import { reservasApi } from '../../api/reservas'
import { operacionesApi } from '../../api/operaciones'
import type { PropiedadListItem } from '../../types/propiedad'
import type { Reserva } from '../../types/reserva'
import StatTile from '../../components/StatTile'
import { diasHasta } from '../../lib/formato'

// Una reserva que vence dentro de esta cantidad de días cuenta como "esta semana".
const DIAS_SEMANA = 7

export default function Dashboard() {
  const [props, setProps]                   = useState<PropiedadListItem[]>([])
  const [reservasActivas, setReservasActivas] = useState<Reserva[]>([])
  const [operacionesAbiertas, setOperacionesAbiertas] = useState(0)

  useEffect(() => {
    propiedadesApi.listar({ limit: 500 }).then(setProps).catch(() => setProps([]))
    reservasApi.listar({ status: 'activa', limit: 200 })
      .then(r => setReservasActivas(r.items))
      .catch(() => setReservasActivas([]))
    // Sólo interesa el total del paginado, no las operaciones en sí.
    operacionesApi.listar({ is_closed: false, limit: 1 })
      .then(r => setOperacionesAbiertas(r.total))
      .catch(() => setOperacionesAbiertas(0))
  }, [])

  const total       = props.length
  const disponibles = props.filter(p => p.estado_comercial === 'disponible').length
  const reservadas  = props.filter(p => p.estado_comercial === 'reservada').length
  const vencenEstaSemana = reservasActivas.filter(r => {
    const d = diasHasta(r.expires_at)
    return d !== null && d >= 0 && d <= DIAS_SEMANA
  }).length

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <span className="section-label">Panel</span>
          <h1>Dashboard</h1>
        </div>
      </div>

      <div className="admin-stats-grid">
        <StatTile label="Propiedades" valor={total} />
        <StatTile label="Disponibles" valor={disponibles} tono="ok" />
        <StatTile label="Reservadas" valor={reservadas} tono="espera" />
        <StatTile label="Reservas activas" valor={reservasActivas.length} tono="espera" />
        <StatTile label="Vencen esta semana" valor={vencenEstaSemana} tono="espera" />
        <StatTile label="Operaciones abiertas" valor={operacionesAbiertas} tono="ok" />
      </div>

      <div className="admin-card" style={{ marginTop: '1.25rem' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Bienvenido al panel de administración de Mambo Groups.
        </p>
      </div>
    </div>
  )
}
