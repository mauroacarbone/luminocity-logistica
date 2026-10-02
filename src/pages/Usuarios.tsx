import { useEffect, useState } from 'react'
import { withCurrent } from '../data/catalog'
import { isSession, ROLE_LABEL, ROLES, type Role, type Session } from '../lib/authStore'
import { listUsers, updateUserCarrier, updateUserPhone, updateUserRole, updateUserSeller } from '../lib/usersApi'
import { useAuth } from '../state/AuthContext'
import { useCatalog } from '../state/CatalogContext'

type Account = Session & { phone: string }

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

export function Usuarios() {
  const { logout } = useAuth()
  const { sellers, transporters } = useCatalog()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')

  useEffect(() => {
    let cancelled = false
    void listUsers().then((result) => {
      if (cancelled) return
      if (!result.ok) {
        if (result.status === 401) logout()
        else setError(result.message)
        return
      }
      if (!Array.isArray(result.data) || !result.data.every(isAccount)) {
        setError('No se pudieron leer los usuarios.')
        return
      }
      const next = result.data.map((item) => ({ ...item, phone: phoneOf(item) }))
      setAccounts(next)
      setDrafts(
        Object.fromEntries(
          next.map((item) => [
            item.id,
            {
              role: item.role,
              phone: item.phone,
              sellerName: sellerOf(item),
              carrierName: carrierOf(item),
            },
          ]),
        ),
      )
    })
    return () => {
      cancelled = true
    }
  }, [logout])

  function setDraft(id: string, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }))
  }

  async function save(account: Account) {
    const draft = drafts[account.id]
    if (!draft) return
    setBusy(account.id)
    setError('')
    setNotice('')
    let next = account
    if (draft.role !== account.role) {
      const result = await updateUserRole(account.id, draft.role)
      if (!result.ok) {
        setBusy('')
        if (result.status === 401) logout()
        else setError(result.message)
        return
      }
      if (!isAccount(result.data)) {
        setBusy('')
        setError('No se pudo leer el usuario.')
        return
      }
      next = { ...result.data, phone: phoneOf(result.data), sellerName: sellerOf(result.data) }
    }
    if (draft.phone.trim() !== next.phone) {
      const result = await updateUserPhone(account.id, draft.phone.trim())
      if (!result.ok) {
        setBusy('')
        if (result.status === 401) logout()
        else setError(result.message)
        return
      }
      if (!isAccount(result.data)) {
        setBusy('')
        setError('No se pudo leer el usuario.')
        return
      }
      next = { ...result.data, phone: phoneOf(result.data), sellerName: sellerOf(result.data) }
    }
    if (draft.role === 'vendedor' && draft.sellerName.trim() !== sellerOf(next)) {
      const result = await updateUserSeller(account.id, draft.sellerName.trim())
      if (!result.ok) {
        setBusy('')
        if (result.status === 401) logout()
        else setError(result.message)
        return
      }
      if (!isAccount(result.data)) {
        setBusy('')
        setError('No se pudo leer el usuario.')
        return
      }
      next = { ...result.data, phone: phoneOf(result.data), sellerName: sellerOf(result.data) }
    }
    if (draft.role === 'chofer' && draft.carrierName.trim() !== carrierOf(next)) {
      const result = await updateUserCarrier(account.id, draft.carrierName.trim())
      if (!result.ok) {
        setBusy('')
        if (result.status === 401) logout()
        else setError(result.message)
        return
      }
      if (!isAccount(result.data)) {
        setBusy('')
        setError('No se pudo leer el usuario.')
        return
      }
      next = { ...result.data, phone: phoneOf(result.data), sellerName: sellerOf(result.data) }
    }
    setAccounts((current) => current.map((item) => (item.id === next.id ? next : item)))
    setDrafts((current) => ({
      ...current,
      [next.id]: {
        role: next.role,
        phone: next.phone,
        sellerName: sellerOf(next),
        carrierName: carrierOf(next),
      },
    }))
    setBusy('')
    setNotice(`Se guardó ${next.name}.`)
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>Usuarios</h1>
        <p>Roles, celular corporativo, vendedor y transportista.</p>
      </header>
      {error && (
        <p className="mt-4 text-sm font-semibold text-lumi-danger" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-4 rounded-xl bg-[#e5f6ea] px-4 py-2 text-sm text-[#1d7a3a]">{notice}</p>
      )}
      <div className="mt-6 flex flex-col gap-3">
        {accounts.map((account) => {
          const draft = drafts[account.id] ?? {
            role: account.role,
            phone: account.phone,
            sellerName: sellerOf(account),
            carrierName: carrierOf(account),
          }
          const sellerOptions = withCurrent(sellers, draft.sellerName)
          const carrierOptions = withCurrent(transporters, draft.carrierName)
          const dirty =
            draft.role !== account.role ||
            draft.phone.trim() !== account.phone ||
            (draft.role === 'vendedor' && draft.sellerName.trim() !== sellerOf(account)) ||
            (draft.role === 'chofer' && draft.carrierName.trim() !== carrierOf(account))
          return (
            <article key={account.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="font-semibold">{account.name}</p>
              <p className="text-sm text-lumi-muted">{account.email}</p>
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
    </section>
  )
}
