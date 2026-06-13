import { Outlet } from 'react-router-dom'
import Navbar from '../components/Navbar'

export default function PublicLayout() {
  return (
    <>
      <Navbar />
      <Outlet />
      <footer className="footer">
        <span className="footer-logo">Mambo Groups</span>
        <p>© {new Date().getFullYear()} — Tucumán, Argentina</p>
      </footer>
    </>
  )
}
