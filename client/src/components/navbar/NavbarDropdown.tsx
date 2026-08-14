import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { EntradaMenu } from './entradas'

/**
 * Desplegable genérico de la navbar: un botón con caret que abre una lista de
 * enlaces. Lo usan tanto "Propiedades" como "Servicios"; el contenido del menú
 * es lo único que cambia entre ellos.
 *
 * Es la versión de escritorio: el menú es `position: absolute` y se centra con
 * `translateX(-50%)`, algo que bajo 860px no tiene dónde vivir. Ahí la navbar
 * esconde esta fila entera y el drawer ofrece los mismos enlaces como acordeón.
 */
export default function NavbarDropdown({
  titulo,
  entradas,
}: {
  titulo: string
  entradas: EntradaMenu[]
}) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLLIElement>(null)

  // Cerrar al hacer clic fuera del desplegable.
  useEffect(() => {
    if (!abierto) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [abierto])

  return (
    <li className="navbar-dropdown" ref={ref}>
      <button
        type="button"
        className="navbar-dropdown-toggle"
        aria-expanded={abierto}
        aria-haspopup="true"
        onClick={() => setAbierto(v => !v)}
      >
        {titulo}
        <svg
          className={`navbar-caret${abierto ? ' is-open' : ''}`}
          viewBox="0 0 24 24" width="14" height="14" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          strokeLinejoin="round" aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {abierto && (
        <ul className="navbar-dropdown-menu">
          {entradas.map(({ label, to }) => (
            <li key={to}>
              <Link to={to} onClick={() => setAbierto(false)}>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
