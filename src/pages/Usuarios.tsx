import { useEffect, useState, type FormEvent } from 'react'
import { ServerDown, Spinner } from '../components/LoadState'
import { withCurrent } from '../data/catalog'
import { confirm, error as showError, success } from '../lib/alerts'
import { isSession, ROLE_LABEL, ROLES, type Role, type Session } from '../lib/authStore'
import {
  createUserAccount,
  listUsers,
  updateUserCarrier,
  updateUserPhone,
  updateUserRole,
  updateUserSeller,
} from '../lib/usersApi'
import { useAuth } from '../state/AuthContext'
import { useCatalog } from '../state/CatalogContext'

type Account = Session & { phone: string; createdAt?: string }

function formatCreatedAt(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

type Draft = {
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
    role: item.role,
    phone: phoneOf(item),
    sellerName: sellerOf(item),
    carrierName: carrierOf(item),
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type NewUserInput = {
  name: string
  email: string
  password: string
  role: Role
  sellerName: string
  carrierName: string
}

function NewUserDialog({
  sellers,
  transporters,
  onClose,
  onCreated,
  onUnauthorized,
}: {
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
    if (!EMAIL_PATTERN.test(form.email.trim())) nextErrors.email = 'Ingresá un email válido.'
    if (form.password.length < 8) nextErrors.password = 'Usá al menos 8 caracteres.'
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
      if (result.status === 409) setErrors({ email: result.message })
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
    <div className="fixed inset-0 z-30 grid place-items-center bg-black/40 p-4">
      <form noValidate className="w-full max-w-md rounded-2xl bg-white p-5 shadow-lg" onSubmit={(event) => void onSubmit(event)}>
        <h2 className="text-xl font-semibold">Nuevo usuario</h2>
        <p className="mt-1 text-sm text-lumi-muted">Nombre, email, contraseña inicial y rol.</p>
        <label className="mt-4 block text-sm font-medium">
          Nombre
          <input
            autoFocus
            autoComplete="name"
            value={form.name}
            className="mt-1 w-full rounded-xl border border-lumi-line px-3 py-2"
            onChange={(event) => patch({ name: event.target.value })}
          />
          {errors.name && <small className="field-error">{errors.name}</small>}
        </label>
        <label className="mt-3 block text-sm font-medium">
          Email
          <input
            type="email"
            inputMode="email"
            autoComplete="off"
            value={form.email}
            className="mt-1 w-full rounded-xl border border-lumi-line px-3 py-2"
            onChange={(event) => patch({ email: event.target.value })}
          />
          {errors.email && <small className="field-error">{errors.email}</small>}
        </label>
        <label className="mt-3 block text-sm font-medium">
          Contraseña inicial
          <input
            type="password"
            autoComplete="new-password"
            value={form.password}
            className="mt-1 w-full rounded-xl border border-lumi-line px-3 py-2"
            onChange={(event) => patch({ password: event.target.value })}
          />
          {errors.password && <small className="field-error">{errors.password}</small>}
        </label>
        <label className="mt-3 block text-sm font-medium">
          Rol
          <select
            value={form.role}
            className="mt-1 w-full rounded-xl border border-lumi-line px-3 py-2"
            onChange={(event) => patch({ role: event.target.value as Role })}
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABEL[role]}
              </option>
            ))}
          </select>
        </label>
        {form.role === 'vendedor' && (
          <label className="mt-3 block text-sm font-medium">
            Vendedor
            <select
              value={form.sellerName}
              className="mt-1 w-full rounded-xl border border-lumi-line px-3 py-2"
              onChange={(event) => patch({ sellerName: event.target.value })}
            >
              <option value="">Sin vincular</option>
              {sellerOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        {form.role === 'chofer' && (
          <label className="mt-3 block text-sm font-medium">
            Transportista
            <select
              value={form.carrierName}
              className="mt-1 w-full rounded-xl border border-lumi-line px-3 py-2"
              onChange={(event) => patch({ carrierName: event.target.value })}
            >
              <option value="">Sin vincular</option>
              {carrierOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        {errors.form && (
          <p className="field-error mt-3" role="alert">
            {errors.form}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-xl px-3 py-2 text-sm text-lumi-muted hover:bg-[#f7f4ea]"
            onClick={onClose}
          >
            Volver
          </button>
          <button
            type="submit"
            className="rounded-xl bg-lumi-yellow px-4 py-2 text-sm font-semibold text-lumi-yellow-ink disabled:opacity-50"
            disabled={pending}
          >
            Crear
          </button>
        </div>
      </form>
    </div>
  )
}

function draftDirty(draft: Draft, account: Account) {
  return (
    draft.role !== account.role ||
    draft.phone.trim() !== phoneOf(account) ||
    (draft.role === 'vendedor' && draft.sellerName.trim() !== sellerOf(account)) ||
    (draft.role === 'chofer' && draft.carrierName.trim() !== carrierOf(account))
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

  async function save(account: Account) {
    const draft = drafts[account.id]
    if (!draft) return
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
      next = { ...result.data, phone: phoneOf(result.data), sellerName: sellerOf(result.data) }
    }
    if (draft.phone.trim() !== next.phone) {
      const result = await updateUserPhone(account.id, draft.phone.trim())
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
      next = { ...result.data, phone: phoneOf(result.data), sellerName: sellerOf(result.data) }
    }
    if (draft.role === 'vendedor' && draft.sellerName.trim() !== sellerOf(next)) {
      const result = await updateUserSeller(account.id, draft.sellerName.trim())
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
      next = { ...result.data, phone: phoneOf(result.data), sellerName: sellerOf(result.data) }
    }
    if (draft.role === 'chofer' && draft.carrierName.trim() !== carrierOf(next)) {
      const result = await updateUserCarrier(account.id, draft.carrierName.trim())
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
      next = { ...result.data, phone: phoneOf(result.data), sellerName: sellerOf(result.data) }
    }
    setAccounts((current) => current.map((item) => (item.id === next.id ? next : item)))
    setDrafts((current) => ({
      ...current,
      [next.id]: draftFrom(next),
    }))
    setBusy('')
    setNotice(`Se guardó ${next.name}.`)
    if (user && next.id === user.id) await refreshSession()
    await success('Cambios guardados')
  }

  return (
    <section className="page">
      <header className="page-header row">
        <div>
          <h1>Usuarios</h1>
          <p>Roles, celular corporativo, vendedor y transportista.</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
          Nuevo usuario
        </button>
      </header>
      {creating && (
        <NewUserDialog
          sellers={sellers}
          transporters={transporters}
          onClose={() => setCreating(false)}
          onCreated={addAccount}
          onUnauthorized={logout}
        />
      )}
      {loading && <Spinner label="Cargando usuarios…" />}
      {error && <ServerDown message={error} onRetry={retry} />}
      {notice && (
        <p className="mt-4 rounded-xl bg-[#e5f6ea] px-4 py-2 text-sm text-[#1d7a3a]">{notice}</p>
      )}
      {!loading && !error && (
      <div className="mt-6 flex flex-col gap-3">
        {accounts.map((account) => {
          const draft = drafts[account.id] ?? draftFrom(account)
          const sellerOptions = withCurrent(sellers, draft.sellerName)
          const carrierOptions = withCurrent(transporters, draft.carrierName)
          const dirty = draftDirty(draft, account)
          return (
            <article key={account.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="font-semibold">{account.name}</p>
              <p className="text-sm text-lumi-muted">{account.email}</p>
              <p className="text-sm text-lumi-muted">{formatCreatedAt(account.createdAt)}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,16rem)_minmax(0,16rem)_minmax(0,16rem)_auto] sm:items-end">
                <label className="text-sm">
                  Rol
                  <select
                    value={draft.role}
                    className="mt-1 w-full rounded-xl border border-lumi-line px-3 py-2"
                    onChange={(event) => setDraft(account.id, { role: event.target.value as Role })}
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABEL[role]}
                      </option>
                    ))}
                  </select>
                </label>
                {draft.role === 'vendedor' && (
                  <label className="text-sm">
                    Vendedor
                    <select
                      value={draft.sellerName}
                      className="mt-1 w-full rounded-xl border border-lumi-line px-3 py-2"
                      onChange={(event) => setDraft(account.id, { sellerName: event.target.value })}
                    >
                      <option value="">Sin vincular</option>
                      {sellerOptions.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {draft.role === 'chofer' && (
                  <label className="text-sm">
                    Transportista
                    <select
                      value={draft.carrierName}
                      className="mt-1 w-full rounded-xl border border-lumi-line px-3 py-2"
                      onChange={(event) => setDraft(account.id, { carrierName: event.target.value })}
                    >
                      <option value="">Sin vincular</option>
                      {carrierOptions.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="text-sm">
                  Celular corporativo
                  <input
                    value={draft.phone}
                    placeholder="11 5555 0101"
                    className="mt-1 w-full rounded-xl border border-lumi-line px-3 py-2"
                    onChange={(event) => setDraft(account.id, { phone: event.target.value })}
                  />
                </label>
                <button
                  type="button"
                  className="rounded-xl bg-lumi-yellow px-4 py-2 text-sm font-semibold text-lumi-yellow-ink disabled:opacity-50"
                  disabled={!dirty || busy === account.id}
                  onClick={() => void save(account)}
                >
                  Guardar
                </button>
              </div>
            </article>
          )
        })}
      </div>
      )}
    </section>
  )
}
