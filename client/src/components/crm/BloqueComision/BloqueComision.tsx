import { useEffect, useState } from 'react'
import { operacionesApi } from '../../../api/operaciones'
import type { Operacion } from '../../../types/operacion'
import type { Comision, ComisionIn } from '../../../types/comision'
import type { UsuarioBrief } from '../../../types/inmobiliaria'
import Badge from '../../Badge'
import { formatearFecha, formatearMonto, formatearPorcentaje } from '../../../lib/formato'
import ModalComision from '../ModalComision/ModalComision'
import './BloqueComision.css'

interface Props {
  operacion: Operacion
  usuarios: UsuarioBrief[]
}

/**
 * Sección "Comisión" de la ficha de una operación ganada. `null` = el backend
 * respondió que no hay comisión cargada (404); `undefined` = todavía no se consultó.
 */
export default function BloqueComision({ operacion, usuarios }: Props) {
  const [comision, setComision] = useState<Comision | null | undefined>(undefined)
  const [editando, setEditando] = useState(false)

  const cargar = () => {
    operacionesApi.comision(operacion.id).then(setComision).catch(() => setComision(null))
  }
  useEffect(cargar, [operacion.id]) // eslint-disable-line

  const guardar = async (body: ComisionIn) => {
    await operacionesApi.guardarComision(operacion.id, body)
    setEditando(false)
    cargar()
  }

  const repartido = comision ? comision.reparto.reduce((acc, r) => acc + Number(r.pct), 0) : 0
  const restoPct = Math.round((100 - repartido) * 100) / 100
  const restoMonto = comision ? Number(comision.monto) * restoPct / 100 : 0

  return (
    <section className="admin-card">
      <div className="bloque-comision-cabecera">
        <h2 className="form-section-title">Comisión</h2>
        {comision !== undefined && (
          <button className="btn btn-outline" onClick={() => setEditando(true)}>
            {comision ? 'Editar' : 'Cargar comisión'}
          </button>
        )}
      </div>

      {comision === undefined && <p className="lista-estado">Cargando...</p>}
      {comision === null && <p className="lista-estado">Sin comisión cargada</p>}
      {comision && (
        <>
          {comision.sin_monto && (
            <p className="form-hint">La operación no tiene monto: cargalo para calcular la comisión.</p>
          )}
          <dl className="ficha-op-datos">
            <dt>Operación</dt>
            <dd>{formatearMonto(comision.monto_operacion, comision.moneda)}</dd>
            <dt>Porcentaje</dt>
            <dd>{formatearPorcentaje(comision.pct)}</dd>
            <dt>Comisión</dt>
            <dd>
              {formatearMonto(comision.monto, comision.moneda)}{' '}
              <Badge
                value={comision.cobrada ? 'cobrada' : 'a_cobrar'}
                color={comision.cobrada ? 'ok' : 'espera'}
                label={comision.cobrada ? `Cobrada ${formatearFecha(comision.fecha_cobro)}` : 'A cobrar'}
              />
            </dd>
          </dl>
          <ul className="bloque-comision-reparto">
            {comision.reparto.map(r => (
              <li key={r.user_id}>
                {r.nombre} · {formatearPorcentaje(r.pct)} · {formatearMonto(r.monto, comision.moneda)}
              </li>
            ))}
            {restoPct > 0 && (
              <li className="bloque-comision-resto">
                Inmobiliaria · {formatearPorcentaje(restoPct)} · {formatearMonto(restoMonto, comision.moneda)}
              </li>
            )}
          </ul>
          {comision.notas && <p className="ficha-op-notas">{comision.notas}</p>}
        </>
      )}

      {editando && (
        <ModalComision
          operacion={operacion}
          usuarios={usuarios}
          inicial={comision ?? undefined}
          onGuardar={guardar}
          onCerrar={() => setEditando(false)}
        />
      )}
    </section>
  )
}
