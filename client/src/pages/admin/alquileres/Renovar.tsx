import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { alquileresApi } from '../../../api/alquileres'
import type { Contrato } from '../../../types/alquileres'
import FormularioContrato from '../../../components/crm/FormularioContrato/FormularioContrato'
import { formatearFecha } from '../../../lib/formato'
import { sumarDias } from '../../../lib/alquileres'
import { valoresDesdeContrato } from './valores'

/**
 * Renovación: el mismo formulario precargado con los defaults del backend
 * (misma propiedad y partes, inicio = fin anterior + 1 día, monto = vigente,
 * mismo índice y condiciones) y con `fecha_fin` vacía y obligatoria.
 */
export default function ContratoRenovar() {
  const { id } = useParams()
  const navigate = useNavigate()
  const contratoId = Number(id)

  const [anterior, setAnterior] = useState<Contrato | null>(null)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    alquileresApi.obtener(contratoId).then(setAnterior).catch(e => setError(e.message))
  }, [contratoId])

  if (error) return <p className="lista-estado lista-error" role="alert">{error}</p>
  if (!anterior) return <p className="lista-estado">Cargando...</p>

  const inicial = {
    ...valoresDesdeContrato(anterior),
    fecha_inicio:  sumarDias(anterior.fecha_fin, 1),
    fecha_fin:     '',
    monto_inicial: String(Number(anterior.monto_vigente)),
    notas:         '',
  }

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <span className="section-label">Renueva al contrato #{anterior.id} (vence el {formatearFecha(anterior.fecha_fin)})</span>
          <h1>Renovar contrato</h1>
        </div>
      </div>
      <FormularioContrato
        modo="renovacion"
        inicial={inicial}
        propiedadBloqueada
        onGuardar={async payload => {
          // La propiedad no viaja: la renovación siempre es sobre la misma.
          const { property_id: _omitida, ...datos } = payload
          const nuevo = await alquileresApi.renovar(anterior.id, datos)
          navigate(`/admin/alquileres/${nuevo.id}`)
        }}
        onCancelar={() => navigate(`/admin/alquileres/${anterior.id}`)}
      />
    </div>
  )
}
