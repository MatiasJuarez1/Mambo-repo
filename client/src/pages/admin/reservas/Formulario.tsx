import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { reservasApi } from '../../../api/reservas'
import { propiedadesApi } from '../../../api/propiedades'
import type { PropiedadListItem } from '../../../types/propiedad'
import type { PersonaBrief } from '../../../types/persona'
import SelectorPersona from '../../../components/crm/SelectorPersona/SelectorPersona'

export default function ReservaFormulario() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // Viene del botón "Reservar" de la lista de propiedades; si falta, se elige
  // entre las disponibles.
  const propiedadInicial = params.get('propiedad')

  const [propiedad, setPropiedad]     = useState<{ id: number; titulo: string } | null>(null)
  const [disponibles, setDisponibles] = useState<PropiedadListItem[]>([])
  const [persona, setPersona]         = useState<PersonaBrief | null>(null)
  const [monto, setMonto]             = useState('')
  const [moneda, setMoneda]           = useState('ARS')
  const [vence, setVence]             = useState('')
  const [notas, setNotas]             = useState('')
  const [guardando, setGuardando]     = useState(false)
  const [error, setError]             = useState<string | null>(null)

  useEffect(() => {
    if (propiedadInicial) {
      propiedadesApi.obtener(Number(propiedadInicial))
        .then(p => setPropiedad({ id: p.id, titulo: p.titulo }))
        .catch(e => setError(e.message))
    } else {
      propiedadesApi.listar({ estado_comercial: 'disponible', limit: 500 })
        .then(setDisponibles)
        .catch(e => setError(e.message))
    }
  }, [propiedadInicial])

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!propiedad || !persona) {
      setError('Elegí la propiedad y la persona')
      return
    }
    setGuardando(true)
    setError(null)
    try {
      await reservasApi.crear({
        property_id: propiedad.id,
        person_id:   persona.id,
        amount:      monto ? Number(monto) : undefined,
        currency:    moneda,
        // El input de fecha no tiene hora: la reserva vale hasta el final de ese día.
        expires_at:  vence ? new Date(`${vence}T23:59:59`).toISOString() : undefined,
        notes:       notas || undefined,
      })
      navigate('/admin/reservas')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo reservar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div>
      <div className="admin-page-header"><h1>Nueva reserva</h1></div>
      {error && <p className="form-error" role="alert">{error}</p>}

      <form onSubmit={guardar} className="admin-card form">
        <div className="form-field full">
          <label htmlFor="propiedad">Propiedad</label>
          {propiedad
            ? <p id="propiedad" className="form-valor">{propiedad.titulo}</p>
            : (
              <select
                id="propiedad"
                required
                onChange={e => {
                  const p = disponibles.find(d => d.id === Number(e.target.value))
                  setPropiedad(p ? { id: p.id, titulo: p.titulo } : null)
                }}
              >
                <option value="">Elegí una propiedad disponible…</option>
                {disponibles.map(p => <option key={p.id} value={p.id}>{p.titulo}</option>)}
              </select>
            )}
        </div>

        <div className="form-field full">
          <SelectorPersona valor={persona} onChange={setPersona} label="Persona" />
        </div>

        <div className="form-row">
          <div className="form-field" style={{ maxWidth: 100 }}>
            <label htmlFor="moneda">Moneda</label>
            <select id="moneda" value={moneda} onChange={e => setMoneda(e.target.value)}>
              <option>ARS</option>
              <option>USD</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="monto">Monto de la seña</label>
            <input id="monto" type="number" min={0} value={monto} onChange={e => setMonto(e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="vence">Vence</label>
            <input id="vence" type="date" value={vence} onChange={e => setVence(e.target.value)} />
          </div>
        </div>

        <div className="form-field full">
          <label htmlFor="notas">Notas</label>
          <textarea id="notas" rows={3} value={notas} onChange={e => setNotas(e.target.value)} />
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={() => navigate(-1)}>Cancelar</button>
          <button type="submit" className="btn btn-magenta" disabled={guardando}>
            {guardando ? 'Reservando...' : 'Reservar'}
          </button>
        </div>
      </form>
    </div>
  )
}
