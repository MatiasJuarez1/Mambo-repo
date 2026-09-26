import { useEffect, type ReactNode } from 'react'
import './Modal.css'

interface Props {
  titulo: string
  onCerrar: () => void
  children: ReactNode
}

/** Diálogo modal mínimo del panel: cierra con Escape o clic afuera. */
export default function Modal({ titulo, onCerrar, children }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCerrar])

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal admin-card" role="dialog" aria-modal="true" aria-labelledby="modal-titulo" onClick={e => e.stopPropagation()}>
        <h2 id="modal-titulo" className="form-section-title">{titulo}</h2>
        {children}
      </div>
    </div>
  )
}
