import './graficos.css'

interface Etapa { nombre: string; valor: number; detalle?: string }

/** Barras horizontales proporcionales al máximo; el detalle (conversión, días) va a la derecha. */
export default function GraficoEmbudo({ etapas }: { etapas: Etapa[] }) {
  const maximo = Math.max(0, ...etapas.map(e => e.valor))
  return (
    <ul className="embudo">
      {etapas.map(e => (
        <li key={e.nombre} className="embudo-fila">
          <span className="embudo-nombre">{e.nombre}</span>
          <span className="embudo-pista">
            <span className="embudo-barra" style={{ width: `${maximo > 0 ? (e.valor / maximo) * 100 : 0}%` }} />
          </span>
          <span className="embudo-valor">{e.valor.toLocaleString('es-AR')}</span>
          {e.detalle && <span className="embudo-detalle">{e.detalle}</span>}
        </li>
      ))}
    </ul>
  )
}
