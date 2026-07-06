import { useEffect, useState } from 'react'
import { propiedadesApi } from '../../api/propiedades'
import type { PropiedadListItem } from '../../types/propiedad'
import StatTile from '../../components/StatTile'

export default function Dashboard() {
  const [props, setProps] = useState<PropiedadListItem[]>([])

  useEffect(() => {
    propiedadesApi.listar({ limit: 500 }).then(setProps).catch(() => setProps([]))
  }, [])

  const total       = props.length
  const disponibles = props.filter(p => p.estado_comercial === 'disponible').length
  const reservadas  = props.filter(p => p.estado_comercial === 'reservada').length

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
        <StatTile label="Disponibles" valor={disponibles} tono="teal" />
        <StatTile label="Reservadas" valor={reservadas} tono="pink" />
      </div>

      <div className="admin-card" style={{ marginTop: '1.25rem' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Bienvenido al panel de administración de Mambo Groups.
        </p>
      </div>
    </div>
  )
}
