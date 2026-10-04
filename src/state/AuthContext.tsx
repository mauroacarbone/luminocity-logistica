import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { loginRequest, meRequest, registerRequest, type AuthFailure } from '../lib/authApi'
import { clearDriverLocation } from '../lib/driversApi'
import {
  clearToken,
  loadToken,
  saveToken,
  tokenExpiresAt,
  type Session,
} from '../lib/authStore'

type RegisterInput = {
  name: string
  email: string
  password: string
}

type AuthContextValue = {
  ready: boolean
  user: Session | null
  login: (email: string, password: string) => Promise<{ ok: true } | AuthFailure>
  register: (input: RegisterInput) => Promise<{ ok: true } | AuthFailure>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Session | null>(null)
  const [ready, setReady] = useState(() => loadToken() === null)

  useEffect(() => {
    const token = loadToken()
    if (!token) return
    let cancelled = false
    void meRequest(token).then((session) => {
      if (cancelled) return
      if (session === 'unauthorized') {
        clearToken()
        setUser(null)
      } else if (session === 'error') {
        setUser(null)
      } else {
        setUser(session)
      }
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!user) return
    const token = loadToken()
    const expiresAt = token ? tokenExpiresAt(token) : null
    if (!expiresAt) return
    const delay = Math.max(0, expiresAt - Date.now())
    const timeout = window.setTimeout(() => {
      if (user.role === 'chofer') void clearDriverLocation()
      clearToken()
      setUser(null)
    }, delay)
    return () => window.clearTimeout(timeout)
  }, [user])

  async function login(email: string, password: string) {
    const result = await loginRequest(email, password)
    if (!result.ok) return result
    if (!saveToken(result.token)) {
      return { ok: false as const, message: 'No se pudo guardar la sesión en este navegador.' }
    }
    setUser(result.user)
    return { ok: true as const }
  }

  async function register(input: RegisterInput) {
    const result = await registerRequest(input)
    if (!result.ok) return result
    if (!saveToken(result.token)) {
      return { ok: false as const, message: 'No se pudo guardar la sesión en este navegador.' }
    }
    setUser(result.user)
    return { ok: true as const }
  }

  const logout = useCallback(() => {
    if (user?.role === 'chofer') void clearDriverLocation()
    clearToken()
    setUser(null)
  }, [user])

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
