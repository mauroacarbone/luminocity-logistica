import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button, Field, Input } from '../components/ui'
import { AuthScreen } from '../layout/AuthScreen'
import { takeSessionNotice } from '../lib/authStore'
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
  const [errors, setErrors] = useState<Errors>(() => {
    const notice = takeSessionNotice()
    return notice ? { form: notice } : {}
  })
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
      if (!result.ok) setErrors({ form: result.message })
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthScreen
      title="Iniciar sesión"
      subtitle="Accedé con tu email y contraseña."
      footer={
        import.meta.env.PROD ? null : (
          <>
            ¿No tenés cuenta? <Link to="/registro">Crear una</Link>
          </>
        )
      }
    >
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <Field label="Email" error={errors.email}>
          <Input
            size="lg"
            type="email"
            inputMode="email"
            autoComplete="username"
            placeholder="tu@email.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field label="Contraseña" error={errors.password}>
          <Input
            size="lg"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        {errors.form && (
          <p className="auth-error" role="alert">
            {errors.form}
          </p>
        )}
        <Button type="submit" variant="primary" size="lg" fullWidth loading={pending}>
          Entrar
        </Button>
      </form>
    </AuthScreen>
  )
}
