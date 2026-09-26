import { useState } from 'react'
import type { PersonaBrief } from '../../../types/persona'
import type {
  ContratoCreatePayload, IndiceAjuste, Moneda, PartePayload, RolParteContrato,
} from '../../../types/alquileres'
import SelectorPersona from '../SelectorPersona/SelectorPersona'
import SelectorPropiedad, { type PropiedadElegida } from '../SelectorPropiedad/SelectorPropiedad'
import { INDICES, LABEL_INDICE, LABEL_ROL_CONTRATO, generarFechasAjuste } from '../../../lib/alquileres'
import { formatearFecha } from '../../../lib/formato'
import './FormularioContrato.css'

/** Estado del formulario: strings para los inputs, personas elegidas por rol. */
export interface ValoresContrato {
  propiedad: PropiedadElegida | null
  inquilinos: PersonaBrief[]
  propietarios: PersonaBrief[]
  garantes: PersonaBrief[]
  fecha_inicio: string
  fecha_fin: string
  dia_vencimiento: string
  monto_inicial: string
  moneda: Moneda
  indice: IndiceAjuste
  frecuencia_meses: string
  porcentaje_fijo: string
  administrado: boolean
  honorarios_pct: string
  punitorio_diario_pct: string
  notas: string
}

export const VALORES_INICIALES: ValoresContrato = {
  propiedad: null, inquilinos: [], propietarios: [], garantes: [],
  fecha_inicio: '', fecha_fin: '', dia_vencimiento: '10',
  monto_inicial: '', moneda: 'ARS',
  indice: 'icl', frecuencia_meses: '3', porcentaje_fijo: '',
  administrado: false, honorarios_pct: '', punitorio_diario_pct: '', notas: '',
}

export type ModoFormulario = 'alta' | 'edicion' | 'renovacion'

interface Props {
  modo: ModoFormulario
  inicial?: Partial<ValoresContrato>
  /** La propiedad viene de la pantalla de origen (deal, renovación) y no se cambia. */
  propiedadBloqueada?: boolean
  /** Edición con ajustes aplicados: monto inicial, fecha de inicio y propiedad quedan fijos. */
  camposCongelados?: boolean
  /** % diario de la inmobiliaria, para el placeholder del override del contrato. */
  punitorioInmobiliaria?: number | null
  onGuardar: (payload: ContratoCreatePayload) => Promise<void>
  onCancelar: () => void
}

const num = (v: string) => (v === '' ? undefined : Number(v))

/** Convierte los valores del formulario al cuerpo de `POST /contratos`. */
export function aPayload(v: ValoresContrato): ContratoCreatePayload {
  const partes: PartePayload[] = [
    ...v.inquilinos.map(p => ({ person_id: p.id, rol: 'inquilino' as RolParteContrato })),
    ...v.propietarios.map(p => ({ person_id: p.id, rol: 'propietario' as RolParteContrato })),
    ...v.garantes.map(p => ({ person_id: p.id, rol: 'garante' as RolParteContrato })),
  ]
  const sinAjuste = v.indice === 'sin_ajuste'
  return {
    property_id:      v.propiedad!.id,
    partes,
    fecha_inicio:     v.fecha_inicio,
    fecha_fin:        v.fecha_fin,
    dia_vencimiento:  Number(v.dia_vencimiento),
    monto_inicial:    Number(v.monto_inicial),
    moneda:           v.moneda,
    indice:           v.indice,
    frecuencia_meses: sinAjuste ? undefined : num(v.frecuencia_meses),
    porcentaje_fijo:  v.indice === 'porcentaje_fijo' ? num(v.porcentaje_fijo) : undefined,
    administrado:     v.administrado,
    honorarios_pct:   num(v.honorarios_pct),
    punitorio_diario_pct: v.administrado ? num(v.punitorio_diario_pct) : undefined,
    notas:            v.notas || undefined,
  }
}

/** Qué le falta al formulario para poder mandarse; null si está completo. */
function validar(v: ValoresContrato): string | null {
  if (!v.propiedad) return 'Elegí la propiedad'
  if (v.inquilinos.length === 0) return 'El contrato necesita al menos un inquilino'
  if (v.propietarios.length === 0) return 'El contrato necesita al menos un propietario'
  if (!v.fecha_inicio || !v.fecha_fin) return 'Completá las fechas de inicio y fin'
  if (v.fecha_fin <= v.fecha_inicio) return 'La fecha de fin debe ser posterior a la de inicio'
  if (!v.monto_inicial || Number(v.monto_inicial) <= 0) return 'Indicá el monto inicial'
  if (v.indice !== 'sin_ajuste' && !v.frecuencia_meses) return 'Indicá cada cuántos meses se ajusta'
  if (v.indice === 'porcentaje_fijo' && !v.porcentaje_fijo) return 'Indicá el porcentaje fijo'
  return null
}

