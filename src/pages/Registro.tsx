import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button, Field, Input, PasswordInput } from '../components/ui'
import { AuthScreen } from '../layout/AuthScreen'
import { PASSWORD_MIN, passwordMinMessage } from '../lib/password'
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
    if (password.length < PASSWORD_MIN) next.password = passwordMinMessage()
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
        <Field label="Nombre" error={errors.name}>
          <Input
            size="lg"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input
            size="lg"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field label="Contraseña" error={errors.password}>
          <PasswordInput
            size="lg"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <Field label="Confirmar contraseña" error={errors.confirm}>
          <PasswordInput
            size="lg"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </Field>
        {errors.form && (
          <p className="auth-error" role="alert">
            {errors.form}
          </p>
        )}
        <Button type="submit" variant="primary" size="lg" fullWidth loading={pending}>
          Crear cuenta
        </Button>
      </form>
    </AuthScreen>
  )
}
