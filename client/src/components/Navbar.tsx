export default function Navbar() {
  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <a href="#" className="navbar-logo">
          <span className="logo-mambo">Mambo</span>
          <span className="logo-groups">Groups</span>
        </a>
        <ul className="navbar-links">
          <li><a href="#propiedades">Propiedades</a></li>
          <li><a href="#contacto">Contacto</a></li>
        </ul>
      </div>
    </nav>
  )
}
