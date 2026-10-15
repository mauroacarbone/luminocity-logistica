import { Page } from './ui'
import { Link } from 'react-router-dom'

export function NoAccess() {
  return (
    <Page>
      <header className="page-header">
        <h1>No tenés acceso a esta sección</h1>
        <p>
          <Link to="/">Volver al inicio</Link>
        </p>
      </header>
    </Page>
  )
}
