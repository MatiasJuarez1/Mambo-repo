import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { EntradaMenu } from './entradas'
import { ENTRADAS_PROPIEDADES, ENTRADAS_SERVICIOS } from './entradas'

/**
 * Un desplegable del drawer. Acá no puede ser un menú flotante como en
 * escritorio: `.navbar-dropdown-menu` es `position: absolute` centrado con
 * `translateX(-50%)` y en 375px no tiene dónde vivir. Es un acordeón que empuja
 * al resto de la lista hacia abajo.
 *
 * El estado es local a cada acordeón, y por eso son independientes por
 * construcción: abrir "Servicios" no puede cerrar "Propiedades" porque no hay
 * un estado compartido que los coordine.
 */
function AcordeonDrawer({
  titulo,
  entradas,
  id,
}: {
  titulo: string
  entradas: EntradaMenu[]
  id: string
}) {
  const [abierto, setAbierto] = useState(false)

  return (
    <li className="navbar-drawer-acordeon">
      <button
        type="button"
        className="navbar-drawer-acordeon-toggle"
        aria-expanded={abierto}
        aria-controls={id}
        onClick={() => setAbierto(v => !v)}
      >
        {titulo}
        <svg
          className={`navbar-caret${abierto ? ' is-open' : ''}`}
          viewBox="0 0 24 24" width="16" height="16" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          strokeLinejoin="round" aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* La sublista se oculta con el atributo `hidden` en vez de desmontarse:
          así el `aria-controls` del botón siempre apunta a un elemento que
          existe, que es la mitad del contrato que ese atributo promete. */}
      <ul id={id} className="navbar-drawer-sublista" hidden={!abierto}>
        {entradas.map(({ label, to }) => (
          <li key={to}>
            <Link to={to}>{label}</Link>
          </li>
        ))}
      </ul>
    </li>
  )
}

/**
 * Panel de navegación de móvil: overlay + panel fijo que entra desde la
 * derecha. Existe siempre en el DOM y se alterna con la fila de escritorio por
 * CSS (`display: none`), no con `matchMedia`: así no parpadea en la primera
 * pintura y no hay estado de JS que sincronizar con el ancho de la ventana.
 *
 * El estado de apertura lo tiene `Navbar` (es quien también renderiza la
 * hamburguesa); acá viven las conductas que dependen del panel en sí. Es el
 * mismo contrato que implementa `AdminLayout` para el drawer del panel admin
 * —cerrar al navegar / con Escape / con clic en el overlay, bloquear el scroll
 * del body, foco al primer enlace—, deliberadamente resuelto igual para que los
 * dos no diverjan.
 */
export default function NavbarDrawer({
  abierto,
  alCerrar,
  id,
}: {
  abierto: boolean
  alCerrar: () => void
  id: string
}) {
  const panelRef = useRef<HTMLElement>(null)
  const { pathname, search, hash } = useLocation()

  // Cierra al navegar. Sin esto el drawer queda abierto tapando la pantalla a
  // la que el usuario acaba de entrar. Se miran las tres partes de la ruta y no
  // sólo `pathname` porque dos de los tres grupos de enlaces del panel no la
  // cambian: los tipos de propiedad varían el query string y los servicios, el
  // ancla.
  //
  // `alCerrar` queda fuera de las dependencias a propósito: este efecto tiene
  // que dispararse cuando cambia la ruta y sólo entonces. Si entrara, bastaría
  // que quien nos usa pasara una función nueva en cada render para que el
  // drawer se cerrara solo apenas se abre.
  useEffect(() => {
    alCerrar()
  }, [pathname, search, hash])

  useEffect(() => {
    if (!abierto) return

    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') alCerrar()
    }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [abierto, alCerrar])

  // Bloquea el scroll de atrás mientras el drawer está abierto. El valor previo
  // se guarda y se restaura en el cleanup —no se pisa con `''`— para que el
  // body no quede bloqueado si la navbar se desmonta con el menú abierto.
  useEffect(() => {
    if (!abierto) return

    const overflowPrevio = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflowPrevio
    }
  }, [abierto])

  // Al abrir, el foco entra al panel: quien navega con teclado o lector de
  // pantalla no tiene que recorrer el resto de la página para llegar al menú.
  useEffect(() => {
    if (!abierto) return
    panelRef.current?.querySelector('a')?.focus()
  }, [abierto])

  return (
    <>
      {/* El overlay se monta sólo con el menú abierto: no hay nada que
          interceptar clics cuando está cerrado, ni en móvil ni en escritorio. */}
      {abierto && (
        <div
          className="navbar-drawer-overlay"
          data-testid="navbar-drawer-overlay"
          aria-hidden="true"
          onClick={alCerrar}
        />
      )}

      <nav
        id={id}
        ref={panelRef}
        className={`navbar-drawer${abierto ? ' abierto' : ''}`}
        aria-label="Menú de navegación"
      >
        <ul className="navbar-drawer-lista">
          <li>
            <Link to="/nosotros" className="navbar-drawer-enlace">Quiénes somos</Link>
          </li>

          <AcordeonDrawer
            titulo="Propiedades"
            entradas={ENTRADAS_PROPIEDADES}
            id="navbar-drawer-propiedades"
          />
          <AcordeonDrawer
            titulo="Servicios"
            entradas={ENTRADAS_SERVICIOS}
            id="navbar-drawer-servicios"
          />

          <li className="navbar-drawer-acciones">
            {/* Contacto es un ancla a un id del footer, no una ruta: la
                ubicación no cambia y el efecto de "cerrar al navegar" no se
                entera. Por eso este cierre es explícito. */}
            <a href="#contacto" className="navbar-contacto-btn" onClick={alCerrar}>
              Contacto
            </a>

            {/* Mismo criterio que en escritorio: el acceso al panel es sólo el
                icono, sin rótulo. El visitante no tiene por qué ver señalizada
                la puerta de administración. */}
            <Link to="/admin" className="navbar-account" aria-label="Acceso al panel">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none"
                   stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
                   strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="8" r="3.4" />
                <path d="M5 19.5a7 7 0 0 1 14 0" />
                <circle cx="12" cy="12" r="10.2" stroke="currentColor" strokeWidth="1.1" opacity="0.5" />
              </svg>
            </Link>
          </li>
        </ul>
      </nav>
    </>
  )
}
