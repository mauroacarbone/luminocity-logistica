import { useEffect, useState, type FormEvent } from 'react'
import { Button, Card, Field, Input, Page, PageHeader, Select } from '../components/ui'
import { Link } from 'react-router-dom'
import { ServerDown, Spinner } from '../components/LoadState'
import { Modal } from '../components/ui/Modal'
import { withCurrent } from '../data/catalog'
import { confirm, error as showError, success } from '../lib/alerts'
import { isSession, ROLE_LABEL, ROLES, type Role, type Session } from '../lib/authStore'
import {
  createUserAccount,
  listUsers,
  updateUser,
  updateUserActive,
  updateUserPassword,
  updateUserRole,
} from '../lib/usersApi'
import { useAuth } from '../state/AuthContext'
import { useCatalog } from '../state/CatalogContext'

type Account = Session & { phone: string; createdAt?: string }

function formatCreatedAt(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

type Draft = {
  name: string
  email: string
  role: Role
  phone: string
  sellerName: string
  carrierName: string
}

function isAccount(value: unknown): value is Account {
  if (!isSession(value)) return false
  const phone = (value as { phone?: unknown }).phone
  return typeof phone === 'string' || phone === undefined
}

function phoneOf(value: Account) {
  return value.phone ?? ''
}

function sellerOf(value: Account) {
  return value.sellerName ?? ''
}

function carrierOf(value: Account) {
  return value.carrierName ?? ''
}

function draftFrom(item: Account): Draft {
  return {
    name: item.name,
    email: item.email,
    role: item.role,
    phone: phoneOf(item),
    sellerName: sellerOf(item),
    carrierName: carrierOf(item),
  }
}

function draftDirty(draft: Draft, account: Account) {
  return (
    draft.name.trim() !== account.name ||
    draft.email.trim().toLowerCase() !== account.email ||
    draft.role !== account.role ||
    draft.phone.trim() !== phoneOf(account) ||
    (draft.role === 'vendedor' && draft.sellerName.trim() !== sellerOf(account)) ||
    (draft.role === 'chofer' && draft.carrierName.trim() !== carrierOf(account))
  )
}

function roleChoices(actor: Role | undefined, locked: boolean, current: Role): Role[] {
  if (locked) return [current]
  if (actor === 'admin') return [...ROLES]
  return ROLES.filter((role) => role !== 'admin' && role !== 'gerencia')
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function passwordTooLong(password: string) {
  return new TextEncoder().encode(password).length > 72
}

type NewUserInput = {
  name: string
  email: string
  password: string
  role: Role
  sellerName: string
  carrierName: string
}

function NewUserDialog({
  roles,
  sellers,
  transporters,
  onClose,
  onCreated,
  onUnauthorized,
}: {
  roles: Role[]
  sellers: string[]
  transporters: string[]
  onClose: () => void
  onCreated: (account: Account) => void
  onUnauthorized: () => void
}) {
  const [form, setForm] = useState<NewUserInput>({
    name: '',
    email: '',
    password: '',
    role: 'vendedor',
    sellerName: '',
    carrierName: '',
  })
  const [errors, setErrors] = useState<Partial<Record<keyof NewUserInput | 'form', string>>>({})
  const [pending, setPending] = useState(false)
  const sellerOptions = withCurrent(sellers, form.sellerName)
  const carrierOptions = withCurrent(transporters, form.carrierName)

  function patch(next: Partial<NewUserInput>) {
    setForm((current) => ({ ...current, ...next }))
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const nextErrors: Partial<Record<keyof NewUserInput | 'form', string>> = {}
    if (!form.name.trim()) nextErrors.name = 'Ingresá el nombre.'
    else if (form.name.trim().length > 80) nextErrors.name = 'El nombre es demasiado largo.'
    if (!EMAIL_PATTERN.test(form.email.trim())) nextErrors.email = 'Ingresá un email válido.'
    if (form.password.length < 8) nextErrors.password = 'Usá al menos 8 caracteres.'
    else if (passwordTooLong(form.password)) nextErrors.password = 'La contraseña es demasiado larga'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setPending(true)
    const result = await createUserAccount({
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
      role: form.role,
      ...(form.role === 'vendedor' ? { sellerName: form.sellerName.trim() } : {}),
      ...(form.role === 'chofer' ? { carrierName: form.carrierName.trim() } : {}),
    })
    setPending(false)
    if (!result.ok) {
      if (result.status === 401) {
        onUnauthorized()
        return
      }
      if (result.status === 409 && result.message.includes('nombre')) setErrors({ name: result.message })
      else if (result.status === 409) setErrors({ email: result.message })
      else setErrors({ form: result.message })
      return
    }
    if (!isAccount(result.data)) {
      setErrors({ form: 'No se pudo leer el usuario.' })
      return
    }
    onCreated({ ...result.data, phone: phoneOf(result.data) })
  }

  return (
    <Modal
      onClose={onClose}
      labelledBy="new-user-title"
      closeOnEscape={!pending}
      className="grid place-items-center bg-overlay p-4"
    >
      <form noValidate className="w-full max-w-md rounded-lg bg-surface p-5 shadow-md" onSubmit={(event) => void onSubmit(event)}>
        <h2 id="new-user-title" className="text-xl font-semibold">
          Nuevo usuario
        </h2>
        <p className="mt-1 text-sm text-muted">Nombre, email, contraseña inicial y rol.</p>
        <div className="mt-4 flex flex-col gap-3">
        <Field label="Nombre" error={errors.name}>
          <Input
            size="lg"
            autoFocus
            autoComplete="name"
            value={form.name}
            onChange={(event) => patch({ name: event.target.value })}
          />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input
            size="lg"
            type="email"
            inputMode="email"
            autoComplete="off"
            value={form.email}
            onChange={(event) => patch({ email: event.target.value })}
          />
        </Field>
        <Field label="Contraseña inicial" error={errors.password}>
          <Input
            size="lg"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(event) => patch({ password: event.target.value })}
          />
        </Field>
        <Field label="Rol">
          <Select
            size="lg"
            value={form.role}
            onChange={(event) => patch({ role: event.target.value as Role })}
          >
            {roles.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABEL[role]}
              </option>
            ))}
          </Select>
        </Field>
        {form.role === 'vendedor' && (
          <Field label="Vendedor">
            <Select
              size="lg"
              value={form.sellerName}
              onChange={(event) => patch({ sellerName: event.target.value })}
            >
              <option value="">Sin vincular</option>
              {sellerOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {form.role === 'chofer' && (
          <Field label="Transportista">
            <Select
              size="lg"
              value={form.carrierName}
              onChange={(event) => patch({ carrierName: event.target.value })}
            >
              <option value="">Sin vincular</option>
              {carrierOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        </div>
        {errors.form && (
          <p className="field-error mt-3" role="alert">
            {errors.form}
          </p>
        )}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" size="lg" onClick={onClose}>
            Volver
          </Button>
          <Button type="submit" variant="primary" size="lg" disabled={pending}>
            Crear
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function PasswordDialog({
  account,
  onClose,
  onUnauthorized,
  onSaved,
}: {
  account: Account
  onClose: () => void
  onUnauthorized: () => void
  onSaved: () => void
}) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({})
  const [pending, setPending] = useState(false)
  const { user, replaceToken } = useAuth()

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const next: { password?: string; confirm?: string } = {}
    if (password.length < 8) next.password = 'Usá al menos 8 caracteres.'
    else if (passwordTooLong(password)) next.password = 'La contraseña es demasiado larga'
    if (confirmPassword !== password) next.confirm = 'Las contraseñas no coinciden.'
    setErrors(next)
    if (next.password || next.confirm) return

    setPending(true)
    const result = await updateUserPassword(account.id, password)
    setPending(false)
    if (!result.ok) {
      if (result.status === 401) onUnauthorized()
      else setErrors({ form: result.message })
      return
    }
    const token =
      result.data && typeof result.data === 'object' && 'token' in result.data && typeof result.data.token === 'string'
        ? result.data.token
        : ''
    if (user && account.id === user.id && token && !replaceToken(token)) {
      onUnauthorized()
      return
    }
    onSaved()
  }

  return (
    <Modal
      onClose={onClose}
      labelledBy="reset-password-title"
      closeOnEscape={!pending}
      className="grid place-items-center bg-overlay p-4"
    >
      <form noValidate className="w-full max-w-md rounded-lg bg-surface p-5 shadow-md" onSubmit={(event) => void onSubmit(event)}>
        <h2 id="reset-password-title" className="text-xl font-semibold">
          Resetear contraseña
        </h2>
        <p className="mt-1 text-sm text-muted">Nueva contraseña para {account.name}.</p>
        <div className="mt-4 flex flex-col gap-3">
        <Field label="Nueva contraseña" error={errors.password}>
          <Input
            size="lg"
            autoFocus
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <Field label="Confirmar contraseña" error={errors.confirm}>
          <Input
            size="lg"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </Field>
        </div>
        {errors.form && (
          <p className="field-error mt-3" role="alert">
            {errors.form}
          </p>
        )}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" size="lg" onClick={onClose}>
            Volver
          </Button>
          <Button type="submit" variant="primary" size="lg" disabled={pending}>
            Guardar
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export function Usuarios() {
  const { user, logout, refreshSession } = useAuth()
  const { sellers, transporters } = useCatalog()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const [creating, setCreating] = useState(false)
  const [resetAccount, setResetAccount] = useState<Account | null>(null)
  const roles = roleChoices(user?.role, false, 'vendedor')

  useEffect(() => {
    let cancelled = false
    void listUsers().then((result) => {
      if (cancelled) return
      setLoading(false)
      if (!result.ok) {
        if (result.status === 401) logout()
        else setError(result.status === 0 ? 'No se pudo conectar con el servidor' : result.message)
        return
      }
      if (!Array.isArray(result.data) || !result.data.every(isAccount)) {
        setError('No se pudieron leer los usuarios.')
        return
      }
      const next = result.data.map((item) => ({ ...item, phone: phoneOf(item) }))
      setAccounts(next)
      setDrafts((current) =>
        Object.fromEntries(
          next.map((item) => {
            const draft = current[item.id]
            return [item.id, draft && draftDirty(draft, item) ? draft : draftFrom(item)]
          }),
        ),
      )
    })
    return () => {
      cancelled = true
    }
  }, [logout, attempt])

  function addAccount(account: Account) {
    setAccounts((current) => [...current, account])
    setDrafts((current) => ({ ...current, [account.id]: draftFrom(account) }))
    setCreating(false)
    void success('Usuario creado')
  }

  function retry() {
    setError('')
    setLoading(true)
    setAttempt((current) => current + 1)
  }

  function setDraft(id: string, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }))
  }

  function applyAccount(next: Account) {
    setAccounts((current) => current.map((item) => (item.id === next.id ? next : item)))
    setDrafts((current) => ({ ...current, [next.id]: draftFrom(next) }))
  }

  async function save(account: Account) {
    const draft = drafts[account.id]
    if (!draft || (user?.role === 'encargado_deposito' && account.role === 'admin')) return
    const name = draft.name.trim()
    const email = draft.email.trim()
    if (!name) {
      await showError('Ingresá el nombre.')
      return
    }
    if (name.length > 80) {
      await showError('El nombre es demasiado largo.')
      return
    }
    if (!EMAIL_PATTERN.test(email)) {
      await showError('Ingresá un email válido.')
      return
    }
    if (draft.role !== account.role) {
      const accepted = await confirm(
        'Cambiar el rol',
        `${account.name} pasa a ${ROLE_LABEL[draft.role]}.`,
      )
      if (!accepted) return
    }
    setBusy(account.id)
    setError('')
    setNotice('')
    let next = account
    if (draft.role !== account.role) {
      const result = await updateUserRole(account.id, draft.role)
      if (!result.ok) {
        setBusy('')
        if (result.status === 401) logout()
        else await showError(result.message)
        return
      }
      if (!isAccount(result.data)) {
        setBusy('')
        await showError('No se pudo leer el usuario.')
        return
      }
      next = { ...result.data, phone: phoneOf(result.data) }
    }
    const patch: {
      name?: string
      email?: string
      phone?: string
      sellerName?: string
      carrierName?: string
    } = {}
    if (name !== next.name) patch.name = name
    if (email.toLowerCase() !== next.email) patch.email = email
    if (draft.phone.trim() !== phoneOf(next)) patch.phone = draft.phone.trim()
    if (draft.role === 'vendedor' && draft.sellerName.trim() !== sellerOf(next)) {
      patch.sellerName = draft.sellerName.trim()
    }
    if (draft.role === 'chofer' && draft.carrierName.trim() !== carrierOf(next)) {
      patch.carrierName = draft.carrierName.trim()
    }
    if (Object.keys(patch).length > 0) {
      const result = await updateUser(account.id, patch)
      if (!result.ok) {
        if (draft.role !== account.role) {
          setAccounts((current) => current.map((item) => (item.id === next.id ? next : item)))
          setDrafts((current) => ({
            ...current,
            [next.id]: { ...current[next.id], role: next.role },
          }))
        }
        setBusy('')
        if (result.status === 401) logout()
        else await showError(result.message)
        return
      }
      if (!isAccount(result.data)) {
        setBusy('')
        await showError('No se pudo leer el usuario.')
        return
      }
      next = { ...result.data, phone: phoneOf(result.data) }
    }
    applyAccount(next)
    setBusy('')
    setNotice(`Se guardó ${next.name}.`)
    if (user && next.id === user.id) await refreshSession()
    await success('Cambios guardados')
  }

  async function toggleActive(account: Account) {
    if (user?.id === account.id) return
    if (user?.role === 'encargado_deposito' && account.role === 'admin') return
    const nextActive = !account.active
    const accepted = nextActive
      ? await confirm('Activar usuario', `${account.name} va a poder iniciar sesión.`)
      : await confirm('Desactivar usuario', `${account.name} no va a poder iniciar sesión.`, { peligro: true })
    if (!accepted) return
    setBusy(account.id)
    const result = await updateUserActive(account.id, nextActive)
    setBusy('')
    if (!result.ok) {
      if (result.status === 401) logout()
      else await showError(result.message)
      return
    }
    if (!isAccount(result.data)) {
      await showError('No se pudo leer el usuario.')
      return
    }
    const next = { ...result.data, phone: phoneOf(result.data) }
    setAccounts((current) => current.map((item) => (item.id === next.id ? next : item)))
    await success(next.active ? 'Usuario activado' : 'Usuario desactivado')
  }

  const ordered = [...accounts].sort((left, right) => Number(!left.active) - Number(!right.active))

  return (
    <Page>
      <PageHeader
        title="Usuarios"
        subtitle="Roles, celular corporativo, vendedor y transportista."
        actions={
          <Button variant={creating || resetAccount ? 'secondary' : 'primary'} onClick={() => setCreating(true)}>
            Nuevo usuario
          </Button>
        }
      />
      {creating && (
        <NewUserDialog
          roles={roles}
          sellers={sellers}
          transporters={transporters}
          onClose={() => setCreating(false)}
          onCreated={addAccount}
          onUnauthorized={logout}
        />
      )}
      {resetAccount && (
        <PasswordDialog
          account={resetAccount}
          onClose={() => setResetAccount(null)}
          onUnauthorized={logout}
          onSaved={() => {
            setResetAccount(null)
            void success('Contraseña actualizada')
          }}
        />
      )}
      {loading && <Spinner label="Cargando usuarios…" />}
      {error && <ServerDown message={error} onRetry={retry} />}
      {notice && (
        <p className="mt-4 rounded-xl bg-success-soft px-4 py-2 text-sm text-success" role="status">{notice}</p>
      )}
      {!loading && !error && (
      <div className="mt-6 flex flex-col gap-3">
        {ordered.map((account) => {
          const draft = drafts[account.id] ?? draftFrom(account)
          const sellerOptions = withCurrent(sellers, draft.sellerName)
          const carrierOptions = withCurrent(transporters, draft.carrierName)
          const locked =
            user?.role === 'encargado_deposito' && (account.role === 'admin' || account.role === 'gerencia')
          const mine = user?.id === account.id
          const dirty = draftDirty(draft, account)
          const choices = roleChoices(user?.role, locked, draft.role)
          return (
            <Card
              as="article"
              key={account.id}
              className={account.active ? undefined : 'opacity-60'}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    account.active ? 'bg-success-soft text-success' : 'bg-surface-muted text-muted'
                  }`}
                >
                  {account.active ? 'Activo' : 'Inactivo'}
                </span>
                <span className="text-sm text-muted">{formatCreatedAt(account.createdAt)}</span>
              </div>
              {locked && (
                <p className="mt-2 text-xs text-muted">Solo el admin puede modificar esta cuenta</p>
              )}
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Nombre">
                  <Input
                    size="lg"
                    value={draft.name}
                    disabled={locked}
                    onChange={(event) => setDraft(account.id, { name: event.target.value })}
                  />
                </Field>
                <Field label="Email">
                  <Input
                    size="lg"
                    type="email"
                    value={draft.email}
                    disabled={locked}
                    onChange={(event) => setDraft(account.id, { email: event.target.value })}
                  />
                </Field>
                <Field label="Rol">
                  <Select
                    size="lg"
                    value={draft.role}
                    disabled={locked}
                    onChange={(event) => setDraft(account.id, { role: event.target.value as Role })}
                  >
                    {choices.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABEL[role]}
                      </option>
                    ))}
                  </Select>
                </Field>
                {draft.role === 'vendedor' && (
                  <Field label="Vendedor">
                    <Select
                      size="lg"
                      value={draft.sellerName}
                      disabled={locked}
                      onChange={(event) => setDraft(account.id, { sellerName: event.target.value })}
                    >
                      <option value="">Sin vincular</option>
                      {sellerOptions.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                {draft.role === 'chofer' && (
                  <Field label="Transportista">
                    <Select
                      size="lg"
                      value={draft.carrierName}
                      disabled={locked}
                      onChange={(event) => setDraft(account.id, { carrierName: event.target.value })}
                    >
                      <option value="">Sin vincular</option>
                      {carrierOptions.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                <Field label="Celular corporativo">
                  <Input
                    size="lg"
                    value={draft.phone}
                    disabled={locked}
                    placeholder="11 5555 0101"
                    onChange={(event) => setDraft(account.id, { phone: event.target.value })}
                  />
                </Field>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="lg"
                  disabled={locked || !dirty || busy === account.id}
                  onClick={() => void save(account)}
                >
                  Guardar
                </Button>
                <Button
                  variant="ghost"
                  size="lg"
                  disabled={locked || busy === account.id}
                  onClick={() => setResetAccount(account)}
                >
                  Resetear contraseña
                </Button>
                {!mine && (
                  <Button
                    variant={account.active ? 'danger-outline' : 'ghost'}
                    size="lg"
                    disabled={locked || busy === account.id}
                    onClick={() => void toggleActive(account)}
                  >
                    {account.active ? 'Desactivar' : 'Activar'}
                  </Button>
                )}
                {account.role === 'chofer' && (
                  <Link
                    className="inline-flex h-[52px] min-h-[52px] items-center justify-center rounded-[10px] bg-transparent px-5 text-base font-semibold text-text hover:bg-surface-2"
                    to={`/mis-viajes?chofer=${account.id}`}
                  >
                    Ver viajes
                  </Link>
                )}
              </div>
            </Card>
          )
        })}
      </div>
      )}
    </Page>
  )
}
