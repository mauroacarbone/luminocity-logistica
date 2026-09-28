import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthScreen } from '../layout/AuthScreen'
import { useAuth } from '../state/AuthContext'

type Errors = {
  email?: string
  password?: string
  form?: string
}

export function Login() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const next: Errors = {}
    if (!email.trim()) next.email = 'Ingresá tu email.'
    if (!password) next.password = 'Ingresá tu contraseña.'
    setErrors(next)
    if (next.email || next.password) return

    setPending(true)
    try {
      const result = await login(email, password)
      if (result === 'invalid') {
        setErrors({ form: 'Email o contraseña incorrectos.' })
        return
      }
      if (result === 'error') {
        setErrors({ form: 'No se pudo guardar la sesión en este navegador.' })
      }
    } catch {
      setErrors({ form: 'No se pudo iniciar sesión.' })
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthScreen
      title="Iniciar sesión"
      subtitle="Accedé con tu email y contraseña."
      footer={
        <>
          ¿No tenés cuenta? <Link to="/registro">Crear una</Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="username"
            placeholder="tu@email.com"
            value={email}
            aria-invalid={Boolean(errors.email)}
            onChange={(event) => setEmail(event.target.value)}
          />
          {errors.email && <small className="field-error">{errors.email}</small>}
        </label>
        <label className="field">
          <span>Contraseña</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            aria-invalid={Boolean(errors.password)}
            onChange={(event) => setPassword(event.target.value)}
          />
          {errors.password && <small className="field-error">{errors.password}</small>}
        </label>
        {errors.form && (
          <p className="auth-error" role="alert">
            {errors.form}
          </p>
        )}
        <button type="submit" className="btn-primary auth-submit" disabled={pending}>
          Entrar
        </button>
      </form>
    </AuthScreen>
  )
}
