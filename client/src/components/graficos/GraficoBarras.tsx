import './graficos.css'

export interface Serie { nombre: string; valores: number[]; color?: string }

interface Props {
  categorias: string[]
  series: Serie[]
  formatear?: (v: number) => string
  alto?: number
}

const COLORES = ['var(--petrol)', 'var(--magenta-deep)', 'var(--estado-neutro)']
const ANCHO = 600
const MARGEN = { arriba: 8, abajo: 22, izq: 4, der: 4 }

/** Barras agrupadas por categoría (un mes) con una barra por serie. SVG puro, sin librería. */
export default function GraficoBarras({
  categorias, series, formatear = v => v.toLocaleString('es-AR'), alto = 180,
}: Props) {
  const maximo = Math.max(0, ...series.flatMap(s => s.valores))
  const areaAlto = alto - MARGEN.arriba - MARGEN.abajo
  const anchoGrupo = (ANCHO - MARGEN.izq - MARGEN.der) / Math.max(1, categorias.length)
  const anchoBarra = (anchoGrupo * 0.7) / Math.max(1, series.length)
  const resumen = series.map(s => `${s.nombre}: ${s.valores.map(formatear).join(', ')}`).join('. ')

  return (
    <figure className="grafico">
      <svg viewBox={`0 0 ${ANCHO} ${alto}`} role="img" aria-label={resumen} className="grafico-svg">
        {categorias.map((cat, i) => {
          const x0 = MARGEN.izq + i * anchoGrupo + anchoGrupo * 0.15
          return (
            <g key={`${cat}-${i}`}>
              {series.map((s, j) => {
                const v = s.valores[i] ?? 0
                const h = maximo > 0 ? (v / maximo) * areaAlto : 0
                return (
                  <rect
                    key={s.nombre}
                    className="barra"
                    x={x0 + j * anchoBarra}
                    y={MARGEN.arriba + areaAlto - h}
                    width={Math.max(1, anchoBarra - 2)}
                    height={h}
                    fill={s.color ?? COLORES[j % COLORES.length]}
                  >
                    <title>{`${cat} · ${s.nombre}: ${formatear(v)}`}</title>
                  </rect>
                )
              })}
              <text x={x0 + (anchoGrupo * 0.7) / 2} y={alto - 6} textAnchor="middle" className="grafico-eje">{cat}</text>
            </g>
          )
        })}
      </svg>
      <figcaption className="grafico-leyenda">
        {series.map((s, j) => (
          <span key={s.nombre}>
            <i style={{ background: s.color ?? COLORES[j % COLORES.length] }} /> {s.nombre}
          </span>
        ))}
      </figcaption>
    </figure>
  )
}
