import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { busquedasApi, type Busqueda } from '../../../api/busquedas'
import { resumirBusqueda } from '../BloqueBusquedas/BloqueBusquedas'
import '../BloqueBusquedas/BloqueBusquedas.css'

interface Props {
  propiedadId: number
}

/**
 * A quién ofrecerle esta propiedad: las personas con una búsqueda activa que
 * hoy la cumple. Solo lectura; las búsquedas se cargan desde la ficha de cada
 * persona. No renderiza `<form>`: vive adentro del formulario de la propiedad.
 */
export default function BloqueInteresados({ propiedadId }: Props) {
  const [interesados, setInteresados] = useState<Busqueda[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    setInteresados(null)
    setError(null)
    busquedasApi.interesados(propiedadId)
      .then(r => { if (activo) setInteresados(r) })
      .catch((e: unknown) => {
        if (activo) setError(e instanceof Error ? e.message : 'No se pudieron cargar los interesados')
      })
    return () => { activo = false }
  }, [propiedadId])

  return (
    <section className="admin-card">
      <h2 className="form-section-title">Interesados</h2>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!error && interesados === null && <p className="lista-estado">Cargando...</p>}
      {interesados !== null && interesados.length === 0 && (
        <p className="lista-estado">Ninguna búsqueda guardada coincide con esta propiedad.</p>
      )}
      {interesados !== null && interesados.length > 0 && (
        <ul className="bloque-busquedas-coincidencias">
          {interesados.map(b => (
            <li key={b.id}>
              <Link to={`/admin/personas/${b.person.id}`}>{b.person.full_name}</Link>
              {' '}<small>— busca: {resumirBusqueda(b)}</small>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