const TITULO_GUARDAR: Record<ModoFormulario, string> = {
  alta: 'Crear contrato', edicion: 'Guardar cambios', renovacion: 'Renovar contrato',
}

/**
 * Alta, edición y renovación de un contrato de alquiler en un solo paso. Los
 * campos condicionales (frecuencia, porcentaje fijo) siguen al índice elegido y
 * la vista previa del calendario replica la regla del backend.
 */
export default function FormularioContrato({
  modo, inicial, propiedadBloqueada = false, camposCongelados = false, punitorioInmobiliaria = null,
  onGuardar, onCancelar,
}: Props) {
  // Los valores de arranque completos: contra esto se detecta qué cambió.
  const [base] = useState<ValoresContrato>({ ...VALORES_INICIALES, ...inicial })
  const [v, setV] = useState<ValoresContrato>(base)
  const [mostrarGarante, setMostrarGarante] = useState((inicial?.garantes?.length ?? 0) > 0)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof ValoresContrato>(k: K, valor: ValoresContrato[K]) =>
    setV(prev => ({ ...prev, [k]: valor }))

  const agregar = (rol: 'inquilinos' | 'propietarios' | 'garantes') => (p: PersonaBrief | null) => {
    if (!p) return
    setV(prev => prev[rol].some(x => x.id === p.id) ? prev : { ...prev, [rol]: [...prev[rol], p] })
  }
  const quitar = (rol: 'inquilinos' | 'propietarios' | 'garantes', id: number) =>
    setV(prev => ({ ...prev, [rol]: prev[rol].filter(x => x.id !== id) }))

  const sinAjuste = v.indice === 'sin_ajuste'
  const fechasAjuste = sinAjuste ? [] : generarFechasAjuste(v.fecha_inicio, v.fecha_fin, num(v.frecuencia_meses) ?? null)

  // En edición, cambiar fin, frecuencia o índice hace que el backend regenere
  // los ajustes pendientes: se avisa antes de guardar.
  const regeneraAjustes = modo === 'edicion' && (
    v.fecha_fin !== base.fecha_fin
    || v.frecuencia_meses !== base.frecuencia_meses
    || v.indice !== base.indice
    || v.porcentaje_fijo !== base.porcentaje_fijo
  )

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    const falta = validar(v)
    if (falta) { setError(falta); return }
    setGuardando(true)
    setError(null)
    try {
      await onGuardar(aPayload(v))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  const listaPartes = (rol: 'inquilinos' | 'propietarios' | 'garantes', etiqueta: string) => (
    <div className="form-field full contrato-partes">
      <ul className="contrato-partes-lista">
        {v[rol].map(p => (
          <li key={p.id}>
            <span>{p.full_name}</span>
            <small>{etiqueta}</small>
            <button type="button" className="btn btn-outline btn-chico" onClick={() => quitar(rol, p.id)}>Quitar</button>
          </li>
        ))}
      </ul>
      <SelectorPersona valor={null} onChange={agregar(rol)} label={`Agregar ${etiqueta.toLowerCase()}`} />
    </div>
  )

  return (
    <form onSubmit={enviar} className="form contrato-form">
      {error && <p className="form-error" role="alert">{error}</p>}
      {camposCongelados && (
        <p className="form-hint contrato-aviso">
          El contrato ya tiene ajustes aplicados: no se pueden cambiar la propiedad, la fecha de inicio ni el monto inicial.
        </p>
      )}

      <div className="admin-card form-section">
        <h2 className="form-section-title">Propiedad</h2>
        <SelectorPropiedad
          valor={v.propiedad}
          onChange={p => set('propiedad', p)}
          bloqueada={propiedadBloqueada || camposCongelados}
        />
      </div>

      <div className="admin-card form-section">
        <h2 className="form-section-title">Partes</h2>
        {listaPartes('inquilinos', LABEL_ROL_CONTRATO.inquilino)}
        {listaPartes('propietarios', LABEL_ROL_CONTRATO.propietario)}
        {mostrarGarante
          ? listaPartes('garantes', LABEL_ROL_CONTRATO.garante)
          : (
            <button type="button" className="btn btn-outline btn-chico" onClick={() => setMostrarGarante(true)}>
              Agregar garante
            </button>
          )}
      </div>

      <div className="admin-card form-section">
        <h2 className="form-section-title">Plazo</h2>
        <div className="form-row">
          <div className="form-field">
            <label htmlFor="fecha_inicio">Inicio</label>
            <input
              id="fecha_inicio" type="date" required value={v.fecha_inicio}
              disabled={camposCongelados}
              onChange={e => set('fecha_inicio', e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="fecha_fin">Fin</label>
            <input id="fecha_fin" type="date" required value={v.fecha_fin} onChange={e => set('fecha_fin', e.target.value)} />
          </div>
          <div className="form-field" style={{ maxWidth: 140 }}>
            <label htmlFor="dia_vencimiento">Día de vencimiento</label>
            <input
              id="dia_vencimiento" type="number" min={1} max={28} required value={v.dia_vencimiento}
              onChange={e => set('dia_vencimiento', e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="admin-card form-section">
        <h2 className="form-section-title">Monto</h2>
        <div className="form-row">
          <div className="form-field" style={{ maxWidth: 100 }}>
            <label htmlFor="moneda">Moneda</label>
            <select id="moneda" value={v.moneda} onChange={e => set('moneda', e.target.value as Moneda)}>
              <option>ARS</option>
              <option>USD</option>
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="monto_inicial">Monto inicial</label>
            <input
              id="monto_inicial" type="number" min={0} step="0.01" required value={v.monto_inicial}
              disabled={camposCongelados}
              onChange={e => set('monto_inicial', e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="admin-card form-section">
        <h2 className="form-section-title">Ajuste</h2>
        <div className="form-row">
          <div className="form-field">
            <label htmlFor="indice">Índice</label>
            <select id="indice" value={v.indice} onChange={e => set('indice', e.target.value as IndiceAjuste)}>
              {INDICES.map(i => <option key={i} value={i}>{LABEL_INDICE[i]}</option>)}
            </select>
          </div>
          {!sinAjuste && (
            <div className="form-field" style={{ maxWidth: 160 }}>
              <label htmlFor="frecuencia_meses">Cada (meses)</label>
              <input
                id="frecuencia_meses" type="number" min={1} max={24} required value={v.frecuencia_meses}
                onChange={e => set('frecuencia_meses', e.target.value)}
              />
            </div>
          )}
          {v.indice === 'porcentaje_fijo' && (
            <div className="form-field" style={{ maxWidth: 160 }}>
              <label htmlFor="porcentaje_fijo">Porcentaje fijo (%)</label>
              <input
                id="porcentaje_fijo" type="number" min={0} step="0.01" required value={v.porcentaje_fijo}
                onChange={e => set('porcentaje_fijo', e.target.value)}
              />
            </div>
          )}
        </div>

        {regeneraAjustes && (
          <p className="form-hint contrato-aviso">
            Al guardar se vuelven a generar los ajustes pendientes; los ya aplicados u omitidos no se tocan.
          </p>
        )}

        <div className="contrato-calendario">
          <h3>Vista previa del calendario</h3>
          {sinAjuste
            ? <p className="form-hint">Este contrato no se ajusta.</p>
            : fechasAjuste.length === 0
              ? <p className="form-hint">Completá inicio, fin y frecuencia para ver las fechas.</p>
              : (
                <ol className="contrato-calendario-lista">
                  {fechasAjuste.map(f => <li key={f}>{formatearFecha(f)}</li>)}
                </ol>
              )}
        </div>
      </div>

      <div className="admin-card form-section">
        <h2 className="form-section-title">Administración</h2>
        <div className="form-row">
          <div className="form-field contrato-switch">
            <label htmlFor="administrado">
              <input
                id="administrado" type="checkbox" role="switch" checked={v.administrado}
                onChange={e => set('administrado', e.target.checked)}
              />
              {' '}Administrado por la inmobiliaria
            </label>
          </div>
          <div className="form-field" style={{ maxWidth: 160 }}>
            <label htmlFor="honorarios_pct">Honorarios (%)</label>
            <input
              id="honorarios_pct" type="number" min={0} max={100} step="0.01" value={v.honorarios_pct}
              onChange={e => set('honorarios_pct', e.target.value)}
            />
          </div>
          {v.administrado && (
            <div className="form-field" style={{ maxWidth: 220 }}>
              <label htmlFor="punitorio_diario_pct">Punitorio (% diario)</label>
              <input
                id="punitorio_diario_pct" type="number" min={0} max={100} step="0.001" value={v.punitorio_diario_pct}
                onChange={e => set('punitorio_diario_pct', e.target.value)}
                placeholder={punitorioInmobiliaria != null ? `Usa el de la inmobiliaria (${punitorioInmobiliaria} %)` : 'Usa el de la inmobiliaria'}
              />
            </div>
          )}
        </div>
        <div className="form-field full">
          <label htmlFor="notas">Notas</label>
          <textarea id="notas" rows={3} value={v.notas} onChange={e => set('notas', e.target.value)} />
        </div>
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-outline" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="btn btn-magenta" disabled={guardando}>
          {guardando ? 'Guardando...' : TITULO_GUARDAR[modo]}
        </button>
      </div>
    </form>
  )
}
