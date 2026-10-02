import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthScreen } from '../layout/AuthScreen'
import { useAuth } from '../state/AuthContext'

type Errors = {
  name?: string
  email?: string
  password?: string
  confirm?: string
  form?: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function Registro() {
  const { register } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const next: Errors = {}
    if (!name.trim()) next.name = 'Ingresá tu nombre.'
    if (!EMAIL_PATTERN.test(email.trim())) next.email = 'Ingresá un email válido.'
    if (password.length < 6) next.password = 'Usá al menos 6 caracteres.'
    if (confirm !== password) next.confirm = 'Las contraseñas no coinciden.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setPending(true)
    try {
      const result = await register({ name, email, password })
      if (!result.ok) {
        if (result.field === 'email') setErrors({ email: result.message })
        else if (result.field === 'name') setErrors({ name: result.message })
        else setErrors({ form: result.message })
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthScreen
      title="Crear cuenta"
      subtitle="Registrate con tu nombre, email y contraseña."
      footer={
        <>
          ¿Ya tenés cuenta? <Link to="/login">Iniciar sesión</Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <label className="field">
          <span>Nombre</span>
          <input
            autoComplete="name"
            value={name}
            aria-invalid={Boolean(errors.name)}
            onChange={(event) => setName(event.target.value)}
          />
          {errors.name && <small className="field-error">{errors.name}</small>}
        </label>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
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
            autoComplete="new-password"
            value={password}
            aria-invalid={Boolean(errors.password)}
            onChange={(event) => setPassword(event.target.value)}
          />
          {errors.password && <small className="field-error">{errors.password}</small>}
        </label>
        <label className="field">
          <span>Confirmar contraseña</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            aria-invalid={Boolean(errors.confirm)}
            onChange={(event) => setConfirm(event.target.value)}
          />
          {errors.confirm && <small className="field-error">{errors.confirm}</small>}
        </label>
        {errors.form && (
          <p className="auth-error" role="alert">
            {errors.form}
          </p>
        )}
        <button type="submit" className="btn-primary auth-submit" disabled={pending}>
          Crear cuenta
        </button>
      </form>
    </AuthScreen>
  )
}
