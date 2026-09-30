import { useEffect, useRef, useState, type KeyboardEvent, type TouchEvent } from 'react'
import type { Medio } from '../types/propiedad'
import { mediaUrl } from '../lib/propiedad'
import { srcSetDeMedio } from '../lib/imagen'
import './GaleriaVisor.css'

interface Props {
  imagenes: Medio[]
  /** Foto con la que se abre: la que se tocó en el mosaico. */
  inicial: number
  /** Para los nombres accesibles ("Foto 3 de Casa en el centro"). */
  titulo: string
  onCerrar: () => void
}

/** Desplazamiento mínimo, en px, para que un deslizamiento cuente como gesto y no como toque. */
const UMBRAL_SWIPE = 50

/**
 * Visor de fotos a pantalla completa de la ficha pública.
 *
 * Es un `<dialog>` nativo abierto con `showModal()`: eso da gratis la capa
 * superior (queda arriba de la navbar sin pelear con `z-index`), el fondo
 * inerte y el foco atrapado adentro. Lo que el diálogo no resuelve se hace a
 * mano: bloquear el scroll de la página de atrás y devolver el foco a la foto
 * del mosaico al cerrar, porque el componente se desmonta en vez de llamar a
 * `close()`.
 *
 * Se navega con las flechas en pantalla, con ← → del teclado y deslizando el
 * dedo en el celular; deslizar hacia abajo cierra, como en las galerías del
 * teléfono. La navegación es circular: después de la última viene la primera.
 */
export default function GaleriaVisor({ imagenes, inicial, titulo, onCerrar }: Props) {
  const [idx, setIdx] = useState(inicial)
  const [arrastre, setArrastre] = useState({ x: 0, y: 0 })
  const dialogRef = useRef<HTMLDialogElement>(null)
  const tiraRef = useRef<HTMLDivElement>(null)
  // Dónde empezó el dedo y cuánto se movió. El desplazamiento se guarda acá y no
  // solo en `arrastre`: al soltar hace falta el último valor, no el del último render.
  const toque = useRef<{ x: number; y: number; dx: number; dy: number; eje: 'x' | 'y' | null } | null>(null)

  const total = imagenes.length
  const actual = imagenes[idx]
  const irA = (i: number) => setIdx((i + total) % total)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const previo = document.activeElement as HTMLElement | null
    // jsdom todavía no implementa `showModal`; ahí alcanza con marcarlo abierto.
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')

    const overflowPrevio = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflowPrevio
      previo?.focus()
    }
  }, [])

  // La miniatura activa siempre a la vista, aunque se haya llegado a ella con las flechas.
  useEffect(() => {
    const activa = tiraRef.current?.children[idx] as HTMLElement | undefined
    activa?.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [idx])

  // Precarga la anterior y la siguiente: al pasar de foto ya está bajada. Con
  // los mismos `srcset` y `sizes` que el `<img>`, para que el navegador elija
  // el mismo archivo y la precarga no sea una descarga de más.
  useEffect(() => {
    if (total < 2) return
    for (const vecina of [imagenes[(idx + 1) % total], imagenes[(idx - 1 + total) % total]]) {
      const img = new Image()
      img.sizes = '100vw'
      const srcSet = srcSetDeMedio(vecina)
      if (srcSet) img.srcset = srcSet
      img.src = mediaUrl(vecina.url)
    }
  }, [idx, imagenes, total])

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowRight') { e.preventDefault(); irA(idx + 1) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); irA(idx - 1) }
    else if (e.key === 'Escape') { e.preventDefault(); onCerrar() }
  }

  function onTouchStart(e: TouchEvent) {
    // Dos dedos es un pellizco para hacer zoom: no es un gesto de la galería.
    if (e.touches.length !== 1) { toque.current = null; return }
    toque.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, dy: 0, eje: null }
  }

  function onTouchMove(e: TouchEvent) {
    const t = toque.current
    if (!t || e.touches.length !== 1) return
    const dx = (t.dx = e.touches[0].clientX - t.x)
    const dy = (t.dy = e.touches[0].clientY - t.y)
    // El eje se decide con el primer movimiento claro y queda fijo: así un
    // deslizamiento lateral un poco torcido no termina cerrando el visor.
    if (!t.eje && Math.max(Math.abs(dx), Math.abs(dy)) > 10) {
      t.eje = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    }
    if (t.eje === 'x') setArrastre({ x: dx, y: 0 })
    else if (t.eje === 'y') setArrastre({ x: 0, y: Math.max(0, dy) })
  }

  function onTouchEnd() {
    const t = toque.current
    toque.current = null
    if (t?.eje === 'x' && total > 1 && Math.abs(t.dx) > UMBRAL_SWIPE) {
      irA(t.dx < 0 ? idx + 1 : idx - 1)
    } else if (t?.eje === 'y' && t.dy > UMBRAL_SWIPE * 2) {
      onCerrar()
      return
    }
    setArrastre({ x: 0, y: 0 })
  }

  const arrastrando = arrastre.x !== 0 || arrastre.y !== 0

  return (
    <dialog
      ref={dialogRef}
      className="visor"
      aria-label={`Fotos de ${titulo}`}
      onKeyDown={onKeyDown}
      // Esc nativo del diálogo: se cierra por el estado de React, no por el navegador.
      onCancel={e => { e.preventDefault(); onCerrar() }}
    >
      <div className="visor-barra">
        <span className="visor-contador" aria-live="polite">{idx + 1} / {total}</span>
        <button className="visor-cerrar" onClick={onCerrar} aria-label="Cerrar fotos">✕</button>
      </div>

      <div
        className="visor-escenario"
        // Clic en lo oscuro alrededor de la foto: cerrar, como en cualquier visor.
        onClick={e => { if (e.target === e.currentTarget) onCerrar() }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <img
          // La `key` fuerza un `<img>` nuevo por foto: sin ella, mientras baja la
          // siguiente se seguiría viendo la anterior con el contador ya cambiado.
          key={actual.id}
          className="visor-foto"
          src={mediaUrl(actual.url)}
          srcSet={srcSetDeMedio(actual)}
          sizes="100vw"
          alt={actual.descripcion || `Foto ${idx + 1} de ${titulo}`}
          draggable={false}
          style={{
            transform: `translate(${arrastre.x}px, ${arrastre.y}px)`,
            opacity: arrastre.y ? Math.max(0.4, 1 - arrastre.y / 400) : undefined,
            transition: arrastrando ? 'none' : undefined,
          }}
        />
        {total > 1 && (
          <>
            <button className="visor-flecha visor-flecha--ant" onClick={() => irA(idx - 1)} aria-label="Foto anterior">‹</button>
            <button className="visor-flecha visor-flecha--sig" onClick={() => irA(idx + 1)} aria-label="Foto siguiente">›</button>
          </>
        )}
      </div>

      {actual.descripcion && <p className="visor-descripcion">{actual.descripcion}</p>}

      {total > 1 && (
        <div className="visor-tira" ref={tiraRef}>
          {imagenes.map((m, i) => (
            <button
              key={m.id}
              className={i === idx ? 'visor-mini visor-mini--activa' : 'visor-mini'}
              onClick={() => setIdx(i)}
              aria-label={`Foto ${i + 1} de ${total}`}
              aria-current={i === idx ? 'true' : undefined}
            >
              <img src={mediaUrl(m.url)} srcSet={srcSetDeMedio(m)} sizes="80px" alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </dialog>
  )
}
