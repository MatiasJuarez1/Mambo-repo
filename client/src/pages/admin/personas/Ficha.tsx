import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { personasApi } from '../../../api/personas'
import type { Contacto, Persona, Vinculos } from '../../../types/persona'
import ChipsRol from '../../../components/crm/ChipsRol/ChipsRol'
import BloqueVinculos from '../../../components/crm/BloqueVinculos/BloqueVinculos'
import Badge from '../../../components/Badge'
import { formatearFecha, formatearMonto } from '../../../lib/formato'
import { LABEL_ESTADO_RESERVA, LABEL_ROL_PARTE } from '../../../lib/crm'
import type { EstadoReserva } from '../../../types/reserva'
import type { RolParte } from '../../../types/operacion'
import './Ficha.css'

/** Un teléfono linkea a `tel:`; un WhatsApp, al chat. El email, a `mailto:`. */
function hrefDeContacto(c: Contacto): string | null {
  const soloDigitos = c.value.replace(/\D/g, '')
  if (c.type === 'whatsapp') return `https://wa.me/${soloDigitos}`
  if (c.type === 'phone') return `tel:${c.value}`
  if (c.type === 'email') return `mailto:${c.value}`
  return null
}

export default function PersonaFicha() {
  const { id } = useParams()
  const personaId = Number(id)
  const [persona, setPersona] = useState<Persona | null>(null)
  const [vinculos, setVinculos] = useState<Vinculos | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([personasApi.obtener(personaId), personasApi.vinculos(personaId)])
      .then(([p, v]) => { setPersona(p); setVinculos(v) })
      .catch(e => setError(e.message))
  }, [personaId])

  if (error) return <p className="lista-estado lista-error">{error}</p>
  if (!persona || !vinculos) return <p className="lista-estado">Cargando...</p>

  return (
    <div>
      <div className="admin-page-header ficha-cabecera">
        <div>
          <span className="section-label">Persona</span>
          <h1>{persona.full_name}</h1>
          <div className="ficha-meta">
            <ChipsRol roles={persona.roles} />
            {persona.tags.map(t => <span key={t} className="etiqueta">{t}</span>)}
          </div>
          <ul className="ficha-contactos">
            {persona.contacts.map(c => {
              const href = hrefDeContacto(c)
              return (
                <li key={c.id}>
                  {href ? <a href={href} target="_blank" rel="noreferrer">{c.value}</a> : c.value}
                  {c.is_primary && <small> · principal</small>}
                </li>
              )
            })}
            {persona.document_number && <li><small>{persona.document_type} {persona.document_number}</small></li>}
          </ul>
        </div>
        <Link to={`/admin/personas/${persona.id}/editar`} className="btn btn-outline">Editar</Link>
      </div>

      {persona.notes && <div className="admin-card ficha-notas">{persona.notes}</div>}

      <div className="ficha-grilla">
        <BloqueVinculos titulo="Propiedades" vacio="Sin propiedades">
          {vinculos.propiedades.map(p => (
            <li key={p.id}>
              <Link to={`/admin/propiedades/${p.id}/editar`}>{p.titulo}</Link>
              <Badge value={p.estado_comercial} />
            </li>
          ))}
        </BloqueVinculos>

        <BloqueVinculos titulo="Reservas" vacio="Sin reservas">
          {vinculos.reservas.map(r => (
            <li key={r.id}>
              <span>{r.propiedad.titulo} · {formatearMonto(r.amount, r.currency)} · vence {formatearFecha(r.expires_at)}</span>
              <Badge value={r.status} label={LABEL_ESTADO_RESERVA[r.status as EstadoReserva] ?? r.status} />
            </li>
          ))}
        </BloqueVinculos>

        <BloqueVinculos titulo="Operaciones" vacio="Sin operaciones">
          {vinculos.deals.map(d => (
            <li key={d.id}>
              <Link to={`/admin/operaciones/${d.id}`}>{d.title} <small>({LABEL_ROL_PARTE[d.role as RolParte] ?? d.role})</small></Link>
              <span className="ficha-etapa">{d.pipeline} · {d.stage}</span>
            </li>
          ))}
        </BloqueVinculos>

        <BloqueVinculos titulo="Actividades pendientes" vacio="Sin actividades pendientes">
          {vinculos.actividades.map(a => (
            <li key={a.id}>
              <span>{a.title}</span>
              <small>{a.activity_type} · {formatearFecha(a.due_at)}</small>
            </li>
          ))}
        </BloqueVinculos>
      </div>
    </div>
  )
}
