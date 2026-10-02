import { Outlet } from 'react-router-dom'
import { ServerDown, Spinner } from '../components/LoadState'
import { NotificationBell } from '../components/NotificationBell'
import { ROLE_LABEL } from '../lib/authStore'
import { useAuth } from '../state/AuthContext'
import { useOrders } from '../state/OrdersContext'
import { Sidebar } from './Sidebar'

function ImportReport({ text }: { text: string }) {
  const [head, ...rest] = text.split('\n')
  return (
    <div className="orders-note error" role="alert">
      <p>{head}</p>
      {rest.length > 0 && (
        <ul>
          {rest.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function AppShell() {
  const { user } = useAuth()
  const { loading, error, legacyCount, importing, importError, importLegacy, reload } = useOrders()
  const showImport = !loading && !error && legacyCount > 0

  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        {user && (
          <header className="session-banner no-print">
            <NotificationBell />
            <p>
              <strong>{user.name}</strong>
              <span> · {ROLE_LABEL[user.role]}</span>
            </p>
          </header>
        )}
        {loading && <Spinner label="Cargando pedidos…" />}
        {error && <ServerDown message={error} onRetry={reload} />}
        {showImport && (
          <div className="orders-import no-print">
            <p>Hay pedidos guardados solo en este navegador.</p>
            <button type="button" className="btn-primary" onClick={() => void importLegacy()} disabled={importing}>
              Importar pedidos guardados en este navegador
            </button>
            {importError && <ImportReport text={importError} />}
          </div>
        )}
        {!showImport && importError && <ImportReport text={importError} />}
        {!loading && !error && <Outlet />}
      </main>
    </div>
  )
}
