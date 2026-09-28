import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  clearSession,
  createStoredUser,
  ensureUsers,
  loadSession,
  matchSession,
  saveSession,
  saveUsers,
  sessionFromUser,
  type Role,
  type Session,
  type StoredUser,
} from '../lib/authStore'
import { verifyPassword } from '../lib/password'

type RegisterInput = {
  name: string
  email: string
  password: string
  role: Role
}

type AuthContextValue = {
  ready: boolean
  user: Session | null
  login: (email: string, password: string) => Promise<'ok' | 'invalid' | 'error'>
  register: (input: RegisterInput) => Promise<'ok' | 'exists' | 'error'>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<StoredUser[]>([])
  const [user, setUser] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    void ensureUsers()
      .then((list) => {
        if (cancelled) return
        const session = matchSession(list, loadSession())
        if (session) saveSession(session)
        else clearSession()
        setUsers(list)
        setUser(session)
        setReady(true)
      })
      .catch(() => {
        if (cancelled) return
        setUsers([])
        setUser(null)
        setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function login(email: string, password: string) {
    const found = users.find((item) => item.email === email.trim().toLowerCase())
    if (!found || !(await verifyPassword(password, found.passwordHash))) return 'invalid' as const
    const session = sessionFromUser(found)
    if (!saveSession(session)) return 'error' as const
    setUser(session)
    return 'ok' as const
  }

  async function register(input: RegisterInput) {
    const email = input.email.trim().toLowerCase()
    if (users.some((item) => item.email === email)) return 'exists' as const
    const stored = await createStoredUser({ ...input, email })
    const next = [...users, stored]
    if (saveUsers(next) !== 'ok') return 'error' as const
    setUsers(next)
    const session = sessionFromUser(stored)
    if (!saveSession(session)) return 'error' as const
    setUser(session)
    return 'ok' as const
  }

  function logout() {
    clearSession()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ ready, user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return value
}
