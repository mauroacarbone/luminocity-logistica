import { Link } from 'react-router-dom'

export function NoAccess() {
  return (
    <section className="page">
      <header className="page-header">
        <h1>No tenés acceso a esta sección</h1>
        <p>
          <Link to="/">Volver al inicio</Link>
        </p>
      </header>
    </section>
  )
}
