import { useEffect, useState } from 'react'
import { namesMatch } from '../lib/access'
import { isSession, type Session } from '../lib/authStore'
import {
  isNotification,
  listNotifications,
  markNotificationRead,
  markNotificationSent,
  type AppNotification,
} from '../lib/notificationsApi'
import { listUsers } from '../lib/usersApi'
import { whatsappLink } from '../lib/whatsapp'
import { useAuth } from '../state/AuthContext'
import { useOrders } from '../state/OrdersContext'

function formatWhen(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function sellerPhone(item: AppNotification, orders: { id: string; seller?: string }[], users: Session[]) {
  if (item.phone?.trim()) return item.phone.trim()
  const order = orders.find((entry) => entry.id === item.orderId)
  if (!order) return ''
  const seller = users.find((user) => user.role === 'vendedor' && namesMatch(user.sellerName, order.seller))
  const phone = (seller as { phone?: string } | undefined)?.phone
  return phone?.trim() ?? ''
}

export function NotificationBell() {
  const { user, logout } = useAuth()
  const { orders } = useOrders()
  const [items, setItems] = useState<AppNotification[]>([])
  const [users, setUsers] = useState<Session[]>([])
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const canSend = user?.role === 'encargado_deposito' || user?.role === 'admin'

  useEffect(() => {
    let cancelled = false

    async function load() {
      const result = await listNotifications()
      if (cancelled) return
      if (!result.ok) {
        if (result.status === 401) logout()
        else setError(result.message)
        return
      }
      if (!Array.isArray(result.data) || !result.data.every(isNotification)) {
        setError('No se pudieron leer los avisos.')
        return
      }
      setError('')
      setItems(result.data)
    }

    void load()
    const timer = window.setInterval(() => void load(), 30000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [logout])

  useEffect(() => {
    if (!canSend) return
    let cancelled = false
    void listUsers().then((result) => {
      if (cancelled || !result.ok || !Array.isArray(result.data)) return
      setUsers(result.data.filter(isSession))
    })
    return () => {
      cancelled = true
    }
  }, [canSend])

  const appItems = items.filter((item) => item.channel === 'app')
  const whatsappItems = canSend
    ? items.filter((item) => item.channel === 'whatsapp' && item.status === 'pendiente')
    : []
  const visible = [...appItems, ...whatsappItems]
  const unread = appItems.filter((item) => !item.read).length + whatsappItems.length

  async function markRead(id: string) {
    const result = await markNotificationRead(id)
    if (!result.ok) {
      if (result.status === 401) logout()
      else setError(result.message)
      return
    }
    setItems((current) => current.map((item) => (item.id === id ? { ...item, read: true } : item)))
  }

  async function sendWhatsapp(item: AppNotification) {
    const phone = sellerPhone(item, orders, users)
    const url = whatsappLink(phone, item.text)
    if (!url) return
    window.open(url, '_blank', 'noopener,noreferrer')
    const result = await markNotificationSent(item.id)
    if (!result.ok) {
      if (result.status === 401) logout()
      else setError(result.message)
      return
    }
    setItems((current) =>
      current.map((entry) => (entry.id === item.id ? { ...entry, status: 'enviado' } : entry)),
    )
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="relative grid h-9 w-9 place-items-center rounded-full hover:bg-white"
        aria-label={unread > 0 ? `Avisos, ${unread} sin leer` : 'Avisos'}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
          <path
            d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6zM10 18a2 2 0 0 0 4 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-lumi-danger px-1 text-[10px] font-semibold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 max-w-[80vw] rounded-2xl border border-lumi-line bg-white p-3 shadow-lg">
          <p className="text-sm font-semibold">Avisos</p>
          {error && (
            <p className="mt-2 text-sm text-lumi-danger" role="alert">
              {error}
            </p>
          )}
          {visible.length === 0 ? (
            <p className="mt-3 text-sm text-lumi-muted">No hay avisos.</p>
          ) : (
            <ul className="mt-2 flex max-h-80 flex-col gap-2 overflow-auto">
              {visible.map((item) => {
                const phone = item.channel === 'whatsapp' ? sellerPhone(item, orders, users) : ''
                const canOpen = Boolean(phone && whatsappLink(phone, item.text))
                return (
                  <li key={item.id} className="rounded-xl bg-[#f7f4ea] px-3 py-2 text-sm">
                    <p className={item.read ? 'text-lumi-muted' : 'font-medium'}>{item.text}</p>
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs text-lumi-muted">
                      <span>{formatWhen(item.createdAt)}</span>
                      {item.channel === 'app' && !item.read && (
                        <button type="button" className="underline" onClick={() => void markRead(item.id)}>
                          Marcar leído
                        </button>
                      )}
                    </div>
                    {item.channel === 'whatsapp' &&
                      (canOpen ? (
                        <button
                          type="button"
                          className="mt-2 w-full rounded-lg bg-lumi-yellow px-3 py-2 text-sm font-semibold text-lumi-yellow-ink"
                          onClick={() => void sendWhatsapp(item)}
                        >
                          Enviar por WhatsApp
                        </button>
                      ) : (
                        <p className="mt-2 text-xs text-lumi-muted">
                          <button type="button" className="w-full rounded-lg bg-lumi-line px-3 py-2 font-semibold" disabled>
                            Enviar por WhatsApp
                          </button>
                          Sin celular cargado
                        </p>
                      ))}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
