import './StatTile.css'

interface Props {
  label: string
  valor: number | string
  tono?: 'teal' | 'pink'
}

export default function StatTile({ label, valor, tono }: Props) {
  return (
    <div className="stat-tile">
      <div className="stat-tile-label">{label}</div>
      <div className={`stat-tile-valor${tono ? ` tono-${tono}` : ''}`}>{valor}</div>
    </div>
  )
}
