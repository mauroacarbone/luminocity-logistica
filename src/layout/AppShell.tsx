import { Outlet } from 'react-router-dom'
import { ROLE_LABEL } from '../lib/authStore'
import { useAuth } from '../state/AuthContext'
import { Sidebar } from './Sidebar'

export function AppShell() {
  const { user } = useAuth()

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
        <Outlet />
      </main>
    </div>
  )
}
