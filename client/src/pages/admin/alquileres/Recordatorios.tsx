import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { alquileresApi } from '../../../api/alquileres'
import type { Recordatorios } from '../../../types/alquileres'
import BandejaRecordatorios from '../../../components/crm/BandejaRecordatorios/BandejaRecordatorios'
import { ORDEN_TIPOS_RECORDATORIO, etiquetaTipoRecordatorio } from '../../../lib/alquileres'

const VENTANAS = [7, 30, 60, 90]

/**
 * La bandeja completa. `dias` vive en la query string para poder linkearla;
 * sin él se usa la ventana configurada en la inmobiliaria (la manda el backend).
 */
export default function RecordatoriosPagina() {
  const [params, setParams] = useSearchParams()
  const diasParam = params.get('dias')
  const dias = diasParam ? Number(diasParam) : undefined

  const [datos, setDatos]     = useState<Recordatorios | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    alquileresApi.recordatorios(dias)
      .then(setDatos)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [dias])

  const cambiarVentana = (valor: string) => {
    const nuevos = new URLSearchParams(params)
    nuevos.set('dias', valor)
    setParams(nuevos, { replace: true })
  }

  // El selector marca la ventana efectiva aunque no esté en la URL.
  const ventana = dias ?? datos?.dias ?? 30
  const opciones = VENTANAS.includes(ventana) ? VENTANAS : [...VENTANAS, ventana].sort((a, b) => a - b)

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <span className="section-label">Alquileres</span>
          <h1>Recordatorios · Próximos {ventana} días</h1>
        </div>
        <div className="admin-page-acciones">
          <Link to="/admin/alquileres/cobros" className="btn btn-outline">Ver cobros</Link>
        </div>
      </div>

      <div className="admin-card filtros-bar">
        <label className="filtros-label">
          Ventana
          <select value={String(ventana)} onChange={e => cambiarVentana(e.target.value)}>
            {opciones.map(v => <option key={v} value={v}>{v} días</option>)}
          </select>
        </label>
        {datos && (
          <div className="filtros-resumen">
            {ORDEN_TIPOS_RECORDATORIO.map(tipo => (
              <span key={tipo} className="badge badge-neutro">
                {etiquetaTipoRecordatorio(tipo)}: {datos.por_tipo[tipo]}
              </span>
            ))}
          </div>
        )}
      </div>

      {loading && <p className="lista-estado">Cargando...</p>}
      {error   && <p className="lista-estado lista-error" role="alert">{error}</p>}
      {!loading && !error && datos && (
        <div className="admin-card">
          <BandejaRecordatorios datos={datos} />
        </div>
      )}
    </div>
  )
}
