import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { alquileresApi } from '../../../api/alquileres'
import type { Contrato, ContratoUpdatePayload } from '../../../types/alquileres'
import FormularioContrato from '../../../components/crm/FormularioContrato/FormularioContrato'
import { valoresDesdeContrato } from './valores'

/**
 * Edición de un contrato vigente. Con ajustes aplicados, el backend rechaza
 * cambiar propiedad, fecha de inicio y monto inicial: el formulario los
 * deshabilita y acá se omiten del PATCH para no mandar lo que no cambió.
 */
export default function ContratoEditar() {
  const { id } = useParams()
  const navigate = useNavigate()
  const contratoId = Number(id)

  const [contrato, setContrato] = useState<Contrato | null>(null)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    alquileresApi.obtener(contratoId).then(setContrato).catch(e => setError(e.message))
  }, [contratoId])

  if (error) return <p className="lista-estado lista-error" role="alert">{error}</p>
  if (!contrato) return <p className="lista-estado">Cargando...</p>

  const congelado = contrato.ajustes.some(a => a.estado === 'aplicado')

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <span className="section-label">Contrato #{contrato.id}</span>
          <h1>Editar contrato</h1>
        </div>
      </div>
      <FormularioContrato
        modo="edicion"
        inicial={valoresDesdeContrato(contrato)}
        camposCongelados={congelado}
        onGuardar={async payload => {
          const cambios: ContratoUpdatePayload = { ...payload }
          if (congelado) {
            delete cambios.property_id
            delete cambios.fecha_inicio
            delete cambios.monto_inicial
          }
          await alquileresApi.editar(contrato.id, cambios)
          navigate(`/admin/alquileres/${contrato.id}`)
        }}
        onCancelar={() => navigate(`/admin/alquileres/${contrato.id}`)}
      />
    </div>
  )
}
