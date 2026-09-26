import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { alquileresApi } from '../../../api/alquileres'
import { operacionesApi } from '../../../api/operaciones'
import { propiedadesApi } from '../../../api/propiedades'
import { inmobiliariaApi } from '../../../api/inmobiliaria'
import type { Moneda } from '../../../types/alquileres'
import type { PersonaBrief } from '../../../types/persona'
import FormularioContrato, { type ValoresContrato } from '../../../components/crm/FormularioContrato/FormularioContrato'

/**
 * Alta de contrato. Con `?deal_id` viene precargado desde un deal de Alquiler
 * ganado (propiedad bloqueada, partes, monto y moneda); con `?property_id`,
 * desde la propiedad. En ambos casos, si la propiedad tiene dueño y no hay
 * propietario cargado, se precarga.
 */
export default function ContratoNuevo() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const dealId     = params.get('deal_id')
  const propertyId = params.get('property_id')

  const [inicial, setInicial] = useState<Partial<ValoresContrato> | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [punitorioInmobiliaria, setPunitorioInmobiliaria] = useState<number | null>(null)

  useEffect(() => {
    const precargar = async (): Promise<Partial<ValoresContrato>> => {
      const valores: Partial<ValoresContrato> = {}
      const inmobiliaria = await inmobiliariaApi.obtener().catch(() => null)
      if (inmobiliaria?.honorarios_alquiler_pct != null) {
        valores.honorarios_pct = String(inmobiliaria.honorarios_alquiler_pct)
      }
      setPunitorioInmobiliaria(inmobiliaria?.punitorio_diario_pct ?? null)

      let propiedadId: number | null = propertyId ? Number(propertyId) : null

      if (dealId) {
        const deal = await operacionesApi.obtener(Number(dealId))
        propiedadId = deal.property_id
        const porRol = (rol: string): PersonaBrief[] =>
          deal.parties.filter(p => p.role === rol).map(p => ({ id: p.person.id, full_name: p.person.full_name }))
        valores.inquilinos   = porRol('inquilino')
        valores.propietarios = porRol('propietario')
        valores.garantes     = porRol('garante')
        if (deal.amount !== null) valores.monto_inicial = String(deal.amount)
        valores.moneda = deal.currency as Moneda
      }

      if (propiedadId !== null) {
        const prop = await propiedadesApi.obtener(propiedadId)
        valores.propiedad = { id: prop.id, titulo: prop.titulo }
        if (prop.propietario && (valores.propietarios?.length ?? 0) === 0) {
          valores.propietarios = [prop.propietario]
        }
      }
      return valores
    }
    precargar().then(setInicial).catch(e => setError(e.message))
  }, [dealId, propertyId])

  if (error && !inicial) return <p className="lista-estado lista-error" role="alert">{error}</p>
  if (!inicial) return <p className="lista-estado">Cargando...</p>

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <span className="section-label">Alquileres</span>
          <h1>Nuevo contrato</h1>
        </div>
      </div>
      <FormularioContrato
        modo="alta"
        inicial={inicial}
        propiedadBloqueada={dealId !== null}
        punitorioInmobiliaria={punitorioInmobiliaria}
        onGuardar={async payload => {
          const creado = await alquileresApi.crear(dealId ? { ...payload, deal_id: Number(dealId) } : payload)
          navigate(`/admin/alquileres/${creado.id}`)
        }}
        onCancelar={() => navigate(-1)}
      />
    </div>
  )
}
