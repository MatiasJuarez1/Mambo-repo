import { Outlet } from 'react-router-dom'
import DatosContacto from '../components/DatosContacto'
import Navbar from '../components/navbar/Navbar'

export default function PublicLayout() {
  return (
    <>
      <Navbar />
      <Outlet />
      {/* El id vive acá y no en los bloques CTA: el footer es lo único que está
          en todas las páginas, así que el botón Contacto de la navbar también
          funciona en /propiedades y en el detalle, que no tienen bloque CTA. */}
      <footer className="footer" id="contacto">
        <div className="footer-inner">
          <span className="footer-logo">Mambo Group</span>
          <DatosContacto />
        </div>
        <p className="footer-copy">© {new Date().getFullYear()} — Tucumán, Argentina</p>
      </footer>
    </>
  )
}
