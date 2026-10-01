import { Outlet } from 'react-router-dom'
import { ROLE_LABEL } from '../lib/authStore'
import { useAuth } from '../state/AuthContext'
import { useOrders } from '../state/OrdersContext'
import { Sidebar } from './Sidebar'

export function AppShell() {
  const { user } = useAuth()
  const { loading, error, orders, legacyCount, importing, importError, importLegacy } = useOrders()
  const showImport = !loading && !error && orders.length === 0 && legacyCount > 0

  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        {user && (
          <header className="session-banner no-print">
            <p>
              <strong>{user.name}</strong>
              <span> · {ROLE_LABEL[user.role]}</span>
            </p>
          </header>
        )}
        {loading && (
          <p className="orders-note" role="status">
            Cargando pedidos…
          </p>
        )}
        {error && (
          <p className="orders-note error" role="alert">
            {error}
          </p>
        )}
        {showImport && (
          <div className="orders-import no-print">
            <p>Hay pedidos guardados solo en este navegador.</p>
            <button type="button" className="btn-primary" onClick={() => void importLegacy()} disabled={importing}>
              Importar pedidos guardados en este navegador
            </button>
            {importError && (
              <p className="error" role="alert">
                {importError}
              </p>
            )}
          </div>
        )}
        {!showImport && importError && (
          <p className="orders-note error" role="alert">
            {importError}
          </p>
        )}
        {!loading && <Outlet />}
      </main>
    </div>
  )
}
